// app/lib/almanac/resolveRecordStation.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'omniwx:record-station:v3';

// flip off when stable
const DEBUG_STATION = true;

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

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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
  // ISO strings compare lexicographically for YYYY-MM-DD
  return maxdate >= recentCutoffIso;
}

export async function resolveRecordStation(lat: number, lon: number, token: string): Promise<RecordStationResolved> {
  const cacheKey = `${KEY_PREFIX}:${lat.toFixed(3)},${lon.toFixed(3)}`;

  // Policy knobs
  const RECENT_DAYS = 365 * 2; // must have data in last 2 years
  const recentCutoff = daysAgoIso(RECENT_DAYS);

  // ---- cache ----
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

        // ✅ reject cached stations that are not recent enough (prevents "Tempe Bridge" poison)
        if (isRecentEnough(resolved.maxdate, recentCutoff)) {
          if (DEBUG_STATION) console.log('[records] station cache hit', { cacheKey, resolved, recentCutoff });
          return resolved;
        } else {
          if (DEBUG_STATION) console.log('[records] station cache rejected (stale)', { cacheKey, resolved, recentCutoff });
        }
      }
      if (typeof parsed === 'string') {
        // Old shape: we can’t validate recency, so ignore it
        if (DEBUG_STATION) console.log('[records] station cache ignored (old shape string)', { cacheKey });
      }
    } catch {
      if (DEBUG_STATION) console.log('[records] station cache parse failed', { cacheKey });
    }
  }

  // Search box (you can widen this if you want more candidates)
  const south = lat - 0.75;
  const west = lon - 0.75;
  const north = lat + 0.75;
  const east = lon + 0.75;

  // IMPORTANT:
  // - Add datatypeid filters so we don’t pick stations missing TMAX/TMIN/PRCP entirely.
  // - Use enddate=today so NOAA filters/coverage considers modern period.
  const url =
    `https://www.ncei.noaa.gov/cdo-web/api/v2/stations` +
    `?datasetid=GHCND` +
    `&datatypeid=TMAX&datatypeid=TMIN&datatypeid=PRCP` +
    `&extent=${south},${west},${north},${east}` +
    `&startdate=1950-01-01` +
    `&enddate=${encodeURIComponent(isoToday())}` +
    `&limit=100` +
    `&sortfield=datacoverage` +
    `&sortorder=desc`;

  if (DEBUG_STATION) console.log('[records] station lookup', { url, recentCutoff });

  const res = await fetch(url, { headers: { token } });
  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch {}
    console.error('[records] station lookup HTTP error', res.status, body);
    throw new Error(`Station lookup failed (${res.status})`);
  }

  const json = await res.json();
  const results: any[] = json?.results ?? [];
  if (!results.length) throw new Error('No suitable GHCND station found');

  // Parse + score
  const candidates: Candidate[] = results
    .map((r) => parseCandidate(r, lat, lon))
    .filter((x): x is Candidate => !!x);

  // Filter to stations with recent data
  const recent = candidates.filter((c) => isRecentEnough(c.maxdate, recentCutoff));

  // If none are recent, fall back to best candidate (but log loudly)
  const pool = recent.length ? recent : candidates;

  // Score:
  // - Prefer high datacoverage
  // - Prefer older mindate (longer record)
  // - Prefer closer stations (soft)
  const scored = pool.map((c) => {
    const dc = c.datacoverage ?? 0;
    const minY = yearFromIso(c.mindate) ?? 9999;
    const longRecordBonus = minY <= 1950 ? 1 : minY <= 1970 ? 0.7 : minY <= 1990 ? 0.4 : 0;
    const dist = c.distanceKm ?? 9999;
    const distPenalty = Math.min(1, dist / 50); // 0..1 over ~50km

    // higher is better
    const score = dc * 3 + longRecordBonus * 1.5 - distPenalty * 0.75;

    return { ...c, score };
  });

  scored.sort((a, b) => (b.score ?? -999) - (a.score ?? -999));

  if (DEBUG_STATION) {
    console.log('[records] station candidates (top 10)', {
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
  if (!best) throw new Error('No suitable GHCND station found after filtering');

  // If we had to fall back to non-recent pool, throw a clearer error
  if (!recent.length) {
    console.warn('[records] no recent stations found in extent; falling back to best non-recent candidate', {
      best: { id: best.id, name: best.name, mindate: best.mindate, maxdate: best.maxdate, datacoverage: best.datacoverage },
    });
  }

  const resolved: RecordStationResolved = {
    id: best.id,
    name: best.name,
    mindate: best.mindate,
    maxdate: best.maxdate,
    datacoverage: best.datacoverage,
  };

  await AsyncStorage.setItem(cacheKey, JSON.stringify(resolved));
  if (DEBUG_STATION) console.log('[records] station resolved (final)', { resolved });

  return resolved;
}