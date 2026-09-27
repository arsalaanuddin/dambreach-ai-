// DamBreach AI — backend seam.
// Backend-first: calls the FastAPI physics service (SPH + Saint-Venant dual model).
// Falls back to the local preview engine if the backend is unreachable, so the
// dashboard never breaks during a demo.

import type { DamParams, SimResult, TrackerScene, Town, RoadSegment } from '../types/sim';
import { runDualSimulation as localDual } from '../lib/simEngine';
import { MULLAPERIYAR_TOWNS, PERIYAR_ROADS } from '../data/damData';
import { TRACKER_SCENES } from '../data/trackerScenes';

export const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ?? 'http://127.0.0.1:8100';

export type EngineSource = 'backend' | 'local-preview';

export interface SimEnvelope {
  sph: SimResult;
  delft3d: SimResult;
  source: EngineSource;
  latencyMs?: number;
}

interface BackendFrame {
  tMin: number;
  frontKm: number;
  frontDepthM: number;
  frontVelocityMs: number;
  releasedMm3: number;
  outflowCumecs: number;
  extentKm2: number;
  townState: Record<string, { depthCm: number; arrivalMin: number | null }>;
  floodedRoadIds: string[];
  damage: SimResult['frames'][0]['damage'];
}

interface BackendRun {
  frames: BackendFrame[];
  model: 'sph' | 'delft3d';
  label: string;
  dam: DamParams;
}

interface BackendResponse {
  sph: BackendRun;
  delft3d: BackendRun;
  meta: { latencyMs: number; framesPerRun: number; engine: string };
}

function damPayload(dam: DamParams) {
  return {
    damHeight: dam.damHeight,
    damWidth: dam.damWidth,
    reservoirVolume: dam.reservoirVolume,
    reservoirLevel: dam.reservoirLevel,
    breachWidth: dam.breachWidth,
    breachFormationTime: dam.breachFormationTime,
    manningsN: dam.manningsN,
  };
}

/**
 * Run both models. Tries the FastAPI backend first (real SPH + Saint-Venant
 * solvers); on any failure falls back to the in-browser preview engine.
 */
export async function runDual(req: {
  damParams: DamParams;
  label: string;
  demBed?: { km: number[]; m: number[]; source: string } | null;
}): Promise<SimEnvelope> {
  try {
    const res = await fetch(`${API_BASE}/api/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dam: damPayload(req.damParams),
        label: req.label,
        demBedKm: req.demBed?.km ?? null,
        demBedM: req.demBed?.m ?? null,
        demSource: req.demBed?.source ?? null,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`backend ${res.status}`);
    const data = (await res.json()) as BackendResponse;

    return {
      sph: toSimResult(data.sph),
      delft3d: toSimResult(data.delft3d),
      source: 'backend',
      latencyMs: data.meta.latencyMs,
    };
  } catch (err) {
    console.warn('[DamBreach] Backend unreachable — using local preview engine.', err);
    return { ...localDual(req.damParams, MULLAPERIYAR_TOWNS, req.label), source: 'local-preview' };
  }
}

function toSimResult(run: BackendRun): SimResult {
  return {
    frames: run.frames,
    dam: run.dam,
    label: run.label,
    model: run.model,
  };
}

export async function runSimulation(req: {
  damParams: DamParams;
  label: string;
}): Promise<SimResult> {
  const env = await runDual(req);
  return env.delft3d;
}

export async function fetchTowns(): Promise<{ towns: Town[]; roads: RoadSegment[] }> {
  // FUTURE: GET {API_BASE}/dams/{id}/geo
  return { towns: MULLAPERIYAR_TOWNS, roads: PERIYAR_ROADS };
}

export async function fetchTrackerScenes(): Promise<{ scenes: TrackerScene[]; source: string }> {
  // Backend-first: live GEE when credentials exist, else backend mock; local as last resort.
  try {
    const res = await fetch(`${API_BASE}/api/tracker/floods`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.scenes?.length) return { scenes: data.scenes as TrackerScene[], source: data.engine };
    }
  } catch {
    /* fall through */
  }
  return { scenes: TRACKER_SCENES, source: 'local-mock' };
}
