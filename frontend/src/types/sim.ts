// DamBreach AI — shared simulation types

export type AppMode = 'scenario' | 'demo' | 'tracker';

export interface DamParams {
  /** Structural height of the dam (m) */
  damHeight: number;
  /** Crest length (m) */
  damWidth: number;
  /** Gross reservoir storage (millions of m³) */
  reservoirVolume: number;
  /** Present reservoir filling (% of gross) */
  reservoirLevel: number;
  /** Final breach width (m) */
  breachWidth: number;
  /** Breach formation time (minutes) */
  breachFormationTime: number;
  /** Riverbed Manning's roughness */
  manningsN: number;
}

export interface Town {
  id: string;
  name: string;
  lat: number;
  lng: number;
  population: number;
  /** Offset (km) of the town along the valley axis from the dam */
  distanceKm: number;
  /** Lateral offset (km) from the valley centerline (signed) */
  lateralKm: number;
  elevation: number;
}

export interface RoadSegment {
  id: string;
  name: string;
  points: [number, number][];
  /** Longitudinal distance (km) of segment midpoint from the dam */
  distanceKm: number;
}

export interface DamageRecord {
  townId: string;
  name: string;
  population: number;
  affectedPopulation: number;
  depthCm: number;
  arrivalMin: number | null;
  severity: 'safe' | 'watch' | 'warning' | 'critical';
}

export interface DamageSummary {
  records: DamageRecord[];
  totalAffected: number;
  townsHit: number;
  roadsFlooded: number;
  buildingsAtRisk: number;
  economicLossCrores: number;
}

export interface SimFrame {
  /** Minutes since breach initiation */
  tMin: number;
  /** Centerline distance of the flood front (km) */
  frontKm: number;
  /** Peak depth at the front (m) */
  frontDepthM: number;
  /** Peak velocity at the front (m/s) */
  frontVelocityMs: number;
  /** Cumulative released volume (millions of m³) */
  releasedMm3: number;
  /** Current breach outflow (m³/s) */
  outflowCumecs: number;
  /** Per-town wet/dry + depth state at this timestep */
  townState: Record<string, { depthCm: number; arrivalMin: number | null }>;
  /** Flooded road segment ids at this timestep */
  floodedRoadIds: string[];
  /** Inundated corridor area this timestep (km²) */
  extentKm2: number;
  damage: DamageSummary;
}

export type ModelTag = 'sph' | 'delft3d';

export interface SimResult {
  frames: SimFrame[];
  dam: DamParams;
  label: string;
  /** Which physics model produced this run */
  model: ModelTag;
}

export interface TrackerScene {
  id: string;
  title: string;
  source: string;
  capturedAt: string;
  /** Flood polygon (lat, lng ring) */
  floodExtent: [number, number][];
  /** Pre-flood normal water body ring */
  baselineExtent: [number, number][];
  areaKm2: number;
  villagesAffected: number;
  populationExposed: number;
  cloudCoverPct: number;
  sensorNote: string;
  villages: { name: string; lat: number; lng: number }[];
}
