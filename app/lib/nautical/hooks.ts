// app/lib/nautical/hooks.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNauticalSummary } from './api';
import type { NauticalStation } from './stations';
import { DEFAULT_NAUTICAL_STATION } from './stations';
import type { NauticalSummary } from './types';

type UseNauticalSummaryResult = {
  data: NauticalSummary | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
};

/**
 * Hook to load nautical summary (tides + marine conditions)
 * for a given station. If no station is provided, falls back
 * to DEFAULT_NAUTICAL_STATION.
 */
export function useNauticalSummary(
  station: NauticalStation = DEFAULT_NAUTICAL_STATION,
  enabled = true,
): UseNauticalSummaryResult {
  const [data, setData] = useState<NauticalSummary | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    if (!enabled) {
      requestIdRef.current += 1;
      setData(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    try {
      setError(null);
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setData(null);
        setLoading(true);
      }

      const result = await fetchNauticalSummary(station);
      if (requestId === requestIdRef.current) setData(result);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(
        err instanceof Error ? err.message : 'Error loading nautical data',
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [enabled, station]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    void load(true);
  }, [enabled, load]);

  useEffect(() => {
    void load(false);
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
  };
}
