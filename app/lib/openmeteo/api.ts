// app/lib/openmeteo/api.ts
import type {
  OpenMeteoDaily,
  OpenMeteoForecast,
  OpenMeteoForecastResponse,
} from './types';

// Open-Meteo free forecast API (no key required)
// Docs: https://open-meteo.com/en/docs
const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

function assertCoords(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('fetchOpenMeteoForecast requires valid lat/lon');
  }
}

export async function fetchOpenMeteoForecast(
  lat: number,
  lon: number,
  days: number = 3
): Promise<OpenMeteoForecast> {
  assertCoords(lat, lon);

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    temperature_unit: 'fahrenheit',
  });

  // Optional: Open-Meteo supports forecast_days as a limiter; keep it aligned with `days`
  params.set('forecast_days', String(Math.max(1, Math.min(16, days))));

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