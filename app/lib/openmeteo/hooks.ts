// app/lib/openmeteo/hooks.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type ForecastHour = {
  time: string; // ISO / local wall-clock time for requested timezone
  tempF: number | null;
  apparentTempF?: number | null;
  dewPointF: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  precipProbPct: number | null;
  windMph: number | null;
  windGustMph: number | null;
  windDirDeg?: number | null;
  weatherCode?: number | null;
  pressureHpa?: number | null;
  visibility?: number | null; // meters from Open-Meteo (you convert where needed)
  uvIndex?: number | null;
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
  cloudCoverMinPct: number | null;
  cloudCoverMaxPct: number | null;
  weatherCode?: number | null;

  sunrise?: string | null; // ISO (timezone=auto)
  sunset?: string | null; // ISO (timezone=auto)
  daylightDurationSec?: number | null;
  sunshineDurationSec?: number | null;
  uvIndexMax?: number | null;
};

export type ForecastData = {
  daily: ForecastDay[];
  hourly: ForecastHour[];

  // ✅ timezone metadata from Open-Meteo
  timezone?: string | null;
  timezoneAbbreviation?: string | null;
  utcOffsetSeconds?: number | null;
};

type ForecastState = {
  data: ForecastData | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
};

export type OpenMeteoForecastOpts = {
  lat: number | null;
  lon: number | null;
  days?: number; // default 3
  pastDays?: number; // default 0
};

type OpenMeteoForecastArg = number | OpenMeteoForecastOpts;

function isOpts(arg: OpenMeteoForecastArg): arg is OpenMeteoForecastOpts {
  return typeof arg === 'object' && arg != null;
}

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function safeStr(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function toKey3(x: number) {
  return Number(x.toFixed(3));
}

export function useOpenMeteoForecast(arg: OpenMeteoForecastArg = 3): ForecastState {
  const opts = useMemo<OpenMeteoForecastOpts>(() => {
    if (isOpts(arg)) {
      return {
        lat: arg.lat ?? null,
        lon: arg.lon ?? null,
        days: arg.days ?? 3,
        pastDays: arg.pastDays ?? 0,
      };
    }

    return { lat: null, lon: null, days: typeof arg === 'number' ? arg : 3, pastDays: 0 };
  }, [arg]);

  const days = opts.days ?? 3;
  const pastDays = opts.pastDays ?? 0;

  const latKey = useMemo(() => (opts.lat == null ? null : toKey3(opts.lat)), [opts.lat]);
  const lonKey = useMemo(() => (opts.lon == null ? null : toKey3(opts.lon)), [opts.lon]);

  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (latKey == null || lonKey == null) {
        setError(null);
        setData(null);
        setLoading(true);
        setRefreshing(false);
        return;
      }

      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const dailyVars = [
          'temperature_2m_max',
          'temperature_2m_min',
          'precipitation_probability_max',
          'wind_gusts_10m_max',
          'wind_speed_10m_max',
          'wind_direction_10m_dominant',
          'cloud_cover_mean',
          'dew_point_2m_max',
          'weather_code',
          'sunrise',
          'sunset',
          'daylight_duration',
          'sunshine_duration',
          'uv_index_max',
        ].join(',');

        const hourlyVars = [
          'temperature_2m',
          'apparent_temperature',
          'dew_point_2m',
          'relative_humidity_2m',
          'cloud_cover',
          'precipitation_probability',
          'visibility',
          'pressure_msl',
          'wind_speed_10m',
          'wind_gusts_10m',
          'wind_direction_10m',
          'weather_code',
          'uv_index',
        ].join(',');

        const params = new URLSearchParams({
          lat: String(latKey),
          lon: String(lonKey),
          daily: dailyVars,
          hourly: hourlyVars,
          forecast_days: String(days),
          timezone: 'auto',
          units: 'imperial',
        });
        if (pastDays > 0) params.set('past_days', String(pastDays));
        const url = apiUrl(`/api/openmeteo/hourly?${params.toString()}`);

        console.log('[net] requesting:', url);
        const res = await fetchWithTimeout(url, 12000);
        console.log('[net] status:', res.status, url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const timezone = safeStr(json?.timezone);
        const timezoneAbbreviation = safeStr(json?.timezone_abbreviation);
        const utcOffsetSeconds = safeNum(json?.utc_offset_seconds);

        // ---- Hourly parse ----
        const h = json.hourly ?? {};
        const hTimes: string[] = h.time ?? [];
        const hTemp: any[] = h.temperature_2m ?? [];
        const hApp: any[] = h.apparent_temperature ?? [];
        const hDp: any[] = h.dew_point_2m ?? [];
        const hRh: any[] = h.relative_humidity_2m ?? h.relativehumidity_2m ?? [];
        const hCloud: any[] = h.cloud_cover ?? h.cloudcover ?? [];
        const hPop: any[] = h.precipitation_probability ?? [];
        const hVis: any[] = h.visibility ?? [];
        const hWind: any[] = h.wind_speed_10m ?? h.windspeed_10m ?? [];
        const hGust: any[] = h.wind_gusts_10m ?? [];
        const hWindDir: any[] = h.wind_direction_10m ?? h.winddirection_10m ?? [];
        const hWmo: any[] = h.weather_code ?? [];
        const hPressure: any[] = h.pressure_msl ?? [];
        const hUv: any[] = h.uv_index ?? [];

        const hourly: ForecastHour[] = hTimes.map((time, idx) => ({
          time,
          tempF: safeNum(hTemp[idx]),
          apparentTempF: safeNum(hApp[idx]),
          dewPointF: safeNum(hDp[idx]),
          humidityPct: safeNum(hRh[idx]),
          cloudCoverPct: safeNum(hCloud[idx]),
          precipProbPct: safeNum(hPop[idx]),
          visibility: safeNum(hVis[idx]),
          windMph: safeNum(hWind[idx]),
          windGustMph: safeNum(hGust[idx]),
          windDirDeg: safeNum(hWindDir[idx]),
          weatherCode: safeNum(hWmo[idx]),
          pressureHpa: safeNum(hPressure[idx]),
          uvIndex: safeNum(hUv[idx]),
        }));

        // ---- Compute DAILY derived fields from HOURLY ----
        const rhMaxByDate: Record<string, number> = {};
        const cloudMinByDate: Record<string, number> = {};
        const cloudMaxByDate: Record<string, number> = {};

        for (let i = 0; i < hTimes.length; i++) {
          const dt = hTimes[i];
          const dateKey = typeof dt === 'string' ? dt.slice(0, 10) : '';
          if (!dateKey) continue;

          const rh = safeNum(hRh[i]);
          if (rh != null) {
            const prev = rhMaxByDate[dateKey];
            if (prev == null || rh > prev) rhMaxByDate[dateKey] = rh;
          }

          const cc = safeNum(hCloud[i]);
          if (cc != null) {
            const prevMin = cloudMinByDate[dateKey];
            const prevMax = cloudMaxByDate[dateKey];
            if (prevMin == null || cc < prevMin) cloudMinByDate[dateKey] = cc;
            if (prevMax == null || cc > prevMax) cloudMaxByDate[dateKey] = cc;
          }
        }

        // ---- Daily parse ----
        const d = json.daily ?? {};
        const dTimes: string[] = d.time ?? [];
        const tMax: any[] = d.temperature_2m_max ?? [];
        const tMin: any[] = d.temperature_2m_min ?? [];
        const popMax: any[] = d.precipitation_probability_max ?? [];
        const gustMax: any[] = d.wind_gusts_10m_max ?? [];
        const cloudMean: any[] = d.cloud_cover_mean ?? d.cloudcover_mean ?? [];
        const dpMax: any[] = d.dew_point_2m_max ?? [];
        const windMax: any[] = d.wind_speed_10m_max ?? d.windspeed_10m_max ?? [];
        const windDirDom: any[] = d.wind_direction_10m_dominant ?? d.winddirection_10m_dominant ?? [];
        const dWmo: any[] = d.weather_code ?? [];

        const dSunrise: any[] = d.sunrise ?? [];
        const dSunset: any[] = d.sunset ?? [];
        const dDaylight: any[] = d.daylight_duration ?? [];
        const dSunshine: any[] = d.sunshine_duration ?? [];
        const dUvMax: any[] = d.uv_index_max ?? [];

        const daily: ForecastDay[] = dTimes.map((date, idx) => ({
          date,
          tempMaxF: safeNum(tMax[idx]),
          tempMinF: safeNum(tMin[idx]),
          precipProbMaxPct: safeNum(popMax[idx]),
          windMaxMph: safeNum(windMax[idx]),
          windDirDominantDeg: safeNum(windDirDom[idx]),
          windGustMaxMph: safeNum(gustMax[idx]),
          cloudCoverAvgPct: safeNum(cloudMean[idx]),
          dewPointMaxF: safeNum(dpMax[idx]),
          humidityMaxPct: typeof rhMaxByDate[date] === 'number' ? rhMaxByDate[date] : null,
          cloudCoverMinPct: typeof cloudMinByDate[date] === 'number' ? cloudMinByDate[date] : null,
          cloudCoverMaxPct: typeof cloudMaxByDate[date] === 'number' ? cloudMaxByDate[date] : null,
          weatherCode: safeNum(dWmo[idx]),
          sunrise: typeof dSunrise[idx] === 'string' ? dSunrise[idx] : null,
          sunset: typeof dSunset[idx] === 'string' ? dSunset[idx] : null,
          daylightDurationSec: safeNum(dDaylight[idx]),
          sunshineDurationSec: safeNum(dSunshine[idx]),
          uvIndexMax: safeNum(dUvMax[idx]),
        }));

        setData({
          daily,
          hourly,
          timezone,
          timezoneAbbreviation,
          utcOffsetSeconds,
        });
      } catch (err: any) {
        console.error('useOpenMeteoForecast error', err);
        setError(err?.message ?? 'Failed to load forecast');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [latKey, lonKey, days, pastDays]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}
