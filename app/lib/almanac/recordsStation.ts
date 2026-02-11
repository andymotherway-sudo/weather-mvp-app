// app/lib/almanac/recordsStation.ts
import { nceiStations } from '../climatology/ncei';
import type { StationCandidate } from '../climatology/types';
import { ClimoError } from '../climatology/types';

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function looksLikeAirport(name?: string) {
  if (!name) return false;
  const n = name.toUpperCase();
  return (
    n.includes('INTL') ||
    n.includes('INTERNATIONAL') ||
    n.includes('AIRPORT') ||
    n.endsWith(' AP') ||
    n.includes(' AFB')
  );
}

/**
 * Find nearest major airport climate station for official records.
 * Dataset: GHCND (daily observations)
 */
export async function findNearestClimateAirportStation(
  lat: number,
  lon: number,
  token?: string,
  signal?: AbortSignal
): Promise<StationCandidate> {
  if (!token) {
    throw new ClimoError('NO_TOKEN', 'NOAA token is required for records lookup.');
  }

  const d = 3.0;
  const extent = `${lat - d},${lon - d},${lat + d},${lon + d}`;

  const json = await nceiStations(
    {
      datasetid: 'GHCND',
      extent,
      limit: 1000,
    },
    token,
    signal
  );

  const results = (json?.results ?? []) as any[];
  if (!results.length) {
    throw new ClimoError('STATION_NOT_FOUND', 'No climate stations found near this location.');
  }

  let best: StationCandidate | null = null;
  let bestKm = Infinity;

  for (const r of results) {
    if (!looksLikeAirport(r.name)) continue;

    const la = Number(r.latitude);
    const lo = Number(r.longitude);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;

    const km = haversineKm(lat, lon, la, lo);
    if (km < bestKm) {
      bestKm = km;
      best = {
        id: r.id,
        name: r.name,
        latitude: la,
        longitude: lo,
        elevation: Number.isFinite(Number(r.elevation))
          ? Number(r.elevation)
          : undefined,
      };
    }
  }

  if (!best) {
    throw new ClimoError(
      'STATION_NOT_FOUND',
      'No suitable airport climate station found nearby.'
    );
  }

  return best;
}