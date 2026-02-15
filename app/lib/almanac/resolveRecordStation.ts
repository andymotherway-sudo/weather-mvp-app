// app/lib/almanac/resolveRecordStation.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { noaaSchedule } from '../noaa/noaaRateLimiter';

const KEY_PREFIX = 'omniwx:record-station:v6'; // ✅ bump (v6 fixes UTC "tomorrow" bug + URLSearchParams)

// flip off when stable
const DEBUG_STATION = true;

// Request policy (mobile-safe)
const STATION_REQ_TIMEOUT_MS = 20_000;

// Policy knobs
const RECENT_DAYS = 365 * 2; // must have data in last 2 years

export type RecordStationResolved = {
  id: string; // "GHCND:USW00023183"
  name?: string;
  mindate?: string; // "YYYY-MM-DD"
  maxdate?: string; // "YYYY-MM-DD"
  datacoverage?: number; // 0..1
};

type Candidate = {
  id: string;
  name?: string;
  mindate?: string;
  maxdate?: string;
  datacoverage?: number;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  score?: number;
};

function ensureGhcndId(id: string) {
  const s = String(id ?? '');
  return s.startsWith('GHCND:') ? s : `GHCND:${s}`;
}

function toIsoDate(v: any): string | undefined {
  const s = typeof v === 'string' ? v : String(v ?? '');
  const iso = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : undefined;
}

/** ✅ Local YYYY-MM-DD (avoids UTC rolling into "tomorrow" at night) */
function localYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoToday() {
  return localYmd();
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localYmd(d);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function yearFromIso(iso?: string) {
  if (!iso) return null;
  const y = Number(String(iso).slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

function parseCandidate(raw: any, lat: number, lon: number): Candidate | null {
  const id = typeof raw?.id === 'string' ? ensureGhcndId(raw.id) : null;
  if (!id) return null;

  const sLat = typeof raw?.latitude === 'number' ? raw.latitude : Number(raw?.latitude);
  const sLon = typeof raw?.longitude === 'number' ? raw.longitude : Number(raw?.longitude);

  const mindate = toIsoDate(raw?.mindate);
  const maxdate = toIsoDate(raw?.maxdate);

  const dc = typeof raw?.datacoverage === 'number' ? raw.datacoverage : Number(raw?.datacoverage);
  const datacoverage = Number.isFinite(dc) ? dc : undefined;

  const distanceKm =
    Number.isFinite(sLat) && Number.isFinite(sLon) ? haversineKm(lat, lon, sLat, sLon) : undefined;

  return {
    id,
    name: typeof raw?.name === 'string' ? raw.name : undefined,
    mindate,
    maxdate,
    datacoverage,
    latitude: Number.isFinite(sLat) ? sLat : undefined,
    longitude: Number.isFinite(sLon) ? sLon : undefined,
    distanceKm,
  };
}

function isRecentEnough(maxdate?: string, recentCutoffIso?: string) {
  if (!maxdate || !recentCutoffIso) return false;
  return maxdate >= recentCutoffIso; // ISO YYYY-MM-DD compares lexicographically
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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Request timed out') {
  let t: any;
  const timeout = new Promise<T>((_, rej) => {
    t = setTimeout(() => rej(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
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

async function fetchJsonScheduled(url: string, token: string, signal?: AbortSignal) {
  if (signal?.aborted) throw makeAbortError();

  const res = await noaaSchedule(() =>
    withTimeout(fetch(url, { headers: { token }, signal }), STATION_REQ_TIMEOUT_MS, 'Station lookup timed out')
  );

  if (signal?.aborted) throw makeAbortError();

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err: any = new Error(
      `Station lookup failed (${res.status})${body ? `: ${body.slice(0, 160)}` : ''}`
    );
    err.status = res.status;
    if (res.status === 429) {
      err.retryAfterSec = parseRetryAfterSeconds(res.headers?.get?.('retry-after') ?? null);
    }
    throw err;
  }

  return res.json();
}

function buildStationsUrl(opts: { extentDeg: number; lat: number; lon: number; enddate: string }) {
  const { extentDeg, lat, lon, enddate } = opts;
  const south = lat - extentDeg;
  const west = lon - extentDeg;
  const north = lat + extentDeg;
  const east = lon + extentDeg;

  const u = new URL('https://www.ncei.noaa.gov/cdo-web/api/v2/stations');
  u.searchParams.set('datasetid', 'GHCND');
  u.searchParams.append('datatypeid', 'TMAX');
  u.searchParams.append('datatypeid', 'TMIN');
  u.searchParams.append('datatypeid', 'PRCP');
  u.searchParams.set('extent', `${south},${west},${north},${east}`);
  u.searchParams.set('startdate', '1950-01-01');
  u.searchParams.set('enddate', enddate); // already local YYYY-MM-DD
  u.searchParams.set('limit', '1000');
  u.searchParams.set('sortfield', 'datacoverage');
  u.searchParams.set('sortorder', 'desc');

  return u.toString();
}

export async function resolveRecordStation(
  lat: number,
  lon: number,
  token: string,
  signal?: AbortSignal
): Promise<RecordStationResolved> {
  const cacheKey = `${KEY_PREFIX}:${lat.toFixed(3)},${lon.toFixed(3)}`;

  const recentCutoff = daysAgoIso(RECENT_DAYS);
  const enddate = isoToday(); // ✅ local date

  // ---- cache (only accept if recent) ----
  const cached = await AsyncStorage.getItem(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed && typeof parsed === 'object' && typeof parsed.id === 'string') {
        const resolved: RecordStationResolved = {
          id: ensureGhcndId(parsed.id),
          name: typeof parsed.name === 'string' ? parsed.name : undefined,
          mindate: toIsoDate(parsed.mindate),
          maxdate: toIsoDate(parsed.maxdate),
          datacoverage: typeof parsed.datacoverage === 'number' ? parsed.datacoverage : undefined,
        };

        if (isRecentEnough(resolved.maxdate, recentCutoff)) {
          if (DEBUG_STATION) console.log('[records] station cache hit', { cacheKey, resolved, recentCutoff });
          return resolved;
        }

        if (DEBUG_STATION) console.log('[records] station cache rejected (stale)', { cacheKey, resolved, recentCutoff });
      }
    } catch {
      if (DEBUG_STATION) console.log('[records] station cache parse failed', { cacheKey });
    }
  }

  // Expanding search extents (degrees)
  const EXTENTS = [0.75, 1.5, 3.0];

  // 429-aware retry (modest; scheduler does most of the work)
  const retryBackoff = [900, 1800];

  let lastErr: any = null;

  for (const extentDeg of EXTENTS) {
    if (signal?.aborted) throw makeAbortError();

    const url = buildStationsUrl({ extentDeg, lat, lon, enddate });
    if (DEBUG_STATION) console.log('[records] station lookup', { extentDeg, url, recentCutoff });

    for (let attempt = 0; attempt <= retryBackoff.length; attempt++) {
      if (signal?.aborted) throw makeAbortError();

      try {
        const json = await fetchJsonScheduled(url, token, signal);

        const results: any[] = json?.results ?? [];
        if (!results.length) {
          if (DEBUG_STATION) console.log('[records] no stations returned', { extentDeg });
          break;
        }

        const candidates: Candidate[] = results
          .map((r) => parseCandidate(r, lat, lon))
          .filter((x): x is Candidate => !!x);

        const recent = candidates.filter((c) => !!c.maxdate && isRecentEnough(c.maxdate, recentCutoff));

        if (!recent.length) {
          if (DEBUG_STATION) {
            console.log('[records] no recent stations in extent', {
              extentDeg,
              total: candidates.length,
              sampleMaxdates: candidates.slice(0, 8).map((c) => c.maxdate ?? null),
              recentCutoff,
            });
          }
          break;
        }

        const scored = recent.map((c) => {
          const dc = c.datacoverage ?? 0;
          const minY = yearFromIso(c.mindate) ?? 9999;
          const longRecordBonus = minY <= 1950 ? 1 : minY <= 1970 ? 0.7 : minY <= 1990 ? 0.4 : 0;
          const dist = c.distanceKm ?? 9999;
          const distPenalty = Math.min(1, dist / 60);

          const score = dc * 3 + longRecordBonus * 1.5 - distPenalty * 0.75;
          return { ...c, score };
        });

        scored.sort((a, b) => (b.score ?? -999) - (a.score ?? -999));

        if (DEBUG_STATION) {
          console.log('[records] station candidates (top 10)', {
            extentDeg,
            recentCutoff,
            total: candidates.length,
            recent: recent.length,
            top: scored.slice(0, 10).map((c) => ({
              id: c.id,
              name: c.name,
              mindate: c.mindate,
              maxdate: c.maxdate,
              datacoverage: c.datacoverage,
              distanceKm: c.distanceKm != null ? Math.round(c.distanceKm * 10) / 10 : null,
              score: c.score != null ? Math.round(c.score * 1000) / 1000 : null,
            })),
          });
        }

        const best = scored[0];
        if (!best) throw new Error('No suitable recent GHCND station found after scoring');

        const resolved: RecordStationResolved = {
          id: best.id,
          name: best.name,
          mindate: best.mindate,
          maxdate: best.maxdate,
          datacoverage: best.datacoverage,
        };

        await AsyncStorage.setItem(cacheKey, JSON.stringify(resolved));
        if (DEBUG_STATION) console.log('[records] station resolved (final)', { extentDeg, resolved });

        return resolved;
      } catch (e: any) {
        if (isAbortError(e) || signal?.aborted) throw makeAbortError();

        lastErr = e;

        const status = Number(e?.status);
        const is429 = status === 429 || (typeof e?.message === 'string' && e.message.includes('(429)'));

        if (!is429 || attempt === retryBackoff.length) {
          if (DEBUG_STATION) {
            console.log('[records] station lookup error', {
              extentDeg,
              status: status || null,
              msg: e?.message,
            });
          }
          break;
        }

        const ra = e?.retryAfterSec;
        if (typeof ra === 'number' && Number.isFinite(ra)) {
          if (DEBUG_STATION) console.log('[records] station lookup 429 retry-after', { extentDeg, ra });
          await sleep(ra * 1000);
        } else {
          const d = retryBackoff[attempt];
          if (DEBUG_STATION) console.log('[records] station lookup 429 backoff', { extentDeg, delayMs: d });
          await sleep(d);
        }
      }
    }
  }

  throw (
    lastErr ??
    new Error(
      `No RECENT GHCND station found near this location (needs data since ${recentCutoff}). Try again later or expand search.`
    )
  );
}