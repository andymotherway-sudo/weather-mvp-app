// app/lib/openmeteo/api.ts

import { DEFAULT_LOCATION } from '../weather/locations';
import type {
  OpenMeteoDaily,
  OpenMeteoForecast,
  OpenMeteoForecastResponse,
} from './types';

// Open-Meteo free forecast API (no key required)
// Docs: https://open-meteo.com/en/docs
const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

export async function fetchOpenMeteoForecast(
  days: number = 3
): Promise<OpenMeteoForecast> {
  const params = new URLSearchParams({
    latitude: String(DEFAULT_LOCATION.lat),
    longitude: String(DEFAULT_LOCATION.lon),
    daily:
      'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
  });

  const res = await fetch(`${BASE_URL}?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`Open-Meteo error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as OpenMeteoForecastResponse;
  const times = json.daily?.time ?? [];
  const tMax = json.daily?.temperature_2m_max ?? [];
  const tMin = json.daily?.temperature_2m_min ?? [];
  const pProb = json.daily?.precipitation_probability_max ?? [];

  const daily: OpenMeteoDaily[] = times.slice(0, days).map((iso, idx) => ({
    date: iso,
    tempMax: tMax[idx] ?? null,
    tempMin: tMin[idx] ?? null,
    precipProb: pProb[idx] ?? null,
  }));

  return {
    provider: 'open-meteo',
    timezone: json.timezone ?? 'auto',
    daily,
  };
}
