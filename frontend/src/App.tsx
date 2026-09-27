// DamBreach AI — command dashboard shell

import { useEffect, useMemo, useState } from 'react';
import { Mountain, Satellite, Upload, FileDown, FileText, Loader2, Waves, GitCompareArrows } from 'lucide-react';
import { MapViewer } from './components/MapViewer';
import { ScenarioPanel, DemoPanel, TrackerPanel, Timeline } from './components/Panels';
import { TelemetryStrip, DamagePanel } from './components/DamagePanel';
import { CompareView } from './components/CompareView';
import { runDual, fetchTrackerScenes, API_BASE, type EngineSource } from './services/api';
import { MULLAPERIYAR_DAM, MULLAPERIYAR_TOWNS, PERIYAR_ROADS } from './data/damData';
import { TRACKER_SCENES } from './data/trackerScenes';
import type { TrackerScene } from './types/sim';
import { exportKML, exportGeoJSON, exportSitRepPDF, exportTrackerKML, exportComparisonCSV } from './utils/exporters';
import { exportImpactShapefile } from './utils/shapefileWriter';
import type { AppMode, DamParams, SimResult } from './types/sim';
import { DEPTH_RAMP } from './lib/colors';


const MODES: { id: AppMode; label: string; icon: typeof Mountain }[] = [
  { id: 'scenario', label: 'Custom Scenario', icon: Upload },
  { id: 'demo', label: 'Indian River Demo', icon: Mountain },
  { id: 'tracker', label: 'GEE Live Tracker', icon: Satellite },
];


export default function App() {
  const [mode, setMode] = useState<AppMode>('demo');
  const [dam, setDam] = useState<DamParams>(MULLAPERIYAR_DAM);
  const [result, setResult] = useState<SimResult | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(TRACKER_SCENES[0]?.id ?? null);
  const [view, setView] = useState<'dashboard' | 'compare'>('dashboard');
  const [dual, setDual] = useState<{ sph: SimResult; delft3d: SimResult } | null>(null);
  const [compareStep, setCompareStep] = useState(30);
  const [engine, setEngine] = useState<EngineSource>('local-preview');
  const [demState, setDemState] = useState<{ status: 'none' | 'loading' | 'ok' | 'fallback'; source?: string }>({ status: 'none' });
  const [demBed, setDemBed] = useState<{ km: number[]; m: number[]; source: string } | null>(null);
  const [trackerScenes, setTrackerScenes] = useState<TrackerScene[]>(TRACKER_SCENES);

  const [sceneSource, setSceneSource] = useState('local-mock');

  useEffect(() => {
    fetchTrackerScenes().then((r) => {
      const scenes = (r?.scenes ?? []).filter((s) => s && Array.isArray(s.floodExtent));
      if (scenes.length) {
        setTrackerScenes(scenes);
        setSceneSource(r.source ?? 'backend');
        setActiveSceneId(scenes[0].id);
      }
    }).catch(() => {/* keep local mock */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scenes = useMemo(() => trackerScenes.map((s) => ({
    id: s.id,
    title: s.title,
    capturedAt: s.capturedAt,
    areaKm2: s.areaKm2,
    villages: s.villagesAffected,
    trend: s.sensorNote.includes('receding') ? ('receding' as const) : ('expanding' as const),
  })), []);
  const activeScene = trackerScenes.find((s) => s.id === activeSceneId) ?? null;

  // Initial run so the demo mode lands pre-armed
  useEffect(() => {
    handleRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!playing) return;
    const iv = setInterval(() => {
      setStep((s) => (result && s >= result.frames.length - 1 ? 0 : s + 1));
    }, 450);
    return () => clearInterval(iv);
  }, [playing, result]);

  async function handleRun() {
    setIsRunning(true);
    try {
      const env = await runDual({ damParams: dam, label: 'Mullaperiyar Dam Break — ' + (engine === 'backend' ? 'Physics Backend' : 'Preview'), demBed });
      setDual({ sph: env.sph, delft3d: env.delft3d });
      setEngine(env.source);
      setResult(env.delft3d);
      setStep(0);
    } finally {
      setIsRunning(false);
    }
  }

  async function handleDemUpload(file: File) {
    setDemState({ status: 'loading' });
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('dam_lat', '9.527');
      fd.append('dam_lng', '77.157');
      fd.append('bearing_deg', '292');
      const res = await fetch(`${API_BASE}/api/scenario/dem/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (data.status === 'ok') {
        setDemState({ status: 'ok', source: data.source });
        setDemBed({ km: data.bedKm, m: data.bedM, source: data.source });
      } else {
        setDemState({ status: 'fallback', source: data.source });
        setDemBed(null);
      }
    } catch {
      setDemState({ status: 'fallback', source: 'backend unreachable — idealized terrain' });
    }
  }

  const frame = result ? result.frames[Math.min(step, result.frames.length - 1)] : null;
  const maxStep = result ? result.frames.length - 1 : 91;

  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 overflow-hidden antialiased">
      {/* Header */}
      <header className="h-12 shrink-0 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-extrabold tracking-tight text-white">DamBreach<span className="text-sky-400"> AI</span></span>
          </div>
          <span className="text-zinc-700">|</span>
          <span className="text-[11px] text-zinc-400 font-medium">Dam-Break Flood Simulation &amp; HADR Command</span>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono">
          <button
            onClick={() => setView(view === 'dashboard' ? 'compare' : 'dashboard')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-bold uppercase tracking-wider cursor-pointer transition ${
              view === 'compare'
                ? 'bg-amber-600 border-amber-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <GitCompareArrows className="w-3.5 h-3.5" />
            SPH vs D3D
          </button>
          <div className="flex items-center gap-1.5 text-zinc-400">
            <span className={`w-2 h-2 rounded-full ${engine === 'backend' ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse`} />
            {engine === 'backend' ? 'Physics Backend · SPH+SWE' : 'Preview Engine (offline)'}
          </div>
          <button
            onClick={() => dual && exportComparisonCSV(dual.sph, dual.delft3d)}
            disabled={!dual}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-300 text-[10px] font-bold uppercase tracking-wider cursor-pointer transition"
          >
            Export Δ CSV
          </button>
        </div>
      </header>

      {view === 'compare' && dual ? (
        <CompareView
          sph={dual.sph}
          delft3d={dual.delft3d}
          step={compareStep}
          onStep={setCompareStep}
          onBack={() => setView('dashboard')}
        />
      ) : (
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-[340px] shrink-0 bg-zinc-900/95 border-r border-zinc-800 flex flex-col overflow-hidden">
          {/* Mode tabs */}
          <div className="grid grid-cols-3 border-b border-zinc-800 shrink-0">
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`py-2.5 text-[10px] font-bold uppercase tracking-wider flex flex-col items-center gap-1 transition cursor-pointer ${
                  mode === id ? 'bg-sky-950/60 text-sky-300 border-b-2 border-sky-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label.split(' ').map((w) => <span key={w}>{w}</span>)}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
            {mode === 'scenario' && (
              <ScenarioPanel dam={dam} onChange={setDam} onRun={handleRun} demState={demState} onDemFile={handleDemUpload} />
            )}
            {mode === 'demo' && (
              <DemoPanel dam={dam} onChange={setDam} onRun={handleRun} isRunning={isRunning} />
            )}
            {mode === 'tracker' && (
              <TrackerPanel scenes={scenes} activeId={activeSceneId} onSelect={setActiveSceneId} />
            )}

            {mode !== 'tracker' && (
              <>
                <Timeline
                  step={step} max={maxStep} playing={playing}
                  onStep={(s) => { setPlaying(false); setStep(s); }}
                  onToggle={() => setPlaying(!playing)}
                  onReset={() => { setPlaying(false); setStep(0); }}
                />
                <TelemetryStrip frame={frame} />
                <DamagePanel frame={frame} />
              </>
            )}

            {mode === 'tracker' && activeScene && (
              <div className="space-y-2.5">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-1.5 text-[11px]">
                  <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    Scene Intelligence
                    <span className="ml-1.5 font-mono normal-case text-[9px] text-sky-400">[{sceneSource}]</span>
                  </div>
                  <Row k="Captured" v={activeScene.capturedAt} />
                  <Row k="Sensor" v={activeScene.source} />
                  <Row k="Inundated Area" v={`${activeScene.areaKm2} km²`} />
                  <Row k="Villages Affected" v={String(activeScene.villagesAffected)} />
                  <Row k="Population Exposed" v={activeScene.populationExposed.toLocaleString('en-IN')} />
                  <Row k="Cloud Cover" v={`${activeScene.cloudCoverPct}% (SAR)`} />
                </div>
                <div className="rounded-lg border border-rose-900/50 bg-rose-950/30 p-3 text-[11px] text-rose-200 leading-relaxed">
                  {activeScene.sensorNote}
                </div>
              </div>
            )}
          </div>

          {/* Export bar */}
          <div className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-2.5">
            {mode === 'tracker' && activeScene ? (
              <button
                onClick={() => exportTrackerKML(activeScene)}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition"
              >
                <FileDown className="w-3.5 h-3.5" /> Export Flood KML
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => result && exportImpactShapefile(result)} className="py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 cursor-pointer transition">
                  <FileDown className="w-3 h-3" /> SHP
                </button>
                <button onClick={() => result && exportKML(result)} className="py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 cursor-pointer transition">
                  <FileDown className="w-3 h-3" /> KML
                </button>
                <button onClick={() => result && exportGeoJSON(result)} className="py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 cursor-pointer transition">
                  <FileDown className="w-3 h-3" /> GeoJSON
                </button>
                <button onClick={() => result && exportSitRepPDF(result, step)} className="py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1 cursor-pointer transition">
                  <FileText className="w-3 h-3" /> SitRep
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Map viewport */}
        <main className="flex-1 relative">
          <MapViewer
            result={result}
            step={step}
            towns={MULLAPERIYAR_TOWNS}
            roads={PERIYAR_ROADS}
            activeScene={mode === 'tracker' ? activeScene : null}
          />

          {/* Legend */}
          <div className="absolute bottom-3 right-3 z-[1000] bg-zinc-900/95 border border-zinc-800 rounded-lg p-3 text-[10px] space-y-1.5 w-44 pointer-events-none">
            <div className="font-bold text-zinc-300 uppercase tracking-widest text-[9px] pb-1 border-b border-zinc-800">Water Depth</div>
            {DEPTH_RAMP.map((stop) => (
              <div key={stop.label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: stop.color }} />
                <span className="text-zinc-300 font-mono">{stop.label}</span>
              </div>
            ))}
          </div>

          {/* Sim running overlay */}
          {isRunning && (
            <div className="absolute inset-0 z-[1200] bg-zinc-950/70 backdrop-blur-sm flex items-center justify-center">
              <div className="flex items-center gap-3 text-sky-300">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-bold uppercase tracking-widest">Coupling SPH → SWE…</span>
              </div>
            </div>
          )}
        </main>
      </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{k}:</span>
      <span className="font-mono text-zinc-200 text-right">{v}</span>
    </div>
  );
}
