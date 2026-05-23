import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'omniwx:almanac:downloadedAreas:v1';

export function almanacAreaKey(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

async function readKeys() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export async function isAlmanacAreaDownloaded(lat: number, lon: number) {
  const key = almanacAreaKey(lat, lon);
  const keys = await readKeys();
  return keys.includes(key);
}

export async function markAlmanacAreaDownloaded(lat: number, lon: number) {
  const key = almanacAreaKey(lat, lon);
  const keys = await readKeys();
  if (keys.includes(key)) return;

  const next = [key, ...keys].slice(0, 80);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // best-effort metadata only; the real data caches still own the content
  }
}
