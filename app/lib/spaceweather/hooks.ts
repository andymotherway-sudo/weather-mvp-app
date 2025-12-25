// app/lib/spaceweather/hooks.ts

import { useCallback, useEffect, useState } from 'react';
import { fetchSpaceWeatherSummary } from './api';
import type { SpaceWeatherSummary } from './types';

export function useSpaceWeatherSummary() {
  const [data, setData] = useState<SpaceWeatherSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

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
