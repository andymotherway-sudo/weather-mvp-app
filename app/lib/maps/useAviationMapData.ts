import { useEffect, useMemo, useState } from 'react';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';

type GeoJsonFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

export type AviationProductFilter = 'all' | 'gairmet' | 'sigmet' | 'convectiveSigmet' | 'cwa' | 'other';
export type AviationHazardFilter = 'all' | 'ICE' | 'TURB' | 'LLWS' | 'IFR_MTN' | 'TS' | 'OTHER';
export type AviationAltitudeFilter = 'all' | 'low' | 'mid' | 'high';

const EMPTY_FC: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const AWC_BASE = 'https://aviationweather.gov/api/data';
const NORTH_AMERICA_CARIBBEAN_BBOX = '5,-170,84,-45';

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

function isPolygonFeature(feature: any) {
  return feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon';
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

function filterByHazardKeys(fc: GeoJsonFeatureCollection, hazardKeys: AviationHazardFilter[]) {
  return {
    type: 'FeatureCollection' as const,
    features: fc.features.filter((feature) => hazardKeys.includes(feature?.properties?.hazardKey)),
  };
}

function pointOnly(fc: GeoJsonFeatureCollection) {
  return {
    type: 'FeatureCollection' as const,
    features: fc.features.filter((feature) => feature?.geometry?.type === 'Point'),
  };
}

function parseIso(value: any) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseAltitude(value: any) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (!normalized || normalized === 'UNKN' || normalized === 'UNKNOWN') return null;
    if (normalized === 'SFC' || normalized === 'SURFACE') return 0;
    const match = normalized.match(/-?\d+/);
    if (!match) return null;
    const n = Number(match[0]);
    if (!Number.isFinite(n)) return null;
    if (normalized.includes('FL') || n <= 700) return n * 100;
    return n;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 700 ? value * 100 : value;
  }

  return null;
}

function minFinite(values: (number | null)[]) {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length ? Math.min(...finite) : null;
}

function maxFinite(values: (number | null)[]) {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

function flightLevelLabel(value: number | null) {
  if (value == null) return null;
  if (value <= 0) return 'SFC';
  return `FL${String(Math.round(value / 100)).padStart(3, '0')}`;
}

function altitudeLabel(baseFt: number | null, topFt: number | null) {
  const base = flightLevelLabel(baseFt);
  const top = flightLevelLabel(topFt);
  if (base && top) return `${base}-${top}`;
  if (top) return `TOP ${top}`;
  if (base) return `${base}+`;
  return 'Altitude unavailable';
}

function deriveAltitudeBands(hazard: string, baseFt: number | null, topFt: number | null) {
  const bands = new Set<string>();
  const upper = hazard.toUpperCase();

  if (upper.includes('LLWS') || upper.includes('IFR') || upper.includes('MT_OBSC') || upper.endsWith('-LO')) {
    bands.add('low');
  }
  if (upper.endsWith('-HI')) {
    bands.add('mid');
    bands.add('high');
  }

  if (baseFt != null || topFt != null) {
    const base = baseFt ?? 0;
    const top = topFt ?? baseFt ?? 0;
    if (base < 12000 && top >= 0) bands.add('low');
    if (base < 24000 && top >= 12000) bands.add('mid');
    if (top >= 24000 || base >= 24000) bands.add('high');
  }

  return Array.from(bands);
}

function altitudeBandLabel(bands: string[]) {
  if (!bands.length) return null;
  if (bands.length === 1) return bands[0].toUpperCase();
  if (bands.includes('low') && bands.includes('mid') && bands.includes('high')) return 'LOW-HIGH';
  return bands.map((band) => band.toUpperCase()).join('/');
}

function sourceProductMeta(tag: string, props: any, text: string) {
  if (tag === 'gairmet') return { sourceProduct: 'G-AIRMET', productKey: 'gairmet' };
  if (tag === 'cwa') return { sourceProduct: 'CWA', productKey: 'cwa' };
  if (tag === 'airsigmet') {
    const convective =
      String(props?.airSigmetType ?? '').toLowerCase().includes('convective') ||
      String(props?.hazard ?? '').toLowerCase().includes('convective') ||
      text.includes('convective sigmet');
    return convective
      ? { sourceProduct: 'Convective SIGMET', productKey: 'convectiveSigmet' }
      : { sourceProduct: 'SIGMET', productKey: 'sigmet' };
  }
  return { sourceProduct: String(props?.product ?? 'Other aviation product'), productKey: 'other' };
}

function hazardMeta(props: any, text: string) {
  const hazard = String(props?.hazard ?? props?.airSigmetType ?? props?.qualifier ?? '').toUpperCase();
  const raw = `${hazard} ${text}`;

  if (raw.includes('LLWS') || raw.includes('LOW LEVEL WIND SHEAR')) {
    return { hazardKey: 'LLWS' as const, hazardType: 'LLWS', hazardShort: 'LLWS' };
  }
  if (raw.includes('TURB')) {
    return { hazardKey: 'TURB' as const, hazardType: 'Turbulence', hazardShort: 'TURB' };
  }
  if (raw.includes('ICE') || raw.includes('ICING') || raw.includes('FZL')) {
    return { hazardKey: 'ICE' as const, hazardType: 'Icing', hazardShort: 'ICE' };
  }
  if (raw.includes('IFR') || raw.includes('LIFR') || raw.includes('MT_OBSC') || raw.includes('MOUNTAIN OBSC')) {
    return { hazardKey: 'IFR_MTN' as const, hazardType: 'IFR/Mountain Obscuration', hazardShort: 'IFR/MTN' };
  }
  if (raw.includes('CONVECTIVE') || raw.includes('THUNDER') || raw.includes(' TS') || raw.includes('TS ') || raw.includes('CB')) {
    return { hazardKey: 'TS' as const, hazardType: 'Thunderstorms', hazardShort: 'TS' };
  }

  return { hazardKey: 'OTHER' as const, hazardType: hazard || 'Other', hazardShort: hazard || 'OTHER' };
}

function severityLabel(props: any, text: string) {
  const raw = String(props?.severity ?? '').toUpperCase();
  if (raw.includes('EXTREME')) return 'Extreme';
  if (raw.includes('SEV') || text.includes(' sev ') || text.includes('severe')) return 'Severe';
  if (raw.includes('MOD') || text.includes(' mod ') || text.includes('moderate')) return 'Moderate';

  const numeric = typeof props?.severity === 'number' ? props.severity : Number(props?.severity);
  if (Number.isFinite(numeric)) {
    if (numeric >= 5) return 'Severe';
    if (numeric >= 3) return 'Moderate';
  }

  return null;
}

function deriveAltitudes(props: any) {
  const low = minFinite([
    parseAltitude(props?.base),
    parseAltitude(props?.altitudeLow1),
    parseAltitude(props?.altitudeLow2),
  ]);
  const high = maxFinite([
    parseAltitude(props?.top),
    parseAltitude(props?.altitudeHi1),
    parseAltitude(props?.altitudeHi2),
    parseAltitude(props?.level),
  ]);
  return { baseFt: low, topFt: high };
}

function decorateAviationHazard(fc: GeoJsonFeatureCollection) {
  return decorateFeatures(fc, (feature, idx) => {
    const props = feature?.properties ?? {};
    const tag = String(props?.__tag ?? '');
    const text = featureText(feature);
    const { sourceProduct, productKey } = sourceProductMeta(tag, props, text);
    const { hazardKey, hazardType, hazardShort } = hazardMeta(props, text);
    const { baseFt, topFt } = deriveAltitudes(props);
    const altitudeBands = deriveAltitudeBands(String(props?.hazard ?? ''), baseFt, topFt);
    const bandLabel = altitudeBandLabel(altitudeBands);
    const altLabel = altitudeLabel(baseFt, topFt);
    const severity = severityLabel(props, text);
    const validFrom = parseIso(props?.validTimeFrom ?? props?.validTime);
    const validTime = parseIso(props?.validTime ?? props?.validTimeFrom);
    const expiresTime = parseIso(props?.validTimeTo ?? props?.expireTime ?? props?.expirationTime);
    const issuedTime = parseIso(props?.issueTime ?? props?.issuedTime ?? props?.receiptTime);
    const rawFeatureId = String(feature?.id ?? props?.id ?? props?.seriesId ?? props?.tag ?? `${tag}-${idx}`);
    const label = [hazardShort, severity, bandLabel, altLabel && altLabel !== 'Altitude unavailable' ? altLabel : null]
      .filter(Boolean)
      .join(' ');
    const icon = iconMetaFromText(text, hazardShort);

    return {
      ...icon,
      iconLabel: label || icon.iconLabel,
      sourceProduct,
      productKey,
      hazardKey,
      hazardType,
      severityLabel: severity ?? 'Not specified',
      baseFt,
      topFt,
      altitudeLabel: altLabel,
      altitudeBands: altitudeBands.join(','),
      altitudeBandLabel: bandLabel ?? 'Unknown',
      issuedTime,
      validFrom,
      validTime,
      expiresTime,
      validKey: validTime ?? validFrom ?? expiresTime ?? issuedTime ?? rawFeatureId,
      rawFeatureId,
    };
  });
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
  return decorateAviationHazard(
    decorateFeatures(fc, (feature) => {
      const text = featureText(feature);
      return iconMetaFromText(text, fallbackLabel);
    })
  );
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

function compactNumber(value: any, digits = 0) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n.toFixed(digits);
}

function compactAltimeter(value: any) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const inHg = n > 100 ? n / 33.8639 : n;
  const hundredths = Math.round(inHg * 100) % 1000;
  return String(hundredths).padStart(3, '0');
}

function compactVisibility(value: any) {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n >= 10 ? '10+' : n.toFixed(n < 3 ? 1 : 0);
}

function flightCategoryColor(value: any) {
  const cat = String(value ?? '').toUpperCase();
  if (cat === 'VFR') return '#22c55e';
  if (cat === 'MVFR') return '#3b82f6';
  if (cat === 'IFR') return '#ef4444';
  if (cat === 'LIFR') return '#a855f7';
  return '#f8fafc';
}

function decorateMetars(fc: GeoJsonFeatureCollection) {
  return decorateFeatures(pointOnly(fc), (feature) => {
    const props = feature?.properties ?? {};
    const temp = compactNumber(props?.temp ?? props?.tempC ?? props?.temperature_c);
    const dew = compactNumber(props?.dewp ?? props?.dewpoint ?? props?.dewpointC ?? props?.dewpoint_c);
    const vis = compactVisibility(props?.visib ?? props?.visibility ?? props?.visibility_statute_mi ?? props?.vis);
    const alt = compactAltimeter(props?.altim ?? props?.altimeter ?? props?.altimeter_in_hg ?? props?.altimeter_hpa);
    const station = String(props?.icaoId ?? props?.icao ?? props?.id ?? props?.station ?? '').toUpperCase();
    const category = String(props?.flight_category ?? props?.flightCategory ?? props?.category ?? '').toUpperCase();
    const windDir = compactNumber(props?.wdir ?? props?.wind_dir_degrees ?? props?.windDirection);
    const windKt = compactNumber(props?.wspd ?? props?.wind_speed_kt ?? props?.windSpeedKt);

    return {
      sourceProduct: 'METAR',
      productKey: 'metar',
      hazardKey: 'OBS',
      hazardType: 'Observation',
      rawFeatureId: String(feature?.id ?? station ?? 'metar'),
      stationLabel: station,
      stationTemp: temp ?? '',
      stationDew: dew ?? '',
      stationVis: vis ?? '',
      stationAltim: alt ?? '',
      stationCategory: category,
      stationCategoryColor: flightCategoryColor(category),
      stationWind: windDir && windKt ? `${windDir}/${windKt}` : '',
      iconLabel: category || 'OBS',
      iconBgColor: flightCategoryColor(category),
      iconTextColor: '#f8fafc',
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

async function fetchWorkerAviationOverlays() {
  const res = await fetchWithTimeout(apiUrl('/api/aviation/overlays?region=north-america'), 15000, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) throw new Error(`Worker aviation overlays failed (${res.status})`);

  const json = await res.json().catch(() => null);
  if (!json?.ok || !json?.products) throw new Error('Worker aviation overlays response was malformed');

  return {
    products: json.products as Record<string, any>,
    errors: Array.isArray(json.errors) ? json.errors.map(String) : [],
  };
}

export function useAviationMapData(enabled: boolean) {
  const [gairmet, setGairmet] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [airsigmet, setAirsigmet] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [cwa, setCwa] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [pirep, setPirep] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
  const [metar, setMetar] = useState<GeoJsonFeatureCollection>(EMPTY_FC);
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
        try {
          const worker = await fetchWorkerAviationOverlays();
          if (cancelled) return;

          setGairmet(normalizeFeatureCollection(worker.products.gairmet, 'gairmet'));
          setAirsigmet(normalizeFeatureCollection(worker.products.airsigmet, 'airsigmet'));
          setCwa(normalizeFeatureCollection(worker.products.cwa, 'cwa'));
          setPirep(normalizeFeatureCollection(worker.products.pirep, 'pirep'));
          setMetar(normalizeFeatureCollection(worker.products.metar, 'metar'));
          setError(worker.errors.length ? `Partial aviation data: ${worker.errors.join(' / ')}` : null);
          return;
        } catch {
          // Fall back to direct AWC calls for older worker deployments or transient worker failures.
        }

        const results = await Promise.allSettled([
          fetchGeoJson('/gairmet?format=geojson'),
          fetchGeoJson('/airsigmet?format=geojson'),
          fetchGeoJson('/cwa?format=geojson'),
          fetchGeoJson(`/pirep?format=geojson&bbox=${NORTH_AMERICA_CARIBBEAN_BBOX}`),
          fetchGeoJson(`/metar?format=geojson&hours=2&bbox=${NORTH_AMERICA_CARIBBEAN_BBOX}`),
        ]);

        if (cancelled) return;

        const [gairmetRes, airsigmetRes, cwaRes, pirepRes, metarRes] = results;

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
        setMetar(
          metarRes.status === 'fulfilled' ? normalizeFeatureCollection(metarRes.value, 'metar') : EMPTY_FC
        );

        const failures = results
          .map((result, idx) => ({ result, idx }))
          .filter((item) => item.result.status === 'rejected')
          .map((item) => {
            const label =
              item.idx === 0 ? 'G-AIRMET' : item.idx === 1 ? 'SIGMET' : item.idx === 2 ? 'CWA' : item.idx === 3 ? 'PIREP' : 'METAR';
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
    () => filterByHazardKeys(decorateHazard(gairmet, 'TURB'), ['TURB', 'LLWS']),
    [gairmet]
  );
  const icing = useMemo(
    () => filterByHazardKeys(decorateHazard(gairmet, 'ICE'), ['ICE']),
    [gairmet]
  );
  const advisories = useMemo(
    () => decorateHazard(airsigmet, 'SIG'),
    [airsigmet]
  );
  const centerWeather = useMemo(
    () => decorateHazard(cwa, 'CWA'),
    [cwa]
  );
  const pireps = useMemo(() => decoratePireps(pointOnly(pirep)), [pirep]);
  const metars = useMemo(() => decorateMetars(metar), [metar]);
  const allHazards = useMemo(
    () =>
      decorateAviationHazard({
        type: 'FeatureCollection',
        features: [...gairmet.features, ...airsigmet.features, ...cwa.features].filter(isPolygonFeature),
      }),
    [gairmet, airsigmet, cwa]
  );
  const validTimes = useMemo(() => {
    const values = new Set<string>();
    allHazards.features.forEach((feature) => {
      const key = feature?.properties?.validKey;
      if (typeof key === 'string' && Number.isFinite(Date.parse(key))) values.add(key);
    });
    return Array.from(values).sort((a, b) => Date.parse(a) - Date.parse(b));
  }, [allHazards]);

  return {
    loading,
    error,
    turbulence,
    icing,
    advisories,
    centerWeather,
    pireps,
    metars,
    allHazards,
    validTimes,
  };
}
