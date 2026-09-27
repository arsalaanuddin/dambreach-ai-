// DamBreach AI — left sidebar panels: mode-specific controls + timeline

import { Play, Pause, RotateCcw, Flame, Clock, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { DamParams } from '../types/sim';

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function SliderRow({ label, value, min, max, step = 1, unit, onChange, disabled }: SliderRowProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline text-[11px] mb-1">
        <span className="text-zinc-400 font-medium">{label}</span>
        <span className="font-mono text-sky-300 font-semibold">
          {value}{unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-sky-500 disabled:opacity-40"
      />
    </div>
  );
}

export function ScenarioPanel({ dam, onChange, onRun, demState, onDemFile }: {
  dam: DamParams;
  onChange: (p: DamParams) => void;
  onRun: () => void;
  demState: { status: 'none' | 'loading' | 'ok' | 'fallback'; source?: string };
  onDemFile: (f: File) => void;
}) {
  const set = (k: keyof DamParams) => (v: number) => onChange({ ...dam, [k]: v });
  return (
    <div className="space-y-3.5">
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Scenario Parameters</div>

      {/* DEM upload */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Terrain (DEM)</span>
          {demState.status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {demState.status === 'fallback' && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
        </div>
        <label className="flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-zinc-700 hover:border-zinc-500 text-[11px] text-zinc-300 cursor-pointer transition">
          <Upload className="w-3.5 h-3.5" />
          {demState.status === 'loading' ? 'Sampling GeoTIFF…' : 'Upload GeoTIFF DEM'}
          <input
            type="file"
            accept=".tif,.tiff"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onDemFile(e.target.files[0])}
          />
        </label>
        {demState.status === 'ok' && demState.source && (
          <div className="text-[10px] font-mono text-emerald-400">✓ {demState.source}</div>
        )}
        {demState.status === 'fallback' && (
          <div className="text-[10px] font-mono text-amber-400">⚠ {demState.source ?? 'DEM unusable — idealized Periyar terrain in use'}</div>
        )}
        {demState.status === 'none' && (
          <div className="text-[10px] text-zinc-500">Optional — idealized Periyar corridor used by default</div>
        )}
      </div>
      <SliderRow label="Dam Height" value={dam.damHeight} min={10} max={180} unit="m" onChange={set('damHeight')} />
      <SliderRow label="Crest Length" value={dam.damWidth} min={50} max={1500} unit="m" onChange={set('damWidth')} />
      <SliderRow label="Reservoir Volume" value={dam.reservoirVolume} min={5} max={2000} unit="Mm³" onChange={set('reservoirVolume')} />
      <SliderRow label="Reservoir Level" value={dam.reservoirLevel} min={20} max={100} unit="%" onChange={set('reservoirLevel')} />
      <SliderRow label="Breach Width" value={dam.breachWidth} min={20} max={400} unit="m" onChange={set('breachWidth')} />
      <SliderRow label="Breach Formation" value={dam.breachFormationTime} min={5} max={90} unit="min" onChange={set('breachFormationTime')} />
      <SliderRow label="Manning's n" value={dam.manningsN} min={0.02} max={0.08} step={0.005} unit="" onChange={set('manningsN')} />
      <button
        onClick={onRun}
        className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold uppercase tracking-widest transition cursor-pointer"
      >
        Run Simulation
      </button>
    </div>
  );
}

export function DemoPanel({ dam, onChange, onRun, isRunning }: {
  dam: DamParams;
  onChange: (p: DamParams) => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const set = (k: keyof DamParams) => (v: number) => onChange({ ...dam, [k]: v });
  return (
    <div className="space-y-3.5">
      <div className="rounded-lg border border-sky-900/60 bg-sky-950/40 p-3 space-y-1">
        <div className="text-[10px] font-bold text-sky-300 uppercase tracking-widest">Preloaded Dam</div>
        <div className="text-sm font-bold text-white">Mullaperiyar · Kerala</div>
        <div className="text-[11px] text-zinc-400 font-mono">Periyar basin · built 1895 · H 53 m · 443.2 Mm³</div>
        <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold mt-1">
          <Flame className="w-3 h-3" /> Open-data validated · judges-ready
        </div>
      </div>
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Live Physics Knobs</div>
      <SliderRow label="Reservoir Level" value={dam.reservoirLevel} min={40} max={100} unit="%" onChange={set('reservoirLevel')} />
      <SliderRow label="Breach Width" value={dam.breachWidth} min={20} max={400} unit="m" onChange={set('breachWidth')} />
      <SliderRow label="Breach Formation" value={dam.breachFormationTime} min={5} max={90} unit="min" onChange={set('breachFormationTime')} />
      <SliderRow label="Manning's n" value={dam.manningsN} min={0.02} max={0.08} step={0.005} unit="" onChange={set('manningsN')} />
      <button
        onClick={onRun}
        disabled={isRunning}
        className="w-full py-2.5 rounded-lg bg-gradient-to-r from-sky-600 to-violet-600 hover:from-sky-500 hover:to-violet-500 text-white text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-60"
      >
        {isRunning ? 'Propagating Floodwave…' : 'Breach the Dam'}
      </button>
    </div>
  );
}

export function TrackerPanel({ scenes, activeId, onSelect }: {
  scenes: TrackerSceneLite[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">GEE Satellite Passes</div>
      {scenes.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left rounded-lg border p-3 transition cursor-pointer ${
            activeId === s.id ? 'bg-sky-950/60 border-sky-600' : 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800/60'
          }`}
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-white">{s.title}</span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
              s.trend === 'receding' ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
            }`}>
              {s.trend}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 font-mono mt-1">{s.capturedAt}</div>
          <div className="flex gap-3 mt-1.5 text-[10px] font-mono">
            <span className="text-sky-300">{s.areaKm2} km²</span>
            <span className="text-amber-300">{s.villages} villages</span>
          </div>
        </button>
      ))}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-[10px] text-zinc-400 leading-relaxed">
        Sentinel-1 SAR · Otsu thresholding · 6–12 h revisit. Cloud-free flood mapping.
      </div>
    </div>
  );
}

export interface TrackerSceneLite {
  id: string;
  title: string;
  capturedAt: string;
  areaKm2: number;
  villages: number;
  trend: 'expanding' | 'receding';
}

export function Timeline({ step, max, playing, onStep, onToggle, onReset }: {
  step: number; max: number; playing: boolean;
  onStep: (s: number) => void; onToggle: () => void; onReset: () => void;
}) {
  return (
    <div className="bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-widest">Floodwave Clock</span>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 text-sky-300">
          T+{step * 2} min
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button onClick={onToggle} className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 cursor-pointer" title={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>
        <button onClick={onReset} className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 cursor-pointer" title="Reset to T+0">
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
        <input
          type="range" min={0} max={max} step={1} value={step}
          onChange={(e) => onStep(Number(e.target.value))}
          className="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
        />
        <span className="text-[10px] font-mono text-zinc-500">+{max * 2}m</span>
      </div>
    </div>
  );
}

