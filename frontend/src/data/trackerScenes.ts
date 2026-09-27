// DamBreach AI — mock GEE tracker scenes (placeholder until Earth Engine backend lands)
// Geometry simplified from public flood reporting; swap with /api/tracker responses later.

import type { TrackerScene } from '../types/sim';

export const TRACKER_SCENES: TrackerScene[] = [
  {
    id: 's-2026-09-24',
    title: 'Periyar Basin — Active Flood',
    source: 'Sentinel-1 IW ·VV+VH · GEE · Otsu',
    capturedAt: '2026-09-24 06:12 IST',
    areaKm2: 184.6,
    villagesAffected: 23,
    populationExposed: 41200,
    cloudCoverPct: 0,
    sensorNote: 'SAR penetrates 100% cloud cover; σ⁰ drop −7.2 dB vs. baseline',
    floodExtent: [
      [10.05, 76.30], [10.08, 76.42], [10.12, 76.55], [10.16, 76.66],
      [10.18, 76.78], [10.15, 76.88], [10.08, 76.94], [10.00, 76.96],
      [9.92, 76.90], [9.86, 76.80], [9.84, 76.66], [9.88, 76.50],
      [9.94, 76.38], [10.00, 76.31],
    ],
    baselineExtent: [
      [10.02, 76.36], [10.04, 76.46], [10.08, 76.58], [10.11, 76.68],
      [10.11, 76.78], [10.07, 76.85], [10.00, 76.87], [9.95, 76.82],
      [9.92, 76.72], [9.93, 76.58], [9.97, 76.46], [10.00, 76.38],
    ],
    villages: [
      { name: 'Aluva', lat: 10.102, lng: 76.352 },
      { name: 'Kalady', lat: 10.148, lng: 76.442 },
      { name: 'Perumbavoor', lat: 10.115, lng: 76.475 },
      { name: 'Angamaly', lat: 10.192, lng: 76.382 },
      { name: 'Kothamangalam', lat: 10.058, lng: 76.632 },
    ],
  },
  {
    id: 's-2026-09-11',
    title: 'Bharathapuzha Basin — Receding',
    source: 'Sentinel-1 IW ·VV · GEE · Otsu',
    capturedAt: '2026-09-11 06:24 IST',
    areaKm2: 96.2,
    villagesAffected: 11,
    populationExposed: 18700,
    cloudCoverPct: 0,
    sensorNote: 'Flood extent receding −18% vs. previous pass',
    floodExtent: [
      [10.78, 75.90], [10.80, 76.00], [10.79, 76.12], [10.75, 76.20],
      [10.68, 76.22], [10.62, 76.16], [10.60, 76.05], [10.64, 75.95],
      [10.71, 75.89],
    ],
    baselineExtent: [
      [10.76, 75.94], [10.77, 76.02], [10.75, 76.10], [10.70, 76.15],
      [10.65, 76.12], [10.63, 76.04], [10.66, 75.97], [10.72, 75.92],
    ],
    villages: [
      { name: 'Ponnani', lat: 10.772, lng: 75.924 },
      { name: 'Kuttippuram', lat: 10.702, lng: 76.042 },
      { name: 'Pattambi', lat: 10.802, lng: 76.122 },
    ],
  },
  {
    id: 's-2026-08-02',
    title: 'Tungabhadra Lowlands — Inundation',
    source: 'Sentinel-1 IW ·VV+VH · GEE · Change-detect',
    capturedAt: '2026-08-02 05:48 IST',
    areaKm2: 232.4,
    villagesAffected: 31,
    populationExposed: 66800,
    cloudCoverPct: 0,
    sensorNote: 'Persistent inundation 11 days; residual pools detected',
    floodExtent: [
      [15.28, 76.35], [15.32, 76.48], [15.36, 76.60], [15.33, 76.72],
      [15.26, 76.78], [15.16, 76.76], [15.10, 76.66], [15.08, 76.52],
      [15.14, 76.40], [15.22, 76.34],
    ],
    baselineExtent: [
      [15.26, 76.40], [15.29, 76.50], [15.31, 76.60], [15.28, 76.68],
      [15.22, 76.70], [15.16, 76.64], [15.14, 76.54], [15.18, 76.44],
    ],
    villages: [
      { name: 'Mantralayam', lat: 15.942, lng: 77.428 },
      { name: 'Sindhanur', lat: 15.352, lng: 76.752 },
      { name: 'Kowthalam', lat: 15.742, lng: 77.222 },
      { name: 'Yemmiganur', lat: 15.782, lng: 77.482 },
    ],
  },
];
