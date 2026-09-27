// DamBreach AI — damage analysis + live telemetry stats

import { AlertTriangle, Users, Home, Banknote, TrendingUp, Activity } from 'lucide-react';
import type { SimFrame, DamageRecord } from '../types/sim';
import { fmtInt, fmtCrore } from '../lib/format';
import { severityColor } from '../lib/colors';

export function TelemetryStrip({ frame }: { frame: SimFrame | null }) {
  const stats = frame ? [
    { icon: Activity, label: 'Front Distance', value: `${frame.frontKm.toFixed(1)} km`, color: 'text-sky-300' },
    { icon: TrendingUp, label: 'Front Depth', value: `${frame.frontDepthM.toFixed(1)} m`, color: 'text-amber-300' },
    { icon: Waves, label: 'Front Velocity', value: `${frame.frontVelocityMs.toFixed(1)} m/s`, color: 'text-rose-300' },
    { icon: Banknote, label: 'Peak Outflow', value: `${fmtInt(frame.outflowCumecs)} m³/s`, color: 'text-violet-300' },
  ] : [];
  return (
    <div className="grid grid-cols-2 gap-2">
      {stats.map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="bg-zinc-900 border border-zinc-800 rounded p-2.5">
          <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
            <Icon className="w-3 h-3" /> {label}
          </div>
          <div className={`text-base font-bold font-mono mt-0.5 ${color}`}>{value}</div>
        </div>
  ))}
    </div>
  );
}

export function DamagePanel({ frame }: { frame: SimFrame | null }) {
  const d = frame?.damage;
  const critical = d?.records.filter((r) => r.severity === 'critical').slice(0, 6) ?? [];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Stat icon={Users} label="Affected Pop." value={fmtInt(d?.totalAffected ?? 0)} color="text-rose-300" />
        <Stat icon={AlertTriangle} label="Towns Hit" value={fmtInt(d?.townsHit ?? 0)} color="text-amber-300" />
        <Stat icon={Home} label="Buildings at Risk" value={fmtInt(d?.buildingsAtRisk ?? 0)} color="text-orange-300" />
        <Stat icon={Banknote} label="Loss Estimate" value={fmtCrore(d?.economicLossCrores ?? 0)} color="text-emerald-300" />
      </div>

      <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pt-1">Hardest-Hit Towns</div>
      <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
        {critical.length === 0 && (
          <div className="text-[11px] text-zinc-500 italic p-2">No towns inundated at this timestep — advance the clock.</div>
        )}
        {critical.map((r: DamageRecord) => (
          <div key={r.townId} className="bg-zinc-900 border border-zinc-800 rounded p-2 flex items-center justify-between text-xs">
            <div>
              <div className="font-semibold text-zinc-200">{r.name}</div>
              <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                {fmtInt(r.affectedPopulation)} people · {(r.depthCm / 100).toFixed(1)} m
              </div>
            </div>
            <span
              className="px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase"
              style={{ backgroundColor: severityColor(r.severity) + '22', color: severityColor(r.severity) }}
            >
              {r.severity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; color: string;
}) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded p-2.5">
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <div className={`text-base font-bold font-mono mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

// Local icon re-export used inside TelemetryStrip
import { Waves } from 'lucide-react';
