// app/lib/climatology/nceiStations.ts
// Nearest-station lookup using GHCN-D station inventory (ghcnd-stations.txt).
// Inventory is large; we download once and cache. Then do fast nearest search.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type GhcnStation = {
  id: string; // e.g., "USW00023183"
  lat: number; // decimal degrees
  lon: number; // decimal degrees
  elevM: number | null;
  name: string;
  state?: string | null;
};

const STATIONS_URL =
  'https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/doc/ghcnd-stations.txt';

const CACHE_KEY = 'omniwx:ghcn:stations:v1';
const CACHE_META_KEY = 'omniwx:ghcn:stations:v1:meta';

// Station search defaults favor nearby, recently active observing sites.
const MAX_CACHE_AGE_DAYS = 90; // refresh quarterly

// Fetch policy
const REQ_TIMEOUT_MS = 25_000;
const RETRY_BACKOFF_MS = [750, 1500];

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

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Request timed out') {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * GHCN-D station inventory fixed-width columns.
 * ID(11) LAT(9) LON(10) ELEV(7) STATE(3) NAME(…)
 */
function parseStationsTxt(text: string): GhcnStation[] {
  const lines = text.split(/\r?\n/);
  const out: GhcnStation[] = [];

  for (const line of lines) {
    if (!line || line.length < 45) continue;

    const id = line.slice(0, 11).trim();
    const lat = Number(line.slice(12, 20).trim());
    const lon = Number(line.slice(21, 30).trim());
    const elevRaw = line.slice(31, 37).trim();
    const state = line.slice(38, 40).trim() || null;
    const name = line.slice(41).trim();

    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon) || !name) continue;

    const elevM = elevRaw ? Number(elevRaw) : NaN;
    out.push({
      id,
      lat,
      lon,
      elevM: Number.isFinite(elevM) ? elevM : null,
      name,
      state,
    });
  }

  return out;
}

async function getCacheMeta(): Promise<{ fetchedAtMs: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setCacheMeta(meta: { fetchedAtMs: number }) {
  try {
    await AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

async function fetchStationsText(signal?: AbortSignal): Promise<string> {
  let lastErr: any = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    if (signal?.aborted) {
      const ae: any = new Error('Aborted');
      ae.name = 'AbortError';
      throw ae;
    }

    try {
      const res = await withTimeout(fetch(STATIONS_URL, { signal }), REQ_TIMEOUT_MS, 'Station inventory timed out');
      if (!res.ok) throw new Error(`Station inventory fetch failed (${res.status})`);
      return await res.text();
    } catch (e: any) {
      if (isAbortError(e) || signal?.aborted) throw e;
      lastErr = e;
      if (attempt === RETRY_BACKOFF_MS.length) break;
      await sleep(RETRY_BACKOFF_MS[attempt]);
    }
  }

  throw lastErr ?? new Error('Station inventory fetch failed');
}

export async function loadGhcnStations(signal?: AbortSignal): Promise<GhcnStation[]> {
  const meta = await getCacheMeta();
  const now = Date.now();
  const maxAgeMs = MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;

  if (meta?.fetchedAtMs && now - meta.fetchedAtMs < maxAgeMs) {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as GhcnStation[];
      } catch {
        // fallthrough to refetch
      }
    }
  }

  // Try cached even if stale (offline-safe), then refetch opportunistically
  const stale = await AsyncStorage.getItem(CACHE_KEY);
  if (stale && (!meta?.fetchedAtMs || now - meta.fetchedAtMs >= maxAgeMs)) {
    refreshStationsCache().catch(() => {});
    try {
      return JSON.parse(stale) as GhcnStation[];
    } catch {
      // fallthrough
    }
  }

  const txt = await fetchStationsText(signal);
  const stations = parseStationsTxt(txt);

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(stations));
  await setCacheMeta({ fetchedAtMs: now });

  return stations;
}

export async function refreshStationsCache(signal?: AbortSignal) {
  const txt = await fetchStationsText(signal);
  const stations = parseStationsTxt(txt);

  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(stations));
  await setCacheMeta({ fetchedAtMs: Date.now() });
}

export async function findNearestGhcnStation(lat: number, lon: number, opts?: { limitToUS?: boolean; signal?: AbortSignal }) {
  const stations = await loadGhcnStations(opts?.signal);

  let best: { s: GhcnStation; km: number } | null = null;

  for (const s of stations) {
    if (opts?.limitToUS && !s.id.startsWith('US')) continue;

    const km = haversineKm(lat, lon, s.lat, s.lon);
    if (!best || km < best.km) best = { s, km };
  }

  return best ? { station: best.s, distanceKm: best.km } : null;
}