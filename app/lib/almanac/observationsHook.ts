// app/lib/almanac/observationsHook.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClimoError } from '../climatology/types';
import { fetchObservedDaysRange, type ObservedDay } from './observations';

const KEY_PREFIX = 'omniwx:obs:v1';
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

function keyFor(stationId: string, start: string, end: string) {
  return `${KEY_PREFIX}:${stationId}:${start}:${end}`;
}

type CachePayload = { savedAt: number; data: ObservedDay[] };

export function useObservedRange({
  stationId,
  startDate,
  endDate,
  enabled = true,
}: {
  stationId?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  enabled?: boolean;
}) {
  const [data, setData] = useState<ObservedDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled || !stationId) return;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      setError(null);

      const k = keyFor(stationId, startDate, endDate);

      try {
        // cache first
        const raw = await AsyncStorage.getItem(k);
        if (raw) {
          const parsed = JSON.parse(raw) as CachePayload;
          if (parsed?.data && typeof parsed.savedAt === 'number') {
            const fresh = Date.now() - parsed.savedAt < TTL_MS;
            if (fresh) {
              setData(parsed.data);
              if (mode === 'initial') setLoading(false);
              else setRefreshing(false);
              return;
            }
          }
        }

        const obs = await fetchObservedDaysRange(stationId, startDate, endDate, ac.signal);
        setData(obs);
        await AsyncStorage.setItem(k, JSON.stringify({ savedAt: Date.now(), data: obs } satisfies CachePayload));
      } catch (e: any) {
        const ce = e instanceof ClimoError ? e : null;
        setError(ce?.message ?? 'Failed to load observed history.');
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [enabled, stationId, startDate, endDate]
  );

  useEffect(() => {
    load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  const byDate = useMemo(() => {
    const m = new Map<string, ObservedDay>();
    for (const d of data ?? []) m.set(d.date, d);
    return m;
  }, [data]);

  return { data, byDate, loading, refreshing, error, refresh };
}