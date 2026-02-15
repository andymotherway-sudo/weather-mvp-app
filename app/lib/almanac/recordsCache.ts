// app/lib/almanac/recordsCache.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Records cache:
 * - keyed by stationId + year window + algorithm version
 * - stores metadata so we can validate and avoid "old station" collisions
 */
const KEY_PREFIX = 'omniwx:records:v10';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function keyFor(parts: string[]) {
  return `${KEY_PREFIX}:${parts.join(':')}`;
}

export type RecordsCacheMeta = {
  stationId: string;
  stationName?: string | null;
  yearFrom: number;
  yearTo: number;
  algoVersion: string; // bump if logic changes
};

export type RecordsCachePayload<T> = {
  savedAt: number; // ms
  ttlMs: number;
  meta: RecordsCacheMeta;
  data: T;
};

export function makeRecordsCacheKey(opts: {
  stationId: string;
  yearFrom: number;
  yearTo: number;
  algoVersion: string;
}) {
  const { stationId, yearFrom, yearTo, algoVersion } = opts;
  // keep it stable + easy to inspect
  return keyFor([`station=${stationId}`, `y=${yearFrom}-${yearTo}`, `algo=${algoVersion}`]);
}

export async function readRecordsCache<T>(cacheKey: string): Promise<RecordsCachePayload<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as RecordsCachePayload<T>;
    if (!parsed?.data || typeof parsed.savedAt !== 'number' || !parsed?.meta) return null;

    const ttlMs = typeof parsed.ttlMs === 'number' ? parsed.ttlMs : DEFAULT_TTL_MS;
    const expired = Date.now() - parsed.savedAt > ttlMs;
    if (expired) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function writeRecordsCache<T>(
  cacheKey: string,
  meta: RecordsCacheMeta,
  data: T,
  ttlMs = DEFAULT_TTL_MS
): Promise<void> {
  try {
    const payload: RecordsCachePayload<T> = { savedAt: Date.now(), ttlMs, meta, data };
    await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
  } catch {
    // ignore cache failures
  }
}

export async function clearRecordsCache(cacheKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(cacheKey);
  } catch {
    // ignore
  }
}