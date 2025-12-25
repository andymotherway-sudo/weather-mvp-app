// lib/weather/api.ts

import type { CurrentWeather, Units } from './types';

export interface WeatherRequest {
  lat: number;
  lon: number;
  units?: Units;
}

// TODO: wire to real API later.
// For now: return deterministic mock data so the UI & flow are testable.
export async function fetchCurrentWeather(
  req: WeatherRequest
): Promise<CurrentWeather> {
  const { lat, lon, units = 'imperial' } = req;

  // Simulated latency
  await new Promise((resolve) => setTimeout(resolve, 400));

  return {
    locationName: 'Phoenix, AZ',
    temperature: units === 'imperial' ? 92 : 33,
    dewPoint: units === 'imperial' ? 40 : 4,
    humidity: 18,
    condition: 'Clear',
    observationTime: new Date().toISOString(),
  };
}
