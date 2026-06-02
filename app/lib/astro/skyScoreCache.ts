import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

const KEY_PREFIX = 'omniwx:skyScore:v1';

function keyFor(lat: number, lon: number) {
  return `${KEY_PREFIX}:${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export async function primeSkyScoreCache(lat: number, lon: number) {
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) return null;

  try {
    const res = await fetchWithTimeout(
      apiUrl(`/api/astro/inspect?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&hour=0`),
      16000
    );
    if (!res.ok) return null;
    const data = await res.json();
    await AsyncStorage.setItem(keyFor(lat, lon), JSON.stringify({ savedAt: Date.now(), data }));
    return data;
  } catch {
    return null;
  }
}
