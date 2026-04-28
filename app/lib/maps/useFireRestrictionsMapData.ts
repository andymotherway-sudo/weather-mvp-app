import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type RegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

type FireRestrictionsMapData = {
  geojson: GeoJsonFeatureCollection;
  loading: boolean;
  error: string | null;
};

const EMPTY_FC: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundCoord(value: number, step = 0.1) {
  return Math.round(value / step) * step;
}

function buildViewportEnvelope(region: RegionLike) {
  const halfLat = clamp(region.latitudeDelta * 0.72, 0.5, 12);
  const halfLon = clamp(region.longitudeDelta * 0.72, 0.5, 12);
  const north = clamp(region.latitude + halfLat, -85, 85);
  const south = clamp(region.latitude - halfLat, -85, 85);
  const east = clamp(region.longitude + halfLon, -179.5, 179.5);
  const west = clamp(region.longitude - halfLon, -179.5, 179.5);
  return {
    north: roundCoord(north),
    south: roundCoord(south),
    east: roundCoord(east),
    west: roundCoord(west),
  };
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

export function useFireRestrictionsMapData(enabled: boolean, region: RegionLike | null): FireRestrictionsMapData {
  const [geojson, setGeojson] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envelope = useMemo(() => (region ? buildViewportEnvelope(region) : null), [region]);
  const zoom = useMemo(
    () => (region ? clamp(approxZoomFromLongitudeDelta(region.longitudeDelta), 3, 12) : 5),
    [region],
  );
  const envelopeKey = envelope
    ? `${envelope.west},${envelope.south},${envelope.east},${envelope.north},${zoom}`
    : null;

  useEffect(() => {
    if (!enabled || !envelope) {
      setGeojson(EMPTY_FC);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          west: String(envelope.west),
          south: String(envelope.south),
          east: String(envelope.east),
          north: String(envelope.north),
          zoom: String(zoom),
        });

        const res = await fetchWithTimeout(apiUrl(`/api/fire/restrictions/geojson?${params.toString()}`), 20000, {
          signal: controller.signal,
        });
        const text = await res.text().catch(() => '');

        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        const json = text ? JSON.parse(text) : null;
        const next = Array.isArray(json?.features) ? (json as GeoJsonFeatureCollection) : EMPTY_FC;

        if (!cancelled) setGeojson(next);
      } catch (err: any) {
        if (controller.signal.aborted || cancelled) return;
        setGeojson(EMPTY_FC);
        setError(err?.message ?? 'Restrictions map unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, envelopeKey]);

  return { geojson, loading, error };
}
