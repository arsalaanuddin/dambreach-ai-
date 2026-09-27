"""River-corridor terrain model.

Idealized 1D-along-river bathymetry extruded laterally: bed elevation falls
downstream, channel widens, overbank floodplain flattens. Both solvers sample
this so their outputs are directly comparable.
"""
from __future__ import annotations

import numpy as np

KM_TOTAL = 143.0
N_STATIONS = 144          # 1 km spacing
N_LATERAL = 25            # cross-channel cells (12.5 each side)
LAT_HALF_WIDTH_KM = 6.0   # half-width of modeled corridor


def bed_elevation(km: np.ndarray) -> np.ndarray:
    """Bed elevation (m) along the river — Mullaperiyar (~470 m) → Aluva (sea level)."""
    t = km / KM_TOTAL
    return 470.0 * np.exp(-3.1 * t) + 2.0


def bank_half_width(km: np.ndarray) -> np.ndarray:
    """Channel bank half-width (km): gorge mouth at the dam (~0.4 km),
    widening through the Idukki reaches to the wide plains near Aluva."""
    t = km / KM_TOTAL
    return 0.38 + 1.15 * t + 0.08 * np.sin(km / 9.0)


def lateral_grid() -> np.ndarray:
    """Lateral offsets (km) across the corridor, -6 .. +6."""
    return np.linspace(-LAT_HALF_WIDTH_KM, LAT_HALF_WIDTH_KM, N_LATERAL)


def ground_elevation(km: np.ndarray, lat_km: np.ndarray) -> np.ndarray:
    """Floodplain ground elevation (m): bed level rises toward valley walls."""
    K = km[:, None]
    L = lat_km[None, :]
    bank = bank_half_width(K)
    rise = np.clip((np.abs(L) - bank) / 2.5, 0, None) ** 1.6 * 18.0
    return bed_elevation(K) + rise
