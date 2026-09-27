# DamBreach AI — Frontend Command Dashboard

Dam-break flood simulation & HADR command dashboard. This is the **frontend-first phase**: the entire experience runs client-side on a preview physics engine, with a clean backend seam (`src/services/api.ts`) for the future Python/SPH/Delft3D backend.

## Run it

```bash
cd frontend
npm install
npm run dev        # http://localhost:5177
```

## Three Modes

| Mode | What it does |
|---|---|
| **Custom Scenario** | Tune dam height, crest length, reservoir volume/level, breach width, formation time, Manning's n — run a hypothetical break anywhere (demo geography: Periyar) |
| **Indian River Demo** | Preloaded Mullaperiyar Dam (Kerala) open-data config; judges tweak live knobs and watch the floodwave propagate down the real Periyar course to Aluva |
| **GEE Live Tracker** | Sentinel-1 SAR flood scenes (mock feeds until Earth Engine backend lands) with flood/baseline polygons, village markers, KML export |

## What's inside

- `src/lib/simEngine.ts` — preview physics: Froehlich-style breach outflow, floodwave front kinematics, per-town depth/arrival, damage model
- `src/data/damData.ts` — Mullaperiyar open-data specs, real Periyar river centerline (dam → Idukki → Malayattoor → Aluva), towns, roads
- `src/data/trackerScenes.ts` — mock GEE satellite passes
- `src/components/MapViewer.tsx` — Leaflet map, depth-colored flood ribbons along the river, foam front, velocity streaks
- `src/utils/exporters.ts` — KML, GeoJSON, 1-page SitRep PDF exports
- `src/services/api.ts` — **backend seam**: every function maps 1:1 to a future endpoint (`POST /simulate`, `GET /tracker/floods`, …)

## Backend roadmap (next phase)

1. FastAPI + WebSocket job runner (`/api/simulate`, `/ws/sim/{job}`)
2. Real SPH surge solver + 2D shallow-water solver (NumPy/CuPy)
3. DEM upload pipeline (GeoTIFF ingest, terrain preprocessing)
4. Google Earth Engine integration for live Sentinel-1 flood mapping
5. Shapefile export + WorldPop/OSM damage analysis
