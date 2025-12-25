// app/lib/buoys/detailHooks.ts
import { useCallback, useEffect, useState } from 'react';
import { fetchAllLatestBuoys, fetchBuoyDetail } from './noaaApi';
import type { BuoyDetailData } from './noaaTypes';

export function useBuoyDetail(stationId: string | undefined) {
  const [data, setData] = useState<BuoyDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
  }, [stationId]);

  const refresh = useCallback(async () => {
    if (!stationId) return;
    try {
      setRefreshing(true);
      const result = await fetchBuoyDetail(stationId);
      setData(result);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to refresh buoy data');
    } finally {
      setRefreshing(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, refreshing, refresh };
}

// 🔹 NEW: hook to get ALL NOAA buoys (bulk feed)
export function useAllBuoyDetails() {
  const [data, setData] = useState<BuoyDetailData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);
        setLoading(true);
        const all = await fetchAllLatestBuoys(); // from noaaApi.ts
        setData(all);
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load buoy feed');
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return { data, loading, error };
}
