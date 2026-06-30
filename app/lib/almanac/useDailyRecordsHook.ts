// app/lib/almanac/useDailyRecordsHook.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { noaaSchedule } from '../noaa/noaaRateLimiter';

import { resolveRecordStation, type RecordStationResolved } from './resolveRecordStation';
import type { AlmanacDailyRecord } from './types';

import {
  makeRecordsCacheKey,
  readRecordsCache,
  writeRecordsCache,
  type RecordsCacheMeta,
} from './recordsCache';

// ---------- Worker base (NCEI token lives in Worker) ----------
const API_BASE_RAW = (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? '';
const API_BASE = API_BASE_RAW.replace(/\/+$/, '');

function apiUrl(path: string) {
  if (!API_BASE) throw new Error('Missing EXPO_PUBLIC_API_BASE. Set it in .env and restart Expo.');
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Cache record windows because NOAA daily history is slow and rate-limited.
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 days

// Worker requests are chunked so the UI can report progress and retry transient failures.
const LIMIT = 1000;

// NOAA can be slow, especially on first load for a station.
const REQ_TIMEOUT_MS = 25_000;

// Backoff handles NOAA rate limits and mobile network drops.
const RETRY_BACKOFF_MS = [300, 800, 1500, 2500, 4000];

// bump when record-building logic changes
const ALGO_VERSION = 'v6-30yr-window-yearly-chunked-worker-proxy';

type RecordsMap = Record<string, AlmanacDailyRecord>;
export type RecordsYears = { from: number; to: number } | null;

export type RecordsProgress =
  | null
  | {
      phase: 'idle' | 'cache' | 'resolve-station' | 'probe' | 'build' | 'saving';
      message?: string;
      pages?: number;
      rows?: number;
      pct?: number; // 0..1 (rough)
      yearFrom?: number;
      yearTo?: number;
      curYear?: number;
    };

function mmddFromIso(isoLike: string) {
  const ymd = String(isoLike).slice(0, 10);
  const d = new Date(`${ymd}T12:00:00`);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function c10ToF(v: number) {
  const c = v / 10;
  return (c * 9) / 5 + 32;
}
function prcp10mmToIn(v: number) {
  const mm = v / 10;
  return mm / 25.4;
}

/** Local YYYY-MM-DD avoids UTC rolling into tomorrow near midnight. */
function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function minYmd(a: string, b: string) {
  return a <= b ? a : b; // ISO ymd sorts lexicographically
}

function maxYmd(a: string, b: string) {
  return a >= b ? a : b;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function buildDataUrl(opts: { stationId: string; start: string; end: string; offset: number }) {
  const { stationId, start, end, offset } = opts;

  // Via Worker proxy
  const u = new URL(apiUrl('/api/ncei/data'));
  u.searchParams.set('datasetid', 'GHCND');
  u.searchParams.append('datatypeid', 'TMAX');
  u.searchParams.append('datatypeid', 'TMIN');
  u.searchParams.append('datatypeid', 'PRCP');
  u.searchParams.set('stationid', stationId);
  u.searchParams.set('startdate', start);
  u.searchParams.set('enddate', end);
  u.searchParams.set('sortfield', 'date');
  u.searchParams.set('sortorder', 'asc');
  u.searchParams.set('limit', String(LIMIT));
  u.searchParams.set('offset', String(offset));

  return u.toString();
}

function yearFromIso(iso?: string | null) {
  if (!iso) return null;
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function initRec(mmdd: string): AlmanacDailyRecord {
  return {
    mmdd,
    recordHighF: null,
    recordHighYears: [],
    recordLowF: null,
    recordLowYears: [],
    recordPrecipIn: null,
    recordPrecipYears: [],
    recordHighMinF: null,
    recordHighMinYears: [],
    recordLowMaxF: null,
    recordLowMaxYears: [],
    recordSnowIn: null,
    recordSnowYears: [],
  };
}

function upsertTieBest(
  curValue: number | null,
  curYears: number[] | undefined,
  nextValue: number,
  nextYear: number,
  dir: 1 | -1
): { value: number; years: number[] } {
  const years = Array.isArray(curYears) ? curYears.slice() : [];

  if (curValue == null || !Number.isFinite(curValue)) return { value: nextValue, years: [nextYear] };

  if (dir === 1) {
    if (nextValue > curValue) return { value: nextValue, years: [nextYear] };
    if (nextValue === curValue) {
      if (!years.includes(nextYear)) years.push(nextYear);
    }
    return { value: curValue, years };
  } else {
    if (nextValue < curValue) return { value: nextValue, years: [nextYear] };
    if (nextValue === curValue) {
      if (!years.includes(nextYear)) years.push(nextYear);
    }
    return { value: curValue, years };
  }
}

function httpErrMsg(status: number, body?: string) {
  const b = (body ?? '').trim();
  if (status === 400) return 'HTTP 400 (bad request)';
  return `HTTP ${status}${b ? `: ${b.slice(0, 180)}` : ''}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeAbortError() {
  const e: any = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

function isAbortError(err: any) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'))
  );
}

function isTransientNetworkError(err: any) {
  const msg = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  return (
    err instanceof TypeError ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('timed out') ||
    msg.includes('timeout')
  );
}

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Request timed out') {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function metaMatches(m: RecordsCacheMeta | undefined | null, want: RecordsCacheMeta) {
  if (!m) return false;
  return (
    m.stationId === want.stationId &&
    m.yearFrom === want.yearFrom &&
    m.yearTo === want.yearTo &&
    m.algoVersion === want.algoVersion
  );
}

function errStatusFromMessage(msg?: string | null): number | null {
  if (!msg) return null;
  const m = String(msg).match(/HTTP\s+(\d{3})/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseRetryAfterSeconds(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const s = retryAfter.trim();

  const n = Number(s);
  if (Number.isFinite(n) && n >= 0) return Math.min(30, n);

  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;

  const deltaSec = Math.ceil((ms - Date.now()) / 1000);
  if (!Number.isFinite(deltaSec)) return null;
  return Math.max(0, Math.min(30, deltaSec));
}

export function useDailyRecords({
  lat,
  lon,
  enabled = true,
}: {
  lat: number;
  lon: number;
  enabled?: boolean;
}) {
  const [records, setRecords] = useState<RecordsMap | null>(null);
  const [stationIdUsed, setStationIdUsed] = useState<string | null>(null);
  const [stationNameUsed, setStationNameUsed] = useState<string | null>(null);
  const [years, setYears] = useState<RecordsYears>(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RecordsProgress>(null);

  const abortRef = useRef<AbortController | null>(null);
  const haveRecordsRef = useRef(false);
  const runIdRef = useRef(0);

  const dbgRef = useRef({ pages: 0, totalRows: 0 });

  const locKey = useMemo(() => `${lat.toFixed(5)},${lon.toFixed(5)}`, [lat, lon]);

  useEffect(() => {
    abortRef.current?.abort();
    haveRecordsRef.current = false;
    setRecords(null);
    setStationIdUsed(null);
    setStationNameUsed(null);
    setYears(null);
    setError(null);
    setProgress(null);
    setLoading(false);
    setRefreshing(false);
  }, [locKey]);

  const fetchJson = useCallback(async (url: string, ac: AbortController) => {
    if (ac.signal.aborted) throw makeAbortError();

    return await noaaSchedule(async () => {
      if (ac.signal.aborted) throw makeAbortError();

      const res = await withTimeout(fetch(url, { signal: ac.signal }), REQ_TIMEOUT_MS, 'NOAA request timed out');

      if (ac.signal.aborted) throw makeAbortError();

      if (!res.ok) {
        let body = '';
        try {
          body = await res.text();
        } catch {}

        const retryAfterSec =
          res.status === 429 ? parseRetryAfterSeconds(res.headers?.get?.('retry-after') ?? null) : null;

        const err: any = new Error(httpErrMsg(res.status, body));
        err.status = res.status;
        err.body = body;
        err.retryAfterSec = retryAfterSec;
        throw err;
      }

      const json = await res.json();
      return json;
    });
  }, []);

  const fetchJsonWithRetry = useCallback(
    async (url: string, ac: AbortController) => {
      let lastErr: any = null;

      for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
        if (ac.signal.aborted) throw makeAbortError();

        try {
          return await fetchJson(url, ac);
        } catch (e: any) {
          if (isAbortError(e) || ac.signal.aborted) throw makeAbortError();
          lastErr = e;

          const status = typeof e?.status === 'number' ? e.status : errStatusFromMessage(e?.message);
          const is429 = status === 429;
          const is5xx = typeof status === 'number' && status >= 500 && status <= 599;

          const canRetry =
            is429 ||
            is5xx ||
            isTransientNetworkError(e) ||
            (typeof e?.message === 'string' && e.message.toLowerCase().includes('timed out'));

          if (!canRetry || attempt === RETRY_BACKOFF_MS.length) break;

          const ra = e?.retryAfterSec;
          const baseDelay = RETRY_BACKOFF_MS[attempt] ?? 1500;
          const backoff429 = [2000, 4000, 8000, 12000, 16000][attempt] ?? 16000;

          const delay =
            is429
              ? (typeof ra === 'number' && Number.isFinite(ra) ? Math.max(1000, ra * 1000) : backoff429)
              : baseDelay;

          await sleep(delay);
        }
      }

      throw lastErr ?? new Error('Failed to load records');
    },
    [fetchJson]
  );

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      if (!API_BASE) {
        setError('Missing EXPO_PUBLIC_API_BASE. Set it to your Worker URL and restart Expo.');
        return;
      }

      const myRunId = ++runIdRef.current;
      dbgRef.current.pages = 0;
      dbgRef.current.totalRows = 0;

      setError(null);
      setProgress({ phase: 'resolve-station', message: 'Finding nearby record station…' });

      setLoading(!force && !haveRecordsRef.current);
      setRefreshing(!!force);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const safeSet = (fn: () => void) => {
        if (runIdRef.current !== myRunId) return;
        if (ac.signal.aborted) return;
        fn();
      };

      try {
        // --- station resolve (via Worker) ---
        const resolved: RecordStationResolved = await resolveRecordStation(lat, lon, ac.signal);
        const stationId = resolved.id;
        const stationName = resolved.name ?? null;

        safeSet(() => {
          setStationIdUsed(stationId);
          setStationNameUsed(stationName);
        });

        const minYResolved = yearFromIso(resolved.mindate) ?? 1950;

        const stationMaxY = yearFromIso(resolved.maxdate) ?? new Date().getFullYear();
        const stationMaxIso = resolved.maxdate ?? localYmd();

        const today = new Date();
        const todayY = today.getFullYear();
        const todayIso = localYmd(today);

        const yearTo = Math.min(todayY, stationMaxY);
        let yearFrom = Math.max(minYResolved, yearTo - 29);
        if (yearFrom > yearTo) yearFrom = yearTo;

        safeSet(() => setYears({ from: yearFrom, to: yearTo }));

        const wantMeta: RecordsCacheMeta = {
          stationId,
          stationName,
          yearFrom,
          yearTo,
          algoVersion: ALGO_VERSION,
        };

        const cacheKey = makeRecordsCacheKey({
          stationId,
          yearFrom,
          yearTo,
          algoVersion: ALGO_VERSION,
        });

        // --- cache ---
        if (!force) {
          safeSet(() => setProgress({ phase: 'cache', message: 'Checking cache…', yearFrom, yearTo }));
          const cached = await readRecordsCache<RecordsMap>(cacheKey);

          const keys = Object.keys(cached?.data ?? {}).length;
          if (cached && metaMatches(cached.meta, wantMeta) && keys > 0) {
            safeSet(() => {
              setRecords(cached.data);
              haveRecordsRef.current = true;
              setLoading(false);
              setRefreshing(false);
              setProgress(null);
            });
            return;
          }
        }

        const endOverallIso = minYmd(stationMaxIso, todayIso);

        if (force) {
          const cachedForRefresh = await readRecordsCache<RecordsMap>(cacheKey);
          const cachedRefreshKeys = Object.keys(cachedForRefresh?.data ?? {}).length;

          if (cachedForRefresh && metaMatches(cachedForRefresh.meta, wantMeta) && cachedRefreshKeys > 0) {
            const map: RecordsMap = JSON.parse(JSON.stringify(cachedForRefresh.data ?? {}));
            const savedIso = localYmd(new Date(cachedForRefresh.savedAt));
            const incrementalStart = maxYmd(`${yearTo}-01-01`, savedIso);
            const incrementalEnd = endOverallIso.startsWith(`${yearTo}-`) ? endOverallIso : `${yearTo}-12-31`;

            if (incrementalStart <= incrementalEnd) {
              safeSet(() =>
                setProgress({
                  phase: 'build',
                  message: `Refreshing NOAA records since ${incrementalStart}...`,
                  pages: 0,
                  rows: 0,
                  pct: 0,
                  yearFrom,
                  yearTo,
                  curYear: yearTo,
                })
              );

              let offset = 1;
              while (true) {
                if (ac.signal.aborted) throw makeAbortError();

                const url = buildDataUrl({ stationId, start: incrementalStart, end: incrementalEnd, offset });
                const json = await fetchJsonWithRetry(url, ac);
                const results: any[] = json?.results ?? [];

                dbgRef.current.pages += 1;
                dbgRef.current.totalRows += results.length;
                applyRecordRows(map, results, yearFrom, yearTo);

                safeSet(() =>
                  setProgress({
                    phase: 'build',
                    message: `Refreshing records... ${dbgRef.current.pages} pages / ${dbgRef.current.totalRows} rows`,
                    pages: dbgRef.current.pages,
                    rows: dbgRef.current.totalRows,
                    pct: results.length < LIMIT ? 1 : 0.5,
                    yearFrom,
                    yearTo,
                    curYear: yearTo,
                  })
                );

                if (!results.length || results.length < LIMIT) break;
                offset += LIMIT;
              }

            } else {
              safeSet(() =>
                setProgress({
                  phase: 'saving',
                  message: 'Records are already current.',
                  yearFrom,
                  yearTo,
                })
              );
            }

            safeSet(() => {
              setRecords(map);
              haveRecordsRef.current = true;
            });

            await writeRecordsCache(cacheKey, wantMeta, map, CACHE_TTL_MS);
            safeSet(() => setProgress(null));
            return;
          }
        }

        safeSet(() =>
          setProgress({
            phase: 'probe',
            message: 'Validating station data…',
            yearFrom,
            yearTo,
          })
        );

        // --- probe: just hit the latest year (1 page) ---
        const probeStart = `${yearTo}-01-01`;
        const probeEnd = endOverallIso.startsWith(`${yearTo}-`) ? endOverallIso : `${yearTo}-12-31`;
        const probeUrl = buildDataUrl({ stationId, start: probeStart, end: probeEnd, offset: 1 });
        const probeJson = await fetchJsonWithRetry(probeUrl, ac);

        const probeTotal = Number(probeJson?.metadata?.resultset?.count ?? 0);
        const probeResults: any[] = probeJson?.results ?? [];

        if (!probeResults.length && (!Number.isFinite(probeTotal) || probeTotal <= 0)) {
          throw new Error('No NOAA daily data found for this station (probe returned empty).');
        }

        // --- build ---
        const map: RecordsMap = {};

        safeSet(() =>
          setProgress({
            phase: 'build',
            message: `Building records… 0 pages`,
            pages: 0,
            rows: 0,
            pct: 0,
            yearFrom,
            yearTo,
            curYear: yearFrom,
          })
        );

        const totalYears = Math.max(1, yearTo - yearFrom + 1);

        for (let y = yearFrom; y <= yearTo; y++) {
          if (ac.signal.aborted) throw makeAbortError();

          const start = `${y}-01-01`;
          const end = y === yearTo && endOverallIso.startsWith(`${y}-`) ? endOverallIso : `${y}-12-31`;

          let offset = 1;
          let yearRows = 0;

          while (true) {
            if (ac.signal.aborted) throw makeAbortError();

            const url = buildDataUrl({ stationId, start, end, offset });

            const json =
              y === yearTo && offset === 1 && start === probeStart && end === probeEnd
                ? probeJson
                : await fetchJsonWithRetry(url, ac);

            const results: any[] = json?.results ?? [];

            dbgRef.current.pages += 1;
            dbgRef.current.totalRows += results.length;

            yearRows += results.length;

            const yearIdx = y - yearFrom; // 0-based
            const pct = clamp((yearIdx + 0.15) / totalYears, 0, 1);

            safeSet(() =>
              setProgress({
                phase: 'build',
                message: `Building records… ${dbgRef.current.pages} pages • ${dbgRef.current.totalRows} rows • year ${y}`,
                pages: dbgRef.current.pages,
                rows: dbgRef.current.totalRows,
                pct,
                yearFrom,
                yearTo,
                curYear: y,
              })
            );

            if (!results.length) break;

            for (const r of results) {
              const year = Number(String(r?.date ?? '').slice(0, 4));
              if (!Number.isFinite(year)) continue;
              if (year < yearFrom || year > yearTo) continue;

              const mmdd = mmddFromIso(r.date);
              const raw = Number(r.value);

              if (!map[mmdd]) map[mmdd] = initRec(mmdd);
              const rec = map[mmdd];

              if (r.datatype === 'TMAX' && Number.isFinite(raw)) {
                const f = c10ToF(raw);

                const hi = upsertTieBest(rec.recordHighF, rec.recordHighYears, f, year, 1);
                rec.recordHighF = hi.value;
                rec.recordHighYears = hi.years;

                const lowMax = upsertTieBest(rec.recordLowMaxF ?? null, rec.recordLowMaxYears, f, year, -1);
                rec.recordLowMaxF = lowMax.value;
                rec.recordLowMaxYears = lowMax.years;
              }

              if (r.datatype === 'TMIN' && Number.isFinite(raw)) {
                const f = c10ToF(raw);

                const lo = upsertTieBest(rec.recordLowF, rec.recordLowYears, f, year, -1);
                rec.recordLowF = lo.value;
                rec.recordLowYears = lo.years;

                const hiMin = upsertTieBest(rec.recordHighMinF ?? null, rec.recordHighMinYears, f, year, 1);
                rec.recordHighMinF = hiMin.value;
                rec.recordHighMinYears = hiMin.years;
              }

              if (r.datatype === 'PRCP' && Number.isFinite(raw)) {
                const inches = prcp10mmToIn(raw);
                const pr = upsertTieBest(rec.recordPrecipIn ?? null, rec.recordPrecipYears, inches, year, 1);
                rec.recordPrecipIn = pr.value;
                rec.recordPrecipYears = pr.years;
              }
            }

            if (results.length < LIMIT) break;
            offset += LIMIT;

            if (dbgRef.current.pages % 3 === 0) await sleep(0);
          }

        }

        if (Object.keys(map).length === 0) {
          throw new Error('NOAA records returned 0 usable rows for the last 30 years.');
        }

        // --- save ---
        safeSet(() => setProgress({ phase: 'saving', message: 'Saving records…', yearFrom, yearTo }));

        safeSet(() => {
          setRecords(map);
          haveRecordsRef.current = true;
        });

        await writeRecordsCache(cacheKey, wantMeta, map, CACHE_TTL_MS);

        safeSet(() => setProgress(null));
      } catch (e: any) {
        if (!isAbortError(e)) {
          safeSet(() => setError(e?.message ?? 'Failed to load records'));
        }
      } finally {
        if (runIdRef.current === myRunId) {
          safeSet(() => {
            setLoading(false);
            setRefreshing(false);
          });
        }
      }
    },
    [enabled, lat, lon, fetchJsonWithRetry]
  );

  useEffect(() => {
    load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);

  return { records, stationIdUsed, stationNameUsed, years, loading, refreshing, error, refresh, progress };
}

function applyRecordRows(map: RecordsMap, rows: any[], yearFrom: number, yearTo: number) {
  for (const r of rows) {
    const year = Number(String(r?.date ?? '').slice(0, 4));
    if (!Number.isFinite(year)) continue;
    if (year < yearFrom || year > yearTo) continue;

    const mmdd = mmddFromIso(r.date);
    const raw = Number(r.value);

    if (!map[mmdd]) map[mmdd] = initRec(mmdd);
    const rec = map[mmdd];

    if (r.datatype === 'TMAX' && Number.isFinite(raw)) {
      const f = c10ToF(raw);

      const hi = upsertTieBest(rec.recordHighF, rec.recordHighYears, f, year, 1);
      rec.recordHighF = hi.value;
      rec.recordHighYears = hi.years;

      const lowMax = upsertTieBest(rec.recordLowMaxF ?? null, rec.recordLowMaxYears, f, year, -1);
      rec.recordLowMaxF = lowMax.value;
      rec.recordLowMaxYears = lowMax.years;
    }

    if (r.datatype === 'TMIN' && Number.isFinite(raw)) {
      const f = c10ToF(raw);

      const lo = upsertTieBest(rec.recordLowF, rec.recordLowYears, f, year, -1);
      rec.recordLowF = lo.value;
      rec.recordLowYears = lo.years;

      const hiMin = upsertTieBest(rec.recordHighMinF ?? null, rec.recordHighMinYears, f, year, 1);
      rec.recordHighMinF = hiMin.value;
      rec.recordHighMinYears = hiMin.years;
    }

    if (r.datatype === 'PRCP' && Number.isFinite(raw)) {
      const inches = prcp10mmToIn(raw);
      const pr = upsertTieBest(rec.recordPrecipIn ?? null, rec.recordPrecipYears, inches, year, 1);
      rec.recordPrecipIn = pr.value;
      rec.recordPrecipYears = pr.years;
    }
  }
}
