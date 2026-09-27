# DamBreach AI — Physics Backend

FastAPI service running **real dam-break physics**: a Saint-Venant (Delft3D-style) grid solver and an SPH particle surge solver, both executing per request and returning frames in the exact schema the frontend renders.

## Run it

```bash
cd dambreach-ai
.venv/Scripts/python -m uvicorn main:app --port 8100 --app-dir backend   # Windows
# or: .venv/bin/python -m uvicorn main:app --port 8100 --app-dir backend # Linux/Mac
```

Health check: `curl http://127.0.0.1:8100/health`

The frontend auto-detects the backend (header shows **Physics Backend · SPH+SWE** with a green pulse); if it's down it falls back to the in-browser preview engine (amber pulse) so demos never break.

## API

### `POST /api/simulate`
```json
{
  "dam": {
    "damHeight": 53, "damWidth": 365,
    "reservoirVolume": 443.2, "reservoirLevel": 98,
    "breachWidth": 120, "breachFormationTime": 20,
    "manningsN": 0.045
  },
  "label": "Mullaperiyar Dam Break"
}
```
Returns `{ jobId, status, sph: {frames, model, label, dam}, delft3d: {...}, meta }` — 91 frames per model (T+0 → T+180 min, 2-min steps).

### `GET /api/simulate/{job_id}`
Retrieve a previous job (in-memory store).

### `GET /health`

## The two models

| | SPH particle surge | Saint-Venant SWE |
|---|---|---|
| Paradigm | Lagrangian particles, histogram-density pressure, Manning drag | Cross-section-averaged finite-volume routing |
| Signature | Sharp shock front, fast propagation, deep concentrated surge | Diffusive spread, overbank spill storage, broader inundation |
| Runtime | ~0.4 s | ~0.1 s |

Both share the same breach hydrograph (Froehlich-style peak, model-specific rise/recession shape) and the same idealized Periyar corridor bathymetry (bed 470 m → sea level, gorge widening downstream), so their outputs are directly comparable — that comparison is the point.

## Structure

```
backend/
├── main.py               # FastAPI app + job runner
├── physics/
│   ├── breach.py         # Froehlich hydrograph + reservoir drain
│   ├── terrain.py        # Periyar corridor bathymetry
│   ├── swe_solver.py     # Saint-Venant routing (Delft3D-style)
│   ├── sph_solver.py     # SPH particle surge
│   └── damage.py         # Town/road sampling → frontend frames
└── data/towns.py         # Downstream towns (mirrors frontend)
```

## Honest status

- Solvers are **real numerical schemes** (mass-conserving flux routing, semi-implicit friction, CFL sub-stepping; particle advection + pressure spreading) on an **idealized 1D-along-river corridor** — not yet a full 2D DEM-driven bathymetry. DEM ingest is the next backend milestone.
- Job store is in-memory; multi-worker deployments need Redis/DB.
