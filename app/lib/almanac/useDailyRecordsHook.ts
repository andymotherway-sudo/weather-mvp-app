// app/lib/almanac/useDailyRecordsHook.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveRecordStation, type RecordStationResolved } from './resolveRecordStation';
import type { AlmanacDailyRecord } from './types';

const KEY_PREFIX = 'omniwx:records:v5';
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 60; // 60 days
const LIMIT = 1000;

// fetch can hang in RN; enforce a timeout
const REQ_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = [650, 1200]; // two retries w/ backoff

// ✅ keep logs fully disabled
const DEBUG_RECORDS = false;

type RecordsMap = Record<string, AlmanacDailyRecord>;

export type RecordsProgress =
  | null
  | {
      phase: 'idle' | 'cache' | 'resolve-station' | 'probe' | 'build' | 'saving';
      message?: string;
      year?: number;
      yearsDone?: number;
      yearsTotal?: number;
      pages?: number;
      rows?: number;
      pct?: number; // 0..1
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
function buildDataUrl(opts: { stationId: string; start: string; end: string; offset: number }) {
  const { stationId, start, end, offset } = opts;
  const base = 'https://www.ncei.noaa.gov/cdo-web/api/v2/data';
  const qs =
    `datasetid=GHCND` +
    `&datatypeid=TMAX` +
    `&datatypeid=TMIN` +
    `&datatypeid=PRCP` +
    `&stationid=${encodeURIComponent(stationId)}` +
    `&startdate=${encodeURIComponent(start)}` +
    `&enddate=${encodeURIComponent(end)}` +
    `&limit=${LIMIT}` +
    `&offset=${offset}`;
  return `${base}?${qs}`;
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
function clampIsoToYear(iso: string, year: number, which: 'start' | 'end') {
  const y = String(year);
  if (which === 'start') return iso < `${y}-01-01` ? `${y}-01-01` : iso;
  return iso > `${y}-12-31` ? `${y}-12-31` : iso;
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
  // RN often throws TypeError('Network request failed')
  return err instanceof TypeError || msg.includes('network request failed') || msg.includes('failed to fetch');
}
function withTimeout<T>(p: Promise<T>, ms: number, label = 'Request timed out') {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
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

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [progress, setProgress] = useState<RecordsProgress>(null);

  const abortRef = useRef<AbortController | null>(null);
  const haveRecordsRef = useRef(false);

  const dbgRef = useRef({
    runId: 0,
    pages: 0,
    totalRows: 0,
    yearsTouched: 0,
    lastYear: 0,
    lastOffset: 0,
  });

  const cacheKey = useMemo(() => `${KEY_PREFIX}:${lat.toFixed(3)},${lon.toFixed(3)}`, [lat, lon]);

  const fetchJson = useCallback(async (url: string, token: string, ac: AbortController) => {
    if (ac.signal.aborted) throw makeAbortError();

    const res = await withTimeout(fetch(url, { headers: { token }, signal: ac.signal }), REQ_TIMEOUT_MS, 'NOAA request timed out');
    if (ac.signal.aborted) throw makeAbortError();

    // @ts-ignore – fetch type union
    if (!res.ok) {
      let body = '';
      try {
        // @ts-ignore
        body = await res.text();
      } catch {}
      // @ts-ignore
      throw new Error(httpErrMsg(res.status, body));
    }

    // @ts-ignore
    return await res.json();
  }, []);

  const fetchJsonWithRetry = useCallback(
    async (url: string, token: string, ac: AbortController) => {
      let lastErr: any = null;

      for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
        if (ac.signal.aborted) throw makeAbortError();

        try {
          return await fetchJson(url, token, ac);
        } catch (e: any) {
          if (isAbortError(e) || ac.signal.aborted) throw makeAbortError();

          lastErr = e;

          const canRetry = isTransientNetworkError(e) || (typeof e?.message === 'string' && e.message.toLowerCase().includes('timed out'));
          if (!canRetry || attempt === RETRY_BACKOFF_MS.length) break;

          await sleep(RETRY_BACKOFF_MS[attempt]);
        }
      }

      throw lastErr ?? new Error('Failed to load records');
    },
    [fetchJson]
  );

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;

      const runId = ++dbgRef.current.runId;
      dbgRef.current.pages = 0;
      dbgRef.current.totalRows = 0;
      dbgRef.current.yearsTouched = 0;
      dbgRef.current.lastYear = 0;
      dbgRef.current.lastOffset = 0;

      setError(null);
      setProgress({ phase: 'cache', message: 'Checking cache…' });

      setLoading(!force && !haveRecordsRef.current);
      setRefreshing(!!force);

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        // ✅ Cache: accept only if non-empty
        if (!force) {
          const cached = await AsyncStorage.getItem(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              const ageMs = Date.now() - Number(parsed?.savedAt ?? 0);
              const keys = Object.keys(parsed?.records ?? {}).length;

              const fresh = ageMs < CACHE_TTL_MS;
              const nonEmpty = keys > 0;

              if (parsed?.records && fresh && nonEmpty) {
                setRecords(parsed.records);
                haveRecordsRef.current = true;
                setStationIdUsed(parsed.stationIdUsed ?? null);
                setStationNameUsed(parsed.stationNameUsed ?? null);
                setLoading(false);
                setRefreshing(false);
                setProgress(null);
                return;
              }
            } catch {
              // ignore cache parse issues
            }
          }
        }

        const token = process.env.EXPO_PUBLIC_NOAA_NCEI_TOKEN || process.env.EXPO_PUBLIC_NOAA_TOKEN;
        if (!token) throw new Error('NOAA token required for records');

        setProgress({ phase: 'resolve-station', message: 'Finding nearby record station…' });

        const resolved: RecordStationResolved = await resolveRecordStation(lat, lon, token);
        const stationId = resolved.id;
        const stationName = resolved.name ?? null;

        setStationIdUsed(stationId);
        setStationNameUsed(stationName);

        const minY = yearFromIso(resolved.mindate) ?? 1950;
        const maxY = yearFromIso(resolved.maxdate) ?? new Date().getFullYear();
        const minIso = resolved.mindate ?? `${minY}-01-01`;
        const maxIso = resolved.maxdate ?? new Date().toISOString().slice(0, 10);

        const map: RecordsMap = {};

        // --- QUICK PROBE: find a recent year with any data (fast validation) ---
        setProgress({ phase: 'probe', message: 'Validating station data…' });

        let firstYearWithData: number | null = null;
        const probeYears = 25; // look back up to 25 years

        for (let y = maxY; y >= Math.max(minY, maxY - probeYears); y--) {
          if (ac.signal.aborted) throw makeAbortError();

          const start = clampIsoToYear(minIso, y, 'start');
          const end = clampIsoToYear(maxIso, y, 'end');
          if (start > end) continue;

          const url = buildDataUrl({ stationId, start, end, offset: 1 });
          const json = await fetchJsonWithRetry(url, token, ac);
          const results: any[] = json?.results ?? [];

          if (results.length > 0) {
            firstYearWithData = y;
            break;
          }
        }

        if (firstYearWithData == null) {
          throw new Error('No NOAA daily data found in recent years for this station.');
        }

        // --- MAIN LOOP: build records from firstYearWithData backward ---
        const yearsTotal = Math.max(0, firstYearWithData - minY + 1);
        let yearsDone = 0;

        for (let y = firstYearWithData; y >= minY; y--) {
          if (ac.signal.aborted) throw makeAbortError();

          dbgRef.current.yearsTouched += 1;
          dbgRef.current.lastYear = y;

          yearsDone = firstYearWithData - y + 1;
          const pct = yearsTotal > 0 ? Math.min(1, Math.max(0, yearsDone / yearsTotal)) : 0;

          setProgress({
            phase: 'build',
            message: `Building records… ${yearsDone}/${yearsTotal} yrs`,
            year: y,
            yearsDone,
            yearsTotal,
            pages: dbgRef.current.pages,
            rows: dbgRef.current.totalRows,
            pct,
          });

          // yield so the UI can paint / update the bar
          if (yearsDone % 2 === 0) await sleep(0);

          const start = clampIsoToYear(minIso, y, 'start');
          const end = clampIsoToYear(maxIso, y, 'end');
          if (start > end) continue;

          let offset = 1;

          while (true) {
            if (ac.signal.aborted) throw makeAbortError();

            dbgRef.current.lastOffset = offset;

            const url = buildDataUrl({ stationId, start, end, offset });
            const json = await fetchJsonWithRetry(url, token, ac);
            const results: any[] = json?.results ?? [];

            dbgRef.current.pages += 1;
            dbgRef.current.totalRows += results.length;

            // update progress every couple pages so it never looks stuck
            if (dbgRef.current.pages % 2 === 0) {
              setProgress((p) =>
                p && p.phase === 'build'
                  ? {
                      ...p,
                      pages: dbgRef.current.pages,
                      rows: dbgRef.current.totalRows,
                      message: `Building records… ${yearsDone}/${yearsTotal} yrs • ${dbgRef.current.pages} pages`,
                    }
                  : p
              );
              await sleep(0);
            }

            if (!results.length) break;

            for (const r of results) {
              const mmdd = mmddFromIso(r.date);
              const year = Number(String(r.date).slice(0, 4));
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
          }
        }

        const keys = Object.keys(map);
        if (keys.length === 0) {
          throw new Error('NOAA records returned 0 rows (mapKeys=0). Not caching.');
        }

        setProgress({ phase: 'saving', message: 'Saving records…' });

        setRecords(map);
        haveRecordsRef.current = true;

        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            savedAt: Date.now(),
            stationIdUsed: stationId,
            stationNameUsed: stationName,
            records: map,
          })
        );

        setProgress(null);
      } catch (e: any) {
        if (!isAbortError(e)) setError(e?.message ?? 'Failed to load records');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [enabled, lat, lon, cacheKey, fetchJsonWithRetry]
  );

  useEffect(() => {
    load(false);
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { records, stationIdUsed, stationNameUsed, loading, refreshing, error, refresh, progress };
}