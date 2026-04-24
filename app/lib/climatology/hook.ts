// app/lib/climatology/hook.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';
import { readClimoCache, writeClimoCache } from './cache';
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
  const fixedLastYear = !r.lastYear
    ? r.lastYear
    : {
        ...r.lastYear,
        precipDailyIn: Array.isArray(r.lastYear.precipDailyIn) ? r.lastYear.precipDailyIn : r.lastYear.precipDailyIn,
        precipMonthlyIn: normalizePrecipMonthlyIn(r.lastYear.precipMonthlyIn),
      };
  if (fixed === r.precipMonthlyIn && fixedLastYear === r.lastYear) return r;
  return { ...r, precipMonthlyIn: fixed, lastYear: fixedLastYear };
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

function hasUsableLastYear(lastYear?: ClimatologyResult['lastYear']) {
  if (!lastYear) return false;
  const tmin = Array.isArray(lastYear.tminF) ? lastYear.tminF : [];
  const tmax = Array.isArray(lastYear.tmaxF) ? lastYear.tmaxF : [];
  const validTmin = tmin.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const validTmax = tmax.filter((v) => typeof v === 'number' && Number.isFinite(v)).length;
  const hasTemps = tmin.length >= 365 && tmax.length >= 365 && validTmin >= 300 && validTmax >= 300;
  const hasPrecip = Array.isArray(lastYear.precipMonthlyIn) && lastYear.precipMonthlyIn.length === 12;
  return hasTemps && hasPrecip;
}

async function fetchClimatologyBundle(lat: number, lon: number, signal?: AbortSignal) {
  if (!API_BASE) {
    throw new Error('Missing EXPO_PUBLIC_API_BASE. Set it to your Worker URL and restart Expo.');
  }

  const url = apiUrl(`/api/almanac/climo?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`);
  const res = await fetchWithTimeout(url, 25000, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ClimoError('NETWORK', `Almanac worker failed (${res.status}).`, text);
  }

  const payload = (await res.json()) as ClimatologyResult;
  let result = normalizeClimoResult(payload);

  try {
    const priorUrl = apiUrl(
      `/api/almanac/prior-year?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`
    );
    const priorRes = await fetchWithTimeout(priorUrl, 25000, { signal });
    if (priorRes.ok) {
      const priorPayload = (await priorRes.json()) as { lastYear?: ClimatologyResult['lastYear'] };
      if (priorPayload?.lastYear) {
        result = normalizeClimoResult({ ...result, lastYear: priorPayload.lastYear });
      }
    }
  } catch (priorErr: any) {
    if (isAbortError(priorErr) || signal?.aborted) throw priorErr;
  }

  return result;
}

export async function primeClimatologyCache(lat: number, lon: number) {
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) return null;

  try {
    const cachedRaw = await readClimoCache(lat, lon);
    if (cachedRaw) {
      const cached = normalizeClimoResult(cachedRaw);
      if (hasUsableLastYear(cached.lastYear)) return cached;
    }
  } catch {
    // ignore cache read failures during warmup
  }

  try {
    const result = await fetchClimatologyBundle(lat, lon);
    await writeClimoCache(lat, lon, result);
    return result;
  } catch {
    return null;
  }
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
          });

          if (hasUsableLastYear(cached.lastYear)) {
            safeSet(() => {
              setLoading(false);
              setRefreshing(false);
            });
            return;
          }
        }
      }

      const result = await fetchClimatologyBundle(lat, lon, ac.signal);

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
