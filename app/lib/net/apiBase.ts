const BASE = (process.env.EXPO_PUBLIC_API_BASE || '').replace(/\/+$/, '');

export function apiUrl(path: string) {
  if (!BASE) throw new Error('Missing EXPO_PUBLIC_API_BASE');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}`;
}