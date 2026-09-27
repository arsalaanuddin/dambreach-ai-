// DamBreach AI — SPH vs Delft3D side-by-side comparison view

import { useMemo } from 'react';
import { Scale, ChevronLeft, ChevronRight, Zap, Grid3x3, GitCompareArrows } from 'lucide-react';
import { MapViewer } from './MapViewer';
import { MULLAPERIYAR_TOWNS, PERIYAR_ROADS } from '../data/damData';
import type { SimResult } from '../types/sim';
import { fmtInt } from '../lib/format';

interface CompareViewProps {
  sph: SimResult;
  delft3d: SimResult;
  step: number;
  onStep: (s: number) => void;
  onBack: () => void;
}

export function CompareView({ sph, delft3d, step, onStep, onBack }: CompareViewProps) {
  const maxStep = Math.min(sph.frames.length, delft3d.frames.length) - 1;
  const s = Math.min(step, maxStep);
  const sphFrame = sph.frames[s];
  const d3Frame = delft3d.frames[s];

  // Per-timestep deltas
  const deltas = useMemo(() => {
    const dFront = sphFrame.frontKm - d3Frame.frontKm;
    const dDepth = sphFrame.frontDepthM - d3Frame.frontDepthM;
    const dOutflow = sphFrame.outflowCumecs - d3Frame.outflowCumecs;
    const dExtent = sphFrame.extentKm2 - d3Frame.extentKm2;
    const dAffected = sphFrame.damage.totalAffected - d3Frame.damage.totalAffected;
    return { dFront, dDepth, dOutflow, dExtent, dAffected };
  }, [sphFrame, d3Frame]);

  // Arrival-time divergence per town
  const arrivalDivergence = useMemo(() => {
    return MULLAPERIYAR_TOWNS.map((town) => {
      const aSph = sphFrame.townState[town.id]?.arrivalMin ?? null;
      const aD3 = d3Frame.townState[town.id]?.arrivalMin ?? null;
      const dSph = sphFrame.townState[town.id]?.depthCm ?? 0;
      const dD3 = d3Frame.townState[town.id]?.depthCm ?? 0;
      return {
        town,
        aSph,
        aD3,
        depthSph: dSph,
        depthD3: dD3,
        leadMin: aSph != null && aD3 != null ? aSph - aD3 : null,
      };
    })
      .filter((r) => r.aSph != null || r.aD3 != null)
      .sort((a, b) => (b.depthSph + b.depthD3) - (a.depthSph + a.depthD3));
  }, [sphFrame, d3Frame]);

  const earlierModel = sphFrame.frontKm > d3Frame.frontKm ? 'SPH' : 'Delft3D';

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* Header */}
      <header className="h-11 shrink-0 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 cursor-pointer transition"
            title="Back to Dashboard"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <GitCompareArrows className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-extrabold tracking-tight text-white">Model Comparison</span>
          <span className="text-[11px] text-zinc-400">SPH vs Delft3D · same scenario</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono">
          <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">T+{sphFrame.tMin} min</span>
          <span className="text-zinc-500">step {s}/{maxStep}</span>
        </div>
      </header>

      {/* Side-by-side maps */}
      <div className="flex-1 flex overflow-hidden">
        {/* SPH map */}
        <div className="flex-1 relative border-r border-zinc-800">
          <ModelChip tag="sph" />
          <MapViewer
            result={sph}
            step={s}
            towns={MULLAPERIYAR_TOWNS}
            roads={PERIYAR_ROADS}
            activeScene={null}
          />
          <MiniTelemetry frame={sphFrame} tag="sph" />
        </div>

        {/* Delft3D map */}
        <div className="flex-1 relative">
          <ModelChip tag="delft3d" />
          <MapViewer
            result={delft3d}
            step={s}
            towns={MULLAPERIYAR_TOWNS}
            roads={PERIYAR_ROADS}
            activeScene={null}
          />
          <MiniTelemetry frame={d3Frame} tag="delft3d" />
        </div>
      </div>

      {/* Delta panel */}
      <div className="shrink-0 border-t border-zinc-800 bg-zinc-900">
        {/* Step scrubber */}
        <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-3">
          <button
            onClick={() => onStep(Math.max(0, s - 1))}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={0}
            max={maxStep}
            step={1}
            value={s}
            onChange={(e) => onStep(Number(e.target.value))}
            className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <button
            onClick={() => onStep(Math.min(maxStep, s + 1))}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Delta metrics row */}
        <div className="grid grid-cols-5 gap-2 px-4 py-2.5">
          <DeltaCard
            label="Front Position Δ"
            value={`${deltas.dFront >= 0 ? '+' : ''}${deltas.dFront.toFixed(1)} km`}
            winner={deltas.dFront >= 0 ? 'sph' : 'delft3d'}
            sub={`SPH ${sphFrame.frontKm.toFixed(1)} · D3D ${d3Frame.frontKm.toFixed(1)}`}
          />
          <DeltaCard
            label="Front Depth Δ"
            value={`${deltas.dDepth >= 0 ? '+' : ''}${deltas.dDepth.toFixed(1)} m`}
            winner={deltas.dDepth >= 0 ? 'sph' : 'delft3d'}
            sub={`SPH ${sphFrame.frontDepthM.toFixed(1)} · D3D ${d3Frame.frontDepthM.toFixed(1)}`}
          />
          <DeltaCard
            label="Peak Outflow Δ"
            value={`${deltas.dOutflow >= 0 ? '+' : ''}${fmtInt(Math.abs(deltas.dOutflow))} m³/s`}
            winner={deltas.dOutflow >= 0 ? 'sph' : 'delft3d'}
            sub={`SPH ${fmtInt(sphFrame.outflowCumecs)} · D3D ${fmtInt(d3Frame.outflowCumecs)}`}
          />
          <DeltaCard
            label="Inundated Extent Δ"
            value={`${deltas.dExtent >= 0 ? '+' : ''}${deltas.dExtent.toFixed(1)} km²`}
            winner={deltas.dExtent >= 0 ? 'sph' : 'delft3d'}
            sub={`SPH ${sphFrame.extentKm2.toFixed(1)} · D3D ${d3Frame.extentKm2.toFixed(1)}`}
          />
          <DeltaCard
            label="Affected Pop. Δ"
            value={`${deltas.dAffected >= 0 ? '+' : ''}${fmtInt(Math.abs(deltas.dAffected))}`}
            winner={deltas.dAffected >= 0 ? 'sph' : 'delft3d'}
            sub={`SPH ${fmtInt(sphFrame.damage.totalAffected)} · D3D ${fmtInt(d3Frame.damage.totalAffected)}`}
          />
        </div>

        {/* Arrival divergence strip */}
        <div className="px-4 pb-2.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Scale className="w-3 h-3 text-zinc-400" />
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              Arrival-Time Divergence — {earlierModel} front arrives earlier at this timestep
            </span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {arrivalDivergence.slice(0, 12).map((r) => (
              <div
                key={r.town.id}
                className="shrink-0 rounded border px-2 py-1 text-[10px] font-mono bg-zinc-950 border-zinc-800"
                title={`${r.town.name}: SPH T+${r.aSph ?? '—'} · D3D T+${r.aD3 ?? '—'}`}
              >
                <span className="text-zinc-300">{r.town.name.slice(0, 14)}</span>
                <span className="mx-1.5 text-cyan-400">S:{r.aSph ?? '—'}</span>
                <span className="text-violet-400">D:{r.aD3 ?? '—'}</span>
                {r.leadMin != null && r.leadMin !== 0 && (
                  <span className={`ml-1.5 font-bold ${r.leadMin < 0 ? 'text-cyan-300' : 'text-violet-300'}`}>
                    {r.leadMin > 0 ? `SPH+${r.leadMin}` : `D3D+${-r.leadMin}`}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelChip({ tag }: { tag: 'sph' | 'delft3d' }) {
  const isSph = tag === 'sph';
  return (
    <div className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/95 border shadow-lg"
      style={{ borderColor: isSph ? '#155e75' : '#5b21b6' }}
    >
      {isSph ? <Zap className="w-3.5 h-3.5 text-cyan-400" /> : <Grid3x3 className="w-3.5 h-3.5 text-violet-400" />}
      <span className={`text-xs font-bold ${isSph ? 'text-cyan-300' : 'text-violet-300'}`}>
        {isSph ? 'SPH Particle Surge' : 'Delft3D Grid Routing'}
      </span>
    </div>
  );
}

function MiniTelemetry({ frame, tag }: { frame: SimResult['frames'][0]; tag: 'sph' | 'delft3d' }) {
  const accent = tag === 'sph' ? 'text-cyan-300' : 'text-violet-300';
  return (
    <div className="absolute bottom-3 left-3 z-[1000] bg-zinc-900/95 border border-zinc-700 rounded-lg px-3 py-2 flex gap-4 text-[11px] font-mono shadow-lg">
      <span className="text-zinc-400">Front <span className={accent}>{frame.frontKm.toFixed(1)} km</span></span>
      <span className="text-zinc-400">Depth <span className={accent}>{frame.frontDepthM.toFixed(1)} m</span></span>
      <span className="text-zinc-400">Extent <span className={accent}>{frame.extentKm2.toFixed(0)} km²</span></span>
      <span className="text-zinc-400">Pop <span className={accent}>{fmtInt(frame.damage.totalAffected)}</span></span>
    </div>
  );
}

function DeltaCard({ label, value, winner, sub }: {
  label: string; value: string; winner: 'sph' | 'delft3d'; sub: string;
}) {
  return (
    <div className={`rounded-lg border p-2 ${winner === 'sph' ? 'bg-cyan-950/30 border-cyan-900/60' : 'bg-violet-950/30 border-violet-900/60'}`}>
      <div className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{label}</div>
      <div className={`text-sm font-bold font-mono mt-0.5 ${winner === 'sph' ? 'text-cyan-300' : 'text-violet-300'}`}>{value}</div>
      <div className="text-[9px] text-zinc-500 font-mono mt-0.5">{sub}</div>
    </div>
  );
}
