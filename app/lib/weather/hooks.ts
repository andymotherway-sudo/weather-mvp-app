// app/lib/weather/hooks.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type CurrentWeatherOptions = {
  lat: number;
  lon: number;
  units?: 'imperial' | 'metric';
  enabled?: boolean;
};

type CurrentWeatherState<T = any> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
};

function isFiniteNum(v: any) {
  return typeof v === 'number' && Number.isFinite(v);
}

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function nearestIndexForTime(times: string[]) {
  if (!Array.isArray(times) || !times.length) return -1;

  const now = Date.now();
  let bestIdx = -1;
  let bestDt = Infinity;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i]).getTime();
    if (!Number.isFinite(t)) continue;

    const dt = Math.abs(t - now);
    if (dt < bestDt) {
      bestDt = dt;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function at<T = any>(arr: T[] | undefined, idx: number): T | null {
  if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return null;
  return arr[idx] ?? null;
}

function normalizeCurrentFromForecastJson(json: any, units: 'imperial' | 'metric') {
  const directTemp = safeNum(json?.temp);
  const directFeels = safeNum(json?.feels);
  const directDewPoint = safeNum(json?.dewPoint);
  const directHumidity = safeNum(json?.humidityPct);
  const directCloudCover = safeNum(json?.cloudCoverPct);
  const directWind = safeNum(json?.wind);
  const directWindGust = safeNum(json?.windGust);
  const directWindDir = safeNum(json?.windDir);
  const directPressure = safeNum(json?.pressureMb);
  const directWeatherCode = safeNum(json?.weatherCode);

  if (
    directTemp != null ||
    directFeels != null ||
    directDewPoint != null ||
    directHumidity != null ||
    directCloudCover != null ||
    directWind != null ||
    directWindGust != null ||
    directWindDir != null ||
    directPressure != null ||
    directWeatherCode != null
  ) {
    return {
      ok: json?.ok ?? true,
      source: json?.source ?? 'open-meteo',
      time: typeof json?.time === 'string' ? json.time : null,
      units: json?.units ?? units,
      temp: directTemp,
      feels: directFeels,
      dewPoint: directDewPoint,
      humidityPct: directHumidity,
      cloudCoverPct: directCloudCover,
      wind: directWind,
      windGust: directWindGust,
      windDir: directWindDir,
      pressureMb: directPressure,
      weatherCode: directWeatherCode,
    };
  }

  const current = json?.current ?? null;
  const hourly = json?.hourly ?? {};
  const hourlyTimes: string[] = Array.isArray(hourly?.time) ? hourly.time : [];

  const idx = nearestIndexForTime(hourlyTimes);

  const time =
    (typeof current?.time === 'string' && current.time) ||
    (idx >= 0 ? (hourlyTimes[idx] ?? null) : null);

  const temp =
    safeNum(current?.temperature_2m) ??
    safeNum(at(hourly?.temperature_2m, idx));

  const feels =
    safeNum(current?.apparent_temperature) ??
    safeNum(at(hourly?.apparent_temperature, idx));

  const dewPoint =
    safeNum(current?.dew_point_2m) ??
    safeNum(at(hourly?.dew_point_2m, idx));

  const humidityPct =
    safeNum(current?.relative_humidity_2m) ??
    safeNum(at(hourly?.relative_humidity_2m, idx));

  const cloudCoverPct =
    safeNum(current?.cloud_cover) ??
    safeNum(at(hourly?.cloud_cover, idx));

  const wind =
    safeNum(current?.wind_speed_10m) ??
    safeNum(at(hourly?.wind_speed_10m, idx));

  const windGust =
    safeNum(current?.wind_gusts_10m) ??
    safeNum(at(hourly?.wind_gusts_10m, idx));

  const windDir =
    safeNum(current?.wind_direction_10m) ??
    safeNum(at(hourly?.wind_direction_10m, idx));

  const pressureMb =
    safeNum(current?.pressure_msl) ??
    safeNum(at(hourly?.pressure_msl, idx));

  const weatherCode =
    safeNum(current?.weather_code) ??
    safeNum(at(hourly?.weather_code, idx));

  return {
    ok: true,
    source: 'open-meteo',
    time: time ?? null,
    units,
    temp,
    feels,
    dewPoint,
    humidityPct,
    cloudCoverPct,
    wind,
    windGust,
    windDir,
    pressureMb,
    weatherCode,
  };
}

function buildCurrentWeatherUrl(lat: number, lon: number, units: 'imperial' | 'metric') {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    units,
  });
  return apiUrl(`/api/current?${params.toString()}`);
}

export function useCurrentWeather(opts: CurrentWeatherOptions): CurrentWeatherState {
  const lat = opts?.lat;
  const lon = opts?.lon;
  const units = opts?.units ?? 'imperial';
  const enabled = opts?.enabled ?? true;

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!isFiniteNum(lat) || !isFiniteNum(lon)) {
        setLoading(false);
        setRefreshing(false);
        setError('No location selected (lat/lon missing).');
        setData(null);
        return;
      }

      if (!enabled) {
        abortRef.current?.abort();
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (isRefresh) setRefreshing(true);
        else {
          setData(null);
          setLoading(true);
        }

        setError(null);

        const url = buildCurrentWeatherUrl(lat, lon, units);
        console.log('[net] current requesting (worker):', url);

        const res = await fetchWithTimeout(url, 12000, { signal: ac.signal });
        console.log('[net] current status:', res.status, url);

        const text = await res.text().catch(() => '');
        console.log('[net] current body:', text.slice(0, 300));

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let json: any;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          throw new Error('Current endpoint did not return JSON');
        }

        const normalized = normalizeCurrentFromForecastJson(json, units);
        if (!ac.signal.aborted && abortRef.current === ac) setData(normalized);
      } catch (err: any) {
        if (err?.name === 'AbortError' || ac.signal.aborted || abortRef.current !== ac) return;
        setError(err?.message ?? 'Failed to load current weather');
        setData(null);
      } finally {
        if (abortRef.current === ac) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [lat, lon, units, enabled]
  );

  useEffect(() => {
    load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}
