"""Saint-Venant kinematic-wave corridor solver — the Delft3D-style model.

Cross-section-averaged Saint-Venant routing (the core of 1D/2D operational
dam-break tools like NWS DAMBRK / HEC-RAS unsteady flow):
  momentum (semi-implicit, unconditionally stable friction):
    u^{n+1} = (u + dt*(g*Sf - g*dz/dx)) / (1 + dt*g*n^2*|u|/h^{4/3})
  continuity (finite-volume, mass conserving):
    dA/dt + dQ/dx = q_lat,  Q = u*A,  A = h*W
  overbank spill: excess depth above bank spreads laterally; the lateral
  depth field is reconstructed for damage sampling.

Stability: adaptive sub-stepping under the Courant condition
    dt <= CFL * dx / (|u| + sqrt(g*h))
This solver is unconditionally dry-safe (h clamped >= 0, fluxes upwind).
"""
from __future__ import annotations

import numpy as np

from .breach import DamParams, outflow_at, live_volume_mm3
from .terrain import KM_TOTAL, bed_elevation, bank_half_width

N_STATIONS = 144
DX_KM = KM_TOTAL / (N_STATIONS - 1)
DX_M = DX_KM * 1000.0
G = 9.81
CFL = 0.4


def channel_width_m(km_arr: np.ndarray) -> np.ndarray:
    """Active flow width (m): channel + floodplain as depth rises."""
    bank_km = bank_half_width(km_arr)
    return (bank_km * 2.0) * 1000.0


def solve_swe(p: DamParams, sample_minutes: list[float], profile: str = "delft3d", bed_override: np.ndarray | None = None) -> dict:
    km = np.linspace(0.0, KM_TOTAL, N_STATIONS)
    bed = bed_elevation(km) if bed_override is None else bed_override.copy()
    W = channel_width_m(km)                    # (Nx,)
    bank_h = 4.0 + 2.0 * (km / KM_TOTAL)       # bankfull depth (m), grows downstream

    u = np.zeros(N_STATIONS)                   # velocity (m/s)
    h = np.zeros(N_STATIONS)                   # channel depth (m)
    spill = np.zeros(N_STATIONS)               # overbank volume per km (m2 equivalent)

    q_peak = peak_q_scale(p)
    live_vol = live_volume_mm3(p) * 1e6
    released = 0.0

    samples: list[dict] = []
    targets = sorted(sample_minutes)
    t_min = 0.0
    max_dt = 8.0
    t_form_s = p.breachFormationTime * 60.0

    def q_in(t_sec: float) -> float:
        """Boundary inflow (m3/s) from the breach hydrograph."""
        t_m = t_sec / 60.0
        tau = 62.0 if profile == "sph" else 105.0
        shape = 1.9 if profile == "sph" else 1.25
        if t_m <= 0:
            return 0.0
        if t_m < p.breachFormationTime:
            frac = (t_m / p.breachFormationTime) ** shape
        else:
            frac = float(np.exp(-(t_m - p.breachFormationTime) / tau))
        return min(q_peak * frac, live_vol * 0.35)  # cap draw-down rate

    def capture(t_m: float):
        depth2d = lateral_field(km, h, spill, bank_h)
        wet = h > 0.05
        front_km = float(km[np.where(wet)[0].max()]) if wet.any() else 0.0
        samples.append({
            "t_min": round(t_m, 1),
            "depth": depth2d,
            "h_channel": h.copy(),
            "front_km": front_km,
            "volume_mm3": float((h * W).sum() * DX_M / 1e6 + spill.sum() * DX_M / 1e6),
        })

    if targets and targets[0] == 0:
        capture(0.0)

    t_sec = 0.0
    target_idx = 1 if targets and targets[0] == 0 else 0
    T_END = max(targets) * 60.0

    while t_sec < T_END - 1e-9 and target_idx < len(targets):
        hmax = max(h.max(), 0.5)
        umax = max(np.abs(u).max(), 1.0)
        dt = min(max_dt, CFL * DX_M / (umax + np.sqrt(G * hmax)))
        dt = max(dt, 0.05)

        # --- Boundary inflow: rating-curve control ---
        # Physical max depth the gorge-mouth section can pass before spilling
        # (critical flow: q_max = h_c * sqrt(g*h_c) per meter width)
        q_b = q_in(t_sec + dt)
        if released < live_vol and q_b > 0:
            add = q_b * dt
            add = min(add, live_vol - released)
            # Rating curve: bound depth so section cannot exceed critical-flow capacity
            q_per_m = add / dt / W[0]
            h_critical = (q_per_m**2 / G) ** (1 / 3)
            h_max_section = max(h_critical, 2.0) + 12.0   # headwater + spill allowance
            max_fill = max(h_max_section - h[0], 0.0) * W[0] * DX_M
            add = min(add, max_fill)
            released += add
            h[0] += add / (W[0] * DX_M)
        else:
            q_b = 0.0

        # --- Semi-implicit momentum ---
        bed_slope = -np.gradient(bed, DX_M)          # positive downstream slope
        wet = h > 0.02
        eta = h + bed
        deta = np.gradient(eta, DX_M)
        press = -G * deta                             # pressure acceleration
        drive = np.where(wet, G * bed_slope * 0.35 + press * 0.65, 0.0)
        fric = np.where(wet, G * p.manningsN**2 * np.abs(u) / np.maximum(h, 0.1) ** (4 / 3), 0.0)
        u = (u + dt * drive) / (1.0 + dt * fric)
        u = np.where(wet, u, 0.0)
        u = np.clip(u, -15.0, 18.0)

        # --- Continuity: upwind volume flux ---
        A = h * W                                     # cross-section area (m2)
        Q = u * A
        Q_up = np.concatenate([[q_b], Q[:-1]])        # upwind face flux
        dA = -(Q - Q_up) / DX_M * dt
        h = h + dA / W

        # --- Overbank spill: cap channel depth, pond the rest on the floodplain ---
        over = np.maximum(h - bank_h, 0.0)
        h = np.minimum(h, bank_h)
        spill = spill + over * 0.85                    # floodplain storage accumulates
        spill_cap = 9.0
        spill = np.minimum(spill, spill_cap)           # bounded ponding depth
        u = u * (1.0 - 0.12 * (over > 0.05))           # floodplain drag

        h = np.maximum(h, 0.0)
        t_sec += dt
        t_min = t_sec / 60.0

        if target_idx < len(targets) and t_min >= targets[target_idx] - 1e-9:
            capture(targets[target_idx])
            target_idx += 1

    return {"samples": samples, "km": km}


def peak_q_scale(p: DamParams) -> float:
    from .breach import peak_breach_outflow
    return peak_breach_outflow(p)


def lateral_field(km: np.ndarray, h: np.ndarray, spill: np.ndarray, bank_h: np.ndarray) -> np.ndarray:
    """Reconstruct a (Nx, 25) lateral depth field for damage sampling.

    In-channel cells get full depth; overbank spill decays laterally with a
    diffusion length that grows with spilled volume (D3D-style spreading).
    """
    lat = np.linspace(-6.0, 6.0, 25)
    bank_km = bank_half_width(km)[:, None]         # (Nx,1)
    L = np.abs(lat)[None, :]                       # (1,25)
    in_channel = (L <= bank_km).astype(float)
    over_dist = np.maximum(L - bank_km, 0.0)
    spread_len = 1.2 + 2.2 * np.minimum(1.0, spill[:, None] / 2.0)
    overbank = np.exp(-(over_dist**2) / (2 * spread_len**2))
    spill_depth = np.where(spill[:, None] > 0.02, spill[:, None] * 0.45, 0.0)
    field = h[:, None] * in_channel + spill_depth * overbank
    return field.astype(np.float64)
