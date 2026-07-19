import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

type RegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

type TropicalLayerData = {
  cones: GeoJsonFeatureCollection;
  forecastTrack: GeoJsonFeatureCollection;
  observedTrack: GeoJsonFeatureCollection;
  forecastPoints: GeoJsonFeatureCollection;
  observedPoints: GeoJsonFeatureCollection;
  watches: GeoJsonFeatureCollection;
  windRadii: GeoJsonFeatureCollection;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
};

const EMPTY_FC: GeoJsonFeatureCollection = { type: 'FeatureCollection', features: [] };

const LAYERS = {
  forecastPoints: 0,
  observedPoints: 1,
  forecastTrack: 2,
  observedTrack: 3,
  cones: 4,
  watches: 5,
  wind34: 7,
  wind50: 8,
  wind64: 9,
} as const;

let tropicalCache: { ts: number; data: Omit<TropicalLayerData, 'loading' | 'error'> } | null = null;

function asFeatureCollection(input: any): GeoJsonFeatureCollection {
  if (input?.type === 'FeatureCollection' && Array.isArray(input.features)) {
    return { type: 'FeatureCollection', features: input.features };
  }
  return EMPTY_FC;
}

function getFeatureDate(feature: any) {
  const props = feature?.properties ?? {};
  const value = props.ADVDATE ?? props.DTG ?? props.ENDDTG ?? props.idp_filedate ?? props.idp_ingestdate;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function normalizeStormLabel(props: any) {
  const name = typeof props?.STORMNAME === 'string' ? props.STORMNAME.trim() : '';
  if (!name) return 'Cyclone';
  const type = typeof props?.TCDVLP === 'string' ? props.TCDVLP.trim() : '';
  if (!type || type.toLowerCase() === name.toLowerCase()) return name;
  return `${name}`;
}

function tropicalBasin(props: any) {
  return String(props?.BASIN ?? props?.basin ?? '').trim().toUpperCase();
}

function classifyTropicalConeFeature(props: any) {
  const basin = tropicalBasin(props);
  if (basin === 'AL' || basin === 'AT' || basin === 'EP' || basin === 'CP') return 'cone';
  return 'danger-area';
}

function decorateFeatureCollection(
  fc: GeoJsonFeatureCollection,
  kind: string | ((props: any) => string),
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((feature, index) => {
      const props = feature?.properties ?? {};
      const omniKind = typeof kind === 'function' ? kind(props) : kind;
      return {
        ...feature,
        id: feature.id ?? `${omniKind}-${props.OBJECTID ?? index}`,
        properties: {
          ...props,
          omniKind,
          omniStormLabel: normalizeStormLabel(props),
          omniBasin: tropicalBasin(props) || null,
          omniMaxWindKt: Number.isFinite(Number(props.MAXWIND ?? props.INTENSITY))
            ? Number(props.MAXWIND ?? props.INTENSITY)
            : null,
          omniGustKt: Number.isFinite(Number(props.GUST)) ? Number(props.GUST) : null,
          omniPressureMb: Number.isFinite(Number(props.MSLP)) ? Number(props.MSLP) : null,
          omniCategory: Number.isFinite(Number(props.SSNUM ?? props.SS)) ? Number(props.SSNUM ?? props.SS) : null,
          omniValidLabel: props.FLDATELBL ?? props.DATELBL ?? props.VALIDTIME ?? props.HHMM ?? null,
          omniUpdatedMs: getFeatureDate(feature),
        },
      };
    }),
  };
}

function mergeCollections(collections: GeoJsonFeatureCollection[], kind: string) {
  return decorateFeatureCollection(
    {
      type: 'FeatureCollection',
      features: collections.flatMap((fc) => fc.features),
    },
    kind,
  );
}

function latestUpdatedAt(collections: GeoJsonFeatureCollection[]) {
  let latest = 0;
  for (const feature of collections.flatMap((fc) => fc.features)) {
    const ms = getFeatureDate(feature);
    if (ms && ms > latest) latest = ms;
  }
  return latest ? new Date(latest).toISOString() : new Date().toISOString();
}

export function useTropicalCycloneLayer(enabled: boolean, _region: RegionLike | null): TropicalLayerData {
  const [data, setData] = useState<TropicalLayerData>(() => ({
    cones: EMPTY_FC,
    forecastTrack: EMPTY_FC,
    observedTrack: EMPTY_FC,
    forecastPoints: EMPTY_FC,
    observedPoints: EMPTY_FC,
    watches: EMPTY_FC,
    windRadii: EMPTY_FC,
    loading: false,
    error: null,
    updatedAt: null,
  }));

  useEffect(() => {
    if (!enabled) return;
    const cached = tropicalCache;
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      setData({ ...cached.data, loading: false, error: null });
      return;
    }

    const ac = new AbortController();
    setData((prev) => ({ ...prev, loading: true, error: null }));

    fetchWithTimeout(apiUrl('/v1/maps/tropical-cyclones'), 16000, { signal: ac.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Tropical cyclone data failed (${res.status})`);
        return res.json();
      })
      .then((json) => {
        const cones = asFeatureCollection(json?.cones);
        const forecastTrack = asFeatureCollection(json?.forecastTrack);
        const observedTrack = asFeatureCollection(json?.observedTrack);
        const forecastPoints = asFeatureCollection(json?.forecastPoints);
        const observedPoints = asFeatureCollection(json?.observedPoints);
        const watches = asFeatureCollection(json?.watches);
        const wind34 = asFeatureCollection(json?.wind34);
        const wind50 = asFeatureCollection(json?.wind50);
        const wind64 = asFeatureCollection(json?.wind64);
        const normalized = {
          cones: decorateFeatureCollection(cones, classifyTropicalConeFeature),
          forecastTrack: decorateFeatureCollection(forecastTrack, 'forecast-track'),
          observedTrack: decorateFeatureCollection(observedTrack, 'observed-track'),
          forecastPoints: decorateFeatureCollection(forecastPoints, 'forecast-point'),
          observedPoints: decorateFeatureCollection(observedPoints, 'observed-point'),
          watches: decorateFeatureCollection(watches, 'watch-warning'),
          windRadii: mergeCollections([wind34, wind50, wind64], 'wind-radii'),
          updatedAt: latestUpdatedAt([cones, forecastTrack, observedTrack, forecastPoints, observedPoints, watches]),
        };
        tropicalCache = { ts: Date.now(), data: normalized };
        setData({ ...normalized, loading: false, error: null });
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setData((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Tropical cyclone data unavailable',
        }));
      });

    return () => ac.abort();
  }, [enabled]);

  return useMemo(() => data, [data]);
}
