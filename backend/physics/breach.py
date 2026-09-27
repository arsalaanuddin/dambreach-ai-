"""Breach hydrograph + reservoir drain model (Froehlich-style).

Produces the inflow boundary condition consumed by both the SWE and SPH solvers.
"""
from __future__ import annotations

import math
from pydantic import BaseModel, Field


class DamParams(BaseModel):
    damHeight: float = Field(53.0, gt=1, le=300, description="Dam height (m)")
    damWidth: float = Field(365.0, gt=10, le=3000, description="Crest length (m)")
    reservoirVolume: float = Field(443.2, gt=0.1, le=50000, description="Gross storage (Mm3)")
    reservoirLevel: float = Field(98.0, gt=5, le=100, description="Filling percentage")
    breachWidth: float = Field(120.0, gt=5, le=600, description="Final breach width (m)")
    breachFormationTime: float = Field(20.0, gt=1, le=240, description="Formation time (min)")
    manningsN: float = Field(0.045, gt=0.01, le=0.15, description="Channel roughness")


def peak_breach_outflow(p: DamParams) -> float:
    """Froehlich (1995)-style peak discharge estimate (m3/s)."""
    depth = 0.85 * p.damHeight
    return 7.7 * depth**1.85 * p.breachWidth**0.72


def live_volume_mm3(p: DamParams) -> float:
    """Live storage available for release (millions m3)."""
    return p.reservoirVolume * (p.reservoirLevel / 100.0)


def outflow_at(t_min: float, p: DamParams, q_peak: float, profile: str = "delft3d") -> float:
    """Time-varying breach outflow (m3/s).

    SPH: sharper rise, quicker collapse (particle surge signature).
    Delft3D: smoother rise, broad recession (grid-diffused signature).
    """
    t_form = p.breachFormationTime
    tau = 62.0 if profile == "sph" else 105.0
    shape = 1.9 if profile == "sph" else 1.25
    if t_min <= 0:
        return 0.0
    if t_min < t_form:
        return q_peak * (t_min / t_form) ** shape
    return q_peak * math.exp(-(t_min - t_form) / tau)
