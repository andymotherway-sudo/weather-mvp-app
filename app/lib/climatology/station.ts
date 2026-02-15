// app/lib/climatology/station.ts
import { nceiData, nceiStations } from './ncei';
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

function isAbortError(err: any) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('abort'))
  );
}

/**
 * Validate that a station actually returns NORMAL_MLY rows for core temp normals.
 * We probe a small 1-year window; dataset returns monthly normals.
 */
async function stationHasTempNormals(stationId: string, token: string, signal?: AbortSignal): Promise<boolean> {
  // a harmless placeholder year
  const startdate = '2010-01-01';
  const enddate = '2010-12-31';

  try {
    const json = await nceiData(
      {
        datasetid: 'NORMAL_MLY',
        stationid: stationId,
        startdate,
        enddate,
        datatypeid: 'MLY-TAVG-NORMAL',
        limit: 5,
      },
      token,
      signal
    );

    const results = (json?.results ?? []) as any[];
    return results.length > 0;
  } catch (e: any) {
    // If aborted, bubble up
    if (isAbortError(e) || signal?.aborted) throw e;

    // Treat other errors as "no" so we can try next candidate
    return false;
  }
}

/**
 * Find the nearest station that actually supports usable NORMAL_MLY temp normals
 * near (lat, lon). Uses CDO /stations with datasetid=NORMAL_MLY + extent bounding box,
 * then validates candidates with a cheap /data probe so we don't pick "phantom" stations.
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

  // Expand search outward if needed (some metros have sparse NORMAL_MLY coverage)
  const rings = [1.5, 2.5, 4.0, 6.0]; // degrees (~165km, 275km, 440km, 660km)
  const limit = 1000;

  for (const d of rings) {
    const extent = `${lat - d},${lon - d},${lat + d},${lon + d}`;

    const json = await nceiStations(
      {
        datasetid: 'NORMAL_MLY',
        extent,
        limit,
      },
      token,
      signal
    );

    const results = (json?.results ?? []) as any[];
    if (!results.length) continue;

    // Build and sort candidates by distance
    const candidates: Array<StationCandidate & { km: number }> = [];

    for (const r of results) {
      const la = Number(r.latitude);
      const lo = Number(r.longitude);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) continue;

      const km = haversineKm(lat, lon, la, lo);
      candidates.push({
        id: r.id,
        name: r.name,
        latitude: la,
        longitude: lo,
        elevation: Number.isFinite(Number(r.elevation)) ? Number(r.elevation) : undefined,
        km,
      });
    }

    candidates.sort((a, b) => a.km - b.km);

    // Validate the nearest few first (fast)
    const MAX_VALIDATE = 12;

    for (let i = 0; i < Math.min(MAX_VALIDATE, candidates.length); i++) {
      if (signal?.aborted) {
        const ae: any = new Error('Aborted');
        ae.name = 'AbortError';
        throw ae;
      }

      const c = candidates[i];
      const ok = await stationHasTempNormals(c.id, token, signal);
      if (ok) {
        // strip km before returning
        const { km, ...station } = c;
        return station;
      }
    }

    // If none of the nearest validated, try next ring
  }

  throw new ClimoError(
    'STATION_NOT_FOUND',
    'No usable normals stations found near this location.',
    { lat, lon }
  );
}