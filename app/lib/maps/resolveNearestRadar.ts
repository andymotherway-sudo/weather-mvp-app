// app/lib/maps/resolveNearestRadar.ts
import { NEXRAD_SITES, type NexradSite } from './nexradSites';

export type NearestRadarResult = {
  site: NexradSite;
  distanceKm: number;
  distanceMi: number;
  bearingDeg: number;
};

export type ResolveNearestRadarOptions = {
  maxDistanceKm?: number;
  filter?: (site: NexradSite) => boolean;
};

const EARTH_RADIUS_KM = 6371;

function deg2rad(d: number) {
  return (d * Math.PI) / 180;
}
function rad2deg(r: number) {
  return (r * 180) / Math.PI;
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Normalize longitude to best match the reference longitude.
 * Handles:
 *  - [-180..180] vs [0..360]
 *  - mistaken sign (e.g. +80 vs -80)
 */
function normalizeLonToReference(lon: number, refLon: number) {
  let candidates = [lon];

  // If it's in 0..360 form, add wrapped form
  if (lon > 180) candidates.push(lon - 360);
  if (lon < -180) candidates.push(lon + 360);

  // If sign might be wrong, try flipping sign
  candidates.push(-lon);

  // Also try wrapped + sign flip combos
  candidates.push(-(lon - 360));
  candidates.push(-(lon + 360));

  // Pick candidate closest to refLon
  let best = candidates[0];
  let bestAbs = Math.abs(best - refLon);
  for (const c of candidates) {
    const a = Math.abs(c - refLon);
    if (a < bestAbs) {
      bestAbs = a;
      best = c;
    }
  }
  return best;
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
  return (rad2deg(θ) + 360) % 360;
}

export function resolveNearestRadar(
  lat: number,
  lon: number,
  opts: ResolveNearestRadarOptions = {},
): NearestRadarResult | null {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (lat < -90 || lat > 90) return null;

  // normalize input lon to [-180..180]
  let lonNorm = lon;
  if (lonNorm > 180) lonNorm -= 360;
  if (lonNorm < -180) lonNorm += 360;

  const { maxDistanceKm, filter } = opts;

  let bestSite: NexradSite | null = null;
  let bestDistanceKm = Infinity;
  let bestBearing = 0;

  for (const s of NEXRAD_SITES) {
    if (!isFiniteNumber(s.lat) || !isFiniteNumber(s.lon)) continue;
    if (filter && !filter(s)) continue;

    const sLon = normalizeLonToReference(s.lon, lonNorm);
    const d = haversineKm(lat, lonNorm, s.lat, sLon);

    if (d < bestDistanceKm) {
      bestDistanceKm = d;
      bestSite = s;
      bestBearing = bearingDeg(lat, lonNorm, s.lat, sLon);
    }
  }

  if (!bestSite || !Number.isFinite(bestDistanceKm)) return null;
  if (isFiniteNumber(maxDistanceKm) && bestDistanceKm > maxDistanceKm) return null;

  return {
    site: bestSite,
    distanceKm: bestDistanceKm,
    distanceMi: bestDistanceKm * 0.621371,
    bearingDeg: bestBearing,
  };
}