import { markAlmanacAreaDownloaded } from '../almanac/downloadManifest';
import { primeSkyScoreCache } from '../astro/skyScoreCache';
import { primeClimatologyCache } from '../climatology/hook';

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function warmFavoriteLocationCaches(lat: number, lon: number) {
  if (!finite(lat) || !finite(lon)) return;

  const [climo] = await Promise.all([
    primeClimatologyCache(lat, lon),
    primeSkyScoreCache(lat, lon),
  ]);

  if (climo) {
    await markAlmanacAreaDownloaded(lat, lon).catch(() => {});
  }
}
