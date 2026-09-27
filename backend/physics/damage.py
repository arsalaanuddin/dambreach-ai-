"""Sample solver state at town/road locations and assemble frontend frames.

Outputs match the frontend's SimFrame schema exactly (types/sim.ts), so the
dashboard renders backend results without any transformation.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

from data.towns import TOWNS, ROAD_KM
from .breach import DamParams, peak_breach_outflow, live_volume_mm3, outflow_at
from .terrain import KM_TOTAL


def _severity(depth_cm: float) -> str:
    if depth_cm >= 300:
        return "critical"
    if depth_cm >= 150:
        return "warning"
    if depth_cm >= 40:
        return "watch"
    return "safe"


def sample_depth_at(depth_grid: np.ndarray, km: float, lat_km: float) -> float:
    """Bilinear-ish sample of the depth field at (km, lateral km)."""
    grid_km = np.linspace(0, KM_TOTAL, depth_grid.shape[0])
    grid_lat = np.linspace(-6, 6, depth_grid.shape[1])
    i = int(np.clip(np.searchsorted(grid_km, km), 1, len(grid_km) - 1))
    j = int(np.clip(np.searchsorted(grid_lat, lat_km), 1, len(grid_lat) - 1))
    return float(depth_grid[i - 1:i + 1, j - 1:j + 1].max())


def build_frames(
    dam: DamParams,
    swe_samples: list[dict],
    arrival_hint: dict[str, float | None],
    label: str,
    model: str,
) -> list[dict]:
    """Convert solver samples into frontend SimFrame dicts."""
    frames: list[dict] = []
    q_peak = peak_breach_outflow(dam)
    vol_total = live_volume_mm3(dam)

    # Arrival times: first sample where town cell is wet
    town_arrival: dict[str, float | None] = {t["id"]: None for t in TOWNS}
    town_depth_cm: dict[str, float] = {t["id"]: 0.0 for t in TOWNS}

    cumulative_affected = 0
    for s_idx, s in enumerate(swe_samples):
        t_min = s["t_min"]
        depth = s["depth"]

        town_state: dict[str, Any] = {}
        records: list[dict] = []
        affected_now = 0
        towns_hit = 0

        for t in TOWNS:
            d_m = sample_depth_at(depth, t["distanceKm"], t["lateralKm"])
            d_cm = float(round(d_m * 100))
            if town_arrival[t["id"]] is None and d_cm > 20:
                town_arrival[t["id"]] = t_min
            arrival = town_arrival[t["id"]]

            sev = _severity(d_cm)
            frac = min(1.0, d_cm / 120.0)
            aff = int(t["population"] * frac * (1.0 if sev == "critical" else 0.85))
            if d_cm > 20:
                affected_now += aff
                towns_hit += 1

            town_state[t["id"]] = {"depthCm": d_cm, "arrivalMin": arrival}
            records.append({
                "townId": t["id"],
                "name": t["name"],
                "population": t["population"],
                "affectedPopulation": aff,
                "depthCm": d_cm,
                "arrivalMin": arrival,
                "severity": sev,
            })

        flooded_roads = [
            r_id for r_id, r_km in ROAD_KM.items()
            if s["front_km"] >= r_km and sample_depth_at(depth, r_km, 0.0) > 0.3
        ]

        peak = max((r["depthCm"] for r in records), default=0)
        # Front metrics from grid
        wet_rows = np.where((depth > 0.05).any(axis=1))[0]
        front_km = float(wet_rows.max()) if len(wet_rows) else 0.0
        front_depth_m = float(depth.max())

        # Simple velocity estimate from front advance
        if s_idx > 0:
            prev_front = frames[-1]["frontKm"]
            dt = t_min - frames[-1]["tMin"]
            v = (front_km - prev_front) / max(dt, 1e-6) * 1000 / 60  # km/min → m/s
            front_v = max(0.4, v)
        else:
            front_v = 6.0

        outflow = outflow_at(t_min, dam, q_peak, model if model in ('sph', 'delft3d') else 'delft3d')
        released_mm3 = min(vol_total, s.get("volume_mm3", 0.0) or vol_total * min(1, t_min / (dam.breachFormationTime * 2.4)))

        wet_area_km2 = float(round(((depth > 0.05).sum()) * 1.0 * 0.48, 1))  # 1 km x ~0.48 km/cell

        frames.append({
            "tMin": t_min,
            "frontKm": round(front_km, 2),
            "frontDepthM": round(front_depth_m, 2),
            "frontVelocityMs": round(front_v, 2),
            "releasedMm3": round(float(released_mm3), 1),
            "outflowCumecs": round(float(outflow), 0),
            "extentKm2": wet_area_km2,
            "townState": town_state,
            "floodedRoadIds": flooded_roads,
            "damage": {
                "records": records,
                "totalAffected": affected_now,
                "townsHit": towns_hit,
                "roadsFlooded": len(flooded_roads),
                "buildingsAtRisk": int(affected_now * 0.31),
                "economicLossCrores": round(affected_now * 4.2e-4 * (1 + dam.damHeight / 120), 1),
            },
        })

    return frames
