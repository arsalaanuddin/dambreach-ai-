// DamBreach AI — main map with river-corridor flood rendering, dam marker,
// towns, roads, advancing flood front and tracker polygons.

import { useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Polygon, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { SimResult, TrackerScene, Town, RoadSegment } from '../types/sim';
import { depthColor, velocityColor } from '../lib/colors';
import { DAM_SITE, RIVER_PATH, riverPositionAt } from '../data/damData';

interface MapViewerProps {
  result: SimResult | null;
  step: number;
  towns: Town[];
  roads: RoadSegment[];
  activeScene: TrackerScene | null;
}

const damIcon = L.divIcon({
  className: '',
  html: `<div style="transform:translate(-50%,-50%);width:26px;height:26px;border-radius:6px;background:linear-gradient(135deg,#2563eb,#7c3aed);border:2px solid #93c5fd;box-shadow:0 0 14px rgba(59,130,246,.9);display:flex;align-items:center;justify-content:center;font:700 11px 'JetBrains Mono',monospace;color:#fff">D</div>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/** Build depth-colored ribbon quads along the river for the current frame.
 * Model-aware: SPH = narrow concentrated surge, Delft3D = wide diffused spread. */
function useFloodRibbons(result: SimResult | null, step: number) {
  return useMemo(() => {
    if (!result || step === 0) return [];
    const frame = result.frames[Math.min(step, result.frames.length - 1)];
    if (!frame || frame.frontKm <= 0.05) return [];
    const isSph = result.model === 'sph';
    const decay = isSph ? 3.0 : 1.7;          // SPH front dies faster downstream
    const widthMax = isSph ? 2.1 : 3.4;        // D3D spreads wider laterally
    const ribbons: { points: [number, number][]; color: string }[] = [];
    const maxKm = Math.min(frame.frontKm, 143);
    for (let km = 0; km < maxKm; km += 2) {
      const km2 = Math.min(km + 2, maxKm);
      const t = km / 143;
      const depthAtKm = frame.frontDepthM * 100 * Math.exp(-t * decay) * (1 - t * 0.5) + 30;
      const halfW = 0.55 + widthMax * Math.min(1, km / 40);
      const [latA, lngA] = riverPositionAt(km, -halfW);
      const [latB, lngB] = riverPositionAt(km, halfW);
      const [latC, lngC] = riverPositionAt(km2, halfW);
      const [latD, lngD] = riverPositionAt(km2, -halfW);
      ribbons.push({
        points: [[latA, lngA], [latB, lngB], [latC, lngC], [latD, lngD]],
        color: depthColor(depthAtKm),
      });
    }
    return ribbons;
  }, [result, step]);
}

export function MapViewer({ result, step, towns, roads, activeScene }: MapViewerProps) {
  const frame = result ? result.frames[Math.min(step, result.frames.length - 1)] : null;
  const ribbons = useFloodRibbons(result, step);

  // Foam front position + trailing velocity streaks
  const frontPos = useMemo(
    () => (frame && frame.frontKm > 0.1 && step > 0 ? riverPositionAt(frame.frontKm) : null),
    [frame, step],
  );
  const streaks = useMemo(() => {
    if (!frame || step === 0 || frame.frontKm <= 1) return [];
    const out: { points: [number, number][]; color: string }[] = [];
    for (let i = 1; i <= 6; i++) {
      const kmBack = frame.frontKm - i * 1.8;
      if (kmBack <= 0.5) continue;
      const [lat, lng] = riverPositionAt(kmBack);
      const [l1, g1] = riverPositionAt(kmBack - 0.8, 1.1);
      const [l2, g2] = riverPositionAt(kmBack - 0.8, -1.1);
      out.push({
        points: [[l2, g2], [lat, lng], [l1, g1]],
        color: velocityColor(frame.frontVelocityMs / (1 + i * 0.5)),
      });
    }
    return out;
  }, [frame, step]);

  const riverPoints = RIVER_PATH.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <MapContainer
      center={[9.85, 76.98]}
      zoom={9}
      style={{ height: '100%', width: '100%', background: '#0a0a0f' }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; Esri, Maxar, Earthstar Geographics'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={18}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
        maxZoom={18}
      />

      {/* Periyar river guide line */}
      <Polyline
        positions={riverPoints}
        pathOptions={{ color: '#0ea5e9', weight: 2, opacity: 0.45, dashArray: '2, 6' }}
      />

      {/* Flood ribbons (depth-colored corridor) */}
      {ribbons.map((rib, i) => (
        <Polygon
          key={`rib-${step}-${i}`}
          positions={rib.points}
          pathOptions={{ color: rib.color, weight: 0.5, fillColor: rib.color, fillOpacity: 0.62, opacity: 0.8 }}
        />
      ))}

      {/* Velocity streaks trailing the front */}
      {streaks.map((s, i) => (
        <Polyline
          key={`stk-${step}-${i}`}
          positions={s.points}
          pathOptions={{ color: s.color, weight: 1.8, opacity: 0.55 }}
        />
      ))}

      {/* Foam front */}
      {frontPos && (
        <CircleMarker
          center={frontPos}
          radius={9}
          pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#e0f2fe', fillOpacity: 0.95 }}
        >
          <Popup>
            <div className="text-xs space-y-1">
              <div className="font-bold text-zinc-900">Flood Front</div>
              <div className="font-mono text-zinc-600">{frame?.frontKm.toFixed(1)} km from dam</div>
              <div className="font-mono text-zinc-600">{frame?.frontDepthM.toFixed(1)} m · {frame?.frontVelocityMs.toFixed(1)} m/s</div>
            </div>
          </Popup>
        </CircleMarker>
      )}

      {/* Dam marker */}
      <Marker position={[DAM_SITE.lat, DAM_SITE.lng]} icon={damIcon}>
        <Popup>
          <div className="text-xs space-y-1">
            <div className="font-bold text-zinc-900">Mullaperiyar Dam</div>
            <div className="text-zinc-600 font-mono">H 53 m · L 365 m · 443.2 Mm³</div>
            <div className="text-zinc-600">Breach origin — Periyar river, km 0</div>
          </div>
        </Popup>
      </Marker>

      {/* Roads */}
      {roads.map((road) => {
        const flooded = frame?.floodedRoadIds.includes(road.id);
        return (
          <Polyline
            key={road.id}
            positions={road.points}
            pathOptions={{
              color: flooded ? '#f59e0b' : '#38bdf8',
              weight: flooded ? 4.5 : 2.5,
              opacity: flooded ? 0.95 : 0.55,
              dashArray: flooded ? undefined : '6, 8',
            }}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-zinc-900">{road.name}</div>
                <div className={flooded ? 'text-orange-600 font-bold' : 'text-emerald-600'}>
                  {flooded ? '⚠ SUBMERGED — divert traffic' : 'Passable — monitor'}
                </div>
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* Towns */}
      {towns.map((town) => {
        const ts = frame?.townState[town.id];
        const depth = ts?.depthCm ?? 0;
        const color = depth > 20 ? depthColor(depth) : '#22c55e';
        const radius = 4 + Math.min(10, Math.log10(town.population) * 2.2) + (depth > 20 ? 2 : 0);
        return (
          <CircleMarker
            key={town.id}
            center={[town.lat, town.lng]}
            radius={radius}
            pathOptions={{ color: '#fafafa', weight: 1.2, fillColor: color, fillOpacity: 0.92 }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-zinc-900">{town.name}</div>
                <div className="font-mono text-zinc-600">Pop {town.population.toLocaleString('en-IN')}</div>
                <div>
                  Depth: <span className="font-bold" style={{ color }}>{(depth / 100).toFixed(2)} m</span>
                </div>
                {ts?.arrivalMin != null && (
                  <div className="text-zinc-600 font-mono">Front arrival: T+{ts.arrivalMin} min</div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      {/* GEE tracker scene */}
      {activeScene && Array.isArray(activeScene.floodExtent) && Array.isArray(activeScene.baselineExtent) && (
        <>
          <Polygon
            positions={activeScene.baselineExtent}
            pathOptions={{ color: '#0ea5e9', weight: 1, fillColor: '#0ea5e9', fillOpacity: 0.25, dashArray: '4, 4' }}
          >
            <Popup><span className="text-xs">Normal water extent (pre-flood baseline)</span></Popup>
          </Polygon>
          <Polygon
            positions={activeScene.floodExtent}
            pathOptions={{ color: '#ef4444', weight: 2, fillColor: '#ef4444', fillOpacity: 0.4 }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-bold text-zinc-900">{activeScene.title}</div>
                <div className="font-mono">{activeScene.areaKm2} km² inundated</div>
                <div className="text-zinc-600">{activeScene.source}</div>
              </div>
            </Popup>
          </Polygon>
          {(activeScene.villages ?? []).map((v) => (
            <CircleMarker
              key={v.name}
              center={[v.lat, v.lng]}
              radius={4}
              pathOptions={{ color: '#fff', weight: 1, fillColor: '#f59e0b', fillOpacity: 0.95 }}
            >
              <Popup><span className="text-xs font-bold">{v.name}</span></Popup>
            </CircleMarker>
          ))}
        </>
      )}
    </MapContainer>
  );
}
