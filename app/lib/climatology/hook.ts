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
 * Requires NOAA NCEI CDO token.
 */
function readToken(): string | undefined {
  return (
    (process.env.EXPO_PUBLIC_NOAA_NCEI_TOKEN as any) ||
    (process.env.EXPO_PUBLIC_NOAA_TOKEN as any) ||
    undefined
  );
}

function isAbortError(err: any) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'))
  );
}

function hasUsableNormals(d: ClimatologyResult | null) {
  return !!d && Array.isArray(d.normals) && d.normals.length > 0;
}

/**
 * Robust precip normalization:
 * - If cached values were stored in "tenths of inches" (e.g., 21 meaning 2.1"),
 *   detect + normalize to inches.
 * - Avoid breaking legit wet climates: only normalize when the array "looks like tenths"
 *   (high max + many integer-ish entries).
 */
function normalizePrecipMonthlyIn(arr?: Array<number | null>) {
  if (!Array.isArray(arr) || arr.length !== 12) return arr;

  const vals = arr.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (vals.length === 0) return arr;

  const max = Math.max(...vals);
  const intLikeCount = vals.filter((v) => Math.abs(v - Math.round(v)) < 1e-6).length;

  // Heuristic: "tenths" arrays often contain many integers (7, 21, 13, ...)
  // and show unusually large max values.
  // Example bad cached: [1.52, 1.32, 1.41, 0.48, 21, 7, 1.18, ...]
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
  const runIdRef = useRef(0);

  // one-time warmup per session (helps Android cold-start flakiness)
  const warmedRef = useRef(false);

  // IMPORTANT: clear stale state synchronously when coords change
  const locKey = useMemo(() => `${lat.toFixed(4)},${lon.toFixed(4)}`, [lat, lon]);
  useEffect(() => {
    abortRef.current?.abort();
    setData(null);
    setError(null);
    setLoading(false);
    setRefreshing(false);
    // do NOT reset warmedRef; keep it warm for the session
  }, [locKey]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled) return;

      const myRunId = ++runIdRef.current;

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const safeSet = (fn: () => void) => {
        if (runIdRef.current !== myRunId) return;
        if (ac.signal.aborted) return;
        fn();
      };

      safeSet(() => {
        if (mode === 'initial') setLoading(true);
        else setRefreshing(true);
        setError(null); // clear old error for a new attempt
      });

      try {
        // 1) Cache first (with self-healing migration)
        if (preferCache) {
          const cachedRaw = await readClimoCache(lat, lon);
          if (cachedRaw) {
            const cached = normalizeClimoResult(cachedRaw);

            // If we normalized, rewrite cache best-effort so we don't keep returning bad values.
            if (!precipArraysEqual(cachedRaw.precipMonthlyIn, cached.precipMonthlyIn)) {
              writeClimoCache(lat, lon, cached).catch(() => {});
            }

            safeSet(() => {
              setData(cached);
              setError(null);
              setLoading(false);
              setRefreshing(false);
            });
            return; // ✅ safe early return (we already cleared flags)
          }
        }

        // 2) Token required
        if (!token) throw new ClimoError('NO_TOKEN', 'NOAA token is required for normals fetch.');

        // 3) Warmup: touch the same NOAA host once
        if (!warmedRef.current) {
          warmedRef.current = true;
          try {
            await nceiStations({ limit: 1 }, token, ac.signal);
          } catch (e: any) {
            if (isAbortError(e) || ac.signal.aborted) throw e;
            // ignore warmup failures; main request may still succeed
          }
        }

        // 4) Fetch station + normals
        const station = await findNearestNormalsStation(lat, lon, token, ac.signal);
        const normals = await fetchMonthlyTempNormalsF(station.id, token, ac.signal);

        // Precip normals (inches) - optional
        let precipMonthlyIn: Array<number | null> | undefined = undefined;
        try {
          precipMonthlyIn = await fetchMonthlyPrecipNormalsIn(station.id, token, ac.signal);
        } catch {
          // soft-fail: precip is optional
        }

        if (!Array.isArray(normals) || normals.length === 0) {
          throw new ClimoError('NO_NORMALS', 'No monthly normals returned by NOAA for this station.');
        }

        const resultRaw: ClimatologyResult = {
          station,
          normals,
          precipMonthlyIn,
          source: 'noaa_cdo_normal_mly',
          fetchedAtIso: new Date().toISOString(),
        };

        // Normalize before setting + caching (guards against scale issues)
        const result = normalizeClimoResult(resultRaw);

        safeSet(() => {
          setData(result);
          setError(null);
        });

        await writeClimoCache(lat, lon, result);
      } catch (e: any) {
        if (isAbortError(e) || ac.signal.aborted) return;

        const ce = e instanceof ClimoError ? e : null;

        safeSet(() => {
          // ✅ Soft-fail behavior:
          // If we already have usable normals on screen, DO NOT show the big error.
          if (hasUsableNormals(data)) {
            setError(null);
            return;
          }

          if (ce?.code === 'NO_TOKEN') {
            setError(
              'Climatology needs a NOAA token. Add EXPO_PUBLIC_NOAA_NCEI_TOKEN (NCEI CDO API) to enable monthly normals.'
            );
          } else {
            setError(ce?.message ?? 'Failed to load climatology.');
          }
        });
      } finally {
        safeSet(() => {
          if (mode === 'initial') setLoading(false);
          else setRefreshing(false);
        });
      }
    },
    [enabled, lat, lon, preferCache, token, data]
  );

  useEffect(() => {
    load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { data, loading, refreshing, error, refresh, hasToken: !!token };
}