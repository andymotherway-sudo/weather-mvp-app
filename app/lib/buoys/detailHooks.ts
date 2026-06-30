// app/lib/buoys/detailHooks.ts
import { useCallback, useEffect, useState } from 'react';
import { fetchAllLatestBuoys, fetchBuoyDetail } from './noaaApi';
import type { BuoyDetailData } from './noaaTypes';

export function useBuoyDetail(stationId: string | undefined, enabled = true) {
  const [data, setData] = useState<BuoyDetailData | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (!stationId) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const result = await fetchBuoyDetail(stationId);
      if (!result) {
        setError('No data found for this buoy');
        setData(null);
      } else {
        setData(result);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load buoy data');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, stationId]);

  const refresh = useCallback(async () => {
    if (!enabled || !stationId) return;
    try {
      setRefreshing(true);
      const result = await fetchBuoyDetail(stationId);
      setData(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to refresh buoy data');
    } finally {
      setRefreshing(false);
    }
  }, [enabled, stationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refreshing, refresh };
}

// Bulk NOAA buoy hook used by map layers and marine extremes.
export function useAllBuoyDetails(enabled = true) {
  const [data, setData] = useState<BuoyDetailData[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        setError(null);
        setLoading(true);
        const all = await fetchAllLatestBuoys(); // from noaaApi.ts
        if (cancelled) return;
        setData(all);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? 'Failed to load buoy feed');
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data, loading, error };
}
