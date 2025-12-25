import { resolveNearestRadar } from './resolveNearestRadar';

export function getLocalRadarId(lat: number, lon: number): string | null {
  const r = resolveNearestRadar(lat, lon, { maxDistanceKm: 300 });
  return r?.site.id ?? null;
  
}
