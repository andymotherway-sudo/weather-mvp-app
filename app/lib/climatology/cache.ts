// app/lib/climatology/cache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClimatologyResult } from './types';

// ✅ bump cache version so we can add new fields safely
const KEY_PREFIX = 'omniwx:climo:v2';

function keyFor(lat: number, lon: number) {
  const la = lat.toFixed(3);
  const lo = lon.toFixed(3);
  return `${KEY_PREFIX}:${la},${lo}`;
}

export async function readClimoCache(lat: number, lon: number): Promise<ClimatologyResult | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(lat, lon));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as ClimatologyResult;

    // ultra-light validation so bad cache doesn’t crash downstream
    if (!parsed || !parsed.station || !Array.isArray(parsed.normals) || !parsed.fetchedAtIso) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function writeClimoCache(lat: number, lon: number, data: ClimatologyResult): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(lat, lon), JSON.stringify(data));
  } catch {
    // ignore cache failures
  }
}

export async function clearClimoCache(lat: number, lon: number): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(lat, lon));
  } catch {
    // ignore
  }
}