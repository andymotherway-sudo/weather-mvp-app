// app/lib/maps/resolveNearestRadar.ts
import { NEXRAD_SITES, type NexradSite } from './nexradSites';

export type NearestRadarResult = {
  site: NexradSite;
  distanceKm: number;
  distanceMi: number;
  bearingDeg: number; // 0..360 from point -> radar
};

export type ResolveNearestRadarOptions = {
  /**
   * If set, returns null when the nearest site is farther than this.
   * Useful for deciding "local radar" vs "regional/national fallback".
   */
  maxDistanceKm?: number;

  /**
   * Provide a custom filter, e.g. (s) => s.ownerType === 'NEXRAD'
   */
  filter?: (site: NexradSite) => boolean;
};

const EARTH_RADIUS_KM = 6371;

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}

function rad2deg(r: number) {
  return (r * 180) / Math.PI;
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

/**
 * Initial bearing from (lat1, lon1) to (lat2, lon2) in degrees [0..360).
 */
function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const φ1 = deg2rad(lat1);
  const φ2 = deg2rad(lat2);
  const λ1 = deg2rad(lon1);
  const λ2 = deg2rad(lon2);

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);

  const θ = Math.atan2(y, x);
  const brng = (rad2deg(θ) + 360) % 360;
  return brng;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function resolveNearestRadar(
  lat: number,
  lon: number,
  opts: ResolveNearestRadarOptions = {}
): NearestRadarResult | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const { maxDistanceKm, filter } = opts;

  let bestSite: NexradSite | null = null;
  let bestDistanceKm = Infinity;

  for (const s of NEXRAD_SITES) {
    // Defensive: ensure the site has valid coordinates
    if (!isFiniteNumber(s.lat) || !isFiniteNumber(s.lon)) continue;
    if (filter && !filter(s)) continue;

    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestDistanceKm) {
      bestDistanceKm = d;
      bestSite = s;
    }
  }

  if (!bestSite || !Number.isFinite(bestDistanceKm)) return null;
  if (isFiniteNumber(maxDistanceKm) && bestDistanceKm > maxDistanceKm) return null;

  const b = bearingDeg(lat, lon, bestSite.lat, bestSite.lon);

  return {
    site: bestSite,
    distanceKm: bestDistanceKm,
    distanceMi: bestDistanceKm * 0.621371,
    bearingDeg: b,
  };
}
