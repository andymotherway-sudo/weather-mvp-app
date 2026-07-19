import Constants from 'expo-constants';

export const API_BASE = (
  process.env.EXPO_PUBLIC_OMNIWX_API_BASE ||
  process.env.EXPO_PUBLIC_API_BASE ||
  ((Constants.expoConfig?.extra as any)?.apiBaseUrl as string | undefined) ||
  ''
).replace(/\/+$/, '');

export const API_ENVIRONMENT =
  String((Constants.expoConfig?.extra as any)?.apiEnvironment || process.env.OMNIWX_API_ENV || '').trim() ||
  'development';

export function apiUrl(path: string) {
  if (!API_BASE) throw new Error('Missing EXPO_PUBLIC_API_BASE');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
