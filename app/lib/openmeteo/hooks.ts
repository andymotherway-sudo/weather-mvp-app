// app/lib/openmeteo/hooks.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCATION } from '../weather/locations';

export type ForecastHour = {
  time: string; // ISO
  tempF: number | null;
  dewPointF: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  precipProbPct: number | null;
  windMph: number | null;
  windGustMph: number | null;
  windDirDeg?: number | null;
};

export type ForecastDay = {
  date: string; // YYYY-MM-DD
  tempMaxF: number | null;
  tempMinF: number | null;
  dewPointMaxF: number | null;
  humidityMaxPct: number | null;
  precipProbMaxPct: number | null;
  windMaxMph: number | null;
  windGustMaxMph: number | null;
  windDirDominantDeg: number | null;
  cloudCoverAvgPct: number | null;
};

type ForecastData = {
  daily: ForecastDay[];
  hourly: ForecastHour[];
};

type ForecastState = {
  data: ForecastData | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
};

export type OpenMeteoForecastOpts = {
  lat: number;
  lon: number;
  days?: number; // default 3
};

// Allow BOTH call styles:
// - useOpenMeteoForecast(3)
// - useOpenMeteoForecast({ lat, lon, days: 3 })
type OpenMeteoForecastArg = number | OpenMeteoForecastOpts;

function isOpts(arg: OpenMeteoForecastArg): arg is OpenMeteoForecastOpts {
  return typeof arg === 'object' && arg != null;
}

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function useOpenMeteoForecast(arg: OpenMeteoForecastArg = 3): ForecastState {
  const opts = useMemo(() => {
    if (isOpts(arg)) {
      return { lat: arg.lat, lon: arg.lon, days: arg.days ?? 3 };
    }
    return {
      lat: DEFAULT_LOCATION.lat,
      lon: DEFAULT_LOCATION.lon,
      days: typeof arg === 'number' ? arg : 3,
    };
  }, [arg]);

  // Optional but helpful: reduce refetch spam from minor GPS jitter
  const latKey = useMemo(() => Number(opts.lat.toFixed(3)), [opts.lat]);
  const lonKey = useMemo(() => Number(opts.lon.toFixed(3)), [opts.lon]);
  const days = opts.days;

  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);

        // These names match your existing parsing keys below
        const dailyVars = [
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_probability_max',
          'wind_gusts_10m_max',
          'windspeed_10m_max',
          'winddirection_10m_dominant',
          'cloudcover_mean',
          'dew_point_2m_max',
        ].join(',');

        const hourlyVars = [
          'temperature_2m',
          'dew_point_2m',
          'relativehumidity_2m',
          'cloudcover',
          'precipitation_probability',
          'windspeed_10m',
          'wind_gusts_10m',
        ].join(',');

        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${latKey}&longitude=${lonKey}` +
          `&daily=${dailyVars}` +
          `&hourly=${hourlyVars}` +
          `&forecast_days=${days}` +
          `&temperature_unit=fahrenheit` +
          `&wind_speed_unit=mph` +
          `&timezone=auto`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        // ---- Hourly parse (FIRST) ----
        const h = json.hourly ?? {};
        const hTimes: string[] = h.time ?? [];
        const hTemp: any[] = h.temperature_2m ?? [];
        const hDp: any[] = h.dew_point_2m ?? [];
        const hRh: any[] = h.relativehumidity_2m ?? [];
        const hCloud: any[] = h.cloudcover ?? [];
        const hPop: any[] = h.precipitation_probability ?? [];
        const hWind: any[] = h.windspeed_10m ?? [];
        const hGust: any[] = h.wind_gusts_10m ?? [];

        const hourly: ForecastHour[] = hTimes.map((time, idx) => ({
          time,
          tempF: safeNum(hTemp[idx]),
          dewPointF: safeNum(hDp[idx]),
          humidityPct: safeNum(hRh[idx]),
          cloudCoverPct: safeNum(hCloud[idx]),
          precipProbPct: safeNum(hPop[idx]),
          windMph: safeNum(hWind[idx]),
          windGustMph: safeNum(hGust[idx]),
        }));

        // ---- Compute DAILY humidityMaxPct from hourly RH ----
        const rhMaxByDate: Record<string, number> = {};
        for (let i = 0; i < hTimes.length; i++) {
          const dt = hTimes[i];
          const dateKey = typeof dt === 'string' ? dt.slice(0, 10) : '';
          const rh = safeNum(hRh[i]);
          if (!dateKey || rh == null) continue;

          const prev = rhMaxByDate[dateKey];
          if (prev == null || rh > prev) rhMaxByDate[dateKey] = rh;
        }

        // ---- Daily parse ----
        const d = json.daily ?? {};
        const dTimes: string[] = d.time ?? [];
        const tMax: any[] = d.temperature_2m_max ?? [];
        const tMin: any[] = d.temperature_2m_min ?? [];
        const popMax: any[] = d.precipitation_probability_max ?? [];
        const gustMax: any[] = d.wind_gusts_10m_max ?? [];
        const cloudMean: any[] = d.cloudcover_mean ?? [];
        const dpMax: any[] = d.dew_point_2m_max ?? [];
        const windMax: any[] = d.windspeed_10m_max ?? [];
        const windDir: any[] = d.winddirection_10m_dominant ?? [];

        const daily: ForecastDay[] = dTimes.map((date, idx) => ({
          date,
          tempMaxF: safeNum(tMax[idx]),
          tempMinF: safeNum(tMin[idx]),
          precipProbMaxPct: safeNum(popMax[idx]),
          windMaxMph: safeNum(windMax[idx]),
          windDirDominantDeg: safeNum(windDir[idx]),
          windGustMaxMph: safeNum(gustMax[idx]),
          cloudCoverAvgPct: safeNum(cloudMean[idx]),
          dewPointMaxF: safeNum(dpMax[idx]),
          humidityMaxPct: typeof rhMaxByDate[date] === 'number' ? rhMaxByDate[date] : null,
        }));

        setData({ daily, hourly });
      } catch (err: any) {
        console.error('useOpenMeteoForecast error', err);
        setError(err?.message ?? 'Failed to load forecast');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [latKey, lonKey, days]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}
