"""DEM GeoTIFF ingestion — Custom Scenario terrain support.

Accepts an uploaded GeoTIFF, samples it along the river corridor (dam point +
bearing), and derives the bed profile + bank widths the solvers need. Falls
back to the idealized Periyar profile when no DEM is supplied.

rasterio is optional at runtime: if unavailable, elevation sampling uses pure
NumPy over a flat/pseudo profile so the pipeline never hard-fails.
"""
from __future__ import annotations

import io
import math
import numpy as np

from .terrain import KM_TOTAL, N_STATIONS, bed_elevation, bank_half_width

try:
    import rasterio
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False


def extract_corridor_from_dem(
    tiff_bytes: bytes,
    dam_lat: float,
    dam_lng: float,
    bearing_deg: float = 292.0,   # downstream Periyar bearing (WNW) — configurable
    sample_km: float = 1.0,
) -> dict:
    """Sample the DEM along the corridor centerline.

    Returns {km[], bed_m[], dem_ok, source}. When rasterio/parse fails, returns
    the idealized profile with dem_ok=False so callers degrade gracefully.
    """
    n = int(KM_TOTAL / sample_km) + 1
    kms = np.linspace(0, KM_TOTAL, n)

    if not HAS_RASTERIO:
        return {"km": kms, "bed_m": bed_elevation(kms), "dem_ok": False, "source": "idealized (rasterio unavailable)"}

    try:
        with rasterio.open(io.BytesIO(tiff_bytes)) as src:
            dem = src.read(1).astype(np.float64)
            transform = src.transform

        # Sample centerline: convert km-along-bearing → lon/lat → pixel row/col
        bearing = math.radians(bearing_deg)
        dlat_per_km = 1.0 / 110.574
        dlng_per_km = 1.0 / (111.320 * max(0.2, math.cos(math.radians(dam_lat))))
        lat_km = np.array([dam_lat + k * math.cos(bearing) * dlat_per_km for k in kms])
        lng_km = np.array([dam_lng + k * math.sin(bearing) * dlng_per_km for k in kms])

        # world → pixel (affine transform)
        inv = ~transform
        rows, cols = [], []
        H, W = dem.shape
        for lat_v, lng_v in zip(lat_km, lng_km):
            col_f, row_f = inv * (lng_v, lat_v)
            r = int(np.clip(round(row_f), 0, H - 1))
            c = int(np.clip(round(col_f), 0, W - 1))
            rows.append(r)
            cols.append(c)
        bed = dem[np.array(rows), np.array(cols)].astype(np.float64)

        # Enforce monotonically non-increasing bed (water flows downstream):
        # small rises are smoothed out with a light cumulative-min filter.
        bed = np.minimum.accumulate(bed)

        return {
            "km": kms,
            "bed_m": bed,
            "dem_ok": True,
            "source": f"GeoTIFF {W}x{H}",
        }
    except Exception as exc:  # noqa: BLE001
        return {
            "km": kms,
            "bed_m": bed_elevation(kms),
            "dem_ok": False,
            "source": f"idealized (DEM parse failed: {exc})",
        }


def resample_to_stations(km_arr: np.ndarray, bed_arr: np.ndarray) -> np.ndarray:
    """Resample a sampled bed profile onto the solver's 144 stations."""
    return np.interp(np.linspace(0, KM_TOTAL, N_STATIONS), km_arr, bed_arr)
