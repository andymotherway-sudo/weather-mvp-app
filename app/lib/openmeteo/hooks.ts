// app/lib/openmeteo/hooks.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type ForecastHour = {
  time: string; // ISO / local wall-clock time for requested timezone
  tempF: number | null;
  apparentTempF?: number | null;
  airQualityUsAqi?: number | null;
  airQualityLabel?: string | null;
  pm25?: number | null;
  pm10?: number | null;
  ozone?: number | null;
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
  apparentTempMaxF?: number | null;
  apparentTempMinF?: number | null;
  airQualityUsAqiMax?: number | null;
  airQualityLabel?: string | null;
  pm25Max?: number | null;
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
  model?: 'best_match' | 'gfs' | 'ecmwf' | 'dwd_icon';
  enabled?: boolean;
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

function airQualityLabelForUsAqi(aqi: number | null) {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

export function useOpenMeteoForecast(arg: OpenMeteoForecastArg = 3): ForecastState {
  const opts = useMemo<OpenMeteoForecastOpts>(() => {
    if (isOpts(arg)) {
      return {
        lat: arg.lat ?? null,
        lon: arg.lon ?? null,
        days: arg.days ?? 3,
        pastDays: arg.pastDays ?? 0,
        model: arg.model ?? 'best_match',
        enabled: arg.enabled ?? true,
      };
    }

    return { lat: null, lon: null, days: typeof arg === 'number' ? arg : 3, pastDays: 0, model: 'best_match', enabled: true };
  }, [arg]);

  const model = opts.model ?? 'best_match';
  const enabled = opts.enabled ?? true;
  const requestedDays = opts.days ?? 3;
  const days =
    model === 'dwd_icon'
      ? Math.min(requestedDays, 7)
      : model === 'ecmwf'
        ? Math.min(requestedDays, 15)
        : Math.min(requestedDays, 16);
  const pastDays = opts.pastDays ?? 0;

  const latKey = useMemo(() => (opts.lat == null ? null : toKey3(opts.lat)), [opts.lat]);
  const lonKey = useMemo(() => (opts.lon == null ? null : toKey3(opts.lon)), [opts.lon]);

  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (latKey == null || lonKey == null) {
        requestIdRef.current += 1;
        abortRef.current?.abort();
        setError(null);
        setData(null);
        setLoading(true);
        setRefreshing(false);
        return;
      }

      if (!enabled) {
        requestIdRef.current += 1;
        abortRef.current?.abort();
        setError(null);
        setData(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const requestId = ++requestIdRef.current;
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

        const dailyVars = [
          'temperature_2m_max',
          'temperature_2m_min',
          'apparent_temperature_max',
          'apparent_temperature_min',
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
        if (model !== 'best_match') params.set('model', model);
        if (pastDays > 0) params.set('past_days', String(pastDays));
        const url = apiUrl(`/api/openmeteo/hourly?${params.toString()}`);

        console.log('[net] requesting:', url);
        const res = await fetchWithTimeout(url, 12000, { signal: ac.signal });
        console.log('[net] status:', res.status, url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const timezone = safeStr(json?.timezone);
        const timezoneAbbreviation = safeStr(json?.timezone_abbreviation);
        const utcOffsetSeconds = safeNum(json?.utc_offset_seconds);

        const aqByTime = new Map<string, any>();
        const aqForecastHours = Math.min(168, Math.max(24, (days + pastDays) * 24));
        try {
          const aqParams = new URLSearchParams({
            lat: String(latKey),
            lon: String(lonKey),
            timezone: timezone ?? 'auto',
            forecast_hours: String(aqForecastHours),
          });
          if (pastDays > 0) aqParams.set('past_hours', String(Math.min(24, pastDays * 24)));
          const aqUrl = apiUrl(`/api/air-quality/hourly?${aqParams.toString()}`);
          const aqRes = await fetchWithTimeout(aqUrl, 10000, { signal: ac.signal });
          if (aqRes.ok) {
            const aqJson = await aqRes.json();
            const aqRows = Array.isArray(aqJson?.hourly) ? aqJson.hourly : [];
            for (const row of aqRows) {
              if (typeof row?.time === 'string') aqByTime.set(row.time, row);
            }
          }
        } catch (aqErr) {
          if (!ac.signal.aborted) console.warn('AQI hourly unavailable', aqErr);
        }

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

        const hourly: ForecastHour[] = hTimes.map((time, idx) => {
          const aq = aqByTime.get(time);
          const usAqi = safeNum(aq?.usAqi ?? aq?.airQualityIndex);
          return {
            time,
            tempF: safeNum(hTemp[idx]),
            apparentTempF: safeNum(hApp[idx]),
            airQualityUsAqi: usAqi,
            airQualityLabel: typeof aq?.airQualityLabel === 'string' ? aq.airQualityLabel : airQualityLabelForUsAqi(usAqi),
            pm25: safeNum(aq?.pm25),
            pm10: safeNum(aq?.pm10),
            ozone: safeNum(aq?.ozone),
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
          };
        });

        // ---- Compute DAILY derived fields from HOURLY ----
        const rhMaxByDate: Record<string, number> = {};
        const cloudMinByDate: Record<string, number> = {};
        const cloudMaxByDate: Record<string, number> = {};
        const aqiMaxByDate: Record<string, number> = {};
        const pm25MaxByDate: Record<string, number> = {};

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

          const aq = aqByTime.get(dt);
          const usAqi = safeNum(aq?.usAqi ?? aq?.airQualityIndex);
          if (usAqi != null) {
            const prev = aqiMaxByDate[dateKey];
            if (prev == null || usAqi > prev) aqiMaxByDate[dateKey] = usAqi;
          }
          const pm25 = safeNum(aq?.pm25);
          if (pm25 != null) {
            const prev = pm25MaxByDate[dateKey];
            if (prev == null || pm25 > prev) pm25MaxByDate[dateKey] = pm25;
          }
        }

        // ---- Daily parse ----
        const d = json.daily ?? {};
        const dTimes: string[] = d.time ?? [];
        const tMax: any[] = d.temperature_2m_max ?? [];
        const tMin: any[] = d.temperature_2m_min ?? [];
        const appMax: any[] = d.apparent_temperature_max ?? [];
        const appMin: any[] = d.apparent_temperature_min ?? [];
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
          apparentTempMaxF: safeNum(appMax[idx]),
          apparentTempMinF: safeNum(appMin[idx]),
          airQualityUsAqiMax: typeof aqiMaxByDate[date] === 'number' ? aqiMaxByDate[date] : null,
          airQualityLabel: typeof aqiMaxByDate[date] === 'number' ? airQualityLabelForUsAqi(aqiMaxByDate[date]) : null,
          pm25Max: typeof pm25MaxByDate[date] === 'number' ? pm25MaxByDate[date] : null,
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

        if (requestId !== requestIdRef.current || ac.signal.aborted) return;

        setData({
          daily,
          hourly,
          timezone,
          timezoneAbbreviation,
          utcOffsetSeconds,
        });
      } catch (err: any) {
        if (err?.name === 'AbortError' || ac.signal.aborted || requestId !== requestIdRef.current) return;
        console.error('useOpenMeteoForecast error', err);
        setError(err?.message ?? 'Failed to load forecast');
      } finally {
        if (requestId === requestIdRef.current && abortRef.current === ac) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [latKey, lonKey, days, pastDays, model, enabled]
  );

  useEffect(() => {
    load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}
