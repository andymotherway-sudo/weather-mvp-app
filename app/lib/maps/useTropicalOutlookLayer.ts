import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

type TropicalOutlookLayerData = {
  outlooks: GeoJsonFeatureCollection;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
};

const EMPTY_FC: GeoJsonFeatureCollection = { type: 'FeatureCollection', features: [] };
let tropicalOutlookCache: { ts: number; data: Omit<TropicalOutlookLayerData, 'loading' | 'error'> } | null = null;

function asFeatureCollection(input: any): GeoJsonFeatureCollection {
  if (input?.type === 'FeatureCollection' && Array.isArray(input.features)) {
    return { type: 'FeatureCollection', features: input.features };
  }
  return EMPTY_FC;
}

function getFeatureDate(feature: any) {
  const props = feature?.properties ?? {};
  const value = props.idp_filedate ?? props.idp_ingestdate;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function normalizeRiskLabel(value: any) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeProbabilityLabel(value: any) {
  const text = String(value ?? '').trim();
  return text || null;
}

function styleRank(props: any) {
  const risk = String(props?.risk7day ?? props?.risk2day ?? '').trim().toLowerCase();
  if (risk === 'high') return 3;
  if (risk === 'medium') return 2;
  if (risk === 'low') return 1;
  const prob = Number.parseInt(String(props?.prob7day ?? props?.prob2day ?? '').replace(/[^\d]/g, ''), 10);
  if (Number.isFinite(prob)) {
    if (prob >= 60) return 3;
    if (prob >= 40) return 2;
    if (prob > 0) return 1;
  }
  return 0;
}

function labelText(props: any) {
  const prob7 = normalizeProbabilityLabel(props?.prob7day);
  const risk7 = normalizeRiskLabel(props?.risk7day);
  const prob2 = normalizeProbabilityLabel(props?.prob2day);
  const risk2 = normalizeRiskLabel(props?.risk2day);
  if (prob7 || risk7) return [prob7, risk7].filter(Boolean).join(' ');
  if (prob2 || risk2) return [prob2, risk2].filter(Boolean).join(' ');
  return 'Tropical development';
}

function decorateFeatureCollection(fc: GeoJsonFeatureCollection): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.map((feature, index) => {
      const props = feature?.properties ?? {};
      const updatedMs = getFeatureDate(feature);
      return {
        ...feature,
        id: feature.id ?? `tropical-outlook-${props.objectid ?? index}`,
        properties: {
          ...props,
          omniKind: 'development-outlook',
          omniStormLabel: `${String(props?.basin ?? 'Tropical').trim()} development area`,
          omniBasin: String(props?.basin ?? '').trim() || null,
          omniRisk2Day: normalizeRiskLabel(props?.risk2day),
          omniRisk7Day: normalizeRiskLabel(props?.risk7day),
          omniProb2Day: normalizeProbabilityLabel(props?.prob2day),
          omniProb7Day: normalizeProbabilityLabel(props?.prob7day),
          omniLabel: labelText(props),
          omniStyleRank: styleRank(props),
          omniUpdatedMs: updatedMs,
          omniValidLabel: updatedMs ? new Date(updatedMs).toLocaleString() : null,
        },
      };
    }),
  };
}

function latestUpdatedAt(collection: GeoJsonFeatureCollection) {
  let latest = 0;
  for (const feature of collection.features) {
    const ms = getFeatureDate(feature);
    if (ms && ms > latest) latest = ms;
  }
  return latest ? new Date(latest).toISOString() : null;
}

async function fetchOutlookLayer(signal?: AbortSignal) {
  const res = await fetchWithTimeout(apiUrl('/v1/maps/tropical-outlook'), 16000, { signal });
  if (!res.ok) throw new Error(`Tropical outlook layer failed (${res.status})`);
  return decorateFeatureCollection(asFeatureCollection(await res.json()));
}

export function useTropicalOutlookLayer(enabled: boolean): TropicalOutlookLayerData {
  const [data, setData] = useState<TropicalOutlookLayerData>(() => ({
    outlooks: EMPTY_FC,
    loading: false,
    error: null,
    updatedAt: null,
  }));

  useEffect(() => {
    if (!enabled) return;
    const cached = tropicalOutlookCache;
    if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
      setData({ ...cached.data, loading: false, error: null });
      return;
    }

    const ac = new AbortController();
    setData((prev) => ({ ...prev, loading: true, error: null }));

    fetchOutlookLayer(ac.signal)
      .then((outlooks) => {
        const normalized = {
          outlooks,
          updatedAt: latestUpdatedAt(outlooks),
        };
        tropicalOutlookCache = { ts: Date.now(), data: normalized };
        setData({ ...normalized, loading: false, error: null });
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setData((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Tropical outlook data unavailable',
        }));
      });

    return () => ac.abort();
  }, [enabled]);

  return useMemo(() => data, [data]);
}
