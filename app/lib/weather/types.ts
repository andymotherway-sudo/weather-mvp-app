// lib/weather/types.ts

export type Units = 'metric' | 'imperial';

export interface CurrentWeather {
  locationName: string;
  temperature: number;    // in chosen units
  dewPoint?: number;
  humidity?: number;
  condition: string;      // "Clear", "Clouds", etc.
  observationTime: string; // ISO string
}