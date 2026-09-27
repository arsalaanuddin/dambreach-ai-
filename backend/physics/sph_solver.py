"""SPH particle surge solver — stable rebuild.

Particles are emitted at the dam face per the breach hydrograph and advected
downstream under gravity with:
  - pressure-style pairwise repulsion (crowding → shock-front spreading)
  - Manning-like quadratic drag
  - lateral confinement toward the channel centerline
The leading particle edge reproduces SPH's characteristic sharp front; the
particle mass field is kernel-smoothed onto the corridor grid for damage
sampling and frontend rendering.
"""
from __future__ import annotations

import numpy as np

from .breach import DamParams, live_volume_mm3, peak_breach_outflow
from .terrain import KM_TOTAL, bed_elevation, bank_half_width

PARTICLE_MASS_M3 = 2.5e5
MAX_PARTICLES = 3000
DT = 6.0
H_KERNEL = 0.4


def solve_sph(p: DamParams, sample_minutes: list[float], profile: str = "sph", bed_override: np.ndarray | None = None) -> dict:
    rng = np.random.default_rng(42)
    q_peak = peak_breach_outflow(p)
    live_vol = live_volume_mm3(p) * 1e6

    km = np.zeros(0)
    lat = np.zeros(0)
    vx = np.zeros(0)
    vy = np.zeros(0)

    released = 0.0
    samples: list[dict] = []
    targets = sorted(sample_minutes)
    target_idx = 0
    total_s = max(targets) * 60.0
    steps = int(total_s / DT) + 1

    if bed_override is not None:
        bed = np.interp(np.linspace(0, KM_TOTAL, 512), np.linspace(0, KM_TOTAL, len(bed_override)), bed_override)
    else:
        bed = bed_elevation(np.linspace(0, KM_TOTAL, 512))
    bed_grad = -np.gradient(bed) / (KM_TOTAL / 511.0)   # positive downstream slope (m/km)
    bank0 = float(bank_half_width(np.array([0.0]))[0])

    for step in range(steps):
        t_sec = step * DT
        t_min = t_sec / 60.0

        # --- Emit particles per hydrograph ---
        tau = 62.0
        shape = 1.9
        if t_min <= 0:
            q_frac = 0.0
        elif t_min < p.breachFormationTime:
            q_frac = (t_min / p.breachFormationTime) ** shape
        else:
            q_frac = float(np.exp(-(t_min - p.breachFormationTime) / tau))
        vol_step = min(q_frac * q_peak * DT, live_vol - released)
        if vol_step > 0:
            n_new = int(vol_step / PARTICLE_MASS_M3)
            n_new = min(n_new, 40, MAX_PARTICLES - len(km))
            if n_new > 0:
                km = np.concatenate([km, rng.uniform(0, 0.3, n_new)])
                lat = np.concatenate([lat, rng.uniform(-bank0, bank0, n_new)])
                vx = np.concatenate([vx, rng.uniform(5.0, 7.5, n_new)])
                vy = np.concatenate([vy, np.zeros(n_new)])
                released += n_new * PARTICLE_MASS_M3

        if len(km) > 0:
            # --- Histogram density → pressure gradient (fast SPH-style repulsion) ---
            # Particles in crowded bins get pushed apart; reproduces the
            # shock-front spreading of pairwise SPH at O(N) cost.
            bin_edges = np.linspace(0, KM_TOTAL, 145)
            rho_bins, _ = np.histogram(km, bins=bin_edges)
            centers = 0.5 * (bin_edges[:-1] + bin_edges[1:])
            press_bins = np.maximum(rho_bins - 18.0, 0.0) * 0.9
            press_grad = np.gradient(press_bins, centers)     # push down-gradient
            ax_full = -np.interp(km, centers, press_grad) * 0.06

            # --- Driving + drag ---
            g_idx = np.clip((km * 511.0 / KM_TOTAL).astype(int), 0, 511)
            slope = bed_grad[g_idx] / 1000.0
            ax_grav = 9.81 * slope * 0.85
            drag = 0.0012 * vx * np.abs(vx)
            vx += (ax_grav + ax_full - drag) * DT
            vx = np.clip(vx, 1.5, 22.0)   # surge celerity floor: wave keeps propagating

            # Lateral: relax toward centerline + confinement to banks
            bank_loc = np.interp(km, np.linspace(0, KM_TOTAL, 512),
                                 bank_half_width(np.linspace(0, KM_TOTAL, 512)))
            vy += (-0.25 * vy - 0.9 * lat) * DT * 0.08
            lat = np.clip(lat, -bank_loc * 1.25, bank_loc * 1.25)

            # --- Advect ---
            km += vx * DT / 1000.0
            lat += vy * DT / 1000.0
            km = np.clip(km, 0.0, KM_TOTAL)

            # Absorbing outflow at the downstream end
            done = km >= KM_TOTAL - 1e-6
            if done.any():
                keep = ~done
                km, lat, vx, vy = km[keep], lat[keep], vx[keep], vy[keep]

        # --- Sample on target (index-based, never skips) ---
        while target_idx < len(targets) and t_min >= targets[target_idx] - 1e-9:
            t_cap = targets[target_idx]
            if len(km) > 0:
                front_km = float(km.max())
                depth = kernel_depth_grid(km, lat)
            else:
                front_km = 0.0
                depth = np.zeros((144, 25))
            samples.append({
                "t_min": round(float(t_cap), 1),
                "depth": depth,
                "front_km": front_km,
                "n_particles": int(len(km)),
                "released_mm3": released / 1e6,
            })
            target_idx += 1

    return {"samples": samples}


def kernel_depth_grid(km: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Fast particle-mass → depth field: histogram + separable gaussian blur.
    Equivalent to kernel density estimation, O(N) instead of O(N*grid)."""
    grid_km = np.linspace(0, KM_TOTAL, 144)
    grid_lat = np.linspace(-6, 6, 25)
    if len(km) == 0:
        return np.zeros((144, 25))
    dk = (KM_TOTAL - 0.0) / 143.0
    dl = 12.0 / 24.0
    ik = np.clip(((km - 0.0) / dk).astype(int), 0, 143)
    il = np.clip(((lat + 6.0) / dl).astype(int), 0, 24)
    hist = np.zeros((144, 25))
    np.add.at(hist, (ik, il), PARTICLE_MASS_M3)
    # Separable gaussian smoothing (sigma ~ H_KERNEL in cells)
    sig_x = max(H_KERNEL / dk, 0.6)
    sig_y = max(H_KERNEL / dl, 0.6)
    rx = int(max(1, 3 * sig_x))
    xs = np.arange(-rx, rx + 1)
    kx = np.exp(-(xs**2) / (2 * sig_x**2)); kx /= kx.sum()
    ry = int(max(1, 3 * sig_y))
    ys = np.arange(-ry, ry + 1)
    ky = np.exp(-(ys**2) / (2 * sig_y**2)); ky /= ky.sum()
    from numpy import convolve
    smoothed = np.apply_along_axis(lambda c: np.convolve(c, kx, mode='same'), 0, hist)
    smoothed = np.apply_along_axis(lambda c: np.convolve(c, ky, mode='same'), 1, smoothed)
    return (smoothed / (1000.0 * 480.0)).astype(np.float64)
