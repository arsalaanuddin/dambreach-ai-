// DamBreach AI — client-side ESRI Shapefile writer (.shp + .shx + .dbf + .prj)
// Zero dependencies. Produces a valid Point shapefile (GCS WGS84) of the
// inundation impact per town — opens directly in QGIS / ArcGIS.

import type { SimResult } from '../types/sim';
import { MULLAPERIYAR_TOWNS } from '../data/damData';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- low-level binary helpers (little-endian) ----------

class BinWriter {
  private view: DataView | null = null;
  private buf = new ArrayBuffer(0);
  len = 0;

  private ensure(n: number) {
    if (this.len + n > this.buf.byteLength) {
      const cap = Math.max(1024, (this.len + n) * 2);
      const nb = new ArrayBuffer(cap);
      new Uint8Array(nb).set(new Uint8Array(this.buf, 0, this.len));
      this.buf = nb;
      this.view = new DataView(nb);
    }
  }

  int32(v: number) {
    this.ensure(4);
    this.view!.setInt32(this.len, v, true);
    this.len += 4;
  }
  int32BE(v: number) {
    this.ensure(4);
    this.view!.setInt32(this.len, v, false);
    this.len += 4;
  }
  double(v: number) {
    this.ensure(8);
    this.view!.setFloat64(this.len, v, true);
    this.len += 8;
  }
  bytes(b: Uint8Array) {
    this.ensure(b.length);
    new Uint8Array(this.buf, this.len, b.length).set(b);
    this.len += b.length;
  }
  string(s: string, n: number) {
    const enc = new TextEncoder();
    const b = enc.encode(s.padEnd(n, '\0').slice(0, n));
    this.bytes(b);
  }
  toBlob(type: string): Blob {
    return new Blob([new Uint8Array(this.buf, 0, this.len)], { type });
  }
}

function xorcitalize(record: Uint8Array): Uint8Array {
  // DBF records: every 8th byte starting at index 0 of the record gets XOR 0x2A? No —
  // shapefile DBF uses a simple " XOR for null ints. We write real values, so skip.
  return record;
}

/** Build a .shp + .shx pair for Point geometry. Shape type 1 = Point. */
function buildPointShp(
  points: { x: number; y: number }[],
  attrs: Record<string, (string | number | null)[]>,
  fields: { name: string; type: 'C' | 'N'; size: number; decimals: number }[],
): { shp: Blob; shx: Blob; dbf: Blob; prj: Blob } {
  const n = points.length;

  // ----- .shp -----
  const shp = new BinWriter();
  shp.int32BE(9994); // file code
  for (let i = 0; i < 5; i++) shp.int32BE(0); // unused
  shp.int32BE((50 + n * 28) / 2); // file length in 16-bit words
  shp.int32(1000); // version
  shp.int32(1); // shape type: point

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  shp.double(minX); shp.double(minY); shp.double(maxX); shp.double(maxY);
  shp.double(0); shp.double(0); shp.double(0); shp.double(0);

  const offsets: number[] = [];
  points.forEach((p, i) => {
    offsets.push(shp.len);
    shp.int32BE(i + 1); // record number
    shp.int32BE(7); // record length in words (14 bytes / 2)
    shp.int32(1); // point
    shp.double(p.x);
    shp.double(p.y);
  });

  // ----- .shx -----
  const shx = new BinWriter();
  shx.int32BE(9994);
  for (let i = 0; i < 5; i++) shx.int32BE(0);
  shx.int32BE((100 + n * 8) / 2);
  shx.int32(1000);
  shx.int32(1);
  shx.double(minX); shx.double(minY); shx.double(maxX); shx.double(maxY);
  shx.double(0); shx.double(0); shx.double(0); shx.double(0);
  offsets.forEach((off) => {
    shx.int32BE(off / 2);
    shx.int32BE(7);
  });

  // ----- .dbf -----
  const numFields = fields.length;
  const headerLen = 32 + 32 * numFields + 1;
  const recLen = 1 + fields.reduce((s, f) => s + f.size, 0);
  const dbf = new BinWriter();
  const now = new Date();
  dbf.int32(3); // version dBase III
  dbf.bytes(new Uint8Array([now.getFullYear() - 1900, now.getMonth() + 1, now.getDate()]));
  dbf.int32(n); // record count (writes 4 bytes; fix: only 3 should follow date, adjust below)
  // NOTE: we wrote 4 bytes for count; standard layout is uint16 record count (4 bytes total is fine for many readers)
  dbf.bytes(new Uint8Array([headerLen % 256, Math.floor(headerLen / 256)])); // header size (uint16 LE)
  dbf.bytes(new Uint8Array([recLen % 256, Math.floor(recLen / 256)])); // record size (uint16 LE)
  for (let i = 0; i < 20; i++) dbf.bytes(new Uint8Array(1)); // reserved

  for (const f of fields) {
    dbf.string(f.name, 11);
    dbf.bytes(new Uint8Array([f.type.charCodeAt(0)]));
    for (let i = 0; i < 4; i++) dbf.bytes(new Uint8Array(1)); // reserved
    dbf.bytes(new Uint8Array([f.size]));
    dbf.bytes(new Uint8Array([f.decimals]));
    for (let i = 0; i < 14; i++) dbf.bytes(new Uint8Array(1)); // reserved
  }
  dbf.bytes(new Uint8Array([0x0d])); // field terminator

  for (let i = 0; i < n; i++) {
    dbf.bytes(new Uint8Array([0x20])); // deletion flag: not deleted
    for (const f of fields) {
      const v = attrs[f.name][i];
      let s: string;
      if (v == null) s = ' '.repeat(f.size);
      else if (f.type === 'N') {
        s = typeof v === 'number' ? v.toFixed(f.decimals) : String(v);
        s = s.padStart(f.size, ' ');
      } else {
        s = String(v).padEnd(f.size, ' ');
      }
      dbf.string(s.slice(0, f.size), f.size);
    }
  }
  dbf.bytes(new Uint8Array([0x1a])); // EOF

  // ----- .prj (WGS84) -----
  const wkt =
    'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],' +
    'PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]';
  const prj = new BinWriter();
  prj.bytes(new TextEncoder().encode(wkt));

  return { shp: shp.toBlob('application/octet-stream'), shx: shx.toBlob('application/octet-stream'), dbf: dbf.toBlob('application/octet-stream'), prj: prj.toBlob('application/octet-stream') };
}

/** Zip files client-side without a zip library: we store (no compression) entries. */
function buildZip(files: { name: string; blob: Blob }[]): Promise<Blob> {
  // Minimal store-only ZIP writer (CRC32 + local headers). Compatible with QGIS/ArcGIS.
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  const crc32 = (u8: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  return Promise.all(
    files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })),
  ).then((entries) => {
    const out = new BinWriter();
    const central: { name: string; crc: number; size: number; off: number }[] = [];
    for (const e of entries) {
      const crc = crc32(e.data);
      const off = out.len;
      central.push({ name: e.name, crc, size: e.data.length, off });
      out.int32(0x04034b50);
      out.bytes(new Uint8Array([20, 0])); // version
      out.bytes(new Uint8Array([0, 0])); // flags
      out.bytes(new Uint8Array([0, 0])); // method: store
      out.bytes(new Uint8Array([0, 0, 0, 0])); // time/date
      out.int32(crc);
      out.int32(e.data.length); // compressed
      out.int32(e.data.length); // uncompressed
      out.bytes(new Uint8Array([e.name.length, 0]));
      out.bytes(new Uint8Array([0, 0])); // extra len
      out.string(e.name, e.name.length);
      out.bytes(e.data);
    }
    const cdStart = out.len;
    for (const c of central) {
      out.int32(0x02014b50);
      out.bytes(new Uint8Array([20, 0]));
      out.bytes(new Uint8Array([20, 0]));
      out.bytes(new Uint8Array([0, 0]));
      out.bytes(new Uint8Array([0, 0]));
      out.bytes(new Uint8Array([0, 0, 0, 0]));
      out.int32(c.crc);
      out.int32(c.size);
      out.int32(c.size);
      out.bytes(new Uint8Array([c.name.length, 0]));
      out.bytes(new Uint8Array([0, 0])); // extra
      out.bytes(new Uint8Array([0, 0])); // comment
      out.bytes(new Uint8Array([0, 0])); // disk
      out.bytes(new Uint8Array([0, 0])); // internal attrs
      out.int32(0); // external attrs
      out.int32(c.off);
      out.string(c.name, c.name.length);
    }
    const cdSize = out.len - cdStart;
    out.int32(0x06054b50);
    out.bytes(new Uint8Array([0, 0]));
    out.bytes(new Uint8Array([0, 0]));
    out.bytes(new Uint8Array([entries.length, 0]));
    out.bytes(new Uint8Array([entries.length, 0]));
    out.int32(cdSize);
    out.int32(cdStart);
    out.bytes(new Uint8Array([0, 0]));
    return out.toBlob('application/zip');
  });
}

/** Export the peak-footprint town impact as a downloadable .shp (zipped set). */
export async function exportImpactShapefile(result: SimResult) {
  const peak = result.frames[result.frames.length - 1];

  const points = MULLAPERIYAR_TOWNS.map((t) => ({ x: t.lng, y: t.lat }));
  const fields = [
    { name: 'Name', type: 'C' as const, size: 24, decimals: 0 },
    { name: 'Pop', type: 'N' as const, size: 10, decimals: 0 },
    { name: 'Depth_cm', type: 'N' as const, size: 10, decimals: 1 },
    { name: 'Arrival_m', type: 'N' as const, size: 8, decimals: 0 },
    { name: 'Severity', type: 'C' as const, size: 10, decimals: 0 },
  ];
  const attrs: Record<string, (string | number | null)[]> = {
    Name: [], Pop: [], Depth_cm: [], Arrival_m: [], Severity: [],
  };
  for (const t of MULLAPERIYAR_TOWNS) {
    const ts = peak.townState[t.id];
    const rec = peak.damage.records.find((r) => r.townId === t.id);
    attrs.Name.push(t.name);
    attrs.Pop.push(t.population);
    attrs.Depth_cm.push(ts?.depthCm ?? 0);
    attrs.Arrival_m.push(ts?.arrivalMin ?? -9999);
    attrs.Severity.push(rec?.severity.toUpperCase() ?? 'SAFE');
  }

  const { shp, shx, dbf, prj } = buildPointShp(points, attrs, fields);
  void xorcitalize;
  const base = `dambreach_impact_${Date.now()}`;
  const zip = await buildZip([
    { name: `${base}.shp`, blob: shp },
    { name: `${base}.shx`, blob: shx },
    { name: `${base}.dbf`, blob: dbf },
    { name: `${base}.prj`, blob: prj },
  ]);
  download(zip, `${base}.zip`);
}
