import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../net/apiBase';

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: [],
} as const;

export type LightningLayerStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useLightningMapData(enabled: boolean, opts?: { windowMinutes?: 15 | 30; focused?: boolean }) {
  const [geojson, setGeojson] = useState<any>(EMPTY_FEATURE_COLLECTION);
  const [status, setStatus] = useState<LightningLayerStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const windowMinutes = opts?.windowMinutes ?? 15;
  const focused = opts?.focused ?? true;

  const url = useMemo(() => {
    const next = new URL(`${API_BASE}/api/lightning/opc/geojson`);
    next.searchParams.set('window', String(windowMinutes));
    next.searchParams.set('binDegrees', '0.35');
    next.searchParams.set('threshold', '1');
    next.searchParams.set('maxFeatures', '1400');
    return next.toString();
  }, [windowMinutes]);

  useEffect(() => {
    if (!enabled || !focused) {
      setGeojson(EMPTY_FEATURE_COLLECTION);
      setStatus('idle');
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setStatus('loading');
    setError(null);

    fetch(url, { signal: controller.signal, headers: { accept: 'application/geo+json, application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Lightning layer failed (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (controller.signal.aborted) return;
        if (json?.type === 'FeatureCollection' && Array.isArray(json.features)) {
          setGeojson(json);
          setStatus('ready');
        } else {
          throw new Error('Lightning layer returned an invalid GeoJSON payload');
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setGeojson(EMPTY_FEATURE_COLLECTION);
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Lightning layer failed');
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [enabled, focused, url]);

  return {
    geojson,
    status,
    error,
    updatedAt: geojson?.properties?.validTime ?? geojson?.properties?.modified ?? null,
    featureCount: Array.isArray(geojson?.features) ? geojson.features.length : 0,
  };
}
