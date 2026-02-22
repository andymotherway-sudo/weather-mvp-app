// app/lib/weather/hooks.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type CurrentWeatherOptions = {
  lat: number;
  lon: number;
  units?: 'imperial' | 'metric';
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

function apiBase() {
  const base = (process.env.EXPO_PUBLIC_API_BASE || '').trim().replace(/\/+$/, '');
  if (!base) throw new Error('Missing EXPO_PUBLIC_API_BASE');
  return base;
}

export function useCurrentWeather(opts: CurrentWeatherOptions): CurrentWeatherState {
  const lat = opts?.lat;
  const lon = opts?.lon;
  const units = opts?.units ?? 'imperial';

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

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);

        setError(null);

        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          units,
        });

        const url = `${apiBase()}/api/current?${params.toString()}`;
        console.log('[net] current requesting:', url);

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

        setData(json);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        setError(err?.message ?? 'Failed to load current weather');
        setData(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lat, lon, units]
  );

  useEffect(() => {
    load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, error, refreshing, refresh };
}