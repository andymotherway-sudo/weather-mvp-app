import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type WindVectorRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type WindVectorUnits = 'imperial' | 'metric';

const EMPTY_GEOJSON = {
  type: 'FeatureCollection',
  features: [],
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundTo(n: number, step: number) {
  return Math.round(n / step) * step;
}

function bboxFromRegion(region: WindVectorRegion) {
  const halfLat = Math.max(0.01, region.latitudeDelta / 2);
  const halfLon = Math.max(0.01, region.longitudeDelta / 2);
  return {
    west: clamp(region.longitude - halfLon, -180, 180),
    south: clamp(region.latitude - halfLat, -80, 80),
    east: clamp(region.longitude + halfLon, -180, 180),
    north: clamp(region.latitude + halfLat, -80, 80),
  };
}

function requestKeyFor(region: WindVectorRegion, zoom: number, units: WindVectorUnits) {
  const bbox = bboxFromRegion(region);
  if (bbox.west >= bbox.east || bbox.south >= bbox.north) return null;

  const step = zoom < 5 ? 0.5 : zoom < 8 ? 0.25 : 0.12;
  const roundedZoom = Math.round(zoom * 2) / 2;
  return {
    key: [
      roundTo(bbox.west, step).toFixed(2),
      roundTo(bbox.south, step).toFixed(2),
      roundTo(bbox.east, step).toFixed(2),
      roundTo(bbox.north, step).toFixed(2),
      roundedZoom.toFixed(1),
      units,
    ].join('|'),
    bbox,
    roundedZoom,
  };
}

export function useWindVectorLayer({
  enabled,
  isFocused,
  mapZoom,
  region,
  units,
}: {
  enabled: boolean;
  isFocused: boolean;
  mapZoom: number;
  region: WindVectorRegion | null;
  units: WindVectorUnits;
}) {
  const [geojson, setGeojson] = useState<any>(EMPTY_GEOJSON);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const request = useMemo(() => (region ? requestKeyFor(region, mapZoom, units) : null), [mapZoom, region, units]);
  const requestKey = request?.key ?? null;

  useEffect(() => {
    if (!enabled || !isFocused || !request) return;

    const ac = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      west: request.bbox.west.toFixed(4),
      south: request.bbox.south.toFixed(4),
      east: request.bbox.east.toFixed(4),
      north: request.bbox.north.toFixed(4),
      zoom: String(request.roundedZoom),
      units,
    });

    fetchWithTimeout(apiUrl(`/api/wind/vectors?${params.toString()}`), 12000, { signal: ac.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Wind vectors unavailable (${res.status})`);
        return res.json();
      })
      .then((json) => {
        if (ac.signal.aborted) return;
        setGeojson(json?.geojson?.type === 'FeatureCollection' ? json.geojson : EMPTY_GEOJSON);
        setUpdatedAt(typeof json?.fetchedAt === 'string' ? json.fetchedAt : null);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Wind vectors unavailable');
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
  }, [enabled, isFocused, requestKey, units]);

  return { geojson, loading, error, updatedAt };
}
