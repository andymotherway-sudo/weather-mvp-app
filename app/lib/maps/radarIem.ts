// app/lib/maps/radarIem.ts
// IEM radar helpers (mosaic + RIDGE animated scan list).

import { NEXRAD_SITES } from './nexradSites';

export type RadarScan = { iso: string; stamp: string };
export type RadarProductId = 'N0Q' | 'N0B' | 'N0Z' | 'N0U' | 'N0S' | 'EET' | 'NET';

export type RadarFrameUnified = {
  iso: string;
  kind: 'past' | 'now' | 'future';
  source: 'iem-mosaic' | 'iem-ridge' | 'rainviewer' | 'futurecast';
  template: string;
  maxZ: number;
  label?: string;
  radarId3?: string;
};

type RidgeProductResult = {
  tsList: string[];
  product: RadarProductId;
  latestOnly?: boolean;
};

type ResolveFramesOpts = {
  zoom: number;
  product: RadarProductId;

  mosaicMaxZoom: number;
  ridgeMinZoom: number;

  maxFrames: number;
  lookbackMinutes: number;
  maxLocalDistanceKm: number;
  allowMosaicFallback?: boolean;

  force?: 'mosaic' | 'ridge';
  forceRadarId3?: string | null;
};

const OMNIWX_WORKER_BASE = 'https://omniwx-api.omniwx.workers.dev';

// Mosaic is inherently coarse, but keep the source available through higher
// map zooms so the broad national view does not disappear during handoff.
// RIDGE remains the detailed single-site path.
const MOSAIC_MAX_Z = 14;
const RIDGE_MAX_Z = 8;

const DEFAULT_MOSAIC_MINUTES = Array.from({ length: 24 }, (_, index) => (23 - index) * 5);

function minutesToStamp(minutesAgo: number) {
  if (minutesAgo <= 0) return '900913';
  return `900913-m${String(minutesAgo).padStart(2, '0')}m`;
}

export function iemNationalMosaicTimestamps() {
  return DEFAULT_MOSAIC_MINUTES.map(minutesToStamp);
}

function iemMosaicTileTemplate(product: RadarProductId, stamp: string) {
  const u = new URL(`${OMNIWX_WORKER_BASE}/v1/radar/iem/mosaic/tiles/{z}/{x}/{y}.png`);
  u.searchParams.set('product', product);
  u.searchParams.set('stamp', stamp);
  return u.toString();
}

function iemRidgeTileTemplate(radarId3: string, product: RadarProductId, ts: string) {
  const u = new URL(`${OMNIWX_WORKER_BASE}/v1/radar/iem/ridge/tiles/{z}/{x}/{y}.png`);
  u.searchParams.set('radar', radarId3);
  u.searchParams.set('product', product);
  u.searchParams.set('ts', ts);
  return u.toString();
}

function canonicalRidgeProduct(product: RadarProductId): RadarProductId {
  return product;
}

function supportsLatestRidgeTile(product: RadarProductId) {
  return ['N0Q', 'N0B', 'N0Z', 'N0U', 'N0S'].includes(product);
}

export function normalizeRadarSiteId(siteId: string) {
  const s = (siteId || '').trim().toUpperCase();
  if (s.length === 4 && s.startsWith('K')) return s.slice(1);
  if (s.length === 3) return s;
  return s.slice(-3);
}

function clampInt(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/**
 * Convert ISO string -> IEM RIDGE ts (YYYYMMDDHHMM, UTC)
 */
function isoToIemTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${da}${hh}${mm}`;
}

function iemTsToIso(ts: string) {
  if (!/^\d{12}$/.test(ts)) return null;
  const y = Number(ts.slice(0, 4));
  const mo = Number(ts.slice(4, 6));
  const da = Number(ts.slice(6, 8));
  const hh = Number(ts.slice(8, 10));
  const mm = Number(ts.slice(10, 12));
  const d = new Date(Date.UTC(y, mo - 1, da, hh, mm, 0));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// --- distance helpers (for multi-radar candidate search) ---

const EARTH_RADIUS_KM = 6371;
function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const Δφ = deg2rad(lat2 - lat1);
  const Δλ = deg2rad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

// ----- RIDGE scan list fetch w/ in-memory cache -----

type RidgeListCacheEntry = { at: number; tsList: string[] };
const ridgeListCache = new Map<string, RidgeListCacheEntry>();

function ridgeListCacheKey(radarId3: string, product: string, lookbackMinutes: number) {
  return `${radarId3}|${product}|${lookbackMinutes}`;
}

const RIDGE_LIST_TTL_MS = 45_000;

async function fetchJsonWithTimeout(url: string, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

type WorkerIemScanListResponse = {
  ok?: boolean;
  tsList?: unknown[];
};

/**
 * Fetch scan list for a radar/product from IEM.
 * IMPORTANT: IEM expects start/end as ISO-8601 timestamps, not YYYYMMDDHHMM.
 * We return tsList as YYYYMMDDHHMM strings for RIDGE tile template.
 */
async function fetchIemRidgeScanList(args: {
  radarId3: string;
  product: RadarProductId;
  lookbackMinutes: number;
}) {
  const { radarId3, product, lookbackMinutes } = args;

  const key = ridgeListCacheKey(radarId3, product, lookbackMinutes);
  const cached = ridgeListCache.get(key);
  const now = Date.now();
  if (cached && now - cached.at < RIDGE_LIST_TTL_MS) return cached.tsList;

  async function fetchOnce(): Promise<string[]> {
    const u = new URL(`${OMNIWX_WORKER_BASE}/v1/radar/iem/scans`);
    u.searchParams.set('radar', radarId3);
    u.searchParams.set('product', product);
    u.searchParams.set('lookbackMinutes', String(lookbackMinutes));

    const j = (await fetchJsonWithTimeout(u.toString(), 4500)) as WorkerIemScanListResponse;

    const raw: unknown[] = Array.isArray(j?.tsList) ? j.tsList : [];

    function extractIsoOrTs(v: unknown): string | null {
      if (typeof v === 'string') return v;
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      if (v && typeof v === 'object') {
        const o = v as any;
        return (
          (typeof o.ts === 'string' && o.ts) ||
          (typeof o.time === 'string' && o.time) ||
          (typeof o.stamp === 'string' && o.stamp) ||
          (typeof o.valid === 'string' && o.valid) ||
          null
        );
      }
      return null;
    }

    // The API may return:
    // - ISO strings (e.g. 2024-07-24T08:05Z / 2024-07-24T08:05:00Z)
    // - or ts strings (YYYYMMDDHHMM)
    // We normalize to ts (YYYYMMDDHHMM) for RIDGE tiles.
    const tsList = raw
      .map(extractIsoOrTs)
      .map((s) => {
        if (!s) return null;
        const str = String(s).trim();
        if (/^\d{12}$/.test(str)) return str; // already ts
        // try parse ISO -> ts
        const ts = isoToIemTs(str);
        return ts && /^\d{12}$/.test(ts) ? ts : null;
      })
      .filter((s): s is string => !!s && /^\d{12}$/.test(s))
      .sort();

    return tsList;
  }

  const tsList = await fetchOnce();

  ridgeListCache.set(key, { at: now, tsList });
  return tsList;
}

async function fetchRidgeWithProductFallback(args: {
  radarId3: string;
  preferred: RadarProductId;
  lookbackMinutes: number;
}): Promise<RidgeProductResult> {
  const { radarId3, preferred, lookbackMinutes } = args;

  const order: RadarProductId[] =
    preferred === 'N0Q'
      ? ['N0Q', 'N0B', 'N0Z']
      : preferred === 'N0B'
        ? ['N0B', 'N0Q', 'N0Z']
        : preferred === 'N0U'
          ? ['N0U']
          : preferred === 'N0S'
            ? ['N0S']
          : preferred === 'EET'
            ? ['EET', 'NET']
            : preferred === 'NET'
              ? ['NET']
              : ['N0Z', 'N0Q', 'N0B'];

  for (const p of order) {
    const product = canonicalRidgeProduct(p);
    const tsList = await fetchIemRidgeScanList({ radarId3, product, lookbackMinutes });
    if (tsList.length) return { tsList, product };
  }

  const latestProduct = canonicalRidgeProduct(preferred);
  if (supportsLatestRidgeTile(latestProduct)) {
    return { tsList: ['0'], product: latestProduct, latestOnly: true };
  }
  return { tsList: [] as string[], product: preferred };
}

// Try multiple nearby radars until one has usable RIDGE scans.
async function findBestRidgeRadar(args: {
  lat: number;
  lon: number;
  maxDistanceKm: number;
  preferredProduct: RadarProductId;
  lookbackMinutes: number;
  maxCandidates?: number;
  forceRadarId3?: string | null;
}) {
  const { lat, lon, maxDistanceKm, preferredProduct, lookbackMinutes } = args;
  const MAX_CANDIDATES = clampInt(args.maxCandidates ?? 8, 3, 20);

  const forcedRadarId3 = args.forceRadarId3 ? normalizeRadarSiteId(args.forceRadarId3) : null;
  if (forcedRadarId3) {
    const site = NEXRAD_SITES.find((s) => normalizeRadarSiteId(s.id) === forcedRadarId3);
    const ridge = await fetchRidgeWithProductFallback({
      radarId3: forcedRadarId3,
      preferred: preferredProduct,
      lookbackMinutes,
    });

    if (ridge.tsList.length) {
      return {
        radarId3: forcedRadarId3,
        ridgeProduct: ridge.product,
        tsList: ridge.tsList,
        distanceKm: site ? haversineKm(lat, lon, site.lat, site.lon) : 0,
      };
    }

    return null;
  }

  const candidates = NEXRAD_SITES
    .filter((s) => isFiniteNumber(s.lat) && isFiniteNumber(s.lon))
    .filter((s) => {
      const id = String(s.id ?? '').trim().toUpperCase();
      if (!id || id.length < 3) return false;      // RIDGE is for WSR-88D NEXRAD sites; TDWR identifiers do not provide these scans.
      const owner = String(s.ownerType ?? '').trim().toUpperCase();
      return owner === 'NEXRAD';
    })
    .map((s) => ({ site: s, dKm: haversineKm(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.dKm <= maxDistanceKm)
    .sort((a, b) => a.dKm - b.dKm)
    .slice(0, MAX_CANDIDATES);

  for (const c of candidates) {
    const radarId3 = c.site?.id ? normalizeRadarSiteId(c.site.id) : null;
    if (!radarId3) continue;

    const ridge = await fetchRidgeWithProductFallback({
      radarId3,
      preferred: preferredProduct,
      lookbackMinutes,
    });

    if (ridge.tsList.length) {
      return { radarId3, ridgeProduct: ridge.product, tsList: ridge.tsList, distanceKm: c.dKm };
    }
  }

  return null;
}

/**
 * Build unified frames for the current zoom + center.
 */
export async function resolveIemFrames(args: {
  lat: number;
  lon: number;
  opts: ResolveFramesOpts;
}): Promise<{
  frames: RadarFrameUnified[];
  mode: 'mosaic' | 'ridge';
  debugLabel: string;
  radarId3?: string;
}> {
  const { lat, lon, opts } = args;

  const zoom = Number.isFinite(opts.zoom) ? opts.zoom : 4;
  const maxFrames = clampInt(opts.maxFrames, 4, 36);
  const lookbackMinutes = clampInt(opts.lookbackMinutes, 20, 240);
  const allowMosaicFallback = opts.allowMosaicFallback !== false;

  const stamps = iemNationalMosaicTimestamps();
  const nowBase = Date.now();
  const usableMinutes = Array.from({ length: stamps.length }, (_, i) => (stamps.length - 1 - i) * 5);

  const mosaicFrames: RadarFrameUnified[] = stamps.map((stamp, i) => ({
    iso: new Date(nowBase - usableMinutes[i] * 60_000).toISOString(),
    kind: i === stamps.length - 1 ? 'now' : 'past',
    source: 'iem-mosaic',
    template: iemMosaicTileTemplate(opts.product, stamp),
    maxZ: MOSAIC_MAX_Z,
    label: `Mosaic ${stamp}`,
  }));

  const wantRidge =
    opts.force === 'ridge' ||
    (opts.force !== 'mosaic' && zoom >= opts.ridgeMinZoom && zoom >= Math.max(3, opts.mosaicMaxZoom - 0.25));

  if (!wantRidge) {
    if (!allowMosaicFallback) {
      return { frames: [], mode: 'ridge', debugLabel: `Single-site ${opts.product} unavailable at this zoom` };
    }
    const trimmed = mosaicFrames.slice(Math.max(0, mosaicFrames.length - maxFrames));
    return { frames: trimmed, mode: 'mosaic', debugLabel: `IEM Mosaic · ${opts.product}` };
  }

  try {
    const best = await findBestRidgeRadar({
      lat,
      lon,
      maxDistanceKm: opts.maxLocalDistanceKm,
      preferredProduct: opts.product,
      lookbackMinutes,
      maxCandidates: 10,
      forceRadarId3: opts.forceRadarId3,
    });

    if (!best) {
      if (!allowMosaicFallback) {
        return {
          frames: [],
          mode: 'ridge',
          debugLabel: opts.forceRadarId3
            ? `Single-site ${opts.product} unavailable for ${normalizeRadarSiteId(opts.forceRadarId3)}`
            : `Single-site ${opts.product} unavailable within ${opts.maxLocalDistanceKm} km`,
        };
      }
      const trimmed = mosaicFrames.slice(Math.max(0, mosaicFrames.length - maxFrames));
      return {
        frames: trimmed,
        mode: 'mosaic',
        debugLabel: `IEM Mosaic · ${opts.product} (no ridge radars nearby within ${opts.maxLocalDistanceKm} km)`,
      };
    }

    const keep = best.tsList.slice(Math.max(0, best.tsList.length - maxFrames));
    const latestOnlyIso = new Date().toISOString();

    const ridgeFrames: RadarFrameUnified[] = keep
      .map((ts) => {
        const iso = ts === '0' ? latestOnlyIso : iemTsToIso(ts);
        if (!iso) return null;
        return {
          iso,
          kind: ts === keep[keep.length - 1] ? 'now' : 'past',
          source: 'iem-ridge',
          template: iemRidgeTileTemplate(best.radarId3, best.ridgeProduct, ts),
          maxZ: RIDGE_MAX_Z,
          radarId3: best.radarId3,
          label: ts === '0' ? `RIDGE ${best.radarId3} ${best.ridgeProduct} latest` : `RIDGE ${best.radarId3} ${best.ridgeProduct} ${ts}`,
        } satisfies RadarFrameUnified;
      })
      .filter(Boolean) as RadarFrameUnified[];

    if (!ridgeFrames.length) {
      if (!allowMosaicFallback) {
        return {
          frames: [],
          mode: 'ridge',
          radarId3: best.radarId3,
          debugLabel: `Single-site ${opts.product} unavailable for ${best.radarId3}`,
        };
      }
      const trimmed = mosaicFrames.slice(Math.max(0, mosaicFrames.length - maxFrames));
      return {
        frames: trimmed,
        mode: 'mosaic',
        radarId3: best.radarId3,
        debugLabel: `IEM Mosaic · ${opts.product} · ${best.radarId3} (ridge parse fail)`,
      };
    }

    return {
      frames: ridgeFrames,
      mode: 'ridge',
      radarId3: best.radarId3,
      debugLabel: `IEM RIDGE · ${best.radarId3} · ${best.ridgeProduct} (picked from nearby)`,
    };
  } catch (e: any) {
    if (!allowMosaicFallback) {
      return {
        frames: [],
        mode: 'ridge',
        debugLabel: `Single-site ${opts.product} error: ${String(e?.message ?? e)}`,
      };
    }
    const trimmed = mosaicFrames.slice(Math.max(0, mosaicFrames.length - maxFrames));
    return {
      frames: trimmed,
      mode: 'mosaic',
      debugLabel: `IEM Mosaic · ${opts.product} (ridge error: ${String(e?.message ?? e)})`,
    };
  }
}
