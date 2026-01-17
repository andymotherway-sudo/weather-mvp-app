// app/lib/climatology/hook.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readClimoCache, writeClimoCache } from './cache';
import { fetchMonthlyTempNormalsF } from './normals';
import { findNearestNormalsStation } from './station';
import type { ClimatologyResult } from './types';
import { ClimoError } from './types';

/**
 * US-only climatology hook (monthly normals).
 * Requires NOAA NCEI CDO token. :contentReference[oaicite:4]{index=4}
 *
 * Add token in one of these ways:
 * - EXPO_PUBLIC_NOAA_NCEI_TOKEN
 * - EXPO_PUBLIC_NOAA_TOKEN
 */
function readToken(): string | undefined {
  return (
    (process.env.EXPO_PUBLIC_NOAA_NCEI_TOKEN as any) ||
    (process.env.EXPO_PUBLIC_NOAA_TOKEN as any) ||
    undefined
  );
}

export function useClimatologyNormals({
  lat,
  lon,
  enabled = true,
  preferCache = true,
}: {
  lat: number;
  lon: number;
  enabled?: boolean;
  preferCache?: boolean;
}) {
  const token = useMemo(() => readToken(), []);
  const [data, setData] = useState<ClimatologyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled) return;

      // cancel any in-flight
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      setError(null);

      try {
        if (preferCache) {
          const cached = await readClimoCache(lat, lon);
          if (cached) {
            setData(cached);
            if (mode === 'initial') setLoading(false);
            else setRefreshing(false);
            // continue to refresh in background? (we’ll keep simple: stop here)
            return;
          }
        }

        const station = await findNearestNormalsStation(lat, lon, token, ac.signal);
        const normals = await fetchMonthlyTempNormalsF(station.id, token, ac.signal);

        const result: ClimatologyResult = {
          station,
          normals,
          source: 'noaa_cdo_normal_mly',
          fetchedAtIso: new Date().toISOString(),
        };

        setData(result);
        await writeClimoCache(lat, lon, result);
      } catch (e: any) {
        const ce = e instanceof ClimoError ? e : null;

        if (ce?.code === 'NO_TOKEN') {
          setError(
            'Climatology needs a NOAA token. Add EXPO_PUBLIC_NOAA_NCEI_TOKEN (NCEI CDO API) to enable monthly normals.'
          );
        } else {
          setError(ce?.message ?? 'Failed to load climatology.');
        }
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [enabled, lat, lon, preferCache, token]
  );

  useEffect(() => {
    load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { data, loading, refreshing, error, refresh, hasToken: !!token };
}
