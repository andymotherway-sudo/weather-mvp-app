// app/lib/almanac/observations.ts
import { ClimoError } from '../climatology/types';

const BASE = 'https://www.ncdc.noaa.gov/cdo-web/api/v2';

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

// CDO returns GHCND values in base GHCN-Daily units.
// TMAX/TMIN: tenths of °C
// PRCP: tenths of mm
function c10ToF(vC10: number) {
  const c = vC10 / 10;
  return (c * 9) / 5 + 32;
}
function mm10ToIn(vMm10: number) {
  const mm = vMm10 / 10;
  return mm / 25.4;
}

type Row = { date: string; datatype: 'TMAX' | 'TMIN' | 'PRCP'; value: number };

export type ObservedDay = {
  date: string; // YYYY-MM-DD
  tmaxF: number | null;
  tminF: number | null;
  prcpIn: number | null;
};

export async function fetchObservedDaysRange(
  stationId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string,   // YYYY-MM-DD
  signal?: AbortSignal
): Promise<ObservedDay[]> {
  const token = readToken();
  if (!token) throw new ClimoError('NO_TOKEN', 'NOAA token is required for observed daily history.');

  const limit = 1000;
  let offset = 1;
  const rows: Row[] = [];

  while (true) {
    const url =
      `${BASE}/data` +
      `?datasetid=GHCND` +
      `&stationid=${encodeURIComponent(stationId)}` +
      `&startdate=${encodeURIComponent(startDate)}` +
      `&enddate=${encodeURIComponent(endDate)}` +
      `&datatypeid=TMAX&datatypeid=TMIN&datatypeid=PRCP` +
      `&limit=${limit}&offset=${offset}`;

    const json = await fetchJson(url, { token, signal });
    const res = (json?.results ?? []) as any[];

    for (const r of res) {
      if (!r?.date || !r?.datatype) continue;
      rows.push({
        date: String(r.date),
        datatype: r.datatype,
        value: Number(r.value),
      });
    }

    if (!res.length || res.length < limit) break;
    offset += limit;
  }

  // Build per-date
  const byDate = new Map<string, ObservedDay>();
  function getDay(dateIso: string) {
    const k = dateIso.slice(0, 10);
    let d = byDate.get(k);
    if (!d) {
      d = { date: k, tmaxF: null, tminF: null, prcpIn: null };
      byDate.set(k, d);
    }
    return d;
  }

  for (const r of rows) {
    const k = String(r.date).slice(0, 10);
    const d = getDay(k);
    if (!Number.isFinite(r.value)) continue;

    if (r.datatype === 'TMAX') d.tmaxF = c10ToF(r.value);
    if (r.datatype === 'TMIN') d.tminF = c10ToF(r.value);
    if (r.datatype === 'PRCP') d.prcpIn = mm10ToIn(r.value);
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}