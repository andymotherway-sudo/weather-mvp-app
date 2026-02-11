// lib/weather/hooks.ts
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LOCATION } from './locations';

type CurrentWeatherOptions = {
  lat?: number;
  lon?: number;
  units?: 'imperial' | 'metric' | 'standard';
};

type CurrentWeatherState = {
  data: any | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
};

function mToMi(m: any): number | null {
  const n = typeof m === 'string' ? Number(m) : m;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n / 1609.344;
}

function hpaToInHg(hpa: any): number | null {
  const n = typeof hpa === 'string' ? Number(hpa) : hpa;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  // 1 hPa = 0.029529983071445 inHg
  return n * 0.029529983071445;
}

function pickHourlyValueForIsoTime(
  hourly: any,
  isoTime: string | null,
  field: string
): number | null {
  const times: string[] = hourly?.time ?? [];
  const values: any[] = hourly?.[field] ?? [];
  if (!isoTime || !times.length || !values.length) return null;

  // Try exact match first
  const exactIdx = times.indexOf(isoTime);
  if (exactIdx >= 0) {
    const v = values[exactIdx];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  // Otherwise choose nearest time
  const target = new Date(isoTime).getTime();
  if (!Number.isFinite(target)) return null;

  let bestIdx = -1;
  let bestDt = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (!Number.isFinite(t)) continue;
    const dt = Math.abs(t - target);
    if (dt < bestDt) {
      bestDt = dt;
      bestIdx = i;
    }
  }

  if (bestIdx >= 0) {
    const v = values[bestIdx];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }

  return null;
}

/**
 * Current land weather hook
 * Uses Open-Meteo and maps to the loose field names used in app/(tabs)/index.tsx.
 * Adds "now" model-derived fields: cloud cover, pressure, UV, visibility, gusts,
 * and fills POP from hourly precipitation_probability for the current hour.
 */
export function useCurrentWeather(options: CurrentWeatherOptions = {}): CurrentWeatherState {
  const lat = options.lat ?? DEFAULT_LOCATION.lat;
  const lon = options.lon ?? DEFAULT_LOCATION.lon;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const currentVars = [
          'temperature_2m',
          'apparent_temperature',
          'dew_point_2m',
          'relative_humidity_2m',
          'wind_speed_10m',
          'wind_gusts_10m',
          'wind_direction_10m',
          'weather_code',
          'cloud_cover',
          'pressure_msl',
          'surface_pressure',
          'visibility',
          'uv_index',
        ].join(',');

        // POP lives in hourly (forecast), not current
        const hourlyVars = ['precipitation_probability'].join(',');

        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}` +
          `&longitude=${lon}` +
          `&current=${encodeURIComponent(currentVars)}` +
          `&hourly=${encodeURIComponent(hourlyVars)}` +
          `&temperature_unit=fahrenheit` +
          `&wind_speed_unit=mph` +
          `&timezone=auto`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const c = json.current ?? {};
        const hourly = json.hourly ?? {};

        const code = c.weather_code;
        const wxMap: Record<number, string> = {
          0: 'Clear',
          1: 'Mostly clear',
          2: 'Partly cloudy',
          3: 'Overcast',
          45: 'Fog',
          48: 'Freezing fog',
          51: 'Drizzle',
          61: 'Rain',
          71: 'Snow',
          80: 'Showers',
          95: 'Thunderstorms',
        };

        const pressureHpa = (c.pressure_msl ?? c.surface_pressure) ?? null;
        const pressureInHg = hpaToInHg(pressureHpa);

        const observedAt: string | null = c.time ?? null;

        const pop =
          pickHourlyValueForIsoTime(hourly, observedAt, 'precipitation_probability') ??
          pickHourlyValueForIsoTime(hourly, new Date().toISOString(), 'precipitation_probability');

        const mapped = {
          temperatureF: c.temperature_2m,
          apparentTemperatureF: c.apparent_temperature,
          dewpointF: c.dew_point_2m,
          humidity: c.relative_humidity_2m,

          windSpeedMph: c.wind_speed_10m,
          windGustMph: c.wind_gusts_10m,
          wind_dir: c.wind_direction_10m,

          cloudCoverPct: c.cloud_cover,

          // pressure in both units
          pressureHpa,
          pressureInHg,

          visibilityMi: mToMi(c.visibility),
          uvIndex: c.uv_index,

          // POP from hourly forecast for the current hour
          precipChancePct: pop,

          shortForecast: typeof code === 'number' && code in wxMap ? wxMap[code] : '—',
          observedAt,
        };

        setData(mapped);
      } catch (err: any) {
        console.error('useCurrentWeather error', err);
        setError(err?.message ?? 'Failed to load current weather');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lat, lon]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}