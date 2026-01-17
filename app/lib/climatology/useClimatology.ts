// app/lib/climatology/nceiNormals.ts
// NCEI Access Data Service API (no token) for climate normals. :contentReference[oaicite:4]{index=4}
//
// We'll pull monthly normals and compute "calendar-year" summaries (annual mean temp, annual precip, etc.)

export type MonthlyNormals = {
  month: number; // 1..12
  // F (or C if you choose metric later)
  tavgF: number | null;
  tminF: number | null;
  tmaxF: number | null;
  // inches
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

// Access Data Service base (documented) :contentReference[oaicite:5]{index=5}
const BASE = 'https://www.ncei.noaa.gov/access/services/data/v1';

// Dataset name is discoverable via the API and commonly used as below.
// If NOAA ever changes it, you can discover datasets via the search service,
// but this is a solid MVP default.
const DATASET = 'normals-monthly-1991-2020';

type NceiRow = Record<string, string>;

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

/**
 * NCEI normals data types (common ones):
 * - MLY-TAVG-NORMAL (°C)
 * - MLY-TMAX-NORMAL (°C)
 * - MLY-TMIN-NORMAL (°C)
 * - MLY-PRCP-NORMAL (mm)
 *
 * Returned field names depend on output format; JSON typically returns those
 * data type IDs as columns (strings).
 */
const DT_TAVG = 'MLY-TAVG-NORMAL';
const DT_TMAX = 'MLY-TMAX-NORMAL';
const DT_TMIN = 'MLY-TMIN-NORMAL';
const DT_PRCP = 'MLY-PRCP-NORMAL';

function monthFromDateStr(s?: string) {
  // Expecting something like "YYYY-MM-01" or "YYYY-MM"
  if (!s || s.length < 7) return null;
  const m = Number(s.slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
}

function buildUrl(params: Record<string, string>) {
  const usp = new URLSearchParams(params);
  return `${BASE}?${usp.toString()}`;
}

export async function fetchMonthlyNormals(stationId: string): Promise<MonthlyNormals[]> {
  // Request JSON output (documented output formats include JSON/CSV) :contentReference[oaicite:6]{index=6}
  const url = buildUrl({
    dataset: DATASET,
    stations: stationId,
    dataTypes: [DT_TAVG, DT_TMAX, DT_TMIN, DT_PRCP].join(','),
    format: 'json',
    includeAttributes: 'false',
    // Many normals datasets return one row per month.
    // If needed later, you can add startDate/endDate, but normals are climatological monthly values.
  });

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Normals fetch failed (${res.status})`);

  const rows = (await res.json()) as NceiRow[];
  const byMonth = new Map<number, MonthlyNormals>();

  for (const r of rows) {
    // The service commonly includes a DATE column; if it differs, we handle a couple variants.
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

  // Ensure 1..12 ordering, with nulls if missing
  const out: MonthlyNormals[] = [];
  for (let m = 1; m <= 12; m++) out.push(byMonth.get(m) ?? { month: m, tavgF: null, tminF: null, tmaxF: null, prcpIn: null });
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
