// app/lib/climatology/station.ts
import { nceiStations } from '../climatology/ncei';
import type { StationCandidate } from './types';
import { ClimoError } from './types';

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

/**
 * Find the nearest station that supports NORMAL_MLY near (lat, lon).
 * Uses CDO /stations with datasetid=NORMAL_MLY + extent bounding box.
 *
 * NOTE: Requires NOAA token (NCEI CDO API).
 */
export async function findNearestNormalsStation(
  lat: number,
  lon: number,
  token?: string,
  signal?: AbortSignal
): Promise<StationCandidate> {
  if (!token) throw new ClimoError('NO_TOKEN', 'NOAA token is required for station lookup.');

  // ~2 degree box (big enough to usually catch multiple stations)
  const d = 2.0;
  const extent = `${lat - d},${lon - d},${lat + d},${lon + d}`;

  const json = await nceiStations(
    {
      datasetid: 'NORMAL_MLY',
      extent,
      limit: 1000,
      // optional: offset could be used if you want pagination later
    },
    token,
    signal
  );

  const results = (json?.results ?? []) as any[];
  if (!results.length) {
    throw new ClimoError('STATION_NOT_FOUND', 'No normals stations found near this location.', { extent });
  }

  // Pick closest by actual distance
  let best: StationCandidate | null = null;
  let bestKm = Number.POSITIVE_INFINITY;

  for (const r of results) {
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
        elevation: Number.isFinite(Number(r.elevation)) ? Number(r.elevation) : undefined,
      };
    }
  }

  if (!best) {
    throw new ClimoError('STATION_NOT_FOUND', 'No usable station candidates returned by NOAA.');
  }

  return best;
}
