// app/lib/maps/radarIem.ts
// IEM radar helpers (mosaic + local RIDGE).
// This file returns COMPLETE {z}/{x}/{y} tile templates that MapLibre can consume.

export type RadarScan = { iso: string; stamp: string };

type ResolveOpts = {
  zoom: number;
  product: 'N0Q' | 'N0B' | 'N0Z';
  localMinZoom: number;
  maxLocalDistanceKm: number;
  nationalTimestamp: string; // e.g. "900913-m05m" or "900913"
};

export type RadarLayerChoice = {
  provider: 'iem-mosaic' | 'iem-ridge' | 'rainviewer';
  tier: 'national' | 'local';
  maxTileZoom: number;
  tileUrl: string;
  debugLabel: string;
  radarIcao?: string;
};

const IEM_TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0';

// Tune these:
// - Mosaic: cap lower to reduce request fan-out (helps 503s a LOT)
// - Ridge: allow a bit higher so it doesn’t look blocky when you zoom in locally
const MOSAIC_MAX_Z = 7;
const RIDGE_MAX_Z = 9;

// IEM national mosaic "minutes ago" availability is commonly 0..50m in 5m steps.
const DEFAULT_MOSAIC_MINUTES = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];

function minutesToStamp(minutesAgo: number) {
  if (minutesAgo <= 0) return '900913';
  return `900913-m${String(minutesAgo).padStart(2, '0')}m`;
}

export function iemNationalMosaicTimestamps() {
  return DEFAULT_MOSAIC_MINUTES.map(minutesToStamp); // Oldest -> newest
}

function iemMosaicTileTemplate(product: 'N0Q' | 'N0B' | 'N0Z', stamp: string) {
  const p = product.toLowerCase(); // n0q/n0b/n0z
  const layer = `nexrad-${p}-${stamp}`;
  return `${IEM_TILE_BASE}/${layer}/{z}/{x}/{y}.png`;
}

function iemRidgeTileTemplate(radarIcao: string, product: 'N0Q' | 'N0B' | 'N0Z') {
  const layer = `ridge::${radarIcao}-${product}-0`;
  return `${IEM_TILE_BASE}/${layer}/{z}/{x}/{y}.png`;
}

type RadarSite = { icao: string; lat: number; lon: number };

// (same RADAR_SITES list as you already have)
const RADAR_SITES: RadarSite[] = [
  { icao: 'KSOX', lat: 33.817, lon: -117.636 },
  { icao: 'KVTX', lat: 34.412, lon: -119.179 },
  { icao: 'KDAX', lat: 38.501, lon: -121.678 },
  { icao: 'KMUX', lat: 37.155, lon: -121.898 },
  { icao: 'KHNX', lat: 36.314, lon: -119.632 },
  { icao: 'KLGX', lat: 47.116, lon: -124.107 },
  { icao: 'KATX', lat: 48.195, lon: -122.495 },
  { icao: 'KRTX', lat: 45.715, lon: -122.965 },
  { icao: 'KOTX', lat: 47.681, lon: -117.626 },
  { icao: 'KRGX', lat: 39.754, lon: -119.462 },
  { icao: 'KFSX', lat: 34.574, lon: -111.198 },
  { icao: 'KIWA', lat: 33.289, lon: -111.67 },
  { icao: 'KEMX', lat: 31.893, lon: -110.63 },
  { icao: 'KFTG', lat: 39.786, lon: -104.545 },
  { icao: 'KPUX', lat: 38.459, lon: -104.181 },

  { icao: 'KTLX', lat: 35.333, lon: -97.278 },
  { icao: 'KFDR', lat: 34.362, lon: -98.976 },
  { icao: 'KINX', lat: 36.175, lon: -95.564 },
  { icao: 'KICT', lat: 37.654, lon: -97.443 },
  { icao: 'KTWX', lat: 38.996, lon: -96.233 },
  { icao: 'KDMX', lat: 41.731, lon: -93.723 },
  { icao: 'KMPX', lat: 44.849, lon: -93.565 },

  { icao: 'KHGX', lat: 29.471, lon: -95.079 },
  { icao: 'KSRX', lat: 35.29, lon: -94.362 },
  { icao: 'KLIX', lat: 30.337, lon: -89.825 },
  { icao: 'KTLH', lat: 30.397, lon: -84.329 },
  { icao: 'KTBW', lat: 27.705, lon: -82.402 },

  { icao: 'KILN', lat: 39.42, lon: -83.822 },
  { icao: 'KLOT', lat: 41.604, lon: -88.085 },
  { icao: 'KDTX', lat: 42.7, lon: -83.471 },
  { icao: 'KPBZ', lat: 40.532, lon: -80.218 },
  { icao: 'KDIX', lat: 39.947, lon: -74.411 },
  { icao: 'KOKX', lat: 40.865, lon: -72.864 },
  { icao: 'KBOX', lat: 41.956, lon: -71.137 },
  { icao: 'KCLX', lat: 32.656, lon: -81.042 },
  { icao: 'KJAX', lat: 30.485, lon: -81.702 },
];

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function findNearestRadar(lat: number, lon: number): { site: RadarSite; distanceKm: number } | null {
  let best: RadarSite | null = null;
  let bestD = Infinity;

  for (const s of RADAR_SITES) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }

  if (!best || !Number.isFinite(bestD)) return null;
  return { site: best, distanceKm: bestD };
}

/**
 * Decide radar layer:
 * - Default: IEM Mosaic timeline
 * - Upgrade: at high zoom on LATEST frame only (stamp === "900913"), swap to nearest RIDGE radar.
 */
export function resolveRadarLayer(lat: number, lon: number, opts: ResolveOpts): RadarLayerChoice {
  const zoom = Number.isFinite(opts.zoom) ? opts.zoom : 4;
  const stamp = opts.nationalTimestamp || '900913';

  const wantsLocal = zoom >= opts.localMinZoom;
  const isLatestFrame = stamp === '900913';

  if (wantsLocal && isLatestFrame) {
    const nearest = findNearestRadar(lat, lon);
    if (nearest && nearest.distanceKm <= opts.maxLocalDistanceKm) {
      const radarIcao = nearest.site.icao;
      return {
        provider: 'iem-ridge',
        tier: 'local',
        maxTileZoom: RIDGE_MAX_Z,
        tileUrl: iemRidgeTileTemplate(radarIcao, opts.product),
        radarIcao,
        debugLabel: `IEM RIDGE · ${radarIcao} · ${opts.product} · ${nearest.distanceKm.toFixed(0)}km`,
      };
    }
  }

  return {
    provider: 'iem-mosaic',
    tier: wantsLocal ? 'local' : 'national',
    maxTileZoom: MOSAIC_MAX_Z,
    tileUrl: iemMosaicTileTemplate(opts.product, stamp),
    debugLabel: `IEM Mosaic · ${opts.product} · ${stamp}`,
  };
}

export async function fetchRainViewerFrames(): Promise<RadarScan[]> {
  return [];
}

export async function buildRainViewerTileUrlForFrame(
  _framePath: string,
): Promise<{ tileUrl: string; providerLabel: string }> {
  throw new Error('RainViewer is not wired in MapLibre-first mode yet.');
}
