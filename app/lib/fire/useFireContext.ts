import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type FireContext = {
  ok: true;
  lat: number;
  lon: number;
  fetchedAtIso: string;
  forest: {
    name: string | null;
    region: string | null;
    slug: string | null;
  } | null;
  fireDanger: {
    classValue: number | null;
    classLabel: string | null;
    summary: string | null;
    source: string;
  };
  fireWeather: {
    redFlagWarning: boolean;
    fireWeatherWatch: boolean;
    alertCount: number;
    headlines: string[];
    summary: string | null;
    source: string;
  };
  restrictions: {
    supported: boolean;
    inEffect: boolean | null;
    summary: string | null;
    source: string | null;
    cards?: Array<{
      title: string;
      url: string | null;
      body: string | null;
      startDate: string | null;
      forestOrder: string | null;
    }>;
  };
};

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function useFireContext({
  lat,
  lon,
  enabled = true,
}: {
  lat: number;
  lon: number;
  enabled?: boolean;
}) {
  const [data, setData] = useState<FireContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!enabled || !isFiniteNum(lat) || !isFiniteNum(lon)) {
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

        const url = apiUrl(`/api/fire/context?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`);
        const res = await fetchWithTimeout(url, 15000, { signal: ac.signal });
        const text = await res.text().catch(() => '');

        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        const json = text ? (JSON.parse(text) as FireContext) : null;
        if (!ac.signal.aborted) setData(json);
      } catch (err: any) {
        if (ac.signal.aborted) return;
        setError(err?.message ?? 'Failed to load fire context.');
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [enabled, lat, lon]
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
