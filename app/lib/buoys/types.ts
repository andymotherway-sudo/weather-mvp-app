// app/lib/buoys/types.ts

export interface BuoyIndexEntry {
  id: string;       // e.g., "46029"
  name: string;     // "Monterey Bay"
  lat: number;
  lon: number;
  region?: string;
  provider: string; // "NDBC", "JMA", etc.
  hasWaves: boolean;
  hasMeteo: boolean;
}

export interface BuoyObservation {
  time: string;          // ISO timestamp
  windSpeedKts: number | null;
  windGustKts: number | null;
  windDirectionDeg: number | null;
  waveHeightM: number | null;
  wavePeriodS: number | null;
  waveDirectionDeg: number | null;
  seaTempC: number | null;
  airTempC: number | null;
  pressureHpa: number | null;
}

export interface BuoyDetail {
  meta: BuoyIndexEntry;
  latest: BuoyObservation | null;
  history: BuoyObservation[];
}
export interface BuoyIndexResponse {
  buoys: BuoyIndexEntry[];
}