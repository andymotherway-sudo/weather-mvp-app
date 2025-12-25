// app/lib/buoys/noaaTypes.ts

export interface NoaaBuoyObservationRaw {
  station_id: string;
  lat: string;
  lon: string;

  wind_dir?: string;
  wind_spd?: string;
  gust?: string;

  wave_ht?: string;
  wvht?: string;          // alternate wave height field
  dominant_wpd?: string;  // dominant wave period
  average_wpd?: string;
  swell_ht?: string;
  swell_period?: string;

  air_temp?: string;
  water_temp?: string;
  dewpoint?: string;

  visibility?: string;
  mslp?: string;
  pressure?: string;
  tide?: string;

  time?: string;

  [key: string]: string | undefined;
}

export interface BuoyDetailData {
  id: string;
  name: string;
  lat: number;
  lon: number;
  updatedAt?: string;

  windDirectionDeg?: number;
  windSpeedKts?: number;
  windGustKts?: number;

  waveHeightM?: number;
  dominantPeriodSec?: number;
  swellHeightM?: number;
  swellPeriodSec?: number;

  airTempC?: number;
  waterTempC?: number;
  visibilityNm?: number;
  pressureHpa?: number;
}
