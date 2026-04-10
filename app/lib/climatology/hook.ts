// app/lib/climatology/hook.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readClimoCache, writeClimoCache } from './cache';
import { nceiStations } from './ncei';
import { fetchMonthlyPrecipNormalsIn, fetchMonthlyTempNormalsF } from './normals';
import { findNearestNormalsStation } from './station';
import type { ClimatologyResult } from './types';
import { ClimoError } from './types';

/**
 * US-only climatology hook (monthly normals).
 * Worker-proxied: does NOT require NOAA token in the app.
 * Requires EXPO_PUBLIC_API_BASE to be set to your Worker base URL.
 */
const API_BASE_RAW = (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? '';
const API_BASE = API_BASE_RAW.replace(/\/+$/, '');

function isAbortError(err: any) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'))
  );
}

const DEBUG_CLIMO_PHASE:
  | 'cache'
  | 'station'
  | 'temp'
  | 'precip'
  | 'full' = 'cache';
  
function isFiniteCoord(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function hasUsableNormals(d: ClimatologyResult | null) {
  return !!d && Array.isArray(d.normals) && d.normals.length > 0;
}

function normalizePrecipMonthlyIn(arr?: Array<number | null>) {
  if (!Array.isArray(arr) || arr.length !== 12) return arr;

  const vals = arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return arr;

  const max = Math.max(...vals);
  const intLikeCount = vals.filter((v) => Math.abs(v - Math.round(v)) < 1e-6).length;

  const looksLikeTenths = max >= 18 && intLikeCount >= Math.max(1, Math.floor(vals.length * 0.25));
  if (!looksLikeTenths) return arr;

  return arr.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v / 10 : v));
}

function normalizeClimoResult(r: ClimatologyResult): ClimatologyResult {
  const fixed = normalizePrecipMonthlyIn(r.precipMonthlyIn);
  if (fixed === r.precipMonthlyIn) return r;
  return { ...r, precipMonthlyIn: fixed };
}

function precipArraysEqual(a?: Array<number | null>, b?: Array<number | null>) {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const av = a[i];
    const bv = b[i];
    if (av == null && bv == null) continue;
    if (typeof av !== 'number' || typeof bv !== 'number') return false;
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return false;
    if (Math.abs(av - bv) > 1e-6) return false;
  }
  return true;
}

export function useClimatologyNormals({
  lat,
  lon,
  enabled = true,
  preferCache = true,
}: {
  lat: number | null;
  lon: number | null;
  enabled?: boolean;
  preferCache?: boolean;
}) {
  const [data, setData] = useState<ClimatologyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const warmedRef = useRef(false);

  const hasValidCoords = isFiniteCoord(lat) && isFiniteCoord(lon);

  const locKey = useMemo(() => {
    if (!hasValidCoords) return 'invalid';
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
  }, [hasValidCoords, lat, lon]);

  useEffect(() => {
    abortRef.current?.abort();
    setData(null);
    setError(null);
    setLoading(false);
    setRefreshing(false);
  }, [locKey]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled || !hasValidCoords) return;

      if (!API_BASE) {
        setError('Missing EXPO_PUBLIC_API_BASE. Set it to your Worker URL and restart Expo.');
        return;
      }

      const myRunId = ++runIdRef.current;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const safeSet = (fn: () => void) => {
        if (runIdRef.current !== myRunId) return;
        if (ac.signal.aborted) return;
        try {
          fn();
        } catch {
          // never let state transitions throw into render timing
        }
      };

      safeSet(() => {
        if (mode === 'initial') setLoading(true);
        else setRefreshing(true);
        setError(null);
      });

   try {
  // 1) Cache first
  if (preferCache) {
    let cachedRaw: ClimatologyResult | null = null;
    try {
      cachedRaw = await readClimoCache(lat, lon);
    } catch {
      cachedRaw = null;
    }

    if (cachedRaw) {
      let cached = cachedRaw;
      try {
        cached = normalizeClimoResult(cachedRaw);
      } catch {}

      safeSet(() => {
        setData(cached);
        setError(null);
        setLoading(false);
        setRefreshing(false);
      });
      return;
    }
  }

  if (DEBUG_CLIMO_PHASE === 'full') {
    safeSet(() => {
      setData({
        station: {
          id: 'CACHE_TEST',
          name: 'Cache Phase',
          latitude: lat,
          longitude: lon,
        } as any,
        normals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          tavgF: null,
          tminF: null,
          tmaxF: null,
        })),
        precipMonthlyIn: undefined,
        source: 'noaa_cdo_normal_mly',
        fetchedAtIso: new Date().toISOString(),
      });
      setError(null);
    });
    return;
  }

  // 2) Warmup
  if (!warmedRef.current) {
    warmedRef.current = true;
    try {
      await nceiStations({ limit: 1 }, undefined, ac.signal);
    } catch (e: any) {
      if (isAbortError(e) || ac.signal.aborted) throw e;
    }
  }

  // 3) Station lookup
  const station = await findNearestNormalsStation(lat, lon, undefined as any, ac.signal);

  if (DEBUG_CLIMO_PHASE === 'station') {
    safeSet(() => {
      setData({
        station,
        normals: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          tavgF: null,
          tminF: null,
          tmaxF: null,
        })),
        precipMonthlyIn: undefined,
        source: 'noaa_cdo_normal_mly',
        fetchedAtIso: new Date().toISOString(),
      });
      setError(null);
    });
    return;
  }

  // 4) Temp normals
  const normals = await fetchMonthlyTempNormalsF(station.id, undefined as any, ac.signal);

  if (!Array.isArray(normals) || normals.length === 0) {
    throw new ClimoError('NO_NORMALS', 'No monthly normals returned by NOAA for this station.');
  }

  if (DEBUG_CLIMO_PHASE === 'temp') {
    safeSet(() => {
      setData({
        station,
        normals,
        precipMonthlyIn: undefined,
        source: 'noaa_cdo_normal_mly',
        fetchedAtIso: new Date().toISOString(),
      });
      setError(null);
    });
    return;
  }

  // 5) Precip normals
  let precipMonthlyIn: Array<number | null> | undefined = undefined;
  try {
    precipMonthlyIn = await fetchMonthlyPrecipNormalsIn(station.id, undefined as any, ac.signal);
  } catch {
    precipMonthlyIn = undefined;
  }

  if (DEBUG_CLIMO_PHASE === 'precip') {
    safeSet(() => {
      setData({
        station,
        normals,
        precipMonthlyIn,
        source: 'noaa_cdo_normal_mly',
        fetchedAtIso: new Date().toISOString(),
      });
      setError(null);
    });
    return;
  }

  const resultRaw: ClimatologyResult = {
    station,
    normals,
    precipMonthlyIn,
    source: 'noaa_cdo_normal_mly',
    fetchedAtIso: new Date().toISOString(),
  };

  const result = normalizeClimoResult(resultRaw);

  safeSet(() => {
    setData(result);
    setError(null);
  });

  try {
    await writeClimoCache(lat, lon, result);
  } catch {}
} catch (e: any) {
  if (isAbortError(e) || ac.signal.aborted) return;

  const ce = e instanceof ClimoError ? e : null;

  safeSet(() => {
    if (hasUsableNormals(data)) {
      setError(null);
      return;
    }
    setError(ce?.message ?? 'Failed to load climatology.');
  });
}
      
      finally {
        safeSet(() => {
          if (mode === 'initial') setLoading(false);
          else setRefreshing(false);
        });
      }
    },
    [enabled, hasValidCoords, lat, lon, preferCache, data]
  );

  useEffect(() => {
    if (!enabled || !hasValidCoords) return;
    load('initial');
    return () => abortRef.current?.abort();
  }, [enabled, hasValidCoords, load]);

  const refresh = useCallback(() => {
    if (!enabled || !hasValidCoords) return Promise.resolve();
    return load('refresh');
  }, [enabled, hasValidCoords, load]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    hasToken: !!API_BASE,
  };
}