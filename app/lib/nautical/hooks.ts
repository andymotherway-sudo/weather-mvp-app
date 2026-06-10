// app/lib/nautical/hooks.ts

import { useCallback, useEffect, useState } from 'react';
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

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const result = await fetchNauticalSummary(station);
      setData(result);
    } catch (err) {
      console.error('Error loading nautical data', err);
      setError(
        err instanceof Error ? err.message : 'Error loading nautical data',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled, station]);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setRefreshing(true);
    void load();
  }, [enabled, load]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
  };
}
