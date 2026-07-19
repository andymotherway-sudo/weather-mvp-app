import { useCallback, useEffect, useRef, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';
import { type ForecastData, normalizeForecastPayload } from '../openmeteo/hooks';

type CurrentLike = any;

type HomeSummaryBundleData = {
  current: CurrentLike | null;
  forecast: ForecastData | null;
};

type HomeSummaryBundleState = {
  data: HomeSummaryBundleData | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function useHomeSummaryBundle(args: {
  lat: number;
  lon: number;
  days: number;
  model?: 'best_match' | 'gfs' | 'ecmwf' | 'dwd_icon';
  enabled?: boolean;
}): HomeSummaryBundleState {
  const { lat, lon, days, model = 'best_match', enabled = true } = args;

  const [data, setData] = useState<HomeSummaryBundleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!enabled || !isFiniteNum(lat) || !isFiniteNum(lon)) {
        abortRef.current?.abort();
        setData(null);
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

        const params = new URLSearchParams({
          lat: String(lat),
          lon: String(lon),
          units: 'imperial',
          days: String(days),
          model,
        });
        const res = await fetchWithTimeout(apiUrl(`/api/home/summary?${params.toString()}`), 15000, { signal: ac.signal });
        const text = await res.text().catch(() => '');

        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        const json = text ? JSON.parse(text) : null;
        const forecast = json?.forecast ? normalizeForecastPayload(json.forecast, json?.airQuality?.hourly) : null;
        const current = json?.current ?? null;

        if (!ac.signal.aborted) {
          setData({
            current,
            forecast,
          });
        }
      } catch (err: any) {
        if (ac.signal.aborted) return;
        setError(err?.message ?? 'Failed to load home summary.');
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [days, enabled, lat, lon, model]
  );

  useEffect(() => {
    load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
  };
}
