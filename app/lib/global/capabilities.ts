import { useEffect, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

export type GlobalCapabilityProduct =
  | 'land-forecast'
  | 'current-weather'
  | 'air-quality'
  | 'almanac'
  | 'nautical'
  | 'marine-extremes'
  | 'maps-radar'
  | 'maps-satellite'
  | 'alerts'
  | 'space-weather'
  | 'water-stations';

export type GlobalCapability = {
  id: GlobalCapabilityProduct;
  label: string;
  coverage: 'global' | 'regional' | 'us-only' | 'curated-global' | 'mixed';
  source: string;
  endpoint: string;
  ttlSeconds: number;
  staleSeconds: number;
  notes?: string[];
};

export type GlobalCapabilitiesResponse = {
  ok: true;
  version: string;
  generatedAt: string;
  products: GlobalCapability[];
};

export async function fetchGlobalCapabilities(opts?: { signal?: AbortSignal }): Promise<GlobalCapabilitiesResponse> {
  const res = await fetchWithTimeout(apiUrl('/api/global/capabilities'), 9000, {
    headers: { Accept: 'application/json' },
    signal: opts?.signal,
  });
  if (!res.ok) throw new Error(`Global capabilities failed: HTTP ${res.status}`);
  const json = await res.json();
  if (!json?.ok || !Array.isArray(json.products)) throw new Error('Global capabilities response was malformed');
  return json as GlobalCapabilitiesResponse;
}

export function useGlobalCapabilities(enabled = true) {
  const [data, setData] = useState<GlobalCapabilitiesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    fetchGlobalCapabilities({ signal: ac.signal })
      .then((next) => {
        if (!ac.signal.aborted) setData(next);
      })
      .catch((e: any) => {
        if (!ac.signal.aborted) setError(e?.message ?? 'Unable to load global capabilities');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [enabled]);

  return { data, loading, error };
}
