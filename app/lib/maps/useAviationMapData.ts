import { useEffect, useMemo, useState } from 'react';

import { fetchWithTimeout } from '../net/fetchWithTimeout';

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

const EMPTY_FC: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const AWC_BASE = 'https://aviationweather.gov/api/data';

function asFeatureCollection(input: any): GeoJsonFeatureCollection {
  if (input?.type === 'FeatureCollection' && Array.isArray(input?.features)) {
    return {
      type: 'FeatureCollection',
      features: input.features.filter(Boolean),
    };
  }

  return EMPTY_FC;
}

function normalizeFeatureCollection(input: any, tag: string): GeoJsonFeatureCollection {
  const fc = asFeatureCollection(input);

  return {
    type: 'FeatureCollection',
    features: fc.features.map((feature: any, idx: number) => ({
      ...feature,
      id: feature?.id ?? `${tag}-${idx}`,
      properties: {
        ...(feature?.properties ?? {}),
        __tag: tag,
      },
    })),
  };
}

function decorateFeatures(
  fc: GeoJsonFeatureCollection,
  decorate: (feature: any, idx: number) => Record<string, unknown>
) {
  return {
    type: 'FeatureCollection' as const,
    features: fc.features.map((feature, idx) => ({
      ...feature,
      properties: {
        ...(feature?.properties ?? {}),
        ...decorate(feature, idx),
      },
    })),
  };
}

function featureText(feature: any) {
  try {
    return JSON.stringify(feature?.properties ?? {}).toLowerCase();
  } catch {
    return '';
  }
}

function filterByTerms(fc: GeoJsonFeatureCollection, terms: string[]) {
  return {
    type: 'FeatureCollection' as const,
    features: fc.features.filter((feature) => {
      const text = featureText(feature);
      return terms.some((term) => text.includes(term));
    }),
  };
}

function pointOnly(fc: GeoJsonFeatureCollection) {
  return {
    type: 'FeatureCollection' as const,
    features: fc.features.filter((feature) => feature?.geometry?.type === 'Point'),
  };
}

function iconMetaFromText(text: string, fallbackLabel: string) {
  const severe = text.includes('severe') || text.includes('sev ');
  const urgent = text.includes('uua') || text.includes('urgent');

  if (text.includes('llws') || text.includes('low level wind shear')) {
    return {
      iconLabel: 'LLWS',
      iconBgColor: urgent || severe ? '#be123c' : '#9f1239',
      iconTextColor: '#ffe4e6',
    };
  }
  if (text.includes('icing') || text.includes(' ice') || text.includes(' fzl')) {
    return {
      iconLabel: 'ICE',
      iconBgColor: severe ? '#0369a1' : '#075985',
      iconTextColor: '#e0f2fe',
    };
  }
  if (text.includes('turb')) {
    return {
      iconLabel: 'TURB',
      iconBgColor: severe ? '#b45309' : '#92400e',
      iconTextColor: '#fef3c7',
    };
  }
  if (
    text.includes('thunder') ||
    text.includes(' ts') ||
    text.includes('ts ') ||
    text.includes('conv') ||
    text.includes('cb')
  ) {
    return {
      iconLabel: 'TS',
      iconBgColor: '#7c3aed',
      iconTextColor: '#f3e8ff',
    };
  }
  if (
    text.includes('ifr') ||
    text.includes('lifr') ||
    text.includes('mvfr') ||
    text.includes('fog') ||
    text.includes('mist') ||
    text.includes(' vis') ||
    text.includes('visibility')
  ) {
    return {
      iconLabel: 'IFR',
      iconBgColor: '#475569',
      iconTextColor: '#f8fafc',
    };
  }
  if (text.includes('snow') || text.includes(' sn') || text.includes('blsn')) {
    return {
      iconLabel: 'SN',
      iconBgColor: '#1d4ed8',
      iconTextColor: '#dbeafe',
    };
  }
  if (text.includes('rain') || text.includes(' shra') || text.includes(' ra') || text.includes('-ra')) {
    return {
      iconLabel: 'RA',
      iconBgColor: '#0f766e',
      iconTextColor: '#ccfbf1',
    };
  }

  return {
    iconLabel: fallbackLabel,
    iconBgColor: '#1f2937',
    iconTextColor: '#f9fafb',
  };
}

function decorateHazard(fc: GeoJsonFeatureCollection, fallbackLabel: string) {
  return decorateFeatures(fc, (feature) => {
    const text = featureText(feature);
    return iconMetaFromText(text, fallbackLabel);
  });
}

function decoratePireps(fc: GeoJsonFeatureCollection) {
  return decorateFeatures(fc, (feature) => {
    const text = featureText(feature);
    const urgency = text.includes('uua') || text.includes('urgent');
    const meta = iconMetaFromText(text, urgency ? 'UUA' : 'UA');

    return {
      ...meta,
      iconRadius: urgency ? 8 : 7,
      iconStrokeColor: urgency ? '#fde68a' : 'rgba(2,6,23,0.95)',
      iconStrokeWidth: urgency ? 1.6 : 1.2,
    };
  });
}

async function fetchGeoJson(path: string) {
  const res = await fetchWithTimeout(`${AWC_BASE}${path}`, 15000, {
    headers: {
      Accept: 'application/geo+json, application/json',
    },
  });

  if (res.status === 204) return EMPTY_FC;
  if (!res.ok) throw new Error(`AWC ${path} failed (${res.status})`);

  const json = await res.json().catch(() => null);
  return asFeatureCollection(json);
}

export function useAviationMapData(enabled: boolean) {
  const [gairmet, setGairmet] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [airsigmet, setAirsigmet] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [cwa, setCwa] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [pirep, setPirep] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.allSettled([
          fetchGeoJson('/gairmet?format=geojson'),
          fetchGeoJson('/airsigmet?format=geojson'),
          fetchGeoJson('/cwa?format=geojson'),
          fetchGeoJson('/pirep?format=geojson'),
        ]);

        if (cancelled) return;

        const [gairmetRes, airsigmetRes, cwaRes, pirepRes] = results;

        setGairmet(
          gairmetRes.status === 'fulfilled'
            ? normalizeFeatureCollection(gairmetRes.value, 'gairmet')
            : EMPTY_FC
        );
        setAirsigmet(
          airsigmetRes.status === 'fulfilled'
            ? normalizeFeatureCollection(airsigmetRes.value, 'airsigmet')
            : EMPTY_FC
        );
        setCwa(
          cwaRes.status === 'fulfilled' ? normalizeFeatureCollection(cwaRes.value, 'cwa') : EMPTY_FC
        );
        setPirep(
          pirepRes.status === 'fulfilled' ? normalizeFeatureCollection(pirepRes.value, 'pirep') : EMPTY_FC
        );

        const failures = results
          .map((result, idx) => ({ result, idx }))
          .filter((item) => item.result.status === 'rejected')
          .map((item) => {
            const label =
              item.idx === 0 ? 'G-AIRMET' : item.idx === 1 ? 'SIGMET' : item.idx === 2 ? 'CWA' : 'PIREP';
            const reason = (item.result as PromiseRejectedResult).reason;
            return `${label}: ${String(reason?.message ?? reason ?? 'failed')}`;
          });

        if (failures.length === results.length) {
          setError(failures.join(' / '));
        } else if (failures.length) {
          setError(`Partial aviation data: ${failures.join(' / ')}`);
        } else {
          setError(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? 'Failed to load aviation overlays');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const turbulence = useMemo(
    () => decorateHazard(filterByTerms(gairmet, ['turb', 'llws', 'low level wind shear']), 'TURB'),
    [gairmet]
  );
  const icing = useMemo(
    () => decorateHazard(filterByTerms(gairmet, ['ice', 'icing', 'fzlvl']), 'ICE'),
    [gairmet]
  );
  const advisories = useMemo(
    () => decorateHazard(normalizeFeatureCollection(airsigmet, 'airsigmet-active'), 'SIG'),
    [airsigmet]
  );
  const centerWeather = useMemo(
    () => decorateHazard(normalizeFeatureCollection(cwa, 'cwa-active'), 'CWA'),
    [cwa]
  );
  const pireps = useMemo(() => decoratePireps(pointOnly(pirep)), [pirep]);

  return {
    loading,
    error,
    turbulence,
    icing,
    advisories,
    centerWeather,
    pireps,
  };
}
