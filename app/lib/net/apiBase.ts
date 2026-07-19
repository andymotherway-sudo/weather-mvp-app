import Constants from 'expo-constants';

const BASE = (
  process.env.EXPO_PUBLIC_OMNIWX_API_BASE ||
  process.env.EXPO_PUBLIC_API_BASE ||
  ((Constants.expoConfig?.extra as any)?.apiBaseUrl as string | undefined) ||
  ''
).replace(/\/+$/, '');

export function apiUrl(path: string) {
  if (!BASE) throw new Error('Missing EXPO_PUBLIC_API_BASE');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}
