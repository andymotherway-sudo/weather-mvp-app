// app/lib/almanac/recordsCache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'omniwx:records:v5';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function keyFor(stationId: string) {
  return `${KEY_PREFIX}:${stationId}`;
}

export type RecordsCachePayload<T> = {
  savedAt: number; // ms
  ttlMs: number;
  data: T;
};

export async function readRecordsCache<T>(stationId: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(stationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecordsCachePayload<T>;
    if (!parsed?.data || typeof parsed.savedAt !== 'number') return null;

    const ttlMs = typeof parsed.ttlMs === 'number' ? parsed.ttlMs : DEFAULT_TTL_MS;
    const expired = Date.now() - parsed.savedAt > ttlMs;
    if (expired) return null;

    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeRecordsCache<T>(
  stationId: string,
  data: T,
  ttlMs = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const payload: RecordsCachePayload<T> = { savedAt: Date.now(), ttlMs, data };
    await AsyncStorage.setItem(keyFor(stationId), JSON.stringify(payload));
  } catch {
    // ignore cache failures
  }
}

export async function clearRecordsCache(stationId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(stationId));
  } catch {
    // ignore
  }
}