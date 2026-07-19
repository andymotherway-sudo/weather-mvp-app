import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type WeatherBatchPoint = {
  lat: number;
  lon: number;
};

export type CurrentBatchPayload = {
  ok: true;
  source: string;
  time: string | null;
  units: 'imperial' | 'metric';
  temp: number | null;
  feels: number | null;
  dewPoint: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  wind: number | null;
  windGust: number | null;
  windDir: number | null;
  pressureMb: number | null;
  weatherCode: number | null;
};

export type CurrentBatchItem = {
  lat: number;
  lon: number;
  current: CurrentBatchPayload;
};

export function nearestTimeIndex(times: unknown, targetMs = Date.now()): number {
  if (!Array.isArray(times) || !times.length) return -1;

  let bestIdx = -1;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i++) {
    const ms = new Date(String(times[i])).getTime();
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export async function fetchCurrentWeatherBatch(
  points: WeatherBatchPoint[],
  units: 'imperial' | 'metric',
  signal?: AbortSignal,
): Promise<CurrentBatchItem[]> {
  if (!points.length) return [];

  const params = new URLSearchParams({
    lat: points.map((point) => point.lat.toFixed(4)).join(','),
    lon: points.map((point) => point.lon.toFixed(4)).join(','),
    units,
  });

  const res = await fetchWithTimeout(apiUrl(`/api/current/batch?${params.toString()}`), 12000, { signal });
  if (!res.ok) throw new Error(`Current batch failed (${res.status})`);

  const json = await res.json();
  return Array.isArray(json?.items) ? (json.items as CurrentBatchItem[]) : [];
}

export async function fetchHourlyForecastBatch(args: {
  points: WeatherBatchPoint[];
  hourly?: string;
  daily?: string;
  forecastDays?: number;
  timezone?: string;
  units?: 'imperial' | 'metric';
  signal?: AbortSignal;
}) {
  const {
    points,
    hourly,
    daily,
    forecastDays = 1,
    timezone = 'auto',
    units = 'imperial',
    signal,
  } = args;

  if (!points.length) return [];

  const params = new URLSearchParams({
    lat: points.map((point) => point.lat.toFixed(4)).join(','),
    lon: points.map((point) => point.lon.toFixed(4)).join(','),
    forecast_days: String(forecastDays),
    timezone,
    units,
  });
  if (hourly) params.set('hourly', hourly);
  if (daily) params.set('daily', daily);

  const res = await fetchWithTimeout(apiUrl(`/api/openmeteo/hourly?${params.toString()}`), 12000, { signal });
  if (!res.ok) throw new Error(`Forecast batch failed (${res.status})`);

  const json = await res.json();
  return Array.isArray(json) ? json : [json];
}
