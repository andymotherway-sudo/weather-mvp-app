import MapLibreGL from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../components/common/Glass';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { AnimatedPageBackground } from '../../components/backgrounds/AnimatedPageBackground';
import { Card } from '../../components/layout/Card';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { OMNI_MARK_WORD, OMNI_TAB_LOGO_STYLE } from '../lib/brand/assets';
import { airportCandidatesForToken, airportEntryForCode, nearestAirportCandidates } from '../lib/aviation/airportIndex';
import { normalizeAviationFeatureCollection } from '../lib/aviation/normalize';
import type { AviationFeature } from '../lib/aviation/types';
import { usePlace } from '../context/PlaceContext';
import { geocodePlaces } from '../lib/locations/geocode';
import { useAviationMapData } from '../lib/maps/useAviationMapData';
import { apiUrl } from '../lib/net/apiBase';
import { fetchWithTimeout } from '../lib/net/fetchWithTimeout';
import { fetchHourlyForecastBatch, nearestTimeIndex } from '../lib/weather/batch';

type Mode = 'station' | 'flight';
type ReportView = 'decoded' | 'raw';
type Stop = { raw: string; code?: string; label: string; lat: number; lon: number };
type Wx = { tempF: number | null; windMph: number | null; gustMph: number | null; cloudPct: number | null; visMi: number | null };
type RouteAdvisory = {
  key: string;
  productType: AviationFeature['productType'];
  hazardType: AviationFeature['hazardType'];
  product: string;
  hazard: string;
  severity: string | null;
  altitude: string;
  valid: string;
  rawId: string;
  rank: number;
};
type Sample = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  distanceMi: number;
  etaIso: string;
  weather: Wx;
  advisories: RouteAdvisory[];
  airportRisk: 'low' | 'elevated' | 'high';
  severity: 'low' | 'elevated' | 'high';
};
type Flight = { origin: Stop; destination: Stop; totalDistanceMi: number; cruiseAltitudeFt: number; departureIso: string; samples: Sample[]; counts: Record<string, number> };
type Station = { station: Stop; metar: any | null; taf: any | null };
type SavedAirport = { id: string; code: string; label: string; lat: number; lon: number; savedAt: number };
type SavedRoute = { id: string; from: string; to: string; label: string; cruiseAltitudeFt: number; departureOffsetMin: number; savedAt: number };

const AVIATION_WIDGET_SELECTION_KEY = 'omniwx:widget:aviation:selected:v1';
const AVIATION_FAVORITES_KEY = 'omniwx:aviation:favorites:v1';

const CRUISE_LEVELS = [
  { label: '6,000 ft', feet: 6000 },
  { label: '9,000 ft', feet: 9000 },
  { label: '12,000 ft', feet: 12000 },
  { label: 'FL180', feet: 18000 },
  { label: 'FL240', feet: 24000 },
  { label: 'FL300', feet: 30000 },
  { label: 'FL360', feet: 36000 },
];

const DEPARTURE_OFFSETS = [
  { label: 'Now', minutes: 0 },
  { label: '+1h', minutes: 60 },
  { label: '+2h', minutes: 120 },
  { label: '+4h', minutes: 240 },
];

const DEFAULT_REGION: Region = { latitude: 39.5, longitude: -98.35, latitudeDelta: 20, longitudeDelta: 28, zoom: 4 };
const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as any[] };

const num = (...xs: any[]) => {
  for (const x of xs) {
    const n = typeof x === 'string' ? Number(x) : x;
    if (typeof n === 'number' && Number.isFinite(n)) return n;
  }
  return null;
};
const str = (...xs: any[]) => {
  for (const x of xs) if (typeof x === 'string' && x.trim()) return x.trim();
  return null;
};
const looseNum = (...xs: any[]) => {
  for (const x of xs) {
    const direct = num(x);
    if (direct != null) return direct;
    if (typeof x === 'string') {
      const match = x.trim().match(/^-?\d+(?:\.\d+)?/);
      if (match) {
        const parsed = Number(match[0]);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
  }
  return null;
};
const fmt = (v: number | null | undefined, s = '', d = 0) =>
  v == null || !Number.isFinite(v) ? '--' : `${v.toFixed(d)}${s}`;
const milesFromMaybeMeters = (v: number | null) =>
  v == null || !Number.isFinite(v) ? null : v > 1000 ? v / 1609.344 : v;
const mi = (aLat: number, aLon: number, bLat: number, bLon: number) => {
  const r = 3958.7613;
  const toR = (v: number) => (v * Math.PI) / 180;
  const dLat = toR(bLat - aLat);
  const dLon = toR(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
};
const bounds = (pts: Array<{ lat: number; lon: number }>) => ({
  west: Math.min(...pts.map((p) => p.lon)),
  east: Math.max(...pts.map((p) => p.lon)),
  south: Math.min(...pts.map((p) => p.lat)),
  north: Math.max(...pts.map((p) => p.lat)),
});
const region = (pts: Array<{ lat: number; lon: number }>): Region => {
  const b = bounds(pts);
  return {
    latitude: (b.south + b.north) / 2,
    longitude: (b.west + b.east) / 2,
    latitudeDelta: Math.max(2.4, (b.north - b.south) * 1.8),
    longitudeDelta: Math.max(3, (b.east - b.west) * 1.6),
  };
};
const expand = (b: any, pad: number) => ({ west: b.west - pad, east: b.east + pad, south: b.south - pad, north: b.north + pad });
const intersects = (a: any, b: any) => !(a.east < b.west || a.west > b.east || a.north < b.south || a.south > b.north);
const rows = (json: any) => (Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : json ? [json] : []);
function coordsOf(input: any, out: Array<[number, number]>) {
  if (!Array.isArray(input) || !input.length) return;
  if (input.length >= 2 && Number.isFinite(input[0]) && Number.isFinite(input[1])) {
    out.push([Number(input[0]), Number(input[1])]);
    return;
  }
  input.forEach((c) => coordsOf(c, out));
}
function featureBounds(f: any) {
  const out: Array<[number, number]> = [];
  coordsOf(f?.geometry?.coordinates, out);
  if (!out.length) return null;
  return {
    west: Math.min(...out.map((c) => c[0])),
    east: Math.max(...out.map((c) => c[0])),
    south: Math.min(...out.map((c) => c[1])),
    north: Math.max(...out.map((c) => c[1])),
  };
}

function productLabel(feature: AviationFeature) {
  const source = String(feature.properties?.sourceProduct ?? '').trim();
  if (source) return source;
  if (feature.productType === 'gairmet') return 'G-AIRMET';
  if (feature.productType === 'sigmet') return 'SIGMET';
  if (feature.productType === 'convectiveSigmet') return 'Convective SIGMET';
  if (feature.productType === 'cwa') return 'CWA';
  if (feature.productType === 'pirep') return 'PIREP';
  return 'Aviation';
}

function hazardLabel(feature: AviationFeature) {
  const hazard = String(feature.properties?.hazardType ?? '').trim();
  if (hazard) return hazard;
  if (feature.hazardType === 'ice') return 'ICE';
  if (feature.hazardType === 'turb') return 'TURB';
  if (feature.hazardType === 'llws') return 'LLWS';
  if (feature.hazardType === 'ifr') return 'IFR/MTN';
  if (feature.hazardType === 'mtnObscuration') return 'MTN OBS';
  if (feature.hazardType === 'ts') return 'TS';
  return 'UNKNOWN';
}

function flLabel(ft: number | null | undefined) {
  if (ft == null || !Number.isFinite(ft)) return null;
  if (ft <= 0) return 'SFC';
  return `FL${String(Math.round(ft / 100)).padStart(3, '0')}`;
}

function altitudeText(feature: AviationFeature) {
  const base = flLabel(feature.baseFt);
  const top = flLabel(feature.topFt);
  if (base && top) return `${base}-${top}`;
  if (top) return `Tops ${top}`;
  if (base) return `${base}+`;
  return 'altitude unknown';
}

function cruiseLabel(feet: number) {
  if (feet >= 18000) return flLabel(feet) ?? `${Math.round(feet).toLocaleString()} ft`;
  return `${Math.round(feet).toLocaleString()} ft`;
}

function departureLabel(minutes: number) {
  if (minutes <= 0) return 'Now';
  return `+${Math.round(minutes / 60)}h`;
}

function utcShort(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}${String(d.getUTCMinutes()).padStart(2, '0')}Z`;
}

function validText(feature: AviationFeature) {
  const from = utcShort(feature.validFrom);
  const to = utcShort(feature.validTo);
  if (from && to && from !== to) return `valid ${from}-${to}`;
  if (to) return `valid until ${to}`;
  if (from) return `valid ${from}`;
  return 'valid time unknown';
}

const GAIRMET_SNAPSHOT_LOOKBACK_MS = 30 * 60 * 1000;
const GAIRMET_SNAPSHOT_WINDOW_MS = 3.5 * 60 * 60 * 1000;

function altitudeApplies(feature: AviationFeature, altitudeFt: number) {
  if (feature.baseFt == null && feature.topFt == null) {
    if (feature.hazardType === 'ifr' || feature.hazardType === 'mtnObscuration' || feature.hazardType === 'llws') {
      return altitudeFt <= 12000;
    }
    return false;
  }
  const base = feature.baseFt ?? 0;
  const top = feature.topFt ?? 60000;
  return altitudeFt >= base && altitudeFt <= top;
}

function timeApplies(feature: AviationFeature, iso: string) {
  const ms = Date.parse(iso);
  const from = Date.parse(feature.validFrom ?? '');
  const to = Date.parse(feature.validTo ?? feature.validFrom ?? '');
  if (!Number.isFinite(ms)) return false;
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) return ms >= from && ms <= to;
  if (Number.isFinite(from) && feature.productType === 'gairmet') {
    return ms >= from - GAIRMET_SNAPSHOT_LOOKBACK_MS && ms <= from + GAIRMET_SNAPSHOT_WINDOW_MS;
  }
  if (Number.isFinite(from)) return Math.abs(ms - from) <= 60 * 1000;
  return false;
}

function rankAdvisory(feature: AviationFeature) {
  const sev = feature.severity;
  if (feature.productType === 'convectiveSigmet') return 5;
  if (feature.productType === 'sigmet') return 5;
  if (feature.productType === 'cwa') return feature.hazardType === 'ts' ? 5 : 3;
  if ((feature.hazardType === 'turb' || feature.hazardType === 'ice') && (sev === 'severe' || sev === 'extreme')) return 5;
  if ((feature.hazardType === 'turb' || feature.hazardType === 'ice') && sev === 'moderate') return 3;
  if (feature.productType === 'pirep' && (sev === 'severe' || sev === 'extreme')) return 5;
  if (feature.productType === 'pirep' && sev === 'moderate') return 3;
  if (feature.hazardType === 'ifr' || feature.hazardType === 'mtnObscuration' || feature.hazardType === 'llws') return 3;
  return 1;
}

function makeRouteAdvisory(feature: AviationFeature): RouteAdvisory {
  return {
    key: feature.id,
    productType: feature.productType,
    hazardType: feature.hazardType,
    product: productLabel(feature),
    hazard: hazardLabel(feature),
    severity: feature.severity === 'unknown' ? null : feature.severity.toUpperCase(),
    altitude: altitudeText(feature),
    valid: validText(feature),
    rawId: feature.id,
    rank: rankAdvisory(feature),
  };
}

function airportRiskFromMetar(row: any): 'low' | 'elevated' | 'high' {
  const cat = String(flightCat(row) ?? '').toUpperCase();
  if (cat === 'LIFR' || cat === 'IFR') return 'high';
  if (cat === 'MVFR') return 'elevated';
  return 'low';
}

function severityFromScore(score: number): 'low' | 'elevated' | 'high' {
  if (score >= 5) return 'high';
  if (score >= 3) return 'elevated';
  return 'low';
}

function severityRank(severity: Sample['severity']) {
  return severity === 'high' ? 3 : severity === 'elevated' ? 2 : 1;
}

function airportRiskText(risk: Sample['airportRisk']) {
  if (risk === 'high') return 'Airport conditions: IFR/LIFR risk near endpoint.';
  if (risk === 'elevated') return 'Airport conditions: MVFR risk near endpoint.';
  return null;
}

function airportCandidates(token: string) {
  return airportCandidatesForToken(token);
}

async function resolveAirport(token: string): Promise<Stop | null> {
  for (const id of airportCandidates(token)) {
    try {
      const r = await fetchWithTimeout(
        `https://aviationweather.gov/api/data/airport?ids=${encodeURIComponent(id)}&format=json`,
        10000,
        { headers: { Accept: 'application/json' } }
      );
      if (!r.ok) continue;
      for (const row of rows(await r.json().catch(() => null))) {
        const lat = num(row?.lat, row?.latitude, row?.geometry?.coordinates?.[1]);
        const lon = num(row?.lon, row?.longitude, row?.geometry?.coordinates?.[0]);
        if (lat == null || lon == null) continue;
        const code = String(row?.icaoId ?? row?.icao ?? row?.ident ?? row?.id ?? id).toUpperCase();
        const label = String(row?.name ?? row?.site ?? row?.city ?? code).trim() || code;
        return { raw: token, code, label, lat, lon };
      }
    } catch {}
  }
  const indexed = airportEntryForCode(token);
  if (indexed) return { raw: token, code: indexed.icao, label: indexed.name, lat: indexed.lat, lon: indexed.lon };
  return null;
}

async function resolveStop(token: string): Promise<Stop> {
  const airport = await resolveAirport(token);
  if (airport) return airport;
  const place = (await geocodePlaces(token))[0];
  if (!place) throw new Error(`Could not resolve "${token}"`);
  return { raw: token, label: [place.name, place.admin1, place.country].filter(Boolean).join(', '), lat: place.lat, lon: place.lon };
}

async function resolveStation(token: string) {
  const airport = await resolveAirport(token);
  if (!airport) throw new Error(`Could not resolve airport "${token}"`);
  return airport;
}

async function fetchWx(lat: number, lon: number): Promise<Wx> {
  const hourlyVars = [
    'temperature_2m',
    'wind_speed_10m',
    'wind_gusts_10m',
    'cloud_cover',
    'visibility',
  ].join(',');
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    hourly: hourlyVars,
    forecast_days: '1',
    timezone: 'auto',
    units: 'imperial',
  });
  const url = apiUrl(`/api/openmeteo/hourly?${params.toString()}`);
  const r = await fetchWithTimeout(url, 12000);
  if (!r.ok) throw new Error(`Route weather fetch failed (${r.status})`);
  const j = await r.json();
  const times = Array.isArray(j?.hourly?.time) ? j.hourly.time : [];
  const now = Date.now();
  let idx = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(String(times[i])).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - now);
    if (diff < best) {
      best = diff;
      idx = i;
    }
  }
  const pick = (arr: any) => (Array.isArray(arr) && idx >= 0 && idx < arr.length ? arr[idx] : null);
  return {
    tempF: num(pick(j?.hourly?.temperature_2m)),
    windMph: num(pick(j?.hourly?.wind_speed_10m)),
    gustMph: num(pick(j?.hourly?.wind_gusts_10m)),
    cloudPct: num(pick(j?.hourly?.cloud_cover)),
    visMi: milesFromMaybeMeters(num(pick(j?.hourly?.visibility))),
  };
}

async function fetchWxBatch(points: Array<{ lat: number; lon: number }>): Promise<Wx[]> {
  if (!points.length) return [];
  const rows = await fetchHourlyForecastBatch({
    points,
    hourly: ['temperature_2m', 'wind_speed_10m', 'wind_gusts_10m', 'cloud_cover', 'visibility'].join(','),
    forecastDays: 1,
    timezone: 'auto',
    units: 'imperial',
  });
  const now = Date.now();

  return rows.map((row) => {
    const idx = nearestTimeIndex(row?.hourly?.time, now);
    const pick = (arr: any) => (Array.isArray(arr) && idx >= 0 && idx < arr.length ? arr[idx] : null);
    return {
      tempF: num(pick(row?.hourly?.temperature_2m)),
      windMph: num(pick(row?.hourly?.wind_speed_10m)),
      gustMph: num(pick(row?.hourly?.wind_gusts_10m)),
      cloudPct: num(pick(row?.hourly?.cloud_cover)),
      visMi: milesFromMaybeMeters(num(pick(row?.hourly?.visibility))),
    };
  });
}

async function fetchProduct(kind: 'metar' | 'taf', code: string) {
  const r = await fetchWithTimeout(
    `https://aviationweather.gov/api/data/${kind}?ids=${encodeURIComponent(code)}&format=json`,
    10000,
    { headers: { Accept: 'application/json' } }
  );
  if (!r.ok) return null;
  return rows(await r.json().catch(() => null))[0] ?? null;
}

function stopFromMetarFeature(feature: any): Stop | null {
  const coords = feature?.geometry?.coordinates;
  const lon = num(coords?.[0]);
  const lat = num(coords?.[1]);
  if (lat == null || lon == null) return null;

  const props = feature?.properties ?? {};
  const code = String(props?.stationLabel ?? props?.icaoId ?? props?.icao ?? props?.id ?? props?.station ?? '').toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return null;

  const label = String(props?.site ?? props?.name ?? props?.stationName ?? code).trim() || code;
  return { raw: code, code, label, lat, lon };
}

function nearestStopFromMetarFeatures(features: any[], lat: number, lon: number): Stop | null {
  const byCode = new Map<string, Stop>();
  for (const feature of features) {
    const stop = stopFromMetarFeature(feature);
    if (!stop?.code || byCode.has(stop.code)) continue;
    byCode.set(stop.code, stop);
  }

  let best: { stop: Stop; distanceMi: number } | null = null;
  for (const stop of byCode.values()) {
    const distanceMi = mi(lat, lon, stop.lat, stop.lon);
    if (!best || distanceMi < best.distanceMi) best = { stop, distanceMi };
  }
  return best?.stop ?? null;
}

async function fetchNearestMetarStation(lat: number, lon: number): Promise<Stop | null> {
  const radii = [4, 8, 14];

  for (const radius of radii) {
    const south = Math.max(-90, lat - radius);
    const north = Math.min(90, lat + radius);
    const west = Math.max(-180, lon - radius);
    const east = Math.min(180, lon + radius);
    const url =
      `https://aviationweather.gov/api/data/metar?format=geojson&hours=6` +
      `&bbox=${encodeURIComponent(`${south},${west},${north},${east}`)}`;

    try {
      const r = await fetchWithTimeout(url, 9000, {
        headers: { Accept: 'application/geo+json, application/json' },
      });
      if (!r.ok) continue;
      const json = await r.json().catch(() => null);
      const features = Array.isArray(json?.features) ? json.features : [];
      const nearest = nearestStopFromMetarFeatures(features, lat, lon);
      if (nearest) return nearest;
    } catch {
      // Try the next wider box.
    }
  }

  const indexedCandidates = nearestAirportCandidates(lat, lon, 8);
  if (indexedCandidates.length) {
    const url =
      `https://aviationweather.gov/api/data/metar?format=geojson&hours=6` +
      `&ids=${encodeURIComponent(indexedCandidates.map((airport) => airport.icao).join(','))}`;
    try {
      const r = await fetchWithTimeout(url, 9000, {
        headers: { Accept: 'application/geo+json, application/json' },
      });
      if (r.ok) {
        const json = await r.json().catch(() => null);
        const features = Array.isArray(json?.features) ? json.features : [];
        const nearest = nearestStopFromMetarFeatures(features, lat, lon);
        if (nearest) return nearest;
      }
    } catch {
      // Fall through to the static nearest airport fallback below.
    }

    const nearestIndexed = indexedCandidates[0];
    return {
      raw: nearestIndexed.icao,
      code: nearestIndexed.icao,
      label: nearestIndexed.name,
      lat: nearestIndexed.lat,
      lon: nearestIndexed.lon,
    };
  }

  return null;
}

const metarRaw = (row: any) => str(row?.rawOb, row?.raw_text, row?.raw, row?.metar, row?.observation);
const tafRaw = (row: any) => str(row?.rawTAF, row?.raw_text, row?.raw, row?.taf);
const visibilityMiles = (row: any) => {
  const direct = looseNum(row?.visib, row?.visibility, row?.visibility_statute_mi, row?.visibility_mi, row?.vis);
  if (direct != null) return direct;
  const meters = num(row?.visibility_meters, row?.visibility_m);
  return meters == null ? null : meters / 1609.344;
};
const ceilingFeet = (row: any) => {
  const direct = num(row?.ceiling, row?.ceiling_ft_agl, row?.ceilingFtAgl);
  if (direct != null) return direct;
  const cloudBases = [
    ...(Array.isArray(row?.clouds) ? row.clouds : []),
    ...(Array.isArray(row?.skyCover) ? row.skyCover : []),
    ...(Array.isArray(row?.sky_condition) ? row.sky_condition : []),
  ]
    .filter((c: any) => {
      const cover = str(c?.cover, c?.sky_cover, c?.type)?.toUpperCase();
      return cover === 'BKN' || cover === 'OVC' || cover === 'VV';
    })
    .map((c: any) => num(c?.base, c?.base_ft_agl, c?.cloud_base_ft_agl))
    .filter((v: any) => v != null) as number[];
  return cloudBases.length ? Math.min(...cloudBases) : null;
};
const flightCat = (row: any) => {
  const direct = str(row?.fltCat, row?.flight_category, row?.flightCategory, row?.flight_rules, row?.category);
  if (direct) return direct;
  const vis = visibilityMiles(row);
  const ceil = ceilingFeet(row);
  if (vis == null && ceil == null) return null;
  if ((ceil != null && ceil < 500) || (vis != null && vis < 1)) return 'LIFR';
  if ((ceil != null && ceil < 1000) || (vis != null && vis < 3)) return 'IFR';
  if ((ceil != null && ceil <= 3000) || (vis != null && vis <= 5)) return 'MVFR';
  return 'VFR';
};
const windText = (row: any) => {
  const d = num(row?.wdir, row?.wind_dir_degrees, row?.windDirection);
  const s = num(row?.wspd, row?.wind_speed_kt, row?.windSpeedKt);
  const g = num(row?.wgst, row?.wind_gust_kt, row?.windGustKt);
  return d == null && s == null && g == null
    ? '--'
    : `${d == null ? 'VRB' : `${Math.round(d)}�`} / ${s == null ? '--' : `${Math.round(s)} kt`}${g == null ? '' : ` G${Math.round(g)}`}`;
};
const tempDew = (row: any) => {
  const t = num(row?.temp, row?.tempC, row?.temperature_c);
  const d = num(row?.dewp, row?.dewpointC, row?.dewpoint_c);
  return t == null && d == null ? '--' : `${t == null ? '--' : `${Math.round(t)}C`} / ${d == null ? '--' : `${Math.round(d)}C`}`;
};
const altim = (row: any) => {
  const a = num(row?.altim, row?.altimeter, row?.altimeter_in_hg, row?.altimeter_hpa);
  return a == null ? '--' : a > 100 ? `${a.toFixed(0)} hPa` : `${a.toFixed(2)} inHg`;
};
const visText = (row: any) => {
  const v = visibilityMiles(row);
  return v == null ? '--' : `${v < 10 ? v.toFixed(1) : v.toFixed(0)} sm`;
};
const ceilText = (row: any) => {
  const c = ceilingFeet(row);
  if (c != null) return `${Math.round(c)} ft`;
  const clouds = [
    ...(Array.isArray(row?.clouds) ? row.clouds : []),
    ...(Array.isArray(row?.skyCover) ? row.skyCover : []),
    ...(Array.isArray(row?.sky_condition) ? row.sky_condition : []),
  ];
  return clouds.length ? 'No ceiling detected' : '--';
};
const tafSummary = (row: any) => {
  const raw = tafRaw(row);
  if (!raw) return '--';
  return raw
    .replace(/^TAF\s+[A-Z0-9]+\s+\d{6}Z?\s*/i, '')
    .trim()
    .replace(/\bFM(\d{6})\b/g, 'From $1Z')
    .replace(/\bTEMPO\b/g, 'Tempo')
    .replace(/\bBECMG\b/g, 'Becoming')
    .replace(/\bPROB30\b/g, '30% chance')
    .replace(/\bPROB40\b/g, '40% chance');
};

function categoryTone(category: string | null | undefined): 'low' | 'elevated' | 'high' {
  const cat = String(category ?? '').toUpperCase();
  if (cat === 'IFR' || cat === 'LIFR') return 'high';
  if (cat === 'MVFR') return 'elevated';
  return 'low';
}

function categoryColor(category: string | null | undefined) {
  const cat = String(category ?? '').toUpperCase();
  if (cat === 'VFR') return '#22c55e';
  if (cat === 'MVFR') return '#3b82f6';
  if (cat === 'IFR') return '#ef4444';
  if (cat === 'LIFR') return '#c084fc';
  return 'rgba(255,255,255,0.45)';
}

function pilotDecision(row: any, taf: any) {
  const cat = flightCat(row);
  const tone = categoryTone(cat);
  const vis = visibilityMiles(row);
  const ceil = ceilingFeet(row);
  const wind = num(row?.wspd, row?.wind_speed_kt, row?.windSpeedKt);
  const gust = num(row?.wgst, row?.wind_gust_kt, row?.windGustKt);
  const rawTaf = tafRaw(taf)?.toUpperCase() ?? '';
  const hasConvectiveTaf = /\b(TS|VCTS|CB)\b/.test(rawTaf);
  const hasLowTaf = /\b(IFR|LIFR|OVC00|BKN00|VV00|1\/2SM|1SM|2SM)\b/.test(rawTaf);

  const concerns: string[] = [];
  if (tone === 'high') concerns.push(`${cat ?? 'Low category'} conditions`);
  if (tone === 'elevated') concerns.push('Marginal flight category');
  if (ceil != null && ceil <= 3000) concerns.push(`ceiling ${Math.round(ceil)} ft`);
  if (vis != null && vis <= 5) concerns.push(`visibility ${vis < 10 ? vis.toFixed(1) : vis.toFixed(0)} sm`);
  if (gust != null && gust >= 25) concerns.push(`gusts ${Math.round(gust)} kt`);
  else if (wind != null && wind >= 20) concerns.push(`wind ${Math.round(wind)} kt`);
  if (hasConvectiveTaf) concerns.push('thunder in TAF');
  if (hasLowTaf) concerns.push('lower forecast groups');

  if (tone === 'high' || hasConvectiveTaf || hasLowTaf) {
    return {
      label: 'High attention',
      tone: 'high' as const,
      summary: concerns.slice(0, 3).join(' / ') || 'Airport weather needs a close read.',
    };
  }
  if (tone === 'elevated' || concerns.length) {
    return {
      label: 'Watch closely',
      tone: 'elevated' as const,
      summary: concerns.slice(0, 3).join(' / ') || 'Conditions are usable but not hands-off.',
    };
  }
  return {
    label: 'Favorable',
    tone: 'low' as const,
    summary: 'Current METAR is VFR with no obvious station-level concern.',
  };
}

function tafTimeline(row: any) {
  const raw = tafRaw(row);
  if (!raw) return [];
  const compact = raw.replace(/\s+/g, ' ').trim();
  const matches = Array.from(compact.matchAll(/\b(FM\d{6}|TEMPO|BECMG|PROB(?:30|40))\b/g));
  if (!matches.length) return [{ label: 'TAF', text: tafSummary(row) }];
  return matches.slice(0, 5).map((match, idx) => {
    const start = match.index ?? 0;
    const end = idx + 1 < matches.length ? matches[idx + 1].index ?? compact.length : compact.length;
    const token = match[1];
    const label = token.startsWith('FM')
      ? `From ${token.slice(2, 4)}:${token.slice(4, 6)}Z`
      : token === 'TEMPO'
        ? 'Temporary'
        : token === 'BECMG'
          ? 'Becoming'
          : token.replace('PROB', 'Chance ');
    return { label, text: compact.slice(start, end).trim() };
  });
}

function routeDecision(samples: Sample[] | undefined) {
  if (!samples?.length) return { label: 'Route not analyzed', tone: 'low' as const, summary: 'Analyze a flight to build route timing and hazards.' };
  const high = samples.filter((sample) => sample.severity === 'high').length;
  const elevated = samples.filter((sample) => sample.severity === 'elevated').length;
  if (high) return { label: 'High attention', tone: 'high' as const, summary: `${high} route segment${high === 1 ? '' : 's'} matched high-concern aviation weather.` };
  if (elevated) return { label: 'Watch closely', tone: 'elevated' as const, summary: `${elevated} route segment${elevated === 1 ? '' : 's'} matched elevated aviation weather.` };
  return { label: 'Favorable corridor', tone: 'low' as const, summary: 'No matched product-based advisories along the sampled route.' };
}

async function saveAviationWidgetStation(stop: Stop) {
  const code = stop.code ?? stop.raw.trim().toUpperCase();
  if (!code) return;
  try {
    await AsyncStorage.setItem(AVIATION_WIDGET_SELECTION_KEY, JSON.stringify({
      type: 'airport',
      station: code,
      name: stop.label,
      lat: stop.lat,
      lon: stop.lon,
      savedAt: Date.now(),
    }));
  } catch {}
}

async function saveAviationWidgetRoute(flight: Flight) {
  const decision = routeDecision(flight.samples);
  const worst = [...flight.samples].sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0];
  const origin = flight.origin.code ?? flight.origin.label;
  const destination = flight.destination.code ?? flight.destination.label;
  const hazards = [
    flight.counts.turbulence ? `${flight.counts.turbulence} turbulence` : null,
    flight.counts.icing ? `${flight.counts.icing} icing` : null,
    flight.counts.sigmet ? `${flight.counts.sigmet} SIGMET` : null,
    flight.counts.cwa ? `${flight.counts.cwa} CWA` : null,
    flight.counts.pirep ? `${flight.counts.pirep} PIREP` : null,
  ].filter(Boolean).join(' / ');
  try {
    await AsyncStorage.setItem(AVIATION_WIDGET_SELECTION_KEY, JSON.stringify({
      type: 'route',
      title: `${origin} to ${destination}`,
      category: decision.label,
      summary: worst ? `${worst.label}: ${worst.severity}` : decision.summary,
      hazards: hazards || 'No matched route advisories',
      altitudeFt: flight.cruiseAltitudeFt,
      departureIso: flight.departureIso,
      counts: flight.counts,
      worstSegment: worst
        ? {
            label: worst.label,
            distanceMi: worst.distanceMi,
            etaIso: worst.etaIso,
            severity: worst.severity,
            concern: worst.advisories[0]
              ? `${worst.advisories[0].product} ${worst.advisories[0].hazard} ${worst.advisories[0].altitude}`
              : `Airport/weather risk ${worst.severity}`,
          }
        : null,
      savedAt: Date.now(),
    }));
  } catch {}
}

function airportFavoriteFromStop(stop: Stop): SavedAirport | null {
  const code = (stop.code ?? stop.raw).trim().toUpperCase();
  if (!code) return null;
  return {
    id: code,
    code,
    label: stop.label,
    lat: stop.lat,
    lon: stop.lon,
    savedAt: Date.now(),
  };
}

function routeFavoriteFromFlight(flight: Flight, departureOffsetMin: number): SavedRoute {
  const from = flight.origin.code ?? flight.origin.raw.trim().toUpperCase();
  const to = flight.destination.code ?? flight.destination.raw.trim().toUpperCase();
  return {
    id: `${from}:${to}:${flight.cruiseAltitudeFt}`,
    from,
    to,
    label: `${from} to ${to}`,
    cruiseAltitudeFt: flight.cruiseAltitudeFt,
    departureOffsetMin,
    savedAt: Date.now(),
  };
}

async function loadAviationFavorites() {
  try {
    const raw = await AsyncStorage.getItem(AVIATION_FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const airports = Array.isArray(parsed?.airports) ? parsed.airports : [];
    const routes = Array.isArray(parsed?.routes) ? parsed.routes : [];
    return {
      airports: airports
        .map((item: any) => ({
          id: String(item.id ?? item.code ?? ''),
          code: String(item.code ?? item.id ?? '').toUpperCase(),
          label: String(item.label ?? item.code ?? 'Saved airport'),
          lat: Number(item.lat),
          lon: Number(item.lon),
          savedAt: Number(item.savedAt ?? 0),
        }))
        .filter((item: SavedAirport) => item.id && item.code && Number.isFinite(item.lat) && Number.isFinite(item.lon)),
      routes: routes
        .map((item: any) => ({
          id: String(item.id ?? ''),
          from: String(item.from ?? '').toUpperCase(),
          to: String(item.to ?? '').toUpperCase(),
          label: String(item.label ?? 'Saved route'),
          cruiseAltitudeFt: Number(item.cruiseAltitudeFt),
          departureOffsetMin: Number(item.departureOffsetMin ?? 0),
          savedAt: Number(item.savedAt ?? 0),
        }))
        .filter((item: SavedRoute) => item.id && item.from && item.to && Number.isFinite(item.cruiseAltitudeFt)),
    };
  } catch {
    return { airports: [] as SavedAirport[], routes: [] as SavedRoute[] };
  }
}

async function saveAviationFavorites(airports: SavedAirport[], routes: SavedRoute[]) {
  try {
    await AsyncStorage.setItem(AVIATION_FAVORITES_KEY, JSON.stringify({ airports, routes }));
  } catch {}
}

export default function AviationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { active } = usePlace();
  const [mode, setMode] = useState<Mode>('station');
  // Continental hazards and PIREPs are route/map context. Keeping that heavy
  // bundle off the station landing path lets the nearest airport briefing load
  // from a single local METAR query first.
  const aviation = useAviationMapData(isFocused && mode === 'flight');
  const [reportView, setReportView] = useState<ReportView>('decoded');
  const [stationInput, setStationInput] = useState('KPHX');
  const [fromInput, setFromInput] = useState('KPHX');
  const [toInput, setToInput] = useState('KDEN');
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(12000);
  const [departureOffsetMin, setDepartureOffsetMin] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [mapRegion, setMapRegion] = useState<Region>(DEFAULT_REGION);
  const [learnVisible, setLearnVisible] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
  const [savedAirports, setSavedAirports] = useState<SavedAirport[]>([]);
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);
  const lastNearestFieldSyncRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAviationFavorites().then((favorites) => {
      if (!mounted) return;
      setSavedAirports(favorites.airports);
      setSavedRoutes(favorites.routes);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const persistAirportFavorite = async (stop: Stop) => {
    const favorite = airportFavoriteFromStop(stop);
    if (!favorite) return;
    const next = [favorite, ...savedAirports.filter((item) => item.id !== favorite.id)].slice(0, 20);
    setSavedAirports(next);
    await saveAviationFavorites(next, savedRoutes);
    await saveAviationWidgetStation(stop);
  };

  const persistRouteFavorite = async (nextFlight: Flight) => {
    const favorite = routeFavoriteFromFlight(nextFlight, departureOffsetMin);
    const next = [favorite, ...savedRoutes.filter((item) => item.id !== favorite.id)].slice(0, 20);
    setSavedRoutes(next);
    await saveAviationFavorites(savedAirports, next);
    await saveAviationWidgetRoute(nextFlight);
  };

  const activateAirportFavorite = (favorite: SavedAirport) => {
    setMode('station');
    setStationInput(favorite.code);
  };

  const activateRouteFavorite = (favorite: SavedRoute) => {
    setMode('flight');
    setFromInput(favorite.from);
    setToInput(favorite.to);
    setCruiseAltitudeFt(favorite.cruiseAltitudeFt);
    setDepartureOffsetMin(favorite.departureOffsetMin);
  };

  const openLearn = (id: string) => {
    setLearnTopicId(id);
    setLearnVisible(true);
  };
  const headerSubtitle =
    mode === 'station'
      ? 'Airport conditions, decoded reports, and map-ready station weather'
      : 'Route scans, corridor hazards, and aviation-focused map context';

  const openMap = () => {
    if (mode === 'station' && station) {
      router.push({ pathname: '/maps', params: { view: 'aviation', focus: 'once', lat: String(station.station.lat), lon: String(station.station.lon), label: station.station.code ?? station.station.label } });
      return;
    }
    if (mode === 'flight' && flight) {
      const c = region(flight.samples);
      router.push({ pathname: '/maps', params: { view: 'aviation', focus: 'once', lat: String(c.latitude), lon: String(c.longitude), label: `${flight.origin.code ?? flight.origin.label} to ${flight.destination.code ?? flight.destination.label}` } });
      return;
    }
    router.push({ pathname: '/maps', params: { view: 'aviation' } });
  };

  const loadStation = async () => {
    if (!stationInput.trim()) {
      setError('Enter an airport station code.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await resolveStation(stationInput.trim());
      const code = s.code ?? s.raw.trim().toUpperCase();
      const [metar, taf] = await Promise.all([fetchProduct('metar', code), fetchProduct('taf', code)]);
      setStation({ station: s, metar, taf });
      await saveAviationWidgetStation(s);
      setFlight(null);
      setMapRegion({ latitude: s.lat, longitude: s.lon, latitudeDelta: 3, longitudeDelta: 3, zoom: 6 });
    } catch (err: any) {
      setStation(null);
      setError(err?.message ?? 'Unable to load station data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    if (mode !== 'station') return;
    if (!active || !Number.isFinite(active.lat) || !Number.isFinite(active.lon)) return;

    const lat = Number(active.lat);
    const lon = Number(active.lon);
    const key = [active.source ?? 'place', active.id ?? active.name ?? 'active', lat.toFixed(4), lon.toFixed(4)].join('|');
    if (lastNearestFieldSyncRef.current === key) return;

    let cancelled = false;
    lastNearestFieldSyncRef.current = key;
    setStation(null);
    setFlight(null);
    setLoading(true);
    setError(null);

    async function syncNearestField() {
      const nearest =
        nearestStopFromMetarFeatures(aviation.metars.features ?? [], lat, lon) ??
        (await fetchNearestMetarStation(lat, lon));

      if (cancelled) return;
      if (!nearest?.code) {
        lastNearestFieldSyncRef.current = null;
        setLoading(false);
        return;
      }

      setStationInput(nearest.code);

      try {
        const [metar, taf] = await Promise.all([
          fetchProduct('metar', nearest.code),
          fetchProduct('taf', nearest.code),
        ]);
        if (cancelled) return;
        setStation({ station: nearest, metar, taf });
        setFlight(null);
        setMapRegion({ latitude: nearest.lat, longitude: nearest.lon, latitudeDelta: 3, longitudeDelta: 3, zoom: 6 });
      } catch (err: any) {
        if (cancelled) return;
        lastNearestFieldSyncRef.current = null;
        setStation(null);
        setError(err?.message ?? 'Unable to load the nearest field.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    syncNearestField();

    return () => {
      cancelled = true;
    };
  }, [
    active?.id,
    active?.lat,
    active?.lon,
    active?.name,
    active?.source,
    aviation.metars.features,
    isFocused,
    mode,
  ]);

  const analyzeFlight = async () => {
    if (!fromInput.trim() || !toInput.trim()) {
      setError('Enter both a From and To airport or place.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [origin, destination] = await Promise.all([resolveStop(fromInput.trim()), resolveStop(toInput.trim())]);
      const departureMs = Date.now() + departureOffsetMin * 60 * 1000;
      const routeSpeedMph = 160;
      const [originMetar, destinationMetar] = await Promise.all([
        origin.code ? fetchProduct('metar', origin.code).catch(() => null) : Promise.resolve(null),
        destination.code ? fetchProduct('metar', destination.code).catch(() => null) : Promise.resolve(null),
      ]);
      const loadedAviationProductCount = aviation.allHazards.features.length + aviation.pireps.features.length;
      if (loadedAviationProductCount === 0) {
        if (aviation.loading) {
          throw new Error('Aviation advisory products are still loading. Wait a few seconds, then analyze the route again.');
        }
        throw new Error(aviation.error ? `Aviation advisory products did not load: ${aviation.error}` : 'Aviation advisory products did not load yet. Try again in a moment.');
      }
      const normalizedHazards = normalizeAviationFeatureCollection(aviation.allHazards);
      const normalizedPireps = normalizeAviationFeatureCollection(aviation.pireps);
      const totalDistanceMi = mi(origin.lat, origin.lon, destination.lat, destination.lon);
      const routeFractions = [0, 0.2, 0.4, 0.6, 0.8, 1];
      const pts = routeFractions.map((t, i) => {
        return {
          key: `pt-${i}`,
          label:
            i === 0
              ? 'Depart'
              : i === routeFractions.length - 1
                ? 'Arrival'
                : `${Math.round(t * 100)}%`,
          lat: origin.lat + (destination.lat - origin.lat) * t,
          lon: origin.lon + (destination.lon - origin.lon) * t,
          distanceMi: totalDistanceMi * t,
          etaIso: new Date(departureMs + (totalDistanceMi * t / routeSpeedMph) * 60 * 60 * 1000).toISOString(),
        };
      });
      const corridor = expand(bounds(pts), 1.2);
      let wx: Wx[] = [];
      try {
        wx = await fetchWxBatch(pts);
      } catch {
        wx = await Promise.all(pts.map((p) => fetchWx(p.lat, p.lon)));
      }
      const samples: Sample[] = pts.map((p, i) => {
        const box = { west: p.lon, east: p.lon, south: p.lat, north: p.lat };
        const productAdvisories = normalizedHazards
          .filter((feature) => {
            const b = featureBounds({ geometry: feature.geometry });
            return b ? intersects(expand(b, 0.75), box) && altitudeApplies(feature, cruiseAltitudeFt) && timeApplies(feature, p.etaIso) : false;
          })
          .map(makeRouteAdvisory);
        const pirepAdvisories = normalizedPireps
          .filter((feature) => {
            const c = feature.geometry?.coordinates;
            return Array.isArray(c) && c.length >= 2 && mi(p.lat, p.lon, Number(c[1]), Number(c[0])) <= 65 && altitudeApplies(feature, cruiseAltitudeFt);
          })
          .map(makeRouteAdvisory);
        const airportRisk =
          i === 0 ? airportRiskFromMetar(originMetar) : i === pts.length - 1 ? airportRiskFromMetar(destinationMetar) : 'low';
        const advisories = [...productAdvisories, ...pirepAdvisories]
          .sort((a, b) => b.rank - a.rank)
          .slice(0, 5);
        const advisoryScore = advisories.reduce((max, advisory) => Math.max(max, advisory.rank), 0);
        const airportScore = airportRisk === 'high' ? 5 : airportRisk === 'elevated' ? 3 : 0;
        return {
          ...p,
          weather: wx[i],
          advisories,
          airportRisk,
          severity: severityFromScore(Math.max(advisoryScore, airportScore)),
        };
      });
      const matchedAdvisories = Array.from(new Map(samples.flatMap((sample) => sample.advisories).map((advisory) => [advisory.key, advisory])).values());
      const nextFlight = {
        origin,
        destination,
        totalDistanceMi,
        cruiseAltitudeFt,
        departureIso: new Date(departureMs).toISOString(),
        samples,
        counts: {
          turbulence: matchedAdvisories.filter((f) => f.hazardType === 'turb').length,
          icing: matchedAdvisories.filter((f) => f.hazardType === 'ice').length,
          sigmet: matchedAdvisories.filter((f) => f.productType === 'sigmet' || f.productType === 'convectiveSigmet').length,
          cwa: matchedAdvisories.filter((f) => f.productType === 'cwa').length,
          pirep: matchedAdvisories.filter((f) => f.productType === 'pirep').length,
        },
      };
      setFlight(nextFlight);
      await saveAviationWidgetRoute(nextFlight);
      setStation(null);
      setMapRegion(region(pts));
    } catch (err: any) {
      setFlight(null);
      setError(err?.message ?? 'Unable to analyze this route.');
    } finally {
      setLoading(false);
    }
  };

  const routeLine = useMemo(() => flight ? ({ type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: flight.samples.map((p) => [p.lon, p.lat]) } }] }) : EMPTY_FC, [flight]);
  const routePts = useMemo(() => flight ? ({ type: 'FeatureCollection' as const, features: flight.samples.map((p) => ({ type: 'Feature' as const, id: p.key, properties: { label: p.label, severity: p.severity }, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] } })) }) : EMPTY_FC, [flight]);

  return (
    <SafeAreaView style={s.safe}>
      <AnimatedPageBackground variant="aviation" />
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 28 + insets.bottom }} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={s.brandRow}>
            <View style={s.brandLeft}>
              <Image source={OMNI_MARK_WORD} style={s.brandWordmark} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle}>Aviation</Text>
                <Text style={s.headerSubtitle}>{headerSubtitle}</Text>
              </View>
            </View>
          </View>
        </View>

        <Card style={s.hero}>
          <Text style={s.eyebrow}>AVIATION</Text>
          <Text style={s.title}>Flight weather</Text>
          <Text style={s.subtitle}>Pilots can load station reports. Travelers can analyze a route and jump into the aviation map.</Text>
          <View style={s.mode}><Seg onPress={() => setMode('station')} active={mode === 'station'} label="Airport Briefing" /><Seg onPress={() => setMode('flight')} active={mode === 'flight'} label="Route Briefing" /></View>
          {mode === 'station' && savedAirports.length ? (
            <FavoriteRail
              label="Favorite fields"
              items={savedAirports}
              getKey={(item) => item.id}
              getLabel={(item) => item.code}
              onPress={activateAirportFavorite}
            />
          ) : null}
          {mode === 'flight' && savedRoutes.length ? (
            <FavoriteRail
              label="Favorite routes"
              items={savedRoutes}
              getKey={(item) => item.id}
              getLabel={(item) => item.label}
              onPress={activateRouteFavorite}
            />
          ) : null}

          {mode === 'station' ? (
            <>
              <Label text="Airport" />
              <TextInput value={stationInput} onChangeText={setStationInput} autoCapitalize="characters" autoCorrect={false} placeholder="KPHX or PHX" placeholderTextColor="rgba(255,255,255,0.34)" style={s.input} />
              <View style={s.actions}><Primary onPress={loadStation} label="Load Station" loading={loading} /><Secondary onPress={openMap} label="Open Aviation Map" /></View>
              <View style={s.learnRow}><Learn onPress={() => openLearn('aviation-metar')} label="METAR" /><Learn onPress={() => openLearn('aviation-taf')} label="TAF" /><Learn onPress={() => openLearn('aviation-flight-category')} label="Flight Cat" /></View>
            </>
          ) : (
            <Text style={s.disclaimer}>For situational awareness only. Not for flight planning or navigation. Verify with official FAA/NWS/AWC briefing sources.</Text>
          )}

          <Text style={s.helper}>Three- and four-letter airport codes are supported, with ICAO/IATA help for the US, Canada, Mexico, the Caribbean, and nearby Central America where AWC data is available.</Text>
          {mode === 'station' ? (
            <Text style={[s.summary, error ? s.error : null]}>{error ?? (station ? `Loaded ${station.station.code ?? station.station.label}.` : 'Enter a station to load raw and decoded aviation weather.')}</Text>
          ) : null}
        </Card>

        {mode === 'station' && station ? (
          <>
            <AirportWeatherBoard station={station} onOpenLearn={openLearn} />
            <View style={s.actions}><Secondary onPress={() => persistAirportFavorite(station.station)} label="Save Favorite Field" /><Secondary onPress={() => saveAviationWidgetStation(station.station)} label="Use on Widget" /></View>
            <Glass style={s.card}><View style={s.cardHead}><Text style={s.cardTitle}>Decoded METAR</Text><Learn onPress={() => openLearn('aviation-metar')} label="METAR" /></View><Text style={s.raw}>{`${flightCat(station.metar) ?? 'Unknown'} conditions. Wind ${windText(station.metar)}. Visibility ${visText(station.metar)}. Ceiling ${ceilText(station.metar)}. Temperature / Dew Point ${tempDew(station.metar)}. Altimeter ${altim(station.metar)}.`}</Text></Glass>
            <TafTimelineCard taf={station.taf} onOpenLearn={openLearn} />
            <Glass style={s.card}><View style={s.cardHead}><Text style={s.cardTitle}>Decoded TAF</Text><Learn onPress={() => openLearn('aviation-taf')} label="TAF" /></View><Text style={s.raw}>{tafSummary(station.taf)}</Text></Glass>
            <Glass style={s.card}><Text style={s.cardTitle}>Raw</Text><Text style={s.sectionLabel}>METAR</Text><Text style={s.raw}>{metarRaw(station.metar) ?? 'No METAR returned.'}</Text><Text style={s.sectionLabel}>TAF</Text><Text style={s.raw}>{tafRaw(station.taf) ?? 'No TAF returned.'}</Text></Glass>
          </>
        ) : null}

        {mode === 'flight' ? (
          <>
            <RouteSummaryCard flight={flight} fromInput={fromInput} toInput={toInput} cruiseAltitudeFt={cruiseAltitudeFt} departureOffsetMin={departureOffsetMin} loading={loading} error={error} />
            <RouteMapCard flight={flight} routeLine={routeLine} routePts={routePts} mapRegion={mapRegion} />
            <CompactRouteForm fromInput={fromInput} toInput={toInput} cruiseAltitudeFt={cruiseAltitudeFt} departureOffsetMin={departureOffsetMin} loading={loading} onFromChange={setFromInput} onToChange={setToInput} onCruiseChange={setCruiseAltitudeFt} onDepartureChange={setDepartureOffsetMin} onAnalyze={analyzeFlight} onOpenMap={openMap} onOpenLearn={openLearn} />
            {flight ? <View style={s.actions}><Secondary onPress={() => persistRouteFavorite(flight)} label="Save Favorite Route" /><Secondary onPress={() => saveAviationWidgetRoute(flight)} label="Use on Widget" /></View> : null}
            <RouteProfileCard flight={flight} departureOffsetMin={departureOffsetMin} />
            {flight?.samples.map((sample) => <RouteCheckpointCard key={sample.key} sample={sample} />)}
          </>
        ) : null}

        <LearnMoreModal visible={learnVisible} onClose={() => setLearnVisible(false)} initialTopicId={learnTopicId} />
      </ScrollView>
    </SafeAreaView>
  );
}
function Label({ text }: { text: string }) { return <Text style={s.label}>{text}</Text>; }
function Seg({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[s.seg, active ? s.segOn : null]}><Text style={[s.segText, active ? s.segTextOn : null]}>{label}</Text></Pressable>; }
function Learn({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={s.learn}><Text style={s.learnText}>{label}</Text></Pressable>; }
function Primary({ label, onPress, loading }: { label: string; onPress: () => void; loading: boolean }) { return <Pressable onPress={onPress} disabled={loading} style={[s.primary, loading ? s.dim : null]}>{loading ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{label}</Text>}</Pressable>; }
function Secondary({ label, onPress }: { label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={s.secondary}><Text style={s.secondaryText}>{label}</Text></Pressable>; }
function Stat({ label, value }: { label: string; value: string }) { return <Glass style={s.stat}><Text style={s.statLabel}>{label}</Text><Text style={s.statValue}>{value}</Text></Glass>; }
function Row({ label, value }: { label: string; value: string }) { return <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{value}</Text></View>; }

function FavoriteRail<T>({
  label,
  items,
  getKey,
  getLabel,
  onPress,
}: {
  label: string;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  onPress: (item: T) => void;
}) {
  return (
    <View style={s.favoriteBlock}>
      <Text style={s.favoriteLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.favoriteRail}>
        {items.map((item) => (
          <Pressable key={getKey(item)} onPress={() => onPress(item)} style={s.favoriteChip}>
            <Text style={s.favoriteChipText}>{getLabel(item)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function toneStyle(tone: 'low' | 'elevated' | 'high') {
  return tone === 'high' ? s.high : tone === 'elevated' ? s.elevated : s.low;
}

function routeName(flight: Flight | null, fromInput: string, toInput: string) {
  const from = (flight?.origin.code ?? fromInput.trim().toUpperCase()) || 'FROM';
  const to = (flight?.destination.code ?? toInput.trim().toUpperCase()) || 'TO';
  return `${from} to ${to}`;
}

function routePrimaryConcern(flight: Flight | null) {
  if (!flight?.samples.length) return 'Enter a route to scan corridor weather, airport category, and matched pilot products.';
  const worst = [...flight.samples].sort((a, b) => {
    const rank = { high: 3, elevated: 2, low: 1 };
    return rank[b.severity] - rank[a.severity] || (b.advisories[0]?.rank ?? 0) - (a.advisories[0]?.rank ?? 0);
  })[0];
  const advisory = worst.advisories[0];
  const airportText = airportRiskText(worst.airportRisk);
  if (advisory) {
    const sev = advisory.severity ? `${advisory.severity.toLowerCase()} ` : '';
    return `${worst.label}: ${sev}${advisory.hazard.toLowerCase()} in ${advisory.product}; ${advisory.altitude}.`;
  }
  if (airportText) return `${worst.label}: ${airportText}`;
  return 'No matched advisory products along the sampled route at the selected altitude and time.';
}

function worstSegment(flight: Flight | null) {
  if (!flight?.samples.length) return null;
  const rank = { high: 3, elevated: 2, low: 1 };
  return [...flight.samples].sort((a, b) => rank[b.severity] - rank[a.severity] || (b.advisories[0]?.rank ?? 0) - (a.advisories[0]?.rank ?? 0))[0];
}

function flightCategoryBadge(flight: Flight | null) {
  if (!flight?.samples.length) return 'OK';
  const hasHigh = flight.samples.some((sample) => sample.airportRisk === 'high');
  const hasElevated = flight.samples.some((sample) => sample.airportRisk === 'elevated');
  if (hasHigh) return 'IFR';
  if (hasElevated) return 'MVFR';
  return 'VFR';
}

function RouteSummaryCard({
  flight,
  fromInput,
  toInput,
  cruiseAltitudeFt,
  departureOffsetMin,
  loading,
  error,
}: {
  flight: Flight | null;
  fromInput: string;
  toInput: string;
  cruiseAltitudeFt: number;
  departureOffsetMin: number;
  loading: boolean;
  error: string | null;
}) {
  const decision = routeDecision(flight?.samples);
  const displayedCruise = flight ? flight.cruiseAltitudeFt : cruiseAltitudeFt;
  const displayedDepart = flight ? utcShort(flight.departureIso) ?? departureLabel(departureOffsetMin) : departureLabel(departureOffsetMin);
  return (
    <Glass style={s.routeSummaryCard}>
      <View style={s.cardHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.sectionLabel}>Route briefing</Text>
          <Text style={s.routeTitle}>{routeName(flight, fromInput, toInput)}</Text>
          <Text style={s.cardSub}>{cruiseLabel(displayedCruise)} / depart {displayedDepart}</Text>
        </View>
        <View style={[s.pill, toneStyle(decision.tone)]}>
          <Text style={s.pillText}>{loading ? 'LOADING' : decision.label.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={[s.routeConcern, error ? s.error : null]}>{error ?? routePrimaryConcern(flight)}</Text>

      <View style={s.badgeGrid}>
        <RouteBadge label="Turbulence" value={flight ? String(flight.counts.turbulence) : '--'} tone={flight?.counts.turbulence ? 'elevated' : 'low'} />
        <RouteBadge label="Icing" value={flight ? String(flight.counts.icing) : '--'} tone={flight?.counts.icing ? 'elevated' : 'low'} />
        <RouteBadge label="Flight cat" value={flightCategoryBadge(flight)} tone={flightCategoryBadge(flight) === 'IFR' ? 'high' : flightCategoryBadge(flight) === 'MVFR' ? 'elevated' : 'low'} />
        <RouteBadge label="SIGMET" value={flight ? String(flight.counts.sigmet) : '--'} tone={flight?.counts.sigmet ? 'high' : 'low'} />
        <RouteBadge label="CWA" value={flight ? String(flight.counts.cwa) : '--'} tone={flight?.counts.cwa ? 'elevated' : 'low'} />
        <RouteBadge label="PIREPs" value={flight ? String(flight.counts.pirep) : '--'} tone={flight?.counts.pirep ? 'elevated' : 'low'} />
      </View>
    </Glass>
  );
}

function RouteBadge({ label, value, tone }: { label: string; value: string; tone: 'low' | 'elevated' | 'high' }) {
  return (
    <View style={[s.routeBadge, toneStyle(tone)]}>
      <Text style={s.routeBadgeLabel}>{label}</Text>
      <Text style={s.routeBadgeValue}>{value}</Text>
    </View>
  );
}

function RouteMapCard({ flight, routeLine, routePts, mapRegion }: { flight: Flight | null; routeLine: any; routePts: any; mapRegion: Region }) {
  return (
    <Glass style={s.card}>
      <View style={s.cardHead}>
        <View>
          <Text style={s.cardTitle}>Route map</Text>
          <Text style={s.cardSub}>Visual corridor with risk-coded checkpoints.</Text>
        </View>
      </View>
      <View style={s.map}>
        <MapRenderer key={flight ? `${flight.origin.code ?? flight.origin.label}-${flight.destination.code ?? flight.destination.label}` : 'empty'} engine="maplibre" initialRegion={mapRegion} mapStyle="dark" boundaryReliefTone="teal" onPanDrag={() => {}} onRegionChangeComplete={() => {}} radar={{ enabled: false, templates: [null, null, null], opacities: [0, 0, 0], tileMaxZ: 0, localImage: null }} overlays={[]}>
          <MapLibreGL.ShapeSource id="route-line" shape={routeLine as any}><MapLibreGL.LineLayer id="route-line-layer" style={{ lineColor: '#f8fafc', lineWidth: 3, lineOpacity: 0.92 }} /></MapLibreGL.ShapeSource>
          <MapLibreGL.ShapeSource id="route-pts" shape={routePts as any}>
            <MapLibreGL.CircleLayer id="route-pts-layer" style={{ circleColor: ['match', ['get', 'severity'], 'high', '#ef4444', 'elevated', '#f59e0b', '#22c55e'] as any, circleRadius: 5, circleStrokeColor: 'rgba(2,6,23,0.98)', circleStrokeWidth: 1.5 }} />
            <MapLibreGL.SymbolLayer id="route-labels" style={{ textField: ['get', 'label'], textSize: 10, textColor: '#e5e7eb', textHaloColor: 'rgba(2,6,23,0.98)', textHaloWidth: 1, textOffset: [0, 1.2], textAnchor: 'top' }} />
          </MapLibreGL.ShapeSource>
        </MapRenderer>
      </View>
    </Glass>
  );
}

function CompactRouteForm(props: {
  fromInput: string;
  toInput: string;
  cruiseAltitudeFt: number;
  departureOffsetMin: number;
  loading: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onCruiseChange: (value: number) => void;
  onDepartureChange: (value: number) => void;
  onAnalyze: () => void;
  onOpenMap: () => void;
  onOpenLearn: (id: string) => void;
}) {
  return (
    <Glass style={s.compactForm}>
      <View style={s.formGrid}>
        <View style={s.formCell}>
          <Label text="From" />
          <TextInput value={props.fromInput} onChangeText={props.onFromChange} autoCapitalize="characters" autoCorrect={false} placeholder="KPHX" placeholderTextColor="rgba(255,255,255,0.34)" style={s.input} />
        </View>
        <View style={s.formCell}>
          <Label text="To" />
          <TextInput value={props.toInput} onChangeText={props.onToChange} autoCapitalize="characters" autoCorrect={false} placeholder="KDEN" placeholderTextColor="rgba(255,255,255,0.34)" style={s.input} />
        </View>
        <View style={s.formCell}>
          <Label text="Cruise" />
          <TextInput value={cruiseLabel(props.cruiseAltitudeFt)} editable={false} style={[s.input, s.lockedInput]} />
        </View>
        <View style={s.formCell}>
          <Label text="Depart" />
          <TextInput value={departureLabel(props.departureOffsetMin)} editable={false} style={[s.input, s.lockedInput]} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {CRUISE_LEVELS.map((level) => <Seg key={level.feet} onPress={() => props.onCruiseChange(level.feet)} active={props.cruiseAltitudeFt === level.feet} label={level.label} />)}
      </ScrollView>
      <View style={s.learnRow}>
        {DEPARTURE_OFFSETS.map((option) => <Seg key={option.minutes} onPress={() => props.onDepartureChange(option.minutes)} active={props.departureOffsetMin === option.minutes} label={option.label} />)}
      </View>
      <View style={s.actions}><Primary onPress={props.onAnalyze} label="Analyze Route" loading={props.loading} /><Secondary onPress={props.onOpenMap} label="Open Map" /></View>
      <View style={s.learnRow}><Learn onPress={() => props.onOpenLearn('aviation-turbulence')} label="Turbulence" /><Learn onPress={() => props.onOpenLearn('aviation-icing')} label="Icing" /><Learn onPress={() => props.onOpenLearn('aviation-pirep')} label="PIREPs" /></View>
    </Glass>
  );
}

function RouteCheckpointCard({ sample }: { sample: Sample }) {
  const [expanded, setExpanded] = useState(false);
  const concern = sample.advisories[0]
    ? `${sample.advisories[0].hazard} / ${sample.advisories[0].product}`
    : airportRiskText(sample.airportRisk) ?? 'No matched advisory products';
  return (
    <Glass style={s.card}>
      <View style={s.cardHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.sectionLabel}>Route checkpoint</Text>
          <Text style={s.cardTitle}>{sample.label}</Text>
          <Text style={s.cardSub}>{fmt(sample.distanceMi, ' mi')} from departure / ETA {utcShort(sample.etaIso) ?? '--'}</Text>
        </View>
        <View style={[s.pill, toneStyle(sample.severity)]}><Text style={s.pillText}>{sample.severity.toUpperCase()}</Text></View>
      </View>
      <Text style={s.routeConcern}>{concern}</Text>
      <Text style={s.raw}>Temp {fmt(sample.weather.tempF, ' deg')} / Wind {fmt(sample.weather.windMph, ' mph')} / Gust {fmt(sample.weather.gustMph, ' mph')} / Visibility {fmt(sample.weather.visMi, ' mi', sample.weather.visMi != null && sample.weather.visMi < 10 ? 1 : 0)} / Clouds {fmt(sample.weather.cloudPct, '%')}</Text>
      {sample.advisories.length ? (
        <View style={s.productChipRow}>
          {sample.advisories.map((advisory) => <View key={advisory.key} style={s.productChip}><Text style={s.productChipText}>{advisory.hazard} / {advisory.product}</Text></View>)}
        </View>
      ) : <Text style={s.raw}>No pilot products matched this checkpoint at the selected altitude and valid time.</Text>}
      <Pressable onPress={() => setExpanded((value) => !value)} style={s.detailsToggle}>
        <Text style={s.detailsToggleText}>{expanded ? 'Hide pilot details' : 'Pilot details'}</Text>
      </Pressable>
      {expanded ? (
        sample.advisories.length ? sample.advisories.map((advisory) => (
          <View key={`${sample.key}-${advisory.key}`} style={s.advisory}>
            <Text style={s.advisoryTitle}>{advisory.hazard} / {advisory.product}</Text>
            <Text style={s.advisoryMeta}>{advisory.severity ? `${advisory.severity} / ` : ''}{advisory.altitude} / {advisory.valid}</Text>
          </View>
        )) : <Text style={s.raw}>No raw advisory detail is available for this checkpoint.</Text>
      ) : null}
    </Glass>
  );
}

function AirportWeatherBoard({
  station,
  onOpenLearn,
}: {
  station: Station;
  onOpenLearn: (id: string) => void;
}) {
  const cat = flightCat(station.metar);
  const decision = pilotDecision(station.metar, station.taf);
  const toneStyle = decision.tone === 'high' ? s.high : decision.tone === 'elevated' ? s.elevated : s.low;
  return (
    <Glass style={s.boardCard}>
      <View style={s.boardTop}>
        <View style={s.boardIdentity}>
          <Text style={s.sectionLabel}>Airport weather board</Text>
          <Text style={s.boardTitle}>{station.station.code ?? station.station.label}</Text>
          <Text style={s.cardSub}>{station.station.label}</Text>
        </View>
        <View style={[s.categoryBadge, { borderColor: categoryColor(cat), backgroundColor: `${categoryColor(cat)}33` }]}>
          <Text style={s.categoryBadgeText}>{cat ?? 'UNK'}</Text>
        </View>
      </View>

      <View style={[s.decisionStrip, toneStyle]}>
        <Text style={s.decisionTitle}>{decision.label}</Text>
        <Text style={s.decisionText}>{decision.summary}</Text>
      </View>

      <View style={s.metricGrid}>
        <MetricTile label="Wind" value={windText(station.metar)} />
        <MetricTile label="Visibility" value={visText(station.metar)} />
        <MetricTile label="Ceiling" value={ceilText(station.metar)} />
        <MetricTile label="Altimeter" value={altim(station.metar)} />
      </View>

      <View style={s.learnRow}>
        <Learn onPress={() => onOpenLearn('aviation-flight-category')} label="Flight category" />
        <Learn onPress={() => onOpenLearn('aviation-metar')} label="METAR" />
        <Learn onPress={() => onOpenLearn('aviation-taf')} label="TAF trend" />
      </View>
    </Glass>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metricTile}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={s.metricValue}>{value}</Text>
    </View>
  );
}

function TafTimelineCard({
  taf,
  onOpenLearn,
}: {
  taf: any;
  onOpenLearn: (id: string) => void;
}) {
  const periods = tafTimeline(taf);
  return (
    <Glass style={s.card}>
      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>TAF trend timeline</Text>
          <Text style={s.cardSub}>Forecast change groups, split into scan-friendly blocks.</Text>
        </View>
        <Learn onPress={() => onOpenLearn('aviation-taf')} label="TAF" />
      </View>
      {periods.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tafRail}>
          {periods.map((period, idx) => (
            <View key={`${period.label}-${idx}`} style={s.tafBlock}>
              <Text style={s.tafLabel}>{period.label}</Text>
              <Text style={s.tafText} numberOfLines={5}>{period.text}</Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <Text style={s.raw}>No TAF returned.</Text>
      )}
    </Glass>
  );
}

function RouteProfileCard({
  flight,
  departureOffsetMin,
}: {
  flight: Flight | null;
  departureOffsetMin: number;
}) {
  const decision = routeDecision(flight?.samples);
  const decisionToneStyle = toneStyle(decision.tone);
  const worst = worstSegment(flight);
  return (
    <Glass style={s.card}>
      <View style={s.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Route profile</Text>
          <Text style={s.cardSub}>
            {flight
              ? `${flight.origin.code ?? flight.origin.label.split(',')[0]} to ${flight.destination.code ?? flight.destination.label.split(',')[0]} / ${cruiseLabel(flight.cruiseAltitudeFt)} / depart ${utcShort(flight.departureIso) ?? departureLabel(departureOffsetMin)}`
              : 'Analyze a route to show time-aware samples.'}
          </Text>
        </View>
        <View style={[s.pill, decisionToneStyle]}>
          <Text style={s.pillText}>{decision.label}</Text>
        </View>
      </View>

      <Text style={s.raw}>{decision.summary}</Text>
      {worst ? (
        <View style={s.worstSegment}>
          <Text style={s.worstLabel}>Worst segment</Text>
          <Text style={s.worstText}>{worst.label}: {worst.advisories[0]?.hazard ?? airportRiskText(worst.airportRisk) ?? 'No matched concern'}</Text>
        </View>
      ) : null}

      {flight?.samples.length ? (
        <>
          <View style={s.profileTrack}>
            {flight.samples.map((sample, idx) => (
              <View
                key={sample.key}
                style={[
                  s.profileSegment,
                  idx === 0 ? s.profileSegmentFirst : null,
                  idx === flight.samples.length - 1 ? s.profileSegmentLast : null,
                  sample.severity === 'high' ? s.profileHigh : sample.severity === 'elevated' ? s.profileElevated : s.profileLow,
                ]}
              />
            ))}
          </View>
          <View style={s.profileStripLabels}>
            {flight.samples.map((sample) => (
              <View key={sample.key} style={s.profileCheckpoint}>
                <View style={[s.profileDot, sample.severity === 'high' ? s.profileHigh : sample.severity === 'elevated' ? s.profileElevated : s.profileLow]} />
                <Text style={s.profilePointLabel}>{sample.label}</Text>
                <Text style={s.profilePointMeta}>{utcShort(sample.etaIso) ?? '--'}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </Glass>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020817' },
  header: { marginBottom: theme.spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandWordmark: { ...OMNI_TAB_LOGO_STYLE },
  headerTitle: { ...typography.title },
  headerSubtitle: { ...typography.subtitle },
  hero: { borderRadius: 24, padding: 14, marginBottom: 12 },
  eyebrow: { color: 'rgba(125,211,252,0.88)', fontWeight: '900', fontSize: 11, letterSpacing: 1.1 },
  title: { color: 'white', fontWeight: '900', fontSize: 26, marginTop: 4 },
  subtitle: { color: 'rgba(255,255,255,0.72)', marginTop: 6, lineHeight: 19 },
  mode: { flexDirection: 'row', gap: 8, marginTop: 16, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', alignSelf: 'flex-start' },
  modeAlt: { flexDirection: 'row', gap: 8, marginTop: 12, padding: 4, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)', alignSelf: 'flex-start' },
  seg: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  segOn: { backgroundColor: 'rgba(14,165,233,0.22)' },
  segText: { color: 'rgba(255,255,255,0.7)', fontWeight: '800' },
  segTextOn: { color: 'white' },
  label: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 },
  input: { minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', paddingHorizontal: 14, fontSize: 16, fontWeight: '700' },
  lockedInput: { color: 'rgba(255,255,255,0.76)', backgroundColor: 'rgba(255,255,255,0.035)' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primary: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#0ea5e9', paddingHorizontal: 16 },
  primaryText: { color: 'white', fontWeight: '900', fontSize: 15 },
  secondary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14 },
  secondaryText: { color: 'white', fontWeight: '800', fontSize: 13 },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  learnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  learn: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.06)' },
  learnText: { color: 'rgba(255,255,255,0.82)', fontWeight: '800', fontSize: 12 },
  favoriteBlock: { marginTop: 12 },
  favoriteLabel: { color: 'rgba(125,211,252,0.78)', fontSize: 10, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  favoriteRail: { gap: 8, paddingTop: 7, paddingRight: 8 },
  favoriteChip: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(125,211,252,0.20)', backgroundColor: 'rgba(14,165,233,0.10)' },
  favoriteChipText: { color: 'white', fontSize: 12, fontWeight: '900' },
  helper: { color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 12, lineHeight: 18 },
  disclaimer: { color: 'rgba(255,255,255,0.48)', marginTop: 8, fontSize: 11, lineHeight: 16 },
  summary: { color: 'rgba(255,255,255,0.84)', marginTop: 12, lineHeight: 19 },
  error: { color: '#fca5a5' },
  card: { marginTop: 12, borderRadius: 22, padding: 12 },
  routeSummaryCard: { marginTop: 12, borderRadius: 22, padding: 12 },
  routeTitle: { color: 'white', fontWeight: '900', fontSize: 22, marginTop: 2 },
  routeConcern: { color: 'rgba(255,255,255,0.86)', lineHeight: 19, fontWeight: '800', marginTop: 10 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  routeBadge: {
    minWidth: '30.5%',
    flexGrow: 1,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  routeBadgeLabel: { color: 'rgba(255,255,255,0.62)', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  routeBadgeValue: { color: 'white', fontWeight: '900', fontSize: 15, marginTop: 3 },
  compactForm: { marginTop: 12, borderRadius: 22, padding: 12 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formCell: { width: '48.4%' },
  productChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 10 },
  productChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  productChipText: { color: 'rgba(255,255,255,0.86)', fontSize: 11, fontWeight: '900' },
  detailsToggle: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  detailsToggleText: { color: 'rgba(255,255,255,0.84)', fontSize: 12, fontWeight: '900' },
  boardCard: { marginTop: 12, borderRadius: 20, padding: 12 },
  boardTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', width: '100%' },
  boardIdentity: { flex: 1, minWidth: 0, paddingRight: 4 },
  boardTitle: { color: 'white', fontWeight: '900', fontSize: 22, marginTop: 2 },
  categoryBadge: {
    minWidth: 64,
    maxWidth: 88,
    flexShrink: 0,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryBadgeText: { color: 'white', fontWeight: '900', fontSize: 16 },
  decisionStrip: { marginTop: 10, borderRadius: 16, paddingVertical: 9, paddingHorizontal: 10 },
  decisionTitle: { color: 'white', fontWeight: '900', fontSize: 15 },
  decisionText: { color: 'rgba(255,255,255,0.78)', fontWeight: '800', lineHeight: 18, marginTop: 4 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, width: '100%' },
  metricTile: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '46%',
    minWidth: 136,
    minHeight: 64,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  metricLabel: { color: 'rgba(255,255,255,0.54)', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { color: 'white', fontSize: 14, lineHeight: 18, fontWeight: '900', marginTop: 6 },
  cardTitle: { color: 'white', fontWeight: '900', fontSize: 16 },
  cardSub: { color: 'rgba(255,255,255,0.6)', marginTop: 4, lineHeight: 18 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  raw: { color: 'rgba(255,255,255,0.82)', lineHeight: 20, fontWeight: '700', marginTop: 10 },
  sectionLabel: { color: 'rgba(125,211,252,0.78)', fontSize: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase', marginTop: 14 },
  airportRisk: { color: '#fbbf24', lineHeight: 19, fontWeight: '800', marginTop: 8 },
  advisory: { marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  advisoryTitle: { color: 'white', fontSize: 14, fontWeight: '900' },
  advisoryMeta: { color: 'rgba(255,255,255,0.78)', fontWeight: '800', lineHeight: 19, marginTop: 3 },
  advisoryId: { color: 'rgba(255,255,255,0.42)', fontSize: 11, fontWeight: '700', marginTop: 3 },
  tafRail: { gap: 10, paddingTop: 12, paddingRight: 6 },
  tafBlock: {
    width: 230,
    minHeight: 130,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.14)',
    backgroundColor: 'rgba(14,165,233,0.08)',
    padding: 12,
  },
  tafLabel: { color: 'rgba(125,211,252,0.9)', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  tafText: { color: 'rgba(255,255,255,0.82)', lineHeight: 18, fontWeight: '700', marginTop: 8 },
  profileTrack: {
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 14,
  },
  profileSegment: { flex: 1, marginRight: 2 },
  profileSegmentFirst: { borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
  profileSegmentLast: { borderTopRightRadius: 999, borderBottomRightRadius: 999, marginRight: 0 },
  profileLow: { backgroundColor: 'rgba(34,197,94,0.72)' },
  profileElevated: { backgroundColor: 'rgba(245,158,11,0.78)' },
  profileHigh: { backgroundColor: 'rgba(239,68,68,0.82)' },
  profileRail: { gap: 10, paddingTop: 12, paddingRight: 6 },
  worstSegment: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  worstLabel: { color: 'rgba(255,255,255,0.56)', fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
  worstText: { color: 'white', fontWeight: '900', marginTop: 4, lineHeight: 18 },
  profileStripLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginTop: 10 },
  profileCheckpoint: { flex: 1, alignItems: 'center', minWidth: 0 },
  profileDot: { width: 11, height: 11, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.36)', marginBottom: 5 },
  profilePoint: {
    width: 160,
    minHeight: 124,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.045)',
    padding: 11,
  },
  profilePointLabel: { color: 'white', fontWeight: '900', fontSize: 13 },
  profilePointMeta: { color: 'rgba(255,255,255,0.58)', fontWeight: '800', fontSize: 11, marginTop: 5 },
  profilePointWeather: { color: 'rgba(255,255,255,0.80)', fontWeight: '800', fontSize: 12, marginTop: 9, lineHeight: 16 },
  profilePointHazard: { color: 'rgba(125,211,252,0.88)', fontWeight: '900', fontSize: 12, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowLabel: { color: 'rgba(255,255,255,0.56)', fontWeight: '800', flex: 1 },
  rowValue: { color: 'white', fontWeight: '800', textAlign: 'right', flexShrink: 1 },
  map: { height: 320, borderRadius: 18, overflow: 'hidden', backgroundColor: 'rgba(2,6,23,0.55)', marginTop: 10 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 10 },
  stat: { flex: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 10 },
  statLabel: { color: 'rgba(255,255,255,0.52)', fontSize: 11, fontWeight: '800' },
  statValue: { color: 'white', fontWeight: '900', fontSize: 14, marginTop: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  pillText: { color: 'white', fontWeight: '900', fontSize: 11 },
  high: { backgroundColor: 'rgba(239,68,68,0.24)' },
  elevated: { backgroundColor: 'rgba(245,158,11,0.24)' },
  low: { backgroundColor: 'rgba(34,197,94,0.20)' },
  dim: { opacity: 0.75 },
});
