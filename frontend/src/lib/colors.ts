// Depth → color ramp shared by the map canvas and legend
import type { DamageRecord } from '../types/sim';

export const DEPTH_RAMP: { maxCm: number; color: string; label: string }[] = [
  { maxCm: 25, color: '#38bdf8', label: '0–25 cm' },
  { maxCm: 75, color: '#22c55e', label: '25–75 cm' },
  { maxCm: 150, color: '#facc15', label: '0.75–1.5 m' },
  { maxCm: 300, color: '#f97316', label: '1.5–3 m' },
  { maxCm: 600, color: '#ef4444', label: '3–6 m' },
  { maxCm: Infinity, color: '#a21caf', label: '> 6 m' },
];

export function depthColor(depthCm: number): string {
  for (const stop of DEPTH_RAMP) {
    if (depthCm <= stop.maxCm) return stop.color;
  }
  return DEPTH_RAMP[DEPTH_RAMP.length - 1].color;
}

export function severityColor(severity: DamageRecord['severity']): string {
  switch (severity) {
    case 'critical': return '#ef4444';
    case 'warning': return '#f97316';
    case 'watch': return '#facc15';
    default: return '#22c55e';
  }
}

export function velocityColor(vMs: number): string {
  if (vMs >= 6) return '#e11d48';
  if (vMs >= 3.5) return '#f97316';
  if (vMs >= 1.5) return '#facc15';
  return '#38bdf8';
}
