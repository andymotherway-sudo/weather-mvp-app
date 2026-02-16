// app/lib/almanac/observations.ts
import { ClimoError } from '../climatology/types';

// ---------- Worker base (NCEI token lives in Worker) ----------
const API_BASE_RAW = (process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? '';
const API_BASE = API_BASE_RAW.replace(/\/+$/, '');

function apiUrl(path: string) {
  if (!API_BASE) throw new Error('Missing EXPO_PUBLIC_API_BASE. Set it in .env and restart Expo.');
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
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

async function fetchJson(url: string, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: { accept: 'application/json' },
    });
  } catch (e: any) {
    throw new ClimoError('NETWORK', 'Network error while contacting NOAA proxy.', e);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // With Worker proxy, auth failures should be rare; treat as network/service error.
    throw new ClimoError('NETWORK', `NOAA proxy request failed (${res.status}).`, { status: res.status, text });
  }

  try {
    return await res.json();
  } catch (e: any) {
    throw new ClimoError('NETWORK', 'Failed to parse NOAA proxy JSON.', e);
  }
}

export async function fetchObservedDaysRange(
  stationId: string,
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  signal?: AbortSignal
): Promise<ObservedDay[]> {
  if (!API_BASE) {
    throw new ClimoError('NETWORK', 'Missing EXPO_PUBLIC_API_BASE. Set it to your Worker URL and restart Expo.');
  }

  const limit = 1000;
  let offset = 1;
  const rows: Row[] = [];

  while (true) {
    // Via Worker: /api/ncei/data -> https://www.ncei.noaa.gov/cdo-web/api/v2/data
    const u = new URL(apiUrl('/api/ncei/data'));
    u.searchParams.set('datasetid', 'GHCND');
    u.searchParams.set('stationid', stationId);
    u.searchParams.set('startdate', startDate);
    u.searchParams.set('enddate', endDate);
    u.searchParams.append('datatypeid', 'TMAX');
    u.searchParams.append('datatypeid', 'TMIN');
    u.searchParams.append('datatypeid', 'PRCP');
    u.searchParams.set('limit', String(limit));
    u.searchParams.set('offset', String(offset));

    const json = await fetchJson(u.toString(), signal);
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