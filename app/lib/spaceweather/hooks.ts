// app/lib/spaceweather/hooks.ts

import { useCallback, useEffect, useState } from 'react';
import { fetchMarsInsightWeather, fetchSpaceWeatherSummary } from './api';
import type { MarsInsightWeather, SpaceWeatherSummary } from './types';

export function useSpaceWeatherSummary(enabled = true) {
  const [data, setData] = useState<SpaceWeatherSummary | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const result = await fetchSpaceWeatherSummary();
      setData(result);
    } catch (err: any) {
      console.error('Error loading solar data', err);
      setError(err?.message ?? 'Error loading solar data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setRefreshing(true);
    load();
  }, [enabled, load]);

  useEffect(() => {
    load();
  }, [load]);

  return {
    data,
    loading,
    error,
    refreshing,
    refresh,
  };
}

export function useMarsInsightWeather(enabled = true) {
  const [data, setData] = useState<MarsInsightWeather | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);
      const result = await fetchMarsInsightWeather();
      setData(result);
    } catch (err: any) {
      setError(err?.message ?? 'Error loading Mars weather');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setRefreshing(true);
    load();
  }, [enabled, load]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refreshing, refresh };
}
