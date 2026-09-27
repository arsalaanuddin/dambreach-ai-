// DamBreach AI — Mullaperiyar Dam demo dataset (open-source figures)
// Dam specs: ~53 m tall, crest ~365 m, gross storage ~443.2 Mm³ (public NDMA/IIT studies).
// Downstream geography follows the REAL Periyar course: dam → Idukki reservoir →
// Malayattoor → Perumbavoor → Aluva (Arabian Sea).

import type { DamParams, Town, RoadSegment } from '../types/sim';

export const MULLAPERIYAR_DAM: DamParams = {
  damHeight: 53,
  damWidth: 365,
  reservoirVolume: 443.2,
  reservoirLevel: 98,
  breachWidth: 120,
  breachFormationTime: 20,
  manningsN: 0.045,
};

export const DAM_SITE = { name: 'Mullaperiyar Dam', lat: 9.5270, lng: 77.1570 };

/** Real Periyar river centerline (simplified). [lat, lng, kmFromDam] */
export const RIVER_PATH: { lat: number; lng: number; km: number }[] = [
  { lat: 9.5270, lng: 77.1570, km: 0 },
  { lat: 9.5450, lng: 77.1200, km: 5 },
  { lat: 9.5600, lng: 77.0800, km: 10 },
  { lat: 9.5750, lng: 77.0400, km: 15 },
  { lat: 9.5900, lng: 77.0000, km: 20 },
  { lat: 9.6150, lng: 76.9750, km: 26 },
  { lat: 9.6500, lng: 76.9700, km: 32 },
  { lat: 9.7000, lng: 76.9620, km: 40 },
  { lat: 9.7500, lng: 76.9680, km: 48 },
  { lat: 9.8000, lng: 76.9700, km: 55 },
  { lat: 9.8430, lng: 76.9710, km: 60 },   // Idukki arch dam complex
  { lat: 9.9000, lng: 76.9650, km: 68 },
  { lat: 9.9500, lng: 76.9580, km: 76 },
  { lat: 10.0500, lng: 76.9580, km: 90 },
  { lat: 10.1400, lng: 76.9550, km: 104 },
  { lat: 10.1670, lng: 76.9530, km: 108 }, // Malayattoor
  { lat: 10.1300, lng: 76.8500, km: 116 },
  { lat: 10.1200, lng: 76.7000, km: 124 },
  { lat: 10.1150, lng: 76.5600, km: 130 },
  { lat: 10.1080, lng: 76.4700, km: 134 }, // Perumbavoor
  { lat: 10.1020, lng: 76.3600, km: 140 }, // Aluva
  { lat: 10.0950, lng: 76.3300, km: 143 }, // river mouth
];

/** Position (lat,lng) at a river-distance km, offset lateralKm perpendicular to flow */
export function riverPositionAt(km: number, lateralKm = 0): [number, number] {
  const path = RIVER_PATH;
  if (km <= 0) {
    const p0 = path[0];
    return [p0.lat, p0.lng];
  }
  if (km >= path[path.length - 1].km) {
    const pN = path[path.length - 1];
    return [pN.lat, pN.lng];
  }
  let i = 0;
  while (i < path.length - 1 && path[i + 1].km < km) i++;
  const a = path[i];
  const b = path[i + 1];
  const t = (km - a.km) / Math.max(0.001, b.km - a.km);
  const lat = a.lat + (b.lat - a.lat) * t;
  const lng = a.lng + (b.lng - a.lng) * t;
  // Perpendicular offset in degrees (~0.009 deg per km at this latitude)
  const dLat = b.lat - a.lat;
  const dLng = b.lng - a.lng;
  const norm = Math.hypot(dLat, dLng) || 1;
  const perpLat = -dLng / norm;
  const perpLng = dLat / norm;
  return [lat + perpLat * lateralKm * 0.009, lng + perpLng * lateralKm * 0.009];
}

export const MULLAPERIYAR_TOWNS: Town[] = [
  { id: 't1',  name: 'Vallakkadavu',         population: 3400,   lat: 9.5290,  lng: 77.1480, distanceKm: 1.5,  lateralKm: 0.3, elevation: 468 },
  { id: 't2',  name: 'Murinjapuzha',         population: 6100,   lat: 9.5590,  lng: 77.0860, distanceKm: 9.5,  lateralKm: 0.5, elevation: 392 },
  { id: 't3',  name: 'Mlappara',             population: 4700,   lat: 9.5760,  lng: 77.0280, distanceKm: 15.5, lateralKm: 0.8, elevation: 351 },
  { id: 't4',  name: 'Upputhara',            population: 9800,   lat: 9.5880,  lng: 77.0060, distanceKm: 20.0, lateralKm: 0.4, elevation: 318 },
  { id: 't5',  name: 'Ayyappancoil',         population: 11200,  lat: 9.6180,  lng: 76.9780, distanceKm: 26.5, lateralKm: 0.6, elevation: 274 },
  { id: 't6',  name: 'Kamakshipuram',        population: 7600,   lat: 9.6420,  lng: 76.9740, distanceKm: 31.0, lateralKm: 1.1, elevation: 258 },
  { id: 't7',  name: 'Kattappana Outskirts', population: 15800,  lat: 9.7000,  lng: 77.0350, distanceKm: 40.0, lateralKm: 3.8, elevation: 245 },
  { id: 't8',  name: 'Cheruthoni (Idukki)',  population: 12400,  lat: 9.8450,  lng: 76.9800, distanceKm: 60.0, lateralKm: 0.5, elevation: 210 },
  { id: 't9',  name: 'Kulamavu',             population: 5400,   lat: 9.8520,  lng: 76.9350, distanceKm: 63.0, lateralKm: 2.1, elevation: 202 },
  { id: 't10', name: 'Painavu',              population: 8900,   lat: 9.8300,  lng: 76.9050, distanceKm: 65.0, lateralKm: 3.6, elevation: 196 },
  { id: 't11', name: 'Vazhathope',           population: 6800,   lat: 9.9050,  lng: 76.9400, distanceKm: 70.0, lateralKm: 1.2, elevation: 168 },
  { id: 't12', name: 'Kothamangalam',        population: 41000,  lat: 10.0600, lng: 76.6400, distanceKm: 96.0, lateralKm: 4.2, elevation: 92 },
  { id: 't13', name: 'Malayattoor',          population: 6800,   lat: 10.1670, lng: 76.9530, distanceKm: 108.0, lateralKm: 0.4, elevation: 48 },
  { id: 't14', name: 'Kalady',               population: 24600,  lat: 10.1530, lng: 76.4470, distanceKm: 126.0, lateralKm: 1.8, elevation: 34 },
  { id: 't15', name: 'Perumbavoor',          population: 51200,  lat: 10.1150, lng: 76.4740, distanceKm: 133.0, lateralKm: 0.4, elevation: 28 },
  { id: 't16', name: 'Aluva',                population: 104000, lat: 10.1020, lng: 76.3600, distanceKm: 140.0, lateralKm: 0.3, elevation: 12 },
];

export const PERIYAR_ROADS: RoadSegment[] = [
  {
    id: 'r1', name: 'Kumily–Kattappana Ghat Road (SH19)', distanceKm: 30,
    points: [[9.5452, 77.1653], [9.6000, 77.1050], [9.6600, 77.0200], [9.7000, 76.9973]],
  },
  {
    id: 'r2', name: 'Upputhara–Ayyappancoil Valley Road', distanceKm: 24,
    points: [[9.5880, 77.0060], [9.6180, 76.9780], [9.6420, 76.9740]],
  },
  {
    id: 'r3', name: 'Idukki–Kothamangalam Corridor', distanceKm: 95,
    points: [[9.8430, 76.9710], [9.9500, 76.9580], [10.0500, 76.7500], [10.0610, 76.6380]],
  },
  {
    id: 'r4', name: 'Aluva–Perumbavoor Road (NH-544 spur)', distanceKm: 132,
    points: [[10.1020, 76.3600], [10.1100, 76.4500], [10.1150, 76.4740]],
  },
];

/** Road km markers used by the sim engine to flag submerged corridors (by r1..r4 index) */
export const ROAD_KM_MARKERS = [30, 24, 95, 132];
