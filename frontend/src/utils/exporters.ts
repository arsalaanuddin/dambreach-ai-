// DamBreach AI — GIS + PDF exporters

import { jsPDF } from 'jspdf';
import type { SimResult, TrackerScene } from '../types/sim';
import { MULLAPERIYAR_TOWNS } from '../data/damData';
import { fmtInt } from '../lib/format';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export flood footprint per-town as point KML ( rescue teams drop straight into Google Earth) */
export function exportKML(result: SimResult) {
  const peak = result.frames[result.frames.length - 1];
  const placemarks = MULLAPERIYAR_TOWNS.map((town) => {
    const ts = peak.townState[town.id];
    const depth = ts?.depthCm ?? 0;
    return `  <Placemark>
    <name>${town.name}</name>
    <description>Peak depth ${depth} cm · Pop ${town.population}</description>
    <Style><IconStyle><color>ff${depth > 300 ? '4444ef' : depth > 150 ? '199afd' : '44fac4'}</color><scale>1.1</scale></IconStyle></Style>
    <Point><coordinates>${town.lng},${town.lat},0</coordinates></Point>
  </Placemark>`;
  }).join('\n');
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>DamBreach AI — ${result.label}</name>
    <open>1</open>
${placemarks}
  </Document>
</kml>`;
  download(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `dambreach_footprint_${Date.now()}.kml`);
}

/** GeoJSON export of per-town peak footprint (loads directly in QGIS — .shp-compatible workflow) */
export function exportGeoJSON(result: SimResult) {
  const peak = result.frames[result.frames.length - 1];
  const geojson = {
    type: 'FeatureCollection' as const,
    features: MULLAPERIYAR_TOWNS.map((town) => {
      const ts = peak.townState[town.id];
      const depth = ts?.depthCm ?? 0;
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [town.lng, town.lat] },
        properties: {
          name: town.name,
          population: town.population,
          peak_depth_cm: depth,
          arrival_min: ts?.arrivalMin ?? null,
          status: depth > 300 ? 'CRITICAL' : depth > 150 ? 'WARNING' : depth > 20 ? 'WATCH' : 'SAFE',
        },
      };
    }),
  };
  download(new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' }), `dambreach_footprint_${Date.now()}.geojson`);
}

/** KML export of GEE tracker flood polygon */
export function exportTrackerKML(scene: TrackerScene) {
  const ring = scene.floodExtent.map(([lat, lng]) => `${lng},${lat},0`).join(' ');
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document><name>GEE Flood Extent — ${scene.title}</name>
    <Placemark>
      <name>Inundated Extent (${scene.areaKm2} km²)</name>
      <Style><PolyStyle><color>664444ef</color></PolyStyle><LineStyle><color>ff4444ef</color></LineStyle></Style>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${ring}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>
  </Document>
</kml>`;
  download(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), `gee_flood_${scene.id}.kml`);
}

/** SPH vs Delft3D per-timestep comparison CSV (loaded into Excel/QGIS workflows) */
export function exportComparisonCSV(sph: SimResult, delft3d: SimResult) {
  const rows = ['t_min,sph_front_km,d3_front_km,sph_depth_m,d3_depth_m,sph_outflow_cumecs,d3_outflow_cumecs,sph_extent_km2,d3_extent_km2,sph_affected,d3_affected'];
  const n = Math.min(sph.frames.length, delft3d.frames.length);
  for (let i = 0; i < n; i++) {
    const a = sph.frames[i];
    const b = delft3d.frames[i];
    rows.push([
      a.tMin,
      a.frontKm.toFixed(2), b.frontKm.toFixed(2),
      a.frontDepthM.toFixed(2), b.frontDepthM.toFixed(2),
      Math.round(a.outflowCumecs), Math.round(b.outflowCumecs),
      a.extentKm2.toFixed(2), b.extentKm2.toFixed(2),
      a.damage.totalAffected, b.damage.totalAffected,
    ].join(','));
  }
  download(new Blob([rows.join('\n')], { type: 'text/csv' }), `dambreach_model_comparison_${Date.now()}.csv`);
}

/** 1-page SitRep PDF for HADR briefing */
export function exportSitRepPDF(result: SimResult, step: number) {
  const frame = result.frames[Math.min(step, result.frames.length - 1)];
  const d = frame.damage;
  const worst = [...d.records].sort((a, b) => b.depthCm - a.depthCm).slice(0, 8);

  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  doc.setFillColor(9, 9, 15);
  doc.rect(0, 0, 210, 34, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('DAMBREACH AI — FLOOD SITREP', 14, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184);
  doc.text(`Scenario: ${result.label} · T+${frame.tMin} min · ${new Date().toLocaleString('en-IN')}`, 14, 21);
  doc.text(`Dam: H ${result.dam.damHeight} m · Crest ${result.dam.damWidth} m · Storage ${result.dam.reservoirVolume} Mm³`, 14, 27);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('EXECUTIVE SUMMARY', 14, 44);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const summary = [
    `Flood front: ${frame.frontKm.toFixed(1)} km downstream, velocity ${frame.frontVelocityMs.toFixed(1)} m/s, peak depth ${frame.frontDepthM.toFixed(1)} m.`,
    `Peak breach outflow ${fmtInt(frame.outflowCumecs)} m³/s · Released volume ${frame.releasedMm3.toFixed(1)} Mm³.`,
    `Affected population ${fmtInt(d.totalAffected)} across ${d.townsHit} towns · ${d.roadsFlooded} road corridors submerged.`,
    `Estimated economic loss ₹${d.economicLossCrores.toFixed(0)} Cr · Buildings at risk ${fmtInt(d.buildingsAtRisk)}.`,
  ];
  doc.text(summary, 14, 50);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOWN-BY-TOWN IMPACT', 14, 76);

  let y = 82;
  doc.setFillColor(30, 41, 59);
  doc.rect(14, y - 5, 182, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('TOWN', 16, y);
  doc.text('POP.', 90, y);
  doc.text('DEPTH', 120, y);
  doc.text('ARRIVAL', 150, y);
  doc.text('STATUS', 175, y);
  y += 7;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  for (const r of worst) {
    const status = r.severity.toUpperCase();
    if (r.severity === 'critical') doc.setTextColor(220, 38, 38);
    else if (r.severity === 'warning') doc.setTextColor(234, 88, 12);
    else doc.setTextColor(30, 41, 59);
    doc.text(r.name.slice(0, 24), 16, y);
    doc.setTextColor(30, 41, 59);
    doc.text(fmtInt(r.population), 90, y);
    doc.text(`${(r.depthCm / 100).toFixed(2)} m`, 120, y);
    doc.text(r.arrivalMin != null ? `T+${r.arrivalMin}m` : '—', 150, y);
    doc.text(status, 175, y);
    y += 6;
  }

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Auto-generated by DamBreach AI preview engine. For HADR briefing support — validate against field survey before operational deployment.', 14, 288);

  doc.save(`dambreach_sitrep_${Date.now()}.pdf`);
}
