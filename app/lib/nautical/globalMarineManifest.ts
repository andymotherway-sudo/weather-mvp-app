import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type GlobalMarineAreaSummary = {
  id: string;
  name: string;
  region: string;
  kind: 'coastal' | 'offshore' | 'high-seas' | 'lake' | 'model';
  center: { lat: number; lon: number };
  bounds?: { west: number; south: number; east: number; north: number };
  sourceLabel: string;
};

export type GlobalMarineManifest = {
  updatedAt: string | null;
  areas: GlobalMarineAreaSummary[];
};

export type MarineViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
  zoom: number;
};

export async function fetchGlobalMarineManifest(
  viewport: MarineViewport,
  opts?: { signal?: AbortSignal },
): Promise<GlobalMarineManifest> {
  const params = new URLSearchParams({
    west: String(viewport.west),
    south: String(viewport.south),
    east: String(viewport.east),
    north: String(viewport.north),
    zoom: String(viewport.zoom),
  });

  const res = await fetchWithTimeout(apiUrl(`/api/marine/areas?${params.toString()}`), 12000, {
    headers: { Accept: 'application/json' },
    signal: opts?.signal,
  });

  if (!res.ok) throw new Error(`Global marine manifest failed: HTTP ${res.status}`);
  const json = await res.json();
  return {
    updatedAt: typeof json?.updatedAt === 'string' ? json.updatedAt : null,
    areas: Array.isArray(json?.areas) ? json.areas : [],
  };
}
