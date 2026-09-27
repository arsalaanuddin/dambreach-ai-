"""DamBreach AI — FastAPI backend.

Runs BOTH physics models (SPH + Saint-Venant SWE) per simulation request and
returns frames matching the frontend schema. Designed to run on a laptop CPU:
each full dual-model job completes in a few seconds.
"""
from __future__ import annotations

import time
import uuid
import asyncio
from typing import Any

from fastapi import UploadFile, File, Form

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from physics.breach import DamParams
from physics.swe_solver import solve_swe
from physics.sph_solver import solve_sph
from physics.damage import build_frames
from physics.breach import peak_breach_outflow, live_volume_mm3
from physics.dem_ingest import extract_corridor_from_dem, resample_to_stations

app = FastAPI(
    title="DamBreach AI — Simulation Backend",
    version="0.2.0",
    description="SPH + Saint-Venant dual-model dam-break flood simulation",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory job store (upgrade to Redis/DB later)
JOBS: dict[str, dict[str, Any]] = {}

SAMPLE_MINUTES = list(range(0, 181, 2))  # 91 frames, matching frontend timeline


class SimulateRequest(BaseModel):
    dam: DamParams
    label: str = "Mullaperiyar Dam Break"
    # DEM-supplied corridor (optional): sampled bed profile km/m pairs
    demBedKm: list[float] | None = None
    demBedM: list[float] | None = None
    demSource: str | None = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "models": ["sph", "delft3d"], "jobs": len(JOBS)}


@app.post("/api/simulate")
async def simulate(req: SimulateRequest) -> dict:
    """Run both models synchronously (fast enough for now) and return job id."""
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"status": "queued", "label": req.label, "created": time.time()}

    bed_override = None
    if req.demBedKm and req.demBedM and len(req.demBedKm) > 4:
        import numpy as np
        bed_override = resample_to_stations(np.array(req.demBedKm), np.array(req.demBedM))

    result = run_dual(req.dam, req.label, bed_override=bed_override, dem_source=req.demSource)
    JOBS[job_id].update({"status": "done", "result": result})
    return {"jobId": job_id, "status": "done", **result}


@app.post("/api/scenario/dem/upload")
async def upload_dem_file(
    file: UploadFile = File(...),
    dam_lat: float = Form(9.527),
    dam_lng: float = Form(77.157),
    bearing_deg: float = Form(292.0),
) -> dict:
    """Ingest a GeoTIFF DEM, sample the corridor, return the extracted bed profile."""
    tiff = await file.read()
    extracted = extract_corridor_from_dem(tiff, dam_lat, dam_lng, bearing_deg)
    return {
        "status": "ok" if extracted["dem_ok"] else "fallback",
        "source": extracted["source"],
        "bedKm": [round(float(k), 3) for k in extracted["km"]],
        "bedM": [round(float(b), 2) for b in extracted["bed_m"]],
    }


@app.get("/api/simulate/{job_id}")
async def get_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        return {"error": "job not found", "jobId": job_id}
    return {"jobId": job_id, "status": job["status"], **job.get("result", {})}


def run_dual(dam: DamParams, label: str, bed_override=None, dem_source: str | None = None) -> dict:
    """Execute both solvers and assemble frontend-compatible results."""
    t0 = time.perf_counter()

    # --- Delft3D-style SWE ---
    swe = solve_swe(dam, SAMPLE_MINUTES, profile="delft3d", bed_override=bed_override)
    swe_frames = build_frames(dam, swe["samples"], {}, label, "delft3d")

    # --- SPH ---
    sph = solve_sph(dam, SAMPLE_MINUTES, profile="sph", bed_override=bed_override)
    sph_frames = build_frames_from_sph(dam, sph, label)

    latency = round((time.perf_counter() - t0) * 1000, 1)

    return {
        "delft3d": {"frames": swe_frames, "model": "delft3d", "label": label, "dam": dam.model_dump()},
        "sph": {"frames": sph_frames, "model": "sph", "label": label, "dam": dam.model_dump()},
        "meta": {
            "latencyMs": latency,
            "framesPerRun": len(SAMPLE_MINUTES),
            "engine": "numpy-cpu",
            "sweGrid": [144, 25],
            "demSource": dem_source or "idealized-periyar",
        },
    }


def build_frames_from_sph(dam: DamParams, sph_result: dict, label: str) -> list[dict]:
    """Assemble SPH frames from particle-derived depth grids."""
    from physics.damage import _severity, sample_depth_at
    from data.towns import TOWNS, ROAD_KM

    frames: list[dict] = []
    q_peak = peak_breach_outflow(dam)
    vol_total = live_volume_mm3(dam)

    town_arrival: dict[str, float | None] = {t["id"]: None for t in TOWNS}

    for s_idx, s in enumerate(sph_result["samples"]):
        t_min = s["t_min"]
        depth = s["depth"]  # (144, 25) kernel-mass grid

        town_state: dict[str, Any] = {}
        records: list[dict] = []
        affected = 0
        towns_hit = 0

        for t in TOWNS:
            d_m = sample_depth_at(depth, t["distanceKm"], t["lateralKm"])
            d_cm = float(round(min(d_m * 100, 2500)))
            if town_arrival[t["id"]] is None and d_cm > 20:
                town_arrival[t["id"]] = t_min
            arrival = town_arrival[t["id"]]
            sev = _severity(d_cm)
            aff = int(t["population"] * min(1.0, d_cm / 120) * (1.0 if sev == "critical" else 0.85))
            if d_cm > 20:
                affected += aff
                towns_hit += 1
            town_state[t["id"]] = {"depthCm": d_cm, "arrivalMin": arrival}
            records.append({
                "townId": t["id"], "name": t["name"], "population": t["population"],
                "affectedPopulation": aff, "depthCm": d_cm, "arrivalMin": arrival,
                "severity": sev,
            })

        wet_rows = np.where((depth > 0.05).any(axis=1))[0]
        front_km = float(wet_rows.max()) if len(wet_rows) else 0.0
        front_depth_m = float(depth.max())

        if s_idx > 0:
            prev = frames[-1]
            dt = t_min - prev["tMin"]
            v = (front_km - prev["frontKm"]) / max(dt, 1e-6) * 1000 / 60
            front_v = max(0.4, v)
        else:
            front_v = 7.5

        outflow = q_peak * (t_min / dam.breachFormationTime) ** 1.9 if t_min < dam.breachFormationTime else \
            q_peak * float(np.exp(-(t_min - dam.breachFormationTime) / 62.0))
        released = min(vol_total, s.get("released_mm3", 0.0))
        extent = float(round(((depth > 0.05).sum()) * 1.0 * 0.48, 1))

        flooded = [r for r, rkm in ROAD_KM.items() if front_km >= rkm and sample_depth_at(depth, rkm, 0) > 0.3]

        frames.append({
            "tMin": t_min,
            "frontKm": round(front_km, 2),
            "frontDepthM": round(front_depth_m, 2),
            "frontVelocityMs": round(front_v, 2),
            "releasedMm3": round(float(released), 1),
            "outflowCumecs": round(float(outflow), 0),
            "extentKm2": extent,
            "townState": town_state,
            "floodedRoadIds": flooded,
            "damage": {
                "records": records,
                "totalAffected": affected,
                "townsHit": towns_hit,
                "roadsFlooded": len(flooded),
                "buildingsAtRisk": int(affected * 0.31),
                "economicLossCrores": round(affected * 4.2e-4 * (1 + dam.damHeight / 120), 1),
            },
        })

    return frames



# ---------------------------------------------------------------- GEE tracker

# Mock scenes (mirrors frontend trackerScenes.ts) used when Earth Engine is
# unavailable (no credentials / offline). Demo can never break.
_MOCK_SCENES = [
    {
        "id": "s-2026-09-24", "title": "Periyar Basin — Active Flood",
        "source": "Sentinel-1 IW · VV+VH · GEE · Otsu", "capturedAt": "2026-09-24 06:12 IST",
        "areaKm2": 184.6, "villagesAffected": 23, "populationExposed": 41200,
        "cloudCoverPct": 0, "trend": "expanding",
        "sensorNote": "SAR penetrates 100% cloud cover; σ⁰ drop −7.2 dB vs. baseline",
        "floodExtent": [[10.05, 76.30], [10.08, 76.42], [10.12, 76.55], [10.16, 76.66], [10.18, 76.78], [10.15, 76.88], [10.08, 76.94], [10.00, 76.96], [9.92, 76.90], [9.86, 76.80], [9.84, 76.66], [9.88, 76.50], [9.94, 76.38], [10.00, 76.31]],
        "baselineExtent": [[10.02, 76.36], [10.04, 76.46], [10.08, 76.58], [10.11, 76.68], [10.11, 76.78], [10.07, 76.85], [10.00, 76.87], [9.95, 76.82], [9.92, 76.72], [9.93, 76.58], [9.97, 76.46], [10.00, 76.38]],
        "villages": [{"name": "Aluva", "lat": 10.102, "lng": 76.352}, {"name": "Kalady", "lat": 10.148, "lng": 76.442}, {"name": "Perumbavoor", "lat": 10.115, "lng": 76.475}, {"name": "Angamaly", "lat": 10.192, "lng": 76.382}, {"name": "Kothamangalam", "lat": 10.058, "lng": 76.632}],
    },
    {
        "id": "s-2026-09-11", "title": "Bharathapuzha Basin — Receding",
        "source": "Sentinel-1 IW · VV · GEE · Otsu", "capturedAt": "2026-09-11 06:24 IST",
        "areaKm2": 96.2, "villagesAffected": 11, "populationExposed": 18700,
        "cloudCoverPct": 0, "trend": "receding",
        "sensorNote": "Flood extent receding −18% vs. previous pass",
        "floodExtent": [[10.78, 75.90], [10.80, 76.00], [10.79, 76.12], [10.75, 76.20], [10.68, 76.22], [10.62, 76.16], [10.60, 76.05], [10.64, 75.95], [10.71, 75.89]],
        "baselineExtent": [[10.76, 75.94], [10.77, 76.02], [10.75, 76.10], [10.70, 76.15], [10.65, 76.12], [10.63, 76.04], [10.66, 75.97], [10.72, 75.92]],
        "villages": [{"name": "Ponnani", "lat": 10.772, "lng": 75.924}, {"name": "Kuttippuram", "lat": 10.702, "lng": 76.042}, {"name": "Pattambi", "lat": 10.802, "lng": 76.122}],
    },
    {
        "id": "s-2026-08-02", "title": "Tungabhadra Lowlands — Inundation",
        "source": "Sentinel-1 IW · VV+VH · GEE · Change-detect", "capturedAt": "2026-08-02 05:48 IST",
        "areaKm2": 232.4, "villagesAffected": 31, "populationExposed": 66800,
        "cloudCoverPct": 0, "trend": "expanding",
        "sensorNote": "Persistent inundation 11 days; residual pools detected",
        "floodExtent": [[15.28, 76.35], [15.32, 76.48], [15.36, 76.60], [15.33, 76.72], [15.26, 76.78], [15.16, 76.76], [15.10, 76.66], [15.08, 76.52], [15.14, 76.40], [15.22, 76.34]],
        "baselineExtent": [[15.26, 76.40], [15.29, 76.50], [15.31, 76.60], [15.28, 76.68], [15.22, 76.70], [15.16, 76.64], [15.14, 76.54], [15.18, 76.44]],
        "villages": [{"name": "Sindhanur", "lat": 15.352, "lng": 76.752}, {"name": "Mantralayam", "lat": 15.942, "lng": 77.428}, {"name": "Kowthalam", "lat": 15.742, "lng": 77.222}, {"name": "Yemmiganur", "lat": 15.782, "lng": 77.482}],
    },
]

_GEE_STATUS = {"credentials": None, "last_error": None}


@app.get("/api/tracker/floods")
async def tracker_floods(bbox: str | None = None) -> dict:
    """Flood scenes: live GEE (Sentinel-1 Otsu) when credentials exist, else mock.

    bbox=west,south,east,north filters/params the query when live.
    """
    creds = _GEE_STATUS["credentials"]
    if creds:
        try:
            import ee
            if not ee.data._credentials:
                ee.Initialize(credentials=creds)
            # Real Sentinel-1 Otsu flood mapping over the bbox
            w, s, e, n = (float(x) for x in bbox.split(",")) if bbox else (76.2, 9.4, 77.3, 10.3)
            aoi = ee.Geometry.Rectangle([w, s, e, n])
            col = (ee.ImageCollection("COPERNICUS/S1_GRD")
                   .filterBounds(aoi)
                   .filterDate(ee.Date(sys_date_days_ago(6)), ee.Date("now"))
                   .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
                   .select("VV"))
            recent = col.mosaic().clip(aoi)
            before = col.filterDate(ee.Date(sys_date_days_ago(60)), ee.Date(sys_date_days_ago(30))).mosaic().clip(aoi)
            # Simple Otsu-proxy: flood = VV drop > 7 dB vs baseline
            flood = recent.subtract(before).lt(-7.0)
            area_km2 = flood.multiply(ee.Image.pixelArea()).divide(1e6).reduceRegion(
                reducer=ee.Reducer.sum(), geometry=aoi, scale=30, maxPixels=1e10)
            area_val = float(area_km2.getInfo().get("VV", 0.0))
            return {
                "status": "live",
                "engine": "gee-sentinel1-otsu",
                "scenes": [{
                    "id": f"live-{int(time.time())}",
                    "title": "Live GEE Flood Extent",
                    "source": "Sentinel-1 IW · VV · GEE · Otsu-proxy",
                    "capturedAt": time.strftime("%Y-%m-%d %H:%M IST", time.gmtime()),
                    "areaKm2": round(area_val, 1),
                    "villagesAffected": max(1, int(area_val / 8)),
                    "populationExposed": max(100, int(area_val * 223)),
                    "cloudCoverPct": 0,
                    "trend": "expanding",
                    "sensorNote": "Live Earth Engine computation — VV drop > 7 dB vs 30–60 d baseline",
                }],
            }
        except Exception as exc:  # noqa: BLE001
            _GEE_STATUS["last_error"] = str(exc)
            # fall through to mock scenes below

    return {"status": "mock", "engine": "mock-scenes", "scenes": _MOCK_SCENES}


def sys_date_days_ago(d: int) -> str:
    from datetime import datetime, timedelta
    return (datetime.utcnow() - timedelta(days=d)).strftime("%Y-%m-%d")


@app.post("/api/tracker/credentials")
async def set_gee_credentials(service_account_json: dict) -> dict:
    """Accept Earth Engine service-account credentials (or clear with {"clear": true})."""
    if service_account_json.get("clear"):
        _GEE_STATUS["credentials"] = None
        return {"status": "cleared"}
    _GEE_STATUS["credentials"] = service_account_json
    return {"status": "stored", "note": "Will be used on next /api/tracker/floods call"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8100)
