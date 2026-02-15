// app/lib/climatology/nceiNormals.ts
// NCEI Access Data Service API (no token) for climate normals.

export type MonthlyNormals = {
  month: number; // 1..12
  tavgF: number | null;
  tminF: number | null;
  tmaxF: number | null;
  prcpIn: number | null;
};

export type NormalsSummary = {
  stationId: string;
  stationName?: string;
  months: MonthlyNormals[];
  annual: {
    tavgF: number | null;
    tminF: number | null;
    tmaxF: number | null;
    prcpIn: number | null;
  };
};

const BASE = 'https://www.ncei.noaa.gov/access/services/data/v1';
const DATASET = 'normals-monthly-1991-2020';

type NceiRow = Record<string, string>;

const REQ_TIMEOUT_MS = 15_000;
const RETRY_BACKOFF_MS = [650, 1200];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
  return err instanceof TypeError || msg.includes('network request failed') || msg.includes('failed to fetch') || msg.includes('timed out');
}

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Request timed out') {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function fetchWithRetry(url: string, signal?: AbortSignal) {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    if (signal?.aborted) {
      const ae: any = new Error('Aborted');
      ae.name = 'AbortError';
      throw ae;
    }

    try {
      const res = await withTimeout(fetch(url, { signal }), REQ_TIMEOUT_MS, 'Normals request timed out');

      // retry 429 / 5xx
      if (!res.ok) {
        const status = res.status;
        const text = await res.text().catch(() => '');
        if ((status === 429 || (status >= 500 && status <= 599)) && attempt < RETRY_BACKOFF_MS.length) {
          await sleep(RETRY_BACKOFF_MS[attempt]);
          continue;
        }
        throw new Error(`Normals fetch failed (${status})${text ? `: ${text.slice(0, 180)}` : ''}`);
      }

      return res;
    } catch (e: any) {
      if (isAbortError(e) || signal?.aborted) throw e;
      lastErr = e;

      if (!isTransientNetworkError(e) || attempt === RETRY_BACKOFF_MS.length) break;
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }

  throw lastErr ?? new Error('Normals fetch failed');
}

function numOrNull(v: any) {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

function mmToIn(mm: number) {
  return mm / 25.4;
}

const DT_TAVG = 'MLY-TAVG-NORMAL';
const DT_TMAX = 'MLY-TMAX-NORMAL';
const DT_TMIN = 'MLY-TMIN-NORMAL';
const DT_PRCP = 'MLY-PRCP-NORMAL';

function monthFromDateStr(s?: string) {
  if (!s || s.length < 7) return null;
  const m = Number(s.slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
}

function buildUrl(params: Record<string, string>) {
  const usp = new URLSearchParams(params);
  return `${BASE}?${usp.toString()}`;
}

export async function fetchMonthlyNormals(stationId: string, signal?: AbortSignal): Promise<MonthlyNormals[]> {
  const url = buildUrl({
    dataset: DATASET,
    stations: stationId,
    dataTypes: [DT_TAVG, DT_TMAX, DT_TMIN, DT_PRCP].join(','),
    format: 'json',
    includeAttributes: 'false',
  });

  const res = await fetchWithRetry(url, signal);
  const rows = (await res.json()) as NceiRow[];

  const byMonth = new Map<number, MonthlyNormals>();

  for (const r of rows) {
    const dateStr = (r.DATE ?? r.date ?? r.Date) as string | undefined;
    const m = monthFromDateStr(dateStr);
    if (!m) continue;

    const tavgC = numOrNull(r[DT_TAVG]);
    const tmaxC = numOrNull(r[DT_TMAX]);
    const tminC = numOrNull(r[DT_TMIN]);
    const prcpMm = numOrNull(r[DT_PRCP]);

    byMonth.set(m, {
      month: m,
      tavgF: tavgC == null ? null : cToF(tavgC),
      tmaxF: tmaxC == null ? null : cToF(tmaxC),
      tminF: tminC == null ? null : cToF(tminC),
      prcpIn: prcpMm == null ? null : mmToIn(prcpMm),
    });
  }

  const out: MonthlyNormals[] = [];
  for (let m = 1; m <= 12; m++) {
    out.push(byMonth.get(m) ?? { month: m, tavgF: null, tminF: null, tmaxF: null, prcpIn: null });
  }
  return out;
}

function avg(vals: Array<number | null>) {
  const v = vals.filter((x): x is number => x != null);
  if (!v.length) return null;
  return v.reduce((a, c) => a + c, 0) / v.length;
}

function sum(vals: Array<number | null>) {
  const v = vals.filter((x): x is number => x != null);
  if (!v.length) return null;
  return v.reduce((a, c) => a + c, 0);
}

export function summarizeNormals(stationId: string, months: MonthlyNormals[]): NormalsSummary {
  const annual = {
    tavgF: avg(months.map((m) => m.tavgF)),
    tminF: avg(months.map((m) => m.tminF)),
    tmaxF: avg(months.map((m) => m.tmaxF)),
    prcpIn: sum(months.map((m) => m.prcpIn)),
  };

  return { stationId, months, annual };
}