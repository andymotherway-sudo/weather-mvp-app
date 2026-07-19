// app/lib/openmeteo/api.ts
import type {
  OpenMeteoDaily,
  OpenMeteoForecast,
  OpenMeteoForecastResponse,
} from './types';
import { apiUrl } from '../net/apiBase';

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
    lat: String(lat),
    lon: String(lon),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    units: 'imperial',
  });

  params.set('forecast_days', String(Math.max(1, Math.min(16, days))));

  const res = await fetch(apiUrl(`/api/openmeteo/hourly?${params.toString()}`));
  if (!res.ok) {
    throw new Error(`Open-Meteo proxy error: ${res.status} ${res.statusText}`);
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
