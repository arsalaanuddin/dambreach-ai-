export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

export function fmtFixed(n: number, digits = 1): string {
  return n.toFixed(digits);
}

export function fmtCrore(crores: number): string {
  if (crores >= 1000) return `₹${(crores / 1000).toFixed(2)}k Cr`;
  return `₹${crores.toFixed(1)} Cr`;
}

export function fmtClock(minutes: number): string {
  const base = 6 * 60; // scenario clock starts at 06:00
  const total = base + Math.round(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function fmtKm(km: number): string {
  return `${km.toFixed(1)} km`;
}
