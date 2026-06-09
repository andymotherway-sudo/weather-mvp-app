import { useEffect, useMemo, useState } from 'react';

import { isWeatherGovAlertLikelySupportedPoint } from '../alerts/nws';
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

export type WeatherAlertDetail = {
  id: string;
  event: string;
  headline: string | null;
  severity: string | null;
  urgency: string | null;
  certainty: string | null;
  areaDesc: string | null;
  effective: string | null;
  expires: string | null;
  ends: string | null;
  sent: string | null;
  senderName: string | null;
  description: string | null;
  instruction: string | null;
  derived: boolean;
  sourceLabel: string;
};

type AlertMapData = {
  geojson: GeoJsonFeatureCollection;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
  sourceMode: 'official' | 'derived';
};

const EMPTY_FC: GeoJsonFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const ALERTS_URL = 'https://api.weather.gov/alerts/active';
const WWA_FEATURE_URL = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer';
const USER_AGENT = 'omniwx (dev)';

let alertCache: { ts: number; key: string; geojson: GeoJsonFeatureCollection } | null = null;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function roundCoord(value: number, step = 0.15) {
  return Math.round(value / step) * step;
}

function buildViewportEnvelope(region: RegionLike) {
  const halfLat = clamp(region.latitudeDelta * 0.72, 0.5, 45);
  const halfLon = clamp(region.longitudeDelta * 0.72, 0.5, 90);
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

function cleanText(value: any) {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

function safeIso(value: any) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function alertPalette(event: string, severity: string | null) {
  const e = event.toLowerCase();
  if (e.includes('tornado')) return { fill: '#dc2626', line: '#fecaca', rank: 8 };
  if (e.includes('severe thunderstorm')) return { fill: '#f59e0b', line: '#fde68a', rank: 7 };
  if (e.includes('flash flood') || e.includes('flood warning')) return { fill: '#16a34a', line: '#bbf7d0', rank: 6 };
  if (e.includes('warning')) return { fill: '#ef4444', line: '#fee2e2', rank: 5 };
  if (e.includes('watch')) return { fill: '#f97316', line: '#ffedd5', rank: 4 };
  if (e.includes('advisory')) return { fill: '#facc15', line: '#fef9c3', rank: 3 };
  if (e.includes('statement')) return { fill: '#38bdf8', line: '#bae6fd', rank: 2 };
  if ((severity ?? '').toLowerCase() === 'severe') return { fill: '#ef4444', line: '#fee2e2', rank: 5 };
  return { fill: '#a78bfa', line: '#ddd6fe', rank: 1 };
}

function sigToSeverity(sig: any, event: string) {
  const s = typeof sig === 'string' ? sig.trim().toUpperCase() : '';
  if (s === 'W') return 'Warning';
  if (s === 'A') return 'Watch';
  if (s === 'Y') return 'Advisory';
  if (s === 'S') return 'Statement';
  if (event.toLowerCase().includes('warning')) return 'Warning';
  if (event.toLowerCase().includes('watch')) return 'Watch';
  if (event.toLowerCase().includes('advisory')) return 'Advisory';
  if (event.toLowerCase().includes('statement')) return 'Statement';
  return null;
}

function geometryBbox(geometry: any) {
  const lons: number[] = [];
  const lats: number[] = [];
  const visit = (coords: any) => {
    if (!Array.isArray(coords)) return;
    if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      lons.push(coords[0]);
      lats.push(coords[1]);
      return;
    }
    coords.forEach(visit);
  };
  visit(geometry?.coordinates);
  if (!lons.length || !lats.length) return null;
  return {
    west: Math.min(...lons),
    east: Math.max(...lons),
    south: Math.min(...lats),
    north: Math.max(...lats),
  };
}

function intersects(a: ReturnType<typeof geometryBbox>, b: { west: number; east: number; south: number; north: number }) {
  if (!a) return false;
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function normalizeAlertFeature(feature: any, idx: number) {
  const geometry = feature?.geometry;
  if (!geometry?.type || !geometry?.coordinates) return null;
  const p = feature?.properties ?? {};
  const event = cleanText(p.event) ?? 'Weather Alert';
  const severity = cleanText(p.severity);
  const palette = alertPalette(event, severity);
  const id = String(feature?.id ?? p.id ?? `${event}-${p.sent ?? idx}`);

  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      id,
      event,
      headline: cleanText(p.headline),
      severity,
      urgency: cleanText(p.urgency),
      certainty: cleanText(p.certainty),
      areaDesc: cleanText(p.areaDesc),
      effective: safeIso(p.effective),
      expires: safeIso(p.expires),
      ends: safeIso(p.ends),
      sent: safeIso(p.sent),
      senderName: cleanText(p.senderName),
      description: cleanText(p.description),
      instruction: cleanText(p.instruction),
      sourceLabel: 'Official NWS alert',
      fillColor: palette.fill,
      lineColor: palette.line,
      rank: palette.rank,
      label: event.replace(/\s+(Warning|Watch|Advisory|Statement)$/i, '\n$1'),
    },
  };
}

function normalizeWwaFeature(feature: any, idx: number, layerId: number) {
  const geometry = feature?.geometry;
  if (!geometry?.type || !geometry?.coordinates) return null;
  const p = feature?.properties ?? {};
  const event = cleanText(p.prod_type) ?? cleanText(p.event) ?? 'Weather Alert';
  const severity = sigToSeverity(p.sig, event);
  const palette = alertPalette(event, severity);
  const id = String(p.cap_id ?? p.objectid ?? p.OBJECTID ?? `${layerId}-${event}-${idx}`);

  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      id,
      event,
      headline: cleanText(p.prod_type) ?? event,
      severity,
      urgency: null,
      certainty: null,
      areaDesc: cleanText(p.wfo) ? `NWS ${cleanText(p.wfo)}` : null,
      effective: safeIso(p.onset ?? p.issuance),
      expires: safeIso(p.expiration),
      ends: safeIso(p.ends ?? p.expiration),
      sent: safeIso(p.issuance ?? p.idp_filedate ?? p.idp_ingestdate),
      senderName: cleanText(p.wfo) ? `National Weather Service ${cleanText(p.wfo)}` : 'National Weather Service',
      description: cleanText(p.url) ? `Alert bulletin: ${cleanText(p.url)}` : null,
      instruction: null,
      url: cleanText(p.url),
      sourceLayer: layerId === 0 ? 'CurrentWarnings' : 'WatchesWarnings',
      sourceLabel: 'Official NWS alert polygon',
      fillColor: palette.fill,
      lineColor: palette.line,
      rank: palette.rank,
      label: event.replace(/\s+(Warning|Watch|Advisory|Statement)$/i, '\n$1'),
    },
  };
}

function normalizeGlobalAlertPoint(alert: any, idx: number, region: RegionLike) {
  const event = cleanText(alert?.event) ?? 'Weather Alert';
  const severity = cleanText(alert?.severity);
  const palette = alertPalette(event, severity);
  const id = String(alert?.id ?? `global-alert-${idx}`);

  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Point',
      coordinates: [region.longitude, region.latitude],
    },
    properties: {
      id,
      event,
      headline: cleanText(alert?.headline) ?? event,
      severity,
      urgency: cleanText(alert?.urgency),
      certainty: cleanText(alert?.certainty),
      areaDesc: cleanText(alert?.areaDesc) ?? 'Selected map area',
      effective: safeIso(alert?.effective),
      expires: safeIso(alert?.expires),
      ends: safeIso(alert?.ends),
      sent: safeIso(alert?.sent),
      senderName: cleanText(alert?.senderName) ?? 'OMNIwx global forecast outlook',
      description: cleanText(alert?.description),
      instruction: cleanText(alert?.instruction),
      sourceLabel: 'Model-derived global outlook',
      fillColor: palette.fill,
      lineColor: palette.line,
      rank: palette.rank,
      derived: alert?.derived === true,
      label: event.replace(/\s+(Outlook|Warning|Watch|Advisory|Statement)$/i, '\n$1'),
    },
  };
}

function filterToEnvelope(fc: GeoJsonFeatureCollection, envelope: { west: number; east: number; south: number; north: number }) {
  return {
    type: 'FeatureCollection' as const,
    features: fc.features.filter((feature) => intersects(geometryBbox(feature?.geometry), envelope)),
  };
}

async function fetchGlobalAlertPoints(signal: AbortSignal, region: RegionLike) {
  const url = apiUrl(
    `/api/alerts/global?lat=${encodeURIComponent(String(region.latitude))}&lon=${encodeURIComponent(String(region.longitude))}`,
  );
  const res = await fetchWithTimeout(url, 18000, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Global alert outlook failed (${res.status})`);
  const json = await res.json().catch(() => null);
  const alerts = Array.isArray(json?.alerts) ? json.alerts : [];
  return {
    type: 'FeatureCollection' as const,
    features: alerts.map((alert: any, idx: number) => normalizeGlobalAlertPoint(alert, idx, region)).filter(Boolean),
  };
}

async function fetchActiveAlerts(signal: AbortSignal) {
  const features: any[] = [];
  let url: string | null = `${ALERTS_URL}?status=actual&message_type=alert%2Cupdate&limit=500`;
  let page = 0;

  while (url && page < 4) {
    const res = await fetchWithTimeout(url, 18000, {
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/geo+json',
      },
    });
    if (!res.ok) throw new Error(`Official alerts failed (${res.status})`);
    const json = await res.json().catch(() => null);
    if (Array.isArray(json?.features)) features.push(...json.features);
    url = typeof json?.pagination?.next === 'string' ? json.pagination.next : null;
    page += 1;
  }

  return {
    type: 'FeatureCollection' as const,
    features: features.map(normalizeAlertFeature).filter(Boolean),
  };
}

function buildWwaQueryUrl(layerId: number, envelope: { west: number; east: number; south: number; north: number }) {
  const params = new URLSearchParams({
    f: 'geojson',
    where: '1=1',
    outFields: '*',
    returnGeometry: 'true',
    geometry: `${envelope.west},${envelope.south},${envelope.east},${envelope.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    resultRecordCount: '4000',
  });
  return `${WWA_FEATURE_URL}/${layerId}/query?${params.toString()}`;
}

async function fetchWwaPolygons(signal: AbortSignal, envelope: { west: number; east: number; south: number; north: number }) {
  const features: any[] = [];
  const seen = new Set<string>();

  for (const layerId of [0, 1]) {
    const url = buildWwaQueryUrl(layerId, envelope);
    const res = await fetchWithTimeout(url, 18000, {
      signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/geo+json, application/json',
      },
    });
    if (!res.ok) throw new Error(`NOAA WWA polygons failed (${res.status})`);
    const json = await res.json().catch(() => null);
    const layerFeatures = Array.isArray(json?.features) ? json.features : [];
    for (const feature of layerFeatures) {
      const normalized = normalizeWwaFeature(feature, features.length, layerId);
      if (!normalized) continue;
      const id = String(normalized.properties.id);
      if (seen.has(id)) continue;
      seen.add(id);
      features.push(normalized);
    }
  }

  return {
    type: 'FeatureCollection' as const,
    features,
  };
}

export function alertFeatureToDetail(feature: any): WeatherAlertDetail | null {
  const p = feature?.properties ?? {};
  const event = cleanText(p.event);
  if (!event) return null;
  return {
    id: String(p.id ?? feature?.id ?? event),
    event,
    headline: cleanText(p.headline),
    severity: cleanText(p.severity),
    urgency: cleanText(p.urgency),
    certainty: cleanText(p.certainty),
    areaDesc: cleanText(p.areaDesc),
    effective: safeIso(p.effective),
    expires: safeIso(p.expires),
    ends: safeIso(p.ends),
    sent: safeIso(p.sent),
    senderName: cleanText(p.senderName),
    description: cleanText(p.description),
    instruction: cleanText(p.instruction),
    derived: p.derived === true,
    sourceLabel: cleanText(p.sourceLabel) ?? (p.derived === true ? 'Model-derived global outlook' : 'Official NWS alert'),
  };
}

export function useAlertMapData(enabled: boolean, region: RegionLike | null): AlertMapData {
  const [allAlerts, setAllAlerts] = useState<GeoJsonFeatureCollection>(alertCache?.geojson ?? EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(alertCache ? new Date(alertCache.ts).toISOString() : null);

  const envelope = useMemo(() => (region ? buildViewportEnvelope(region) : null), [region]);
  const envelopeKey = envelope ? `${envelope.west},${envelope.south},${envelope.east},${envelope.north}` : null;
  const supported = region ? isWeatherGovAlertLikelySupportedPoint(region.latitude, region.longitude) : true;
  const sourceMode: AlertMapData['sourceMode'] = supported ? 'official' : 'derived';

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    const cached = alertCache;
    const fresh = cached && cached.key === envelopeKey && Date.now() - cached.ts < 5 * 60 * 1000;
    if (fresh) {
      setAllAlerts(cached.geojson);
      setUpdatedAt(new Date(cached.ts).toISOString());
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
        const geojson =
          supported && envelope
            ? await fetchWwaPolygons(controller.signal, envelope)
            : supported
            ? await fetchActiveAlerts(controller.signal)
            : region
            ? await fetchGlobalAlertPoints(controller.signal, region)
            : EMPTY_FC;
        if (cancelled) return;
        alertCache = { ts: Date.now(), key: envelopeKey ?? 'global', geojson };
        setAllAlerts(geojson);
        setUpdatedAt(new Date(alertCache.ts).toISOString());
      } catch (err: any) {
        if (controller.signal.aborted || cancelled) return;
        setError(err?.message ?? 'Official alerts unavailable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, envelopeKey, supported, region?.latitude, region?.longitude]);

  const geojson = useMemo(() => {
    if (!enabled || !envelope) return EMPTY_FC;
    return filterToEnvelope(allAlerts, envelope);
  }, [allAlerts, enabled, envelopeKey]);

  return { geojson, loading, error, updatedAt, sourceMode };
}
