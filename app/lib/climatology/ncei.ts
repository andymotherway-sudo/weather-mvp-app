// app/lib/climatology/ncei.ts
import { ClimoError } from './types';

const BASE = 'https://www.ncei.noaa.gov/cdo-web/api/v2';

type FetchJsonOpts = {
  token?: string;
  signal?: AbortSignal;
};

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
    // NCEI returns 401 for bad/missing token
    if (res.status === 401 || res.status === 403) {
      throw new ClimoError('NO_TOKEN', 'NOAA token missing/invalid for NCEI CDO API.', { status: res.status, text });
    }
    throw new ClimoError('NETWORK', `NOAA request failed (${res.status}).`, { status: res.status, text });
  }

  return res.json();
}

export function buildStationsUrl(params: Record<string, string | number | undefined>) {
  const u = new URL(`${BASE}/stations`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export function buildDataUrl(params: Record<string, string | number | undefined>) {
  const u = new URL(`${BASE}/data`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export async function nceiStations(params: Record<string, any>, token?: string, signal?: AbortSignal) {
  const url = buildStationsUrl(params);
  return fetchJson(url, { token, signal });
}

export async function nceiData(params: Record<string, any>, token?: string, signal?: AbortSignal) {
  const url = buildDataUrl(params);
  return fetchJson(url, { token, signal });
}
