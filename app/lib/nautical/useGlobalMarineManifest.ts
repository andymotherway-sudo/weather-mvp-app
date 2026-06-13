import { useEffect, useRef, useState } from 'react';
import {
  fetchGlobalMarineManifest,
  type GlobalMarineAreaSummary,
  type MarineViewport,
} from './globalMarineManifest';

const MANIFEST_MEMORY_TTL_MS = 15 * 60 * 1000;
const MANIFEST_MEMORY_MAX_KEYS = 32;

const manifestMemoryCache = new Map<string, { ts: number; areas: GlobalMarineAreaSummary[] }>();

function rememberManifest(key: string, areas: GlobalMarineAreaSummary[]) {
  manifestMemoryCache.set(key, { ts: Date.now(), areas });
  while (manifestMemoryCache.size > MANIFEST_MEMORY_MAX_KEYS) {
    const oldestKey = manifestMemoryCache.keys().next().value;
    if (!oldestKey) break;
    manifestMemoryCache.delete(oldestKey);
  }
}

function getRememberedManifest(key: string) {
  const cached = manifestMemoryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts > MANIFEST_MEMORY_TTL_MS) {
    manifestMemoryCache.delete(key);
    return null;
  }
  return cached.areas;
}

export function useGlobalMarineManifest(viewport: MarineViewport | null) {
  const [areas, setAreas] = useState<GlobalMarineAreaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = viewport
    ? `${viewport.west.toFixed(1)},${viewport.south.toFixed(1)},${viewport.east.toFixed(1)},${viewport.north.toFixed(
        1,
      )},${Math.floor(viewport.zoom)}`
    : null;

  useEffect(() => {
    if (!viewport) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setAreas([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const cachedAreas = key ? getRememberedManifest(key) : null;
    if (cachedAreas) {
      setAreas(cachedAreas);
      setLoading(false);
      setError(null);
      return;
    }

    debounceRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      (async () => {
        try {
          setLoading(true);
          setError(null);
          const manifest = await fetchGlobalMarineManifest(viewport, { signal: ac.signal });
          if (ac.signal.aborted) return;
          if (key) rememberManifest(key, manifest.areas);
          setAreas(manifest.areas);
        } catch (e: any) {
          if (ac.signal.aborted) return;
          setError(e?.message ?? 'Failed to load global marine areas');
          setAreas([]);
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, 350);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [key]);

  return { areas, loading, error };
}
