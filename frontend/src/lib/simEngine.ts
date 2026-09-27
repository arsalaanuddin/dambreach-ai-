// DamBreach AI — preview physics engine (client-side).
// Mirrors the future backend chain: breach hydrograph → floodwave propagation → damage.
// NOTE: offline standalone build; swap with API calls in src/services/api.ts when backend lands.

import type {
  DamParams, Town, SimFrame, SimResult, DamageSummary, DamageRecord, ModelTag,
} from '../types/sim';

/**
 * Model profiles: SPH (Lagrangian particle surge) vs Delft3D (Eulerian grid routing).
 * Distinct celerity, diffusion, recession and corridor-shaping coefficients so the
 * two runs produce genuinely different — comparable — physics signatures.
 */
export interface ModelProfile {
  tag: ModelTag;
  name: string;
  /** Front celerity multiplier (√t coefficient) */
  celerity: number;
  /** Downstream depth decay length (km) — small = concentrated surge */
  decayLength: number;
  /** Lateral corridor half-width growth (km at full development) */
  corridorWidth: number;
  /** Post-peak recession time constant (min) — large = sustained flooding */
  recessionTau: number;
  /** Hydrograph shape exponent — SPH spikes, D3D broadens */
  hydroShape: number;
  /** Depth smoothing toward towns (diffusion factor 0–1) */
  diffusion: number;
  /** Roughness sensitivity multiplier (Manning's n effect on celerity) */
  roughnessSensitivity: number;
}

export const SPH_PROFILE: ModelProfile = {
  tag: 'sph',
  name: 'SPH Particle Surge',
  celerity: 8.4,
  decayLength: 52,
  corridorWidth: 2.0,
  recessionTau: 62,
  hydroShape: 1.9,
  diffusion: 0.35,
  roughnessSensitivity: 1.35,
};

export const DELFT3D_PROFILE: ModelProfile = {
  tag: 'delft3d',
  name: 'Delft3D Grid Routing',
  celerity: 6.1,
  decayLength: 78,
  corridorWidth: 3.4,
  recessionTau: 105,
  hydroShape: 1.25,
  diffusion: 0.7,
  roughnessSensitivity: 0.8,
};

/** Froehlich-style peak breach outflow (m³/s) */
export function peakBreachOutflow(dam: DamParams): number {
  const depth = dam.damHeight * 0.85; // breach to 85% of height
  return 7.7 * Math.pow(depth, 1.85) * Math.pow(dam.breachWidth, 0.72);
}

/** Reservoir live storage released through the breach (millions m³) */
export function releasedVolumeMm3(dam: DamParams): number {
  return dam.reservoirVolume * (dam.reservoirLevel / 100);
}

/** Floodwave propagation preview along the river centerline for a given model profile */
export function simulateWithProfile(
  dam: DamParams,
  towns: Town[],
  label: string,
  profile: ModelProfile,
): SimResult {
  const V = releasedVolumeMm3(dam);          // mm³
  const Qp = peakBreachOutflow(dam);         // m³/s
  const tForm = dam.breachFormationTime;     // min
  const dt = 2;                              // frame interval (min)
  const T = 180;                             // horizon (min)
  const frameCount = Math.floor(T / dt) + 1;

  const peakOut = Math.min(Qp, V * 1e6 / (tForm * 60) * 2.2); // cap by storage drain
  const rough = Math.pow(dam.manningsN / 0.045, -profile.roughnessSensitivity); // smoother → faster

  // Attenuation law for the front position/depth (calibrated feel, physically shaped)
  const frontKm = (t: number) =>
    Math.max(0, profile.celerity * rough * Math.sqrt(Math.max(0, t)) * Math.pow(peakOut / 5e4, 0.25));
  const peakDepthAt = (km: number, t: number) => {
    const celerityDep = Math.pow(peakOut / 5e4, 0.4);
    const geo = Math.exp(-km / profile.decayLength) * (1 / (1 + km / 30));
    const hydro = Math.exp(-Math.max(0, t - tForm) / profile.recessionTau) * Math.min(1, t / Math.max(tForm, 1));
    return 1450 * celerityDep * geo * hydro;
  };

  // Inundated extent estimate: corridor length × mean width × mean depth factor
  const extentAt = (t: number): number => {
    const fk = frontKm(t);
    if (fk <= 0.1) return 0;
    const meanDepthM = peakDepthAt(fk * 0.4, t) * 0.6;
    const widthKm = 2 * (0.5 + profile.corridorWidth * Math.min(1, fk / 40)) * 0.55;
    return Math.round(fk * widthKm * Math.min(1, meanDepthM / 2) * 10) / 10;
  };

  const severityOf = (depthCm: number): DamageRecord['severity'] => {
    if (depthCm >= 300) return 'critical';
    if (depthCm >= 150) return 'warning';
    if (depthCm >= 40) return 'watch';
    return 'safe';
  };

  // Town arrival times from front kinematics
  const arrivalOf = (town: Town): number | null => {
    const target = town.distanceKm * (1 + Math.abs(town.lateralKm) * 0.18);
    let lo = 0, hi = T;
    if (frontKm(T) < target) return null;
    while (hi - lo > 0.1) {
      const mid = (lo + hi) / 2;
      if (frontKm(mid) >= target) hi = mid; else lo = mid;
    }
    return Math.round(lo);
  };

  // Pre-compute static per-town geometry factors
  const townsPre = towns.map((town) => {
    const lateral = Math.abs(town.lateralKm);
    const shield = Math.exp(-lateral * 0.55); // elevation shadow behind ridges
    return { town, arrival: arrivalOf(town), shield };
  });

  const frames: SimFrame[] = [];
  const cumulative = { affected: 0, townsHit: 0, roadsFlooded: 0 };

  for (let i = 0; i < frameCount; i++) {
    const t = i * dt;
    const fk = frontKm(t);
    const fd = peakDepthAt(fk, t);
    const fv = Math.max(0.4, Math.pow(fd, 0.5) * 1.35);
    const released = V * (1 - Math.exp(-t / (tForm * 2.4)));
    const outflow = peakOut * (t < tForm ? (t / tForm) ** profile.hydroShape : Math.exp(-(t - tForm) / profile.recessionTau));

    const townState: SimFrame['townState'] = {};
    const records: DamageRecord[] = [];
    let frameAffected = 0;
    let frameTownsHit = 0;

    for (const { town, arrival, shield } of townsPre) {
      if (arrival === null || t < arrival) {
        townState[town.id] = { depthCm: 0, arrivalMin: arrival };
        records.push({ townId: town.id, name: town.name, population: town.population, affectedPopulation: 0, depthCm: 0, arrivalMin: arrival, severity: 'safe' });
        continue;
      }
      const since = t - arrival;
      const rawDepth = peakDepthAt(town.distanceKm, t) * shield * (0.55 + 0.45 * Math.exp(-since / 40));
      // Grid models diffuse; SPH concentrates. Blend toward lateral mean by diffusion factor.
      const lateralMean = peakDepthAt(town.distanceKm, t) * (0.55 + 0.45 * Math.exp(-since / 40));
      const depth = rawDepth * (1 - profile.diffusion) + lateralMean * profile.diffusion * (1 - Math.abs(town.lateralKm) * 0.12);
      const depthCm = Math.round(Math.max(depth, 0));
      const sev = severityOf(depthCm);
      const affected = Math.round(town.population * Math.min(1, depthCm / 120) * (sev === 'critical' ? 1 : 0.85));
      if (depthCm > 20) { frameAffected += affected; frameTownsHit += 1; }
      townState[town.id] = { depthCm, arrivalMin: arrival };
      records.push({ townId: town.id, name: town.name, population: town.population, affectedPopulation: affected, depthCm, arrivalMin: arrival, severity: sev });
    }

    const floodedRoadIds = ['r1', 'r2', 'r3', 'r4'].filter((_id, idx) => {
      const roadKm = [30, 24, 95, 132][idx];
      return fk >= roadKm && peakDepthAt(roadKm, t) > 30;
    });

    cumulative.affected = Math.max(cumulative.affected, frameAffected);
    cumulative.townsHit = Math.max(cumulative.townsHit, frameTownsHit);
    cumulative.roadsFlooded = floodedRoadIds.length;

    const damage: DamageSummary = {
      records,
      totalAffected: frameAffected,
      townsHit: frameTownsHit,
      roadsFlooded: floodedRoadIds.length,
      buildingsAtRisk: Math.round(frameAffected * 0.31),
      economicLossCrores: frameAffected * 4.2e-4 * (1 + dam.damHeight / 120),
    };

    frames.push({ tMin: t, frontKm: fk, frontDepthM: fd, frontVelocityMs: fv, releasedMm3: released, outflowCumecs: outflow, townState, floodedRoadIds, extentKm2: extentAt(t), damage });
  }

  return { frames, dam, label, model: profile.tag };
}

/** Back-compat single-run entry (dashboard uses this with the Delft3D profile) */
export function simulateDamBreak(dam: DamParams, towns: Town[], label: string): SimResult {
  return simulateWithProfile(dam, towns, label, DELFT3D_PROFILE);
}

/** Run both models on the identical scenario for side-by-side comparison */
export function runDualSimulation(dam: DamParams, towns: Town[], label: string): { sph: SimResult; delft3d: SimResult } {
  return {
    sph: simulateWithProfile(dam, towns, label, SPH_PROFILE),
    delft3d: simulateWithProfile(dam, towns, label, DELFT3D_PROFILE),
  };
}
