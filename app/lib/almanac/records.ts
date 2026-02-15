// app/lib/almanac/records.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClimoError } from '../climatology/types';
import {
  makeRecordsCacheKey,
  readRecordsCache,
  writeRecordsCache,
  type RecordsCacheMeta,
} from './recordsCache';

// NOAA CDO Web Services v2 base
const BASE = 'https://www.ncei.noaa.gov/cdo-web/api/v2';

const DEFAULT_ALGO_VERSION = 'v1-doy-records-yearly-chunk';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

type FetchJsonOpts = { token?: string; signal?: AbortSignal };

async function fetchJson(url: string, opts: FetchJsonOpts) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.token = opts.token;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: opts.signal });
  } catch (e: any) {
    throw new ClimoError('NETWORK', 'Network error while contacting NOAA.', e);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new ClimoError('NO_TOKEN', 'NOAA token missing/invalid for CDO API.', { status: res.status, text });
    }
    throw new ClimoError('NETWORK', `NOAA request failed (${res.status}).`, { status: res.status, text });
  }

  return res.json();
}

function readToken(): string | undefined {
  return (
    (process.env.EXPO_PUBLIC_NOAA_NCEI_TOKEN as any) ||
    (process.env.EXPO_PUBLIC_NOAA_TOKEN as any) ||
    undefined
  );
}

// GHCN-Daily uses DATE as yyyy-mm-dd in CDO results; datatypeid includes TMAX/TMIN/PRCP.
type CdoDataRow = {
  date: string; // e.g. "1950-02-08T00:00:00"
  datatype: 'TMAX' | 'TMIN' | 'PRCP';
  value: number; // units depend on datatype (GHCND is typically tenths C and tenths mm)
};

export type DayOfYearRecord = {
  value: number | null;
  year: number | null;
};

export type StationRecordsByDoy = {
  stationId: string;
  computedAtIso: string;
  period: { startYear: number; endYear: number; yearsUsed: number };

  // 365 entries (index 0 -> DOY 1). Feb 29 is ignored for simplicity.
  recordHighFByDoy: DayOfYearRecord[];
  recordLowFByDoy: DayOfYearRecord[];
  recordPrcpInByDoy: DayOfYearRecord[];
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function isLeapYear(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Convert yyyy-mm-dd -> day-of-year 1..365, ignoring Feb 29 (returns null for Feb 29).
 */
function doy365(ymd: string): number | null {
  if (!ymd || ymd.length < 10) return null;
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

  // ignore Feb 29
  if (m === 2 && d === 29) return null;

  const monthDays = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let doy = 0;
  for (let i = 0; i < m - 1; i++) doy += monthDays[i];
  doy += d;

  // If leap year and date after Feb 28, and we ignored Feb 29, shift down by 1
  if (isLeapYear(y) && m > 2) doy -= 1;

  return clamp(doy, 1, 365);
}

/**
 * Units (GHCN-Daily conventions):
 * - TMAX/TMIN are in tenths of °C
 * - PRCP is in tenths of mm
 * Convert to °F and inches.
 */
function c10ToF(vC10: number) {
  const c = vC10 / 10;
  return (c * 9) / 5 + 32;
}
function mm10ToIn(vMm10: number) {
  const mm = vMm10 / 10;
  return mm / 25.4;
}

function buildDataUrl(opts: { stationId: string; start: string; end: string; limit: number; offset: number }) {
  const { stationId, start, end, limit, offset } = opts;

  // IMPORTANT: CDO /data requires start/end and (for daily) effectively limits requests to <= 1 year.
  // We'll enforce that at callsite (fetching year-by-year).
  return (
    `${BASE}/data` +
    `?datasetid=GHCND` +
    `&stationid=${encodeURIComponent(stationId)}` +
    `&startdate=${encodeURIComponent(start)}` +
    `&enddate=${encodeURIComponent(end)}` +
    `&datatypeid=TMAX&datatypeid=TMIN&datatypeid=PRCP` +
    `&sortfield=date&sortorder=asc` +
    `&limit=${limit}` +
    `&offset=${offset}`
  );
}

/**
 * Fetch CDO daily data for a station within [start,end] inclusive.
 * Uses pagination (limit/offset).
 *
 * NOTE: Caller must keep start/end within a 1-year window for daily data. :contentReference[oaicite:1]{index=1}
 */
async function fetchCdoDataRangePaged(
  stationId: string,
  start: string,
  end: string,
  token: string,
  signal?: AbortSignal
): Promise<CdoDataRow[]> {
  const limit = 1000;
  let offset = 1;
  const out: CdoDataRow[] = [];

  while (true) {
    const url = buildDataUrl({ stationId, start, end, limit, offset });
    const json = await fetchJson(url, { token, signal });

    const results = (json?.results ?? []) as any[];
    for (const r of results) {
      if (!r?.date || !r?.datatype) continue;
      out.push({
        date: String(r.date),
        datatype: r.datatype,
        value: Number(r.value),
      } as CdoDataRow);
    }

    if (!results.length || results.length < limit) break;
    offset += limit;
  }

  return out;
}

/**
 * Fetch year-by-year to satisfy CDO /data range limits for daily data. :contentReference[oaicite:2]{index=2}
 */
async function fetchCdoDataByYear(
  stationId: string,
  startYear: number,
  endYear: number,
  token: string,
  signal?: AbortSignal,
  endIsoOverrideForLastYear?: string
): Promise<CdoDataRow[]> {
  const out: CdoDataRow[] = [];

  for (let y = startYear; y <= endYear; y++) {
    const start = `${y}-01-01`;
    const end =
      y === endYear && endIsoOverrideForLastYear && endIsoOverrideForLastYear.startsWith(`${y}-`)
        ? endIsoOverrideForLastYear
        : `${y}-12-31`;

    const rows = await fetchCdoDataRangePaged(stationId, start, end, token, signal);
    out.push(...rows);
  }

  return out;
}

/**
 * Compute daily records by DOY.
 * Tie-break: if values are equal, keep the earliest year.
 */
function computeRecords(rows: CdoDataRow[], startYear: number, endYear: number, stationId: string): StationRecordsByDoy {
  const mkArr = (): DayOfYearRecord[] =>
    new Array(365).fill(null).map(() => ({ value: null, year: null }));

  const hi = mkArr();
  const lo = mkArr();
  const pr = mkArr();

  for (const r of rows) {
    const dateStr = String(r.date).slice(0, 10); // yyyy-mm-dd
    const y = Number(dateStr.slice(0, 4));
    if (!Number.isFinite(y)) continue;

    const doy = doy365(dateStr);
    if (!doy) continue;
    const idx = doy - 1;

    if (!Number.isFinite(r.value)) continue;

    if (r.datatype === 'TMAX') {
      const f = c10ToF(r.value);
      const cur = hi[idx];
      if (cur.value == null || f > cur.value || (f === cur.value && (cur.year == null || y < cur.year))) {
        hi[idx] = { value: f, year: y };
      }
    } else if (r.datatype === 'TMIN') {
      const f = c10ToF(r.value);
      const cur = lo[idx];
      if (cur.value == null || f < cur.value || (f === cur.value && (cur.year == null || y < cur.year))) {
        lo[idx] = { value: f, year: y };
      }
    } else if (r.datatype === 'PRCP') {
      const inches = mm10ToIn(r.value);
      const cur = pr[idx];
      if (cur.value == null || inches > cur.value || (inches === cur.value && (cur.year == null || y < cur.year))) {
        pr[idx] = { value: inches, year: y };
      }
    }
  }

  const yearsUsed = Math.max(1, endYear - startYear + 1);

  return {
    stationId,
    computedAtIso: new Date().toISOString(),
    period: { startYear, endYear, yearsUsed },
    recordHighFByDoy: hi,
    recordLowFByDoy: lo,
    recordPrcpInByDoy: pr,
  };
}

export function useStationRecordsByDoy(opts: {
  stationId?: string;
  stationName?: string | null;
  enabled?: boolean;
  preferCache?: boolean;
  startYear?: number;
  endYear?: number;
  algoVersion?: string;
  ttlMs?: number;
  // optional: if endYear is current year, you can clamp last-year end date (e.g., station maxdate or today)
  endIsoForLastYear?: string;
}) {
  const {
    stationId,
    stationName = null,
    enabled = true,
    preferCache = true,
    startYear,
    endYear,
    algoVersion = DEFAULT_ALGO_VERSION,
    ttlMs = DEFAULT_TTL_MS,
    endIsoForLastYear,
  } = opts;

  const token = useMemo(() => readToken(), []);
  const [data, setData] = useState<StationRecordsByDoy | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!enabled || !stationId) return;

      if (!token) {
        setError('Records need a NOAA token. Add EXPO_PUBLIC_NOAA_NCEI_TOKEN.');
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      setError(null);

      try {
        const nowY = new Date().getFullYear();
        const sy = clamp(startYear ?? 1900, 1700, nowY);
        const ey = clamp(endYear ?? nowY, sy, nowY);

        const cacheKey = makeRecordsCacheKey({
          stationId,
          yearFrom: sy,
          yearTo: ey,
          algoVersion,
        });

        const wantMeta: RecordsCacheMeta = {
          stationId,
          stationName,
          yearFrom: sy,
          yearTo: ey,
          algoVersion,
        };

        if (preferCache) {
          const cached = await readRecordsCache<StationRecordsByDoy>(cacheKey);
          if (cached && cached.data && cached.meta) {
            // optional meta check (avoid collisions)
            const m = cached.meta;
            const metaOk =
              m.stationId === wantMeta.stationId &&
              m.yearFrom === wantMeta.yearFrom &&
              m.yearTo === wantMeta.yearTo &&
              m.algoVersion === wantMeta.algoVersion;

            if (metaOk) {
              setData(cached.data);
              if (mode === 'initial') setLoading(false);
              else setRefreshing(false);
              return;
            }
          }
        }

        // ✅ Fetch year-by-year (CDO /data daily limit). :contentReference[oaicite:3]{index=3}
        const rows = await fetchCdoDataByYear(stationId, sy, ey, token, ac.signal, endIsoForLastYear);

        const recs = computeRecords(rows, sy, ey, stationId);
        setData(recs);

        await writeRecordsCache(cacheKey, wantMeta, recs, ttlMs);
      } catch (e: any) {
        const ce = e instanceof ClimoError ? e : null;
        setError(ce?.message ?? 'Failed to load records.');
      } finally {
        if (mode === 'initial') setLoading(false);
        else setRefreshing(false);
      }
    },
    [enabled, stationId, stationName, token, preferCache, startYear, endYear, algoVersion, ttlMs, endIsoForLastYear]
  );

  useEffect(() => {
    load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);

  return { data, loading, refreshing, error, refresh, hasToken: !!token };
}