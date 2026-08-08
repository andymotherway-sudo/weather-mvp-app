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

type BasicGeoJsonGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

type WildfireMapData = {
  smoke: GeoJsonFeatureCollection;
  perimeters: GeoJsonFeatureCollection;
  incidents: GeoJsonFeatureCollection;
  loading: boolean;
  error: string | null;
};

const EMPTY_FC: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function emptyState(): WildfireMapData {
  return {
    smoke: EMPTY_FC,
    perimeters: EMPTY_FC,
    incidents: EMPTY_FC,
    loading: false,
    error: null,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundCoord(value: number, step = 0.1) {
  return Math.round(value / step) * step;
}

function buildViewportEnvelope(region: RegionLike) {
  const halfLat = clamp(region.latitudeDelta * 0.9, 0.75, 8);
  const halfLon = clamp(region.longitudeDelta * 0.9, 0.75, 8);
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

function signedAreaLonLat(ring: number[][]) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function isOuterRing(ring: number[][]) {
  return signedAreaLonLat(ring) > 0;
}

function normalizeClosedRing(ring: number[][]): number[][] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function ringsToGeoJsonGeometry(rings: number[][][]): BasicGeoJsonGeometry | null {
  const cleaned = rings
    .map((ring) => normalizeClosedRing(ring))
    .filter((ring) => Array.isArray(ring) && ring.length >= 4);

  if (!cleaned.length) return null;

  const outers: number[][][] = [];
  const holes: number[][][] = [];
  for (const ring of cleaned) {
    if (isOuterRing(ring)) outers.push(ring);
    else holes.push(ring);
  }

  if (!outers.length) {
    const [first, ...rest] = cleaned;
    return { type: 'Polygon', coordinates: [first, ...rest] };
  }

  if (outers.length === 1) {
    return { type: 'Polygon', coordinates: [outers[0], ...holes] };
  }

  const polygons: number[][][][] = [];
  let current: number[][][] | null = null;
  for (const ring of cleaned) {
    if (isOuterRing(ring)) {
      if (current) polygons.push(current);
      current = [ring];
    } else if (current) {
      current.push(ring);
    }
  }
  if (current) polygons.push(current);

  return {
    type: 'MultiPolygon',
    coordinates: polygons,
  };
}

function asFeatureCollection(features: any[]): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.filter(Boolean),
  };
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function geometryToGeoJson(geometry: any): BasicGeoJsonGeometry | null {
  if (!geometry) return null;
  if (typeof geometry.x === 'number' && typeof geometry.y === 'number') {
    return { type: 'Point', coordinates: [geometry.x, geometry.y] };
  }
  if (Array.isArray(geometry?.rings)) {
    return ringsToGeoJsonGeometry(geometry.rings);
  }
  if (Array.isArray(geometry?.paths)) {
    const paths = geometry.paths.filter((path: any) => Array.isArray(path) && path.length >= 2);
    if (!paths.length) return null;
    return paths.length === 1
      ? { type: 'LineString', coordinates: paths[0] }
      : { type: 'MultiLineString', coordinates: paths };
  }
  return null;
}

function smokeDensityMeta(rawDensity: unknown) {
  const density = String(rawDensity ?? '').toLowerCase();
  if (density.includes('heavy') || density.includes('thick')) {
    return {
      densityCategory: 'Heavy smoke',
      densityRank: 3,
      fillColor: 'rgba(100,116,139,0.30)',
      lineColor: 'rgba(226,232,240,0.58)',
      chipColor: 'rgba(100,116,139,0.9)',
    };
  }
  if (density.includes('medium') || density.includes('moderate')) {
    return {
      densityCategory: 'Medium smoke',
      densityRank: 2,
      fillColor: 'rgba(148,163,184,0.22)',
      lineColor: 'rgba(203,213,225,0.52)',
      chipColor: 'rgba(148,163,184,0.9)',
    };
  }
  return {
    densityCategory: 'Light smoke',
    densityRank: 1,
    fillColor: 'rgba(251,191,36,0.16)',
    lineColor: 'rgba(253,224,71,0.44)',
    chipColor: 'rgba(245,158,11,0.92)',
  };
}

function incidentMarkerMeta(acres: number | null) {
  if (acres == null) {
    return {
      markerRadius: 9,
      markerHaloRadius: 15,
      markerColor: '#fda4af',
      markerHaloColor: 'rgba(251,113,133,0.26)',
      markerStrokeColor: 'rgba(255,255,255,0.92)',
      markerStrokeWidth: 1.8,
      markerCenterRadius: 3,
    };
  }
  if (acres >= 50000) {
    return {
      markerRadius: 15,
      markerHaloRadius: 24,
      markerColor: '#dc2626',
      markerHaloColor: 'rgba(220,38,38,0.32)',
      markerStrokeColor: 'rgba(255,245,245,0.96)',
      markerStrokeWidth: 2.2,
      markerCenterRadius: 5,
    };
  }
  if (acres >= 10000) {
    return {
      markerRadius: 13,
      markerHaloRadius: 21,
      markerColor: '#ea580c',
      markerHaloColor: 'rgba(234,88,12,0.30)',
      markerStrokeColor: 'rgba(255,247,237,0.94)',
      markerStrokeWidth: 2,
      markerCenterRadius: 4.5,
    };
  }
  if (acres >= 1000) {
    return {
      markerRadius: 11,
      markerHaloRadius: 18,
      markerColor: '#fb923c',
      markerHaloColor: 'rgba(251,146,60,0.28)',
      markerStrokeColor: 'rgba(255,247,237,0.94)',
      markerStrokeWidth: 1.9,
      markerCenterRadius: 4,
    };
  }
  return {
    markerRadius: 10,
    markerHaloRadius: 16,
    markerColor: '#fdba74',
    markerHaloColor: 'rgba(253,186,116,0.24)',
    markerStrokeColor: 'rgba(255,251,235,0.92)',
    markerStrokeWidth: 1.8,
    markerCenterRadius: 3.5,
  };
}

function normalizeWildfireSmoke(features: any[]) {
  return asFeatureCollection(
    features.map((feature: any, idx: number) => {
      const geometry = geometryToGeoJson(feature?.geometry);
      if (!geometry) return null;
      const attrs = feature?.attributes ?? {};
      const densityValue =
        attrs?.Density ??
        attrs?.density ??
        attrs?.SMOKE_DENSITY ??
        attrs?.SmokeDensity ??
        attrs?.DensityText ??
        null;
      const meta = smokeDensityMeta(densityValue);
      return {
        type: 'Feature',
        id: feature?.attributes?.OBJECTID ?? `wildfire-smoke-${idx}`,
        geometry,
        properties: {
          ...(attrs ?? {}),
          densityCategory: meta.densityCategory,
          densityRank: meta.densityRank,
          fillColor: meta.fillColor,
          lineColor: meta.lineColor,
          chipColor: meta.chipColor,
        },
      };
    })
  );
}

function normalizeWildfirePerimeters(features: any[]) {
  return asFeatureCollection(
    features.map((feature: any, idx: number) => {
      const geometry = geometryToGeoJson(feature?.geometry);
      if (!geometry) return null;
      const attrs = feature?.attributes ?? {};
      const incidentName =
        asString(attrs?.IncidentName) ??
        asString(attrs?.poly_IncidentName) ??
        asString(attrs?.Label) ??
        'Wildfire';
      const acres =
        asNumber(attrs?.GISAcres) ??
        asNumber(attrs?.DailyAcres) ??
        asNumber(attrs?.CalculatedAcres) ??
        asNumber(attrs?.poly_GISAcres) ??
        asNumber(attrs?.attr_IncidentSize);
      return {
        type: 'Feature',
        id: attrs?.OBJECTID ?? `wildfire-perimeter-${idx}`,
        geometry,
        properties: {
          ...(attrs ?? {}),
          incidentName,
          acres,
          hasPerimeter: true,
        },
      };
    })
  );
}

function perimeterDedupKey(feature: any) {
  const props = feature?.properties ?? {};
  const rawName =
    asString(props?.incidentName) ??
    asString(props?.IncidentName) ??
    asString(props?.poly_IncidentName) ??
    asString(props?.Label);
  const name = rawName
    ? rawName
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\b(fire|wildfire|incident)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : null;
  const geom = feature?.geometry;
  const firstRing =
    geom?.type === 'Polygon'
      ? geom.coordinates?.[0]
      : geom?.type === 'MultiPolygon'
        ? geom.coordinates?.[0]?.[0]
        : null;
  const firstCoord = Array.isArray(firstRing) ? firstRing[0] : null;
  const coordKey =
    Array.isArray(firstCoord) && firstCoord.length >= 2
      ? `${Number(firstCoord[0]).toFixed(3)},${Number(firstCoord[1]).toFixed(3)}`
      : String(feature?.id ?? '');
  return `${name ?? 'unnamed'}|${coordKey}`;
}

function mergePerimeterCollections(...collections: GeoJsonFeatureCollection[]) {
  const seen = new Set<string>();
  const features: any[] = [];
  for (const collection of collections) {
    for (const feature of collection.features ?? []) {
      const key = perimeterDedupKey(feature);
      if (seen.has(key)) continue;
      seen.add(key);
      features.push(feature);
    }
  }
  return asFeatureCollection(features);
}

function normalizeWildfireIncidents(features: any[]) {
  return asFeatureCollection(
    features.map((feature: any, idx: number) => {
      const geometry = geometryToGeoJson(feature?.geometry);
      if (!geometry || geometry.type !== 'Point') return null;
      const attrs = feature?.attributes ?? {};
      const incidentName =
        asString(attrs?.IncidentName) ??
        asString(attrs?.poly_IncidentName) ??
        asString(attrs?.Label) ??
        asString(attrs?.ComplexName) ??
        'Wildfire';
      const acres =
        asNumber(attrs?.DailyAcres) ??
        asNumber(attrs?.GISAcres) ??
        asNumber(attrs?.CalculatedAcres) ??
        asNumber(attrs?.IncidentSize) ??
        asNumber(attrs?.poly_GISAcres);
      const marker = incidentMarkerMeta(acres);
      return {
        type: 'Feature',
        id:
          attrs?.IrwinID ??
          attrs?.UniqueFireIdentifier ??
          attrs?.OBJECTID ??
          `${incidentName}-${idx}`.replace(/\s+/g, '-').toLowerCase(),
        geometry,
        properties: {
          ...(attrs ?? {}),
          incidentName,
          acres,
          ...marker,
        },
      };
    })
  );
}

async function fetchGlobalHotspots(envelope: { west: number; south: number; east: number; north: number }, signal: AbortSignal) {
  const url = apiUrl(
    `/api/fire/hotspots?west=${encodeURIComponent(String(envelope.west))}&south=${encodeURIComponent(String(envelope.south))}&east=${encodeURIComponent(String(envelope.east))}&north=${encodeURIComponent(String(envelope.north))}&days=1`,
  );
  const res = await fetchWithTimeout(url, 15000, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Global hotspots failed (${res.status})`);
  const json = await res.json().catch(() => null);
  return asFeatureCollection(Array.isArray(json?.features) ? json.features : []);
}

export function useWildfireMapData(enabled: boolean, region: RegionLike | null) {
  const [smoke, setSmoke] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [perimeters, setPerimeters] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [incidents, setIncidents] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envelope = useMemo(() => (region ? buildViewportEnvelope(region) : null), [region]);
  const envelopeKey = envelope
    ? `${envelope.west},${envelope.south},${envelope.east},${envelope.north}`
    : null;

  useEffect(() => {
    if (!enabled || !envelope) {
      setSmoke(EMPTY_FC);
      setPerimeters(EMPTY_FC);
      setIncidents(EMPTY_FC);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      const shared = {
        where: '1=1',
        geometry: `${envelope.west},${envelope.south},${envelope.east},${envelope.north}`,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
        outSR: '4326',
        returnGeometry: 'true',
        f: 'pjson',
      } satisfies Record<string, string>;

      try {
        const wildfireUrl = apiUrl(
          `/v1/maps/wildfire?west=${encodeURIComponent(String(envelope.west))}` +
            `&south=${encodeURIComponent(String(envelope.south))}` +
            `&east=${encodeURIComponent(String(envelope.east))}` +
            `&north=${encodeURIComponent(String(envelope.north))}` +
            `&payload=v3`,
        );
        const [wildfireRes, hotspotsRes] = await Promise.allSettled([
          fetchWithTimeout(wildfireUrl, 15000, { signal: controller.signal, headers: { Accept: 'application/json' } }).then(async (res) => {
            if (!res.ok) throw new Error(`Wildfire data failed (${res.status})`);
            return res.json().catch(() => null);
          }),
          fetchGlobalHotspots(envelope, controller.signal),
        ]);

        if (cancelled) return;

        const wildfireJson = wildfireRes.status === 'fulfilled' ? wildfireRes.value : null;
        setSmoke(
          wildfireJson && Array.isArray(wildfireJson?.smoke)
            ? normalizeWildfireSmoke(wildfireJson.smoke)
            : EMPTY_FC,
        );
        const wfigsPerimeters =
          wildfireJson && Array.isArray(wildfireJson?.wfigsPerimeters)
            ? normalizeWildfirePerimeters(wildfireJson.wfigsPerimeters)
            : EMPTY_FC;
        const usaPerimeters =
          wildfireJson && Array.isArray(wildfireJson?.usaPerimeters)
            ? normalizeWildfirePerimeters(wildfireJson.usaPerimeters)
            : EMPTY_FC;
        setPerimeters(mergePerimeterCollections(usaPerimeters, wfigsPerimeters));
        const incidentsFc =
          wildfireJson && Array.isArray(wildfireJson?.incidents)
            ? normalizeWildfireIncidents(wildfireJson.incidents)
            : EMPTY_FC;
        const hotspotsFc = hotspotsRes.status === 'fulfilled' ? hotspotsRes.value : EMPTY_FC;
        setIncidents(asFeatureCollection([...incidentsFc.features, ...hotspotsFc.features]));

        const failures = [
          wildfireRes.status === 'rejected'
            ? `Wildfire overlays: ${String(wildfireRes.reason?.message ?? wildfireRes.reason)}`
            : null,
          hotspotsRes.status === 'rejected'
            ? `Hotspots: ${String(hotspotsRes.reason?.message ?? hotspotsRes.reason)}`
            : null,
        ].filter(Boolean);

        setError(failures.length ? failures.join(' / ') : null);
      } catch (err: any) {
        if (!cancelled) {
          setSmoke(EMPTY_FC);
          setPerimeters(EMPTY_FC);
          setIncidents(EMPTY_FC);
          setError(String(err?.message ?? err ?? 'Wildfire data unavailable'));
        }
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

  return { smoke, perimeters, incidents, loading, error };
}
