// app/lib/spaceweather/types.ts

export type SolarWindSample = {
  time: string;   // ISO datetime
  speed: number;  // km/s
};

export type SpaceWeatherSummary = {
  solarWindSpeed: number;    // km/s
  solarWindDensity: number;  // protons/cm^3
  solarWindTemp: number;     // Kelvin
  kp: number;                // planetary K-index
  updatedAt: string;         // ISO datetime string
  windHistory: SolarWindSample[]; // recent samples for tiny graph
};
