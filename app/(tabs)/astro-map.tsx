// app/(tabs)/astro-map.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { Buffer } from 'buffer';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../components/common/Glass';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { usePlace } from '../context/PlaceContext';
import { useSettings } from '../context/SettingsContext';

import {
  buildAuroraContourRings,
  fetchOvationPoints as fetchOvationPointsLib,
  sampleOvationAt,
  type OvationPoint as OvationPointLib,
} from '../lib/aurora/ovation';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function clamp01(n: number) {
  return clamp(n, 0, 1);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function toNum(x: unknown) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function isFiniteNum(x: any): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function regionBounds(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return { west, east, south, north };
}

function hasValidBounds(b: { west: number; east: number; south: number; north: number }) {
  return (
    Number.isFinite(b.west) &&
    Number.isFinite(b.east) &&
    Number.isFinite(b.south) &&
    Number.isFinite(b.north) &&
    b.east > b.west &&
    b.north > b.south &&
    Math.abs(b.east - b.west) >= 0.01 &&
    Math.abs(b.north - b.south) >= 0.01
  );
}

function pointInBounds(lat: number, lon: number, b: { west: number; east: number; south: number; north: number }) {
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

function boundsToPolygonFeature(b: { west: number; east: number; south: number; north: number }) {
  return {
    type: 'Feature',
    properties: { kind: 'skyscoreCoverage' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [b.west, b.south],
        [b.east, b.south],
        [b.east, b.north],
        [b.west, b.north],
        [b.west, b.south],
      ]],
    },
  } as const;
}

const OMNIWX_API_BASE =
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ??
  process.env.EXPO_PUBLIC_OMNIWX_API_BASE ??
  'https://omniwx-api.omniwx.workers.dev';

const OM_BACKOFF = { until: 0, lastStatus: 0, strikes: 0 };
const SKY_GRID_MEMORY_CACHE = new Map<string, SkyGridPayload>();

function setSkyGridCache(key: string, value: SkyGridPayload, maxEntries = 6) {
  if (SKY_GRID_MEMORY_CACHE.has(key)) {
    SKY_GRID_MEMORY_CACHE.delete(key);
  }

  SKY_GRID_MEMORY_CACHE.set(key, value);

  while (SKY_GRID_MEMORY_CACHE.size > maxEntries) {
    const oldestKey = SKY_GRID_MEMORY_CACHE.keys().next().value as string | undefined;
    if (!oldestKey) break;
    SKY_GRID_MEMORY_CACHE.delete(oldestKey);
  }
}

const OPEN_METEO_TIMEOUT_MS = 12000;
const OPEN_METEO_GRID_BATCH_SIZE = 8;

function formatHourLabel(h: number) {
  if (h === 0) return 'Now';
  return `+${h}h`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function toMph(mps: number | null | undefined) {
  if (mps == null || !Number.isFinite(mps)) return null;
  return mps * 2.23693629;
}

function fmtMph(mps: number | null | undefined) {
  const mph = toMph(mps);
  if (mph == null) return '—';
  return `${Math.round(mph)} mph`;
}

function fmtMilesFromMeters(m: number | null | undefined) {
  if (m == null || !Number.isFinite(m)) return '—';
  const mi = m / 1609.344;
  if (mi >= 10) return `${Math.round(mi)} mi`;
  return `${mi.toFixed(1)} mi`;
}

function scoreLabel(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return '—';
  if (score >= 88) return 'Excellent';
  if (score >= 75) return 'Very good';
  if (score >= 62) return 'Good';
  if (score >= 48) return 'Fair';
  if (score >= 34) return 'Poor';
  return 'Very poor';
}

function scoreSentence(score: number | null | undefined, cloudTotal?: number | null, aurVis?: number | null) {
  if (score == null || !Number.isFinite(score)) return 'Move the map to inspect this area.';
  const label = scoreLabel(score);
  const cloudPart =
    cloudTotal == null || !Number.isFinite(cloudTotal)
      ? ''
      : cloudTotal <= 20
        ? 'low cloud risk'
        : cloudTotal <= 50
          ? 'some cloud risk'
          : 'clouds may be limiting';
  const aurPart =
    aurVis == null || !Number.isFinite(aurVis)
      ? ''
      : aurVis >= 35
        ? 'aurora may be worth checking'
        : aurVis >= 10
          ? 'slight aurora potential'
          : 'aurora unlikely now';

  return [label, cloudPart, aurPart].filter(Boolean).join(' · ');
}

function shortPlaceLabel(name: string | null | undefined) {
  const s = String(name ?? '').trim();
  if (!s) return 'Selected area';
  return s.length > 28 ? `${s.slice(0, 28).trim()}…` : s;
}

function fmtClock(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtMoon(phaseLabel: string | null | undefined, illumPct: number | null | undefined) {
  const a = phaseLabel && phaseLabel.trim() ? phaseLabel.trim() : null;
  const b = illumPct != null && Number.isFinite(illumPct) ? `${Math.round(illumPct)}% lit` : null;
  return [a, b].filter(Boolean).join(' · ') || '—';
}

function approxDistanceDeg(latA: number, lonA: number, latB: number, lonB: number) {
  return Math.abs(latA - latB) + Math.abs(lonA - lonB);
}

function fmtBortle(site?: { bortleClass?: number | null; bortleLabel?: string | null } | null) {
  const num =
    site?.bortleClass != null && Number.isFinite(site.bortleClass)
      ? `Bortle ${Math.round(site.bortleClass)}`
      : null;
  const label = site?.bortleLabel?.trim() ? site.bortleLabel.trim() : null;
  return [num, label].filter(Boolean).join(' · ') || '—';
}

function isSkyFetchScaleOK(region: Region) {
  const lonSpan = Math.abs(region.longitudeDelta);
  const latSpan = Math.abs(region.latitudeDelta);
  return !(lonSpan >= 60 || latSpan >= 45);
}

function chooseSkyGridSize(zoom: number) {
  if (zoom >= 9) return 192;
  if (zoom >= 7) return 160;
  return 128;
}

function choosePointStepDeg(zoom: number) {
  if (zoom >= 10) return 0.16;
  if (zoom >= 9) return 0.22;
  if (zoom >= 8) return 0.3;
  if (zoom >= 7) return 0.45;
  if (zoom >= 6) return 0.7;
  return 1.0;
}

function hashKey(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

async function readErrorText(res: Response) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 12000, externalSignal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const handleExternalAbort = () => ctrl.abort();
  if (externalSignal?.aborted) ctrl.abort();
  externalSignal?.addEventListener('abort', handleExternalAbort);
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) {
      const body = await readErrorText(res);
      throw new Error(body ? `${res.status}: ${body}` : `${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
    externalSignal?.removeEventListener('abort', handleExternalAbort);
  }
}

function chunkArray<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function roundCoordKey(v: number, step = 0.0001) {
  return Math.round(v / step) * step;
}

function buildRegularGrid(
  bounds: { west: number; east: number; south: number; north: number },
  stepDeg: number,
  maxPts = 72
) {
  const pts: Array<{ lat: number; lon: number }> = [];

  const latMin = Math.min(bounds.south, bounds.north);
  const latMax = Math.max(bounds.south, bounds.north);
  const lonMin = Math.min(bounds.west, bounds.east);
  const lonMax = Math.max(bounds.west, bounds.east);

  let step = stepDeg;

  const estimatedCount = (s: number) => {
    const latN = Math.max(1, Math.floor((latMax - latMin) / s) + 1);
    const lonN = Math.max(1, Math.floor((lonMax - lonMin) / s) + 1);
    return latN * lonN;
  };

  while (estimatedCount(step) > maxPts && step < 5) {
    step *= 1.25;
  }

  const lat0 = Math.floor(latMin / step) * step;
  const lon0 = Math.floor(lonMin / step) * step;

  for (let lat = lat0; lat <= latMax + 1e-9; lat += step) {
    for (let lon = lon0; lon <= lonMax + 1e-9; lon += step) {
      pts.push({ lat, lon });
    }
  }

  return { pts, stepUsed: step };
}

function dedupeGridPoints(points: Array<{ lat: number; lon: number }>, keyStep = 0.0001) {
  const seen = new Set<string>();
  const out: Array<{ lat: number; lon: number }> = [];

  for (const p of points) {
    const key = `${roundCoordKey(p.lat, keyStep).toFixed(4)},${roundCoordKey(p.lon, keyStep).toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

function normalizeMultiResponse(json: any): any[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object' && Array.isArray(json.results)) return json.results;
  if (json && typeof json === 'object' && Array.isArray(json.data)) return json.data;
  if (json && typeof json === 'object') return [json];
  return [];
}

function pickUtcHourIndex(times: unknown, hourOffset: number) {
  if (!Array.isArray(times) || !times.length) return 0;

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);

  const target = new Date(now.getTime() + Math.max(0, Math.min(24, Math.floor(hourOffset))) * 3600_000).getTime();

  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(String(times[i])).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function parseLocalDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isBetween(
  timeIso: string,
  startIso?: string | null,
  endIso?: string | null
) {
  const t = parseLocalDate(timeIso);
  const s = parseLocalDate(startIso);
  const e = parseLocalDate(endIso);

  if (!t || !s || !e) return false;
  return t >= s && t <= e;
}

function moonIsUpAt(
  hourIso: string,
  moonriseIso?: string | null,
  moonsetIso?: string | null
) {
  const t = parseLocalDate(hourIso);
  if (!t) return false;

  const rise = parseLocalDate(moonriseIso);
  const set = parseLocalDate(moonsetIso);

  if (!rise && !set) return false;
  if (rise && !set) return t >= rise;
  if (!rise && set) return t <= set;
  if (!rise || !set) return false;

  if (rise <= set) return t >= rise && t <= set;
  return t >= rise || t <= set;
}

function darknessScoreForHour(args: {
  isTrueDark: boolean;
  isAstronomicalTwilight: boolean;
  isNauticalTwilight: boolean;
  isCivilTwilight: boolean;
  isNight: boolean;
}) {
  if (args.isTrueDark) return 1.0;
  if (args.isAstronomicalTwilight) return 0.78;
  if (args.isNauticalTwilight) return 0.52;
  if (args.isCivilTwilight) return 0.28;
  if (args.isNight) return 0.85;
  return 0.18;
}

function deriveDarknessScore(activeAstro: AstroLocationPayload | null, hourOffset: number) {
  if (!activeAstro?.hourly?.time?.length) return 0.8;

  const idx = pickAstroHourIndex(activeAstro, hourOffset);
  if (idx < 0) return 0.8;

  const time = activeAstro.hourly.time[idx];
  const isNight =
    isBetween(time, activeAstro.sun?.todaySunset, activeAstro.sun?.tomorrowSunrise) ||
    isBetween(time, activeAstro.twilight?.todayCivilDusk, activeAstro.sun?.tomorrowSunrise);

  const isCivilTwilight =
    isBetween(time, activeAstro.sun?.todaySunset, activeAstro.twilight?.todayCivilDusk) ||
    isBetween(time, activeAstro.twilight?.tomorrowCivilDawn, activeAstro.sun?.tomorrowSunrise);

  const isNauticalTwilight =
    isBetween(time, activeAstro.twilight?.todayCivilDusk, activeAstro.twilight?.todayNauticalDusk) ||
    isBetween(time, activeAstro.twilight?.tomorrowNauticalDawn, activeAstro.twilight?.tomorrowCivilDawn);

  const isAstronomicalTwilight =
    isBetween(time, activeAstro.twilight?.todayNauticalDusk, activeAstro.twilight?.todayAstronomicalDusk) ||
    isBetween(time, activeAstro.twilight?.tomorrowAstronomicalDawn, activeAstro.twilight?.tomorrowNauticalDawn);

  const isTrueDark =
    isBetween(time, activeAstro.twilight?.todayAstronomicalDusk, activeAstro.twilight?.tomorrowAstronomicalDawn);

  return darknessScoreForHour({
    isTrueDark,
    isAstronomicalTwilight,
    isNauticalTwilight,
    isCivilTwilight,
    isNight,
  });
}

function deriveMoonScore(activeAstro: AstroLocationPayload | null, hourOffset: number, darkness01: number) {
  if (!activeAstro?.hourly?.time?.length) return 0.9;

  const idx = pickAstroHourIndex(activeAstro, hourOffset);
  if (idx < 0) return 0.9;

  const time = activeAstro.hourly.time[idx];
  const moonDay =
    activeAstro.moonDays?.find((m) => m.date === String(time).slice(0, 10)) ??
    activeAstro.moonDays?.[0];

  const moonIsUp = moonIsUpAt(time, moonDay?.moonrise, moonDay?.moonset);
  if (!moonIsUp) return 1;

  const illum01 = clamp01((moonDay?.moonIlluminationPct ?? 0) / 100);
  const maxPenalty = 0.82 * clamp01(darkness01);
  return clamp01(1 - illum01 * maxPenalty);
}

function pct01Sky(p: number | null | undefined) {
  if (p == null || !Number.isFinite(p)) return null;
  return clamp01(p / 100);
}

function computeCloudPenaltyCanonical(p: {
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
}) {
  const low = pct01Sky(p.cloudLow) ?? 0;
  const mid = pct01Sky(p.cloudMid) ?? 0;
  const high = pct01Sky(p.cloudHigh) ?? 0;
  const total = pct01Sky(p.cloudTotal);

  const cloudPenaltyFromLayers = clamp01(0.36 * low + 0.62 * mid + 0.96 * high);
  return Math.max(total ?? 0, cloudPenaltyFromLayers);
}

function regionChangeIsSignificant(a: Region | null, b: Region) {
  if (!a) return true;

  const centerShift =
    Math.abs(a.latitude - b.latitude) +
    Math.abs(a.longitude - b.longitude);

  const zoomShift =
    Math.abs(a.latitudeDelta - b.latitudeDelta) +
    Math.abs(a.longitudeDelta - b.longitudeDelta);

  return centerShift > 0.35 || zoomShift > 0.35;
}

function computeTransparency01Canonical(p: {
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  humidityPct?: number | null;
}) {
  const cloudPenalty = computeCloudPenaltyCanonical(p);

  const visKm = p.visibilityM != null ? p.visibilityM / 1000 : null;
  const visibilityPenalty =
    visKm == null
      ? 0.12
      : clamp01((22 - Math.max(0, Math.min(22, visKm))) / 22) * 0.40;

  const humidity = p.humidityPct ?? null;
  const humidityPenalty =
    humidity == null
      ? 0.05
      : clamp01((humidity - 68) / 32) * 0.24;

  let transparency01 = clamp01(1 - (cloudPenalty * 1.02 + visibilityPenalty + humidityPenalty));

  const cloudTotalPct = p.cloudTotal ?? null;
  if (cloudTotalPct != null) {
    if (cloudTotalPct >= 100) transparency01 = Math.min(transparency01, 0.02);
    else if (cloudTotalPct >= 98) transparency01 = Math.min(transparency01, 0.04);
    else if (cloudTotalPct >= 95) transparency01 = Math.min(transparency01, 0.07);
    else if (cloudTotalPct >= 90) transparency01 = Math.min(transparency01, 0.12);
    else if (cloudTotalPct >= 85) transparency01 = Math.min(transparency01, 0.18);
  }

  return transparency01;
}

function computeSeeing01Canonical(p: {
  windMps: number | null;
  gustMps: number | null;
  humidityPct?: number | null;
}) {
  const wind = p.windMps ?? 0;
  const gust = p.gustMps ?? wind;

  const sustainedPenalty = clamp01((wind - 4) / 10) * 0.42;
  const gustPenalty = clamp01((gust - 6) / 14) * 0.50;
  const humidityPenalty = p.humidityPct == null ? 0 : clamp01((p.humidityPct - 85) / 15) * 0.08;

  return clamp01(1 - (sustainedPenalty + gustPenalty + humidityPenalty));
}

type OvationPoint = { lat: number; lon: number; prob: number; prob01: number };
type OvationCache = { fetchedAt: number; points: OvationPoint[] };
const OVATION_CACHE: { cur: OvationCache | null } = { cur: null };

async function fetchOvationPoints(ttlMs = 2 * 60_000): Promise<OvationPoint[]> {
  const now = Date.now();
  if (OVATION_CACHE.cur && now - OVATION_CACHE.cur.fetchedAt < ttlMs) return OVATION_CACHE.cur.points;

  const ptsRaw: OvationPointLib[] = await fetchOvationPointsLib({ ttlMs });
  const pts: OvationPoint[] = ptsRaw
    .filter((p) => p.prob >= 1)
    .map((p) => ({ lat: p.lat, lon: p.lon, prob: p.prob, prob01: clamp(p.prob / 100, 0, 1) }));

  OVATION_CACHE.cur = { fetchedAt: now, points: pts };
  return pts;
}

function TimelineSlider(props: { value: number; onChange: (v: number) => void }) {
  const v = clamp(Math.round(props.value), 0, 24);
  const trackWRef = useRef(1);

  const setFromX = (x: number) => {
    const w = Math.max(1, trackWRef.current);
    const pct = clamp(x / w, 0, 1);
    props.onChange(Math.round(pct * 24));
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderRelease: (e) => setFromX(e.nativeEvent.locationX),
      }),
    [props]
  );

  const set = (x: number) => props.onChange(clamp(Math.round(x), 0, 24));
  const pct = v / 24;

  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '900' }}>Forecast: {formatHourLabel(v)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontWeight: '800' }}>0–24h</Text>
      </View>

      <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          onPress={() => set(v - 1)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '900' }}>-</Text>
        </Pressable>

        <View
          style={{ flex: 1, height: 26, justifyContent: 'center' }}
          onLayout={(e) => {
            trackWRef.current = e.nativeEvent.layout.width || 1;
          }}
          {...pan.panHandlers}
        >
          <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' }} />
          <View
            style={{
              position: 'absolute',
              left: 0,
              width: `${pct * 100}%`,
              height: 8,
              borderRadius: 999,
              backgroundColor: 'rgba(120,255,210,0.35)',
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: pct * (trackWRef.current - 20),
              width: 20,
              height: 20,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.20)',
              backgroundColor: 'rgba(255,255,255,0.10)',
            }}
          />
        </View>

        <Pressable
          onPress={() => set(v + 1)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.14)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          }}
        >
          <Text style={{ color: 'white', fontWeight: '900' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

type SheetSnap = 'collapsed' | 'half' | 'full';

function BottomSheet(props: {
  visible: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
  snap?: SheetSnap;
  bottomDock?: number;
  draggable?: boolean;
  onSnapChange?: (s: SheetSnap) => void;
}) {
  const { visible, children, header, bottomDock = 0, draggable = true } = props;
  const isControlled = props.snap != null;
  const [snapInternal, setSnapInternal] = React.useState<SheetSnap>(props.snap ?? 'collapsed');
  const snap = (isControlled ? props.snap : snapInternal) as SheetSnap;

  const screenH = Dimensions.get('window').height;
  const fullY = 150;
  const collapsedPeek = 82;
  const collapsedY = screenH - (collapsedPeek + bottomDock);
  const showBody = snap !== 'collapsed';

  const yForSnap = (s: SheetSnap) => (s === 'collapsed' ? collapsedY : fullY);

  const translateY = React.useRef(new Animated.Value(yForSnap(snap))).current;
  const dragStartYRef = React.useRef(yForSnap(snap));

  const setSnap = React.useCallback(
    (next: SheetSnap) => {
      const normalized: SheetSnap = next === 'half' ? 'full' : next;

      if (!isControlled) setSnapInternal(normalized);
      props.onSnapChange?.(normalized);

      const y = yForSnap(normalized);
      dragStartYRef.current = y;

      Animated.spring(translateY, {
        toValue: y,
        useNativeDriver: true,
        tension: 90,
        friction: 14,
      }).start();
    },
    [isControlled, props, translateY]
  );

  React.useEffect(() => {
    if (!visible) return;
    const normalized: SheetSnap = snap === 'half' ? 'full' : snap;
    const y = yForSnap(normalized);
    dragStartYRef.current = y;
    translateY.setValue(y);
  }, [visible, snap, translateY]);

  React.useEffect(() => {
    if (!visible || !isControlled) return;
    setSnap(snap);
  }, [snap, visible, isControlled, setSnap]);

  const toggleSnap = React.useCallback(() => {
    setSnap(snap === 'collapsed' ? 'full' : 'collapsed');
  }, [setSnap, snap]);

  const pan = React.useMemo(() => {
    if (!draggable) return null;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderGrant: () => {
        translateY.stopAnimation((v: number) => {
          dragStartYRef.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = clamp(dragStartYRef.current + g.dy, fullY, collapsedY);
        translateY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const projected = clamp(dragStartYRef.current + g.dy + g.vy * 120, fullY, collapsedY);
        const midpoint = (fullY + collapsedY) / 2;
        setSnap(projected < midpoint ? 'full' : 'collapsed');
      },
      onPanResponderTerminate: () => {
        const midpoint = (fullY + collapsedY) / 2;
        translateY.stopAnimation((v: number) => {
          setSnap(v < midpoint ? 'full' : 'collapsed');
        });
      },
    });
  }, [draggable, translateY, fullY, collapsedY, setSnap]);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Animated.View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          height: screenH,
          transform: [{ translateY }],
        }}
      >
        <Glass style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 24 }}>
          <View style={{ alignItems: 'center', paddingBottom: 8 }}>
            <View {...(pan ? pan.panHandlers : {})}>
              <Pressable
                onPress={toggleSnap}
                style={{ paddingVertical: 6, paddingHorizontal: 20, alignItems: 'center' }}
                hitSlop={12}
              >
                <View
                  style={{
                    width: 44,
                    height: 5,
                    borderRadius: 999,
                    backgroundColor: 'rgba(255,255,255,0.18)',
                  }}
                />
                <Text
                  style={{
                    marginTop: 4,
                    color: 'rgba(255,255,255,0.55)',
                    fontSize: 10,
                    fontWeight: '900',
                    letterSpacing: 0.7,
                  }}
                >
                  DETAILS
                </Text>
              </Pressable>
            </View>
          </View>

          {header ? <View style={{ marginBottom: 10 }}>{header}</View> : null}

          {showBody ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: bottomDock + 140 }}
            >
              {children}
            </ScrollView>
          ) : null}
        </Glass>
      </Animated.View>
    </View>
  );
}

function MetricPill(props: { label: string; value: string; accent?: string }) {
  return (
    <View
      style={{
        flexGrow: 1,
        minWidth: 104,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: '800' }}>{props.label}</Text>
      <Text style={{ marginTop: 3, color: props.accent ?? 'white', fontSize: 17, fontWeight: '900' }}>
        {props.value}
      </Text>
    </View>
  );
}

function Row(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
      <Text style={{ color: 'rgba(255,255,255,0.70)', fontWeight: '900', flex: 1, paddingRight: 8 }}>{props.label}</Text>
      <Text style={{ color: 'white', fontWeight: '900', textAlign: 'right', flexShrink: 1, maxWidth: '48%' }}>
        {props.value}
      </Text>
    </View>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        marginTop: 14,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        gap: 10,
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.80)', fontWeight: '900', letterSpacing: 0.5 }}>{props.title}</Text>
      {props.children}
    </View>
  );
}

function ToggleChip(props: { label: string; active?: boolean; onPress: () => void }) {
  const active = !!props.active;
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
        opacity: active ? 1 : 0.9,
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{props.label}</Text>
    </Pressable>
  );
}

type AstroLocationPayload = {
  ok: true;
  lat: number;
  lon: number;
  placeName?: string;
  timezone: string;
  fetchedAt: string;
  sun: {
    todaySunrise?: string | null;
    todaySunset?: string | null;
    tomorrowSunrise?: string | null;
    tomorrowSunset?: string | null;
  };
  twilight: {
    todayCivilDusk?: string | null;
    todayNauticalDusk?: string | null;
    todayAstronomicalDusk?: string | null;
    tomorrowCivilDawn?: string | null;
    tomorrowNauticalDawn?: string | null;
    tomorrowAstronomicalDawn?: string | null;
  };
  moonDays: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  hourly: {
    time: string[];
    temperatureC: Array<number | null>;
    humidityPct: Array<number | null>;
    cloudTotal: Array<number | null>;
    cloudLow: Array<number | null>;
    cloudMid: Array<number | null>;
    cloudHigh: Array<number | null>;
    visibilityM: Array<number | null>;
    windMps: Array<number | null>;
    gustMps: Array<number | null>;
  };
  site: {
    elevationM?: number | null;
    bortleClass?: number | null;
    bortleLabel?: string | null;
    skyBrightness?: number | null;
  };
  aerosols: {
    index?: number | null;
    label?: string | null;
    source?: string | null;
  };
};

type SkyGridPoint = {
  lat: number;
  lon: number;
  score: number;
  weather01: number;
  darkness01: number;
  transparency01?: number;
  seeing01?: number;
  moon01?: number;
  aerosols01?: number;
  siteScore01?: number;
  humidityPct?: number | null;
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;
  bortleClass?: number | null;
  bortleLabel?: string | null;
  elevationM?: number | null;
  skyBrightness?: number | null;
};

type SkyGridPayload = {
  ok: true;
  bounds: { west: number; south: number; east: number; north: number };
  zoom: number;
  hourOffset: number;
  sourceStepDeg: number;
  denseStepDeg: number;
  width: number;
  height: number;
  scores: number[];
  points?: SkyGridPoint[];
  fetchedAt: string;
  diagnostics?: {
    source?: string;
    mode?: 'hero' | 'regional';
    density?: 'auto' | 'low' | 'medium' | 'high';
    sourcePoints?: number;
    heroCenterLat?: number | null;
    heroCenterLon?: number | null;
  };
};

type AstroInspectPayload = {
  ok: true;
  lat: number;
  lon: number;
  hourOffset: number;
  skyScore: number;
  weather01: number;
  darkness01: number;
  transparency01: number;
  seeing01: number;
  moon01: number;
  aerosols01: number;
  siteScore01: number;
  humidityPct?: number | null;
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;
  site: {
    elevationM?: number | null;
    bortleClass?: number | null;
    bortleLabel?: string | null;
    skyBrightness?: number | null;
  };
  fetchedAt: string;
};

type SkyInspect = {
  lat: number;
  lon: number;
  skyScore: number;
  auroraProb: number;
  visibleProb: number;
  nearestPoint: SkyGridPoint | null;
};

const SKY_STOPS: Array<{ s: number; rgba: [number, number, number, number] }> = [
  { s: 0, rgba: [255, 92, 92, 218] },
  { s: 18, rgba: [255, 146, 82, 204] },
  { s: 36, rgba: [204, 112, 224, 192] },
  { s: 54, rgba: [112, 113, 255, 178] },
  { s: 70, rgba: [66, 154, 255, 164] },
  { s: 84, rgba: [34, 211, 181, 150] },
  { s: 94, rgba: [74, 222, 128, 142] },
  { s: 100, rgba: [187, 247, 208, 134] },
];

const SKY_LEGEND_SWATCHES = [
  'rgba(255,92,92,0.88)',
  'rgba(255,146,82,0.84)',
  'rgba(204,112,224,0.80)',
  'rgba(112,113,255,0.78)',
  'rgba(66,154,255,0.74)',
  'rgba(34,211,181,0.70)',
  'rgba(74,222,128,0.68)',
  'rgba(187,247,208,0.64)',
] as const;

function SkyScoreLegendSliver() {
  return (
    <Glass
      style={{
        paddingVertical: 7,
        paddingHorizontal: 8,
        borderRadius: 12,
        alignSelf: 'flex-start',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 9, fontWeight: '900' }}>WORST</Text>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          {SKY_LEGEND_SWATCHES.map((color, idx) => (
            <View
              key={`sky-legend-${idx}`}
              style={{
                width: 24,
                height: 5,
                borderRadius: 999,
                backgroundColor: color,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.16)',
              }}
            />
          ))}
        </View>
        <Text style={{ color: 'rgba(187,247,208,0.92)', fontSize: 9, fontWeight: '900' }}>BEST</Text>
      </View>
    </Glass>
  );
}

function colorForScore(score: number): [number, number, number, number] {
  const s = clamp(score, 0, 100);
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i];
    const b = SKY_STOPS[i + 1];
    if (s >= a.s && s <= b.s) {
      const t = (s - a.s) / Math.max(1e-9, b.s - a.s);
      return [
        Math.round(lerp(a.rgba[0], b.rgba[0], t)),
        Math.round(lerp(a.rgba[1], b.rgba[1], t)),
        Math.round(lerp(a.rgba[2], b.rgba[2], t)),
        Math.round(lerp(a.rgba[3], b.rgba[3], t)),
      ];
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1].rgba;
}

function sampleGridScore(grid: SkyGridPayload, lat: number, lon: number) {
  const { bounds, width, height, scores } = grid;
  if (!scores.length || width < 2 || height < 2) return null;

  const spanLon = Math.max(1e-9, bounds.east - bounds.west);
  const spanLat = Math.max(1e-9, bounds.north - bounds.south);

  const u = clamp((lon - bounds.west) / spanLon, 0, 1);
  const v = clamp((bounds.north - lat) / spanLat, 0, 1);

  const x = u * (width - 1);
  const y = v * (height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);

  const tx = x - x0;
  const ty = y - y0;

  const idx = (xx: number, yy: number) => yy * width + xx;

  const q11 = scores[idx(x0, y0)] ?? 100;
  const q12 = scores[idx(x1, y0)] ?? q11;
  const q21 = scores[idx(x0, y1)] ?? q11;
  const q22 = scores[idx(x1, y1)] ?? q11;

  const s1 = lerp(q11, q12, tx);
  const s2 = lerp(q21, q22, tx);
  return Math.round(lerp(s1, s2, ty));
}

function nearestGridPoint(grid: SkyGridPayload | null, lat: number, lon: number): SkyGridPoint | null {
  if (!grid?.points?.length) return null;
  let best: SkyGridPoint | null = null;
  let bestD = Number.POSITIVE_INFINITY;

  for (const p of grid.points) {
    const d = Math.abs(p.lat - lat) + Math.abs(p.lon - lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }

  return best;
}

async function makeSkyRasterFromGrid(grid: SkyGridPayload, cacheKey: string) {
  const fileName = `skygrid_${hashKey(cacheKey)}_${grid.width}x${grid.height}.png`;
  const cacheDir =
    (FileSystem as any).cacheDirectory ?? 'file:///data/user/0/host.exp.exponent/cache/';
  const fileUri = `${cacheDir}${fileName}`;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) return fileUri;
  } catch {}

  const pixels = new Uint8Array(grid.width * grid.height * 4);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const score = grid.scores[y * grid.width + x] ?? 100;
      const [r, g, b, a] = colorForScore(score);
      const i = (y * grid.width + x) * 4;
      pixels[i + 0] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }

  const data = Skia.Data.fromBytes(pixels);
  const img = Skia.Image.MakeImage(
    {
      width: grid.width,
      height: grid.height,
      alphaType: AlphaType.Premul,
      colorType: ColorType.RGBA_8888,
    },
    data,
    grid.width * 4
  );

  if (!img) throw new Error('Skia image creation failed');

  const pngBytes = img.encodeToBytes();
  if (!pngBytes) throw new Error('Sky raster encode failed');

  const b64 = Buffer.from(pngBytes).toString('base64');
  await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: 'base64' as any });

  return fileUri;
}

async function fetchAstroLocation(lat: number, lon: number, placeName?: string, signal?: AbortSignal) {
  const url =
    `${OMNIWX_API_BASE}/api/astro/location` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    (placeName ? `&placeName=${encodeURIComponent(placeName)}` : '');

  return fetchJsonWithTimeout<AstroLocationPayload>(url, 12000, signal);
}

async function fetchOpenMeteoGridChunk(args: {
  points: Array<{ lat: number; lon: number }>;
  hourOffset: number;
}) {
  const { points, hourOffset } = args;
  if (!points.length) return [];

  const hourly = [
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
    'relative_humidity_2m',
  ].join(',');

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(points.map((p) => p.lat.toFixed(4)).join(','))}` +
    `&longitude=${encodeURIComponent(points.map((p) => p.lon.toFixed(4)).join(','))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&forecast_days=2` +
    `&wind_speed_unit=ms` +
    `&timezone=GMT`;

  const json = await fetchJsonWithTimeout<any>(url, OPEN_METEO_TIMEOUT_MS);
  const rows = normalizeMultiResponse(json);

  return rows.map((row, i) => {
    const h = row?.hourly ?? {};
    const idx = pickUtcHourIndex(h?.time, hourOffset);

    const pick = (name: string) => {
      const arr = h?.[name];
      const v = Array.isArray(arr) ? arr[idx] : null;
      return toNum(v);
    };

    return {
      lat: points[i]?.lat ?? toNum(row?.latitude) ?? 0,
      lon: points[i]?.lon ?? toNum(row?.longitude) ?? 0,
      cloudTotal: pick('cloud_cover'),
      cloudLow: pick('cloud_cover_low'),
      cloudMid: pick('cloud_cover_mid'),
      cloudHigh: pick('cloud_cover_high'),
      visibilityM: pick('visibility'),
      windMps: pick('wind_speed_10m'),
      gustMps: pick('wind_gusts_10m'),
      humidityPct: pick('relative_humidity_2m'),
    };
  });
}

async function fetchSkyGridPayload(args: {
  bounds: { west: number; south: number; east: number; north: number };
  zoom: number;
  hourOffset: number;
  size: number;
  includePoints?: boolean;
  mode?: 'hero' | 'regional';
  density?: 'auto' | 'low' | 'medium' | 'high';
  centerLat?: number | null;
  centerLon?: number | null;
  astroContext?: AstroLocationPayload | null;
  signal?: AbortSignal;
}): Promise<SkyGridPayload> {
  const {
    bounds,
    zoom,
    hourOffset,
    size,
    includePoints,
    mode = 'regional',
    density = 'auto',
    centerLat,
    centerLon,
    signal,
  } = args;

  const url =
    `${OMNIWX_API_BASE}/api/astro/skyscore-grid` +
    `?west=${encodeURIComponent(String(bounds.west))}` +
    `&south=${encodeURIComponent(String(bounds.south))}` +
    `&east=${encodeURIComponent(String(bounds.east))}` +
    `&north=${encodeURIComponent(String(bounds.north))}` +
    `&zoom=${encodeURIComponent(String(zoom))}` +
    `&hour=${encodeURIComponent(String(hourOffset))}` +
    `&w=${encodeURIComponent(String(size))}` +
    `&h=${encodeURIComponent(String(size))}` +
    `&includePoints=${includePoints ? '1' : '0'}` +
    `&mode=${encodeURIComponent(mode)}` +
    `&density=${encodeURIComponent(density)}` +
    (centerLat != null ? `&centerLat=${encodeURIComponent(String(centerLat))}` : '') +
    (centerLon != null ? `&centerLon=${encodeURIComponent(String(centerLon))}` : '');

  return fetchJsonWithTimeout<SkyGridPayload>(url, 15000, signal);
}

async function fetchAstroInspect(args: {
  lat: number;
  lon: number;
  hourOffset: number;
  signal?: AbortSignal;
}): Promise<AstroInspectPayload> {
  const url =
    `${OMNIWX_API_BASE}/api/astro/inspect` +
    `?lat=${encodeURIComponent(String(args.lat))}` +
    `&lon=${encodeURIComponent(String(args.lon))}` +
    `&hour=${encodeURIComponent(String(args.hourOffset))}`;

  return fetchJsonWithTimeout<AstroInspectPayload>(url, 10000, args.signal);
}

function buildHeroBounds(lat: number, lon: number) {
  const latHalf = 2.1;
  const lonHalf = 2.8;
  return {
    west: lon - lonHalf,
    east: lon + lonHalf,
    south: lat - latHalf,
    north: lat + latHalf,
  };
}

function pickAstroHourIndex(payload: AstroLocationPayload | null, hourOffset: number) {
  if (!payload) return -1;
  const times = payload.hourly?.time ?? [];
  if (!times.length) return -1;

  const now = Date.now();
  let nearestIdx = 0;
  let nearestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i++) {
    const ms = new Date(times[i]).getTime();
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - now);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestIdx = i;
    }
  }

  return clamp(nearestIdx + hourOffset, 0, Math.max(0, times.length - 1));
}

export default function AstroMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { active } = usePlace();

  const params = useLocalSearchParams<{
    lat?: string;
    lon?: string;
    latDelta?: string;
    lonDelta?: string;
    zoom?: string;
    from?: string;
    nav?: string;
  }>();

  const navKey = String(params?.nav ?? '0');
  const routeLat = toNum(params.lat);
  const routeLon = toNum(params.lon);
  const routeLatDelta = toNum(params.latDelta);
  const routeLonDelta = toNum(params.lonDelta);
  const routeZoom = toNum(params.zoom);
  const hasExplicitEntryTarget = routeLat != null && routeLon != null;

  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skyFetchAbortRef = useRef<AbortController | null>(null);
  const inspectAbortRef = useRef<AbortController | null>(null);
  const inspectSerialRef = useRef(0);
  const fetchSerialRef = useRef(0);
  const lastSkyGridKeyRef = useRef<string>('');
  const lastRegionRef = useRef<Region | null>(null);
  const preloadInFlightRef = useRef(false);
  const didFinishInitialPreloadRef = useRef(false);
  const lastSyncedActiveTargetRef = useRef<string>('');
  const activeSnapshotRef = useRef(active);

  const screenKey = navKey;
  const activeSource = active?.source ?? null;
  const activeId = active?.id ?? null;
  const [entrySeed, setEntrySeed] = useState(() => ({
    lat: routeLat ?? active?.lat ?? null,
    lon: routeLon ?? active?.lon ?? null,
    latDelta: routeLatDelta,
    lonDelta: routeLonDelta,
    zoom: routeZoom,
  }));

  const activeFollowKey = useMemo(() => {
    if (!activeSource || hasExplicitEntryTarget) return 'none';
    if (activeSource === 'gps') return `gps:${screenKey}`;
    return `${activeSource}:${activeId}`;
  }, [activeId, activeSource, hasExplicitEntryTarget, screenKey]);

  const activeSyncTargetKey = useMemo(() => {
    if (activeFollowKey === 'none') return 'none';
    if (!active?.lat || !active?.lon) return 'none';
    return `${activeFollowKey}:${active.lat.toFixed(4)}:${active.lon.toFixed(4)}`;
  }, [active?.lat, active?.lon, activeFollowKey]);

  const initialRegion: Region = useMemo(() => {
    const fallback: Region = {
      latitude: 39.5,
      longitude: -98.35,
      latitudeDelta: 6,
      longitudeDelta: 6,
    };

    if (entrySeed.lat == null || entrySeed.lon == null) return fallback;

    if (entrySeed.latDelta != null && entrySeed.lonDelta != null) {
      return {
        latitude: entrySeed.lat,
        longitude: entrySeed.lon,
        latitudeDelta: clamp(entrySeed.latDelta, 0.05, 80),
        longitudeDelta: clamp(entrySeed.lonDelta, 0.05, 80),
      };
    }

    const z = entrySeed.zoom != null ? clamp(entrySeed.zoom, 2, 12) : 7;
    const d = clamp(360 / Math.pow(2, z), 0.1, 60);

    return {
      latitude: entrySeed.lat,
      longitude: entrySeed.lon,
      latitudeDelta: d,
      longitudeDelta: d,
    };
  }, [entrySeed]);

  const initialRegionRef = useRef<Region | null>(null);

  useEffect(() => {
    activeSnapshotRef.current = active;
  }, [active]);

  useEffect(() => {
    setEntrySeed({
      lat: routeLat ?? activeSnapshotRef.current?.lat ?? null,
      lon: routeLon ?? activeSnapshotRef.current?.lon ?? null,
      latDelta: routeLatDelta,
      lonDelta: routeLonDelta,
      zoom: routeZoom,
    });
  }, [screenKey, routeLat, routeLon, routeLatDelta, routeLonDelta, routeZoom]);

  useEffect(() => {
    initialRegionRef.current = initialRegion;
    lastRegionRef.current = initialRegion;
    lastSkyGridKeyRef.current = '';
    setViewRegion(initialRegion);
  }, [screenKey, initialRegion]);

  const cameraRef = useRef<any>(null);

  const [showSkyScore, setShowSkyScore] = useState(true);
  const [showAuroraProb, setShowAuroraProb] = useState(true);
  const [showAuroraOval, setShowAuroraOval] = useState(true);
  const [hourOffset, setHourOffset] = useState(0);
  const hourOffsetRef = useRef(hourOffset);
  const [isSkyLoading, setIsSkyLoading] = useState(false);
  const [hasEverLoadedSky, setHasEverLoadedSky] = useState(false);

  const [ovationPoints, setOvationPoints] = useState<OvationPoint[]>([]);
  const [ovationUpdatedAt, setOvationUpdatedAt] = useState<number | null>(null);

  const [statusLine, setStatusLine] = useState<string>('Loading astro map…');
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const [skyRasterUri, setSkyRasterUri] = useState<string>('');
  const [skyRasterBounds, setSkyRasterBounds] = useState<[number, number][]>([]);
  const [coverageBounds, setCoverageBounds] = useState<{
    west: number;
    east: number;
    south: number;
    north: number;
  } | null>(null);

  const [skyGrid, setSkyGrid] = useState<SkyGridPayload | null>(null);
  const [activeAstro, setActiveAstro] = useState<AstroLocationPayload | null>(null);
  const [inspectDetail, setInspectDetail] = useState<AstroInspectPayload | null>(null);

  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('full');
  const [inspect, setInspect] = useState<SkyInspect | null>(null);
  const [viewRegion, setViewRegion] = useState<Region>(initialRegion);
  const { baseMapStyle } = useSettings();

  useEffect(() => {
    hourOffsetRef.current = hourOffset;
  }, [hourOffset]);

  const canShowSky =
    showSkyScore &&
    typeof skyRasterUri === 'string' &&
    skyRasterUri.length > 0 &&
    skyRasterBounds.length === 4;
  const hasResolvedSky = canShowSky || inspect?.skyScore != null;
  const showSkyLoadingHud = isSkyLoading && !hasResolvedSky;

  const currentCenter = useMemo(() => {
    return {
      lat: viewRegion.latitude,
      lon: viewRegion.longitude,
      lonDelta: viewRegion.longitudeDelta,
      latDelta: viewRegion.latitudeDelta,
    };
  }, [viewRegion]);

  const isInCoverage = useMemo(() => {
    if (!coverageBounds) return false;
    return pointInBounds(currentCenter.lat, currentCenter.lon, coverageBounds);
  }, [coverageBounds, currentCenter.lat, currentCenter.lon]);

  const isZoomedWayOut = useMemo(() => {
    return currentCenter.lonDelta >= 120 || currentCenter.latDelta >= 80;
  }, [currentCenter.lonDelta, currentCenter.latDelta]);

  const coverageGeojson = useMemo(() => {
    if (!coverageBounds) return null;
    return { type: 'FeatureCollection', features: [boundsToPolygonFeature(coverageBounds)] } as any;
  }, [coverageBounds]);

  const hasUsableSkyOverlay = useCallback(() => {
    return (
      typeof skyRasterUri === 'string' &&
      skyRasterUri.length > 0 &&
      skyRasterBounds.length === 4 &&
      !!skyGrid
    );
  }, [skyRasterUri, skyRasterBounds, skyGrid]);

  const loadingCoverageGeojson = useMemo(() => {
    const b = regionBounds(viewRegion);
    if (!hasValidBounds(b)) return null;
    return { type: 'FeatureCollection', features: [boundsToPolygonFeature(b)] } as any;
  }, [viewRegion]);

  const activeHourIndex = useMemo(() => pickAstroHourIndex(activeAstro, hourOffset), [activeAstro, hourOffset]);

  const activeHourDetail = useMemo(() => {
    if (!activeAstro || activeHourIndex < 0) return null;
    const h = activeAstro.hourly;
    return {
      time: h.time?.[activeHourIndex] ?? null,
      cloudTotal: h.cloudTotal?.[activeHourIndex] ?? null,
      cloudLow: h.cloudLow?.[activeHourIndex] ?? null,
      cloudMid: h.cloudMid?.[activeHourIndex] ?? null,
      cloudHigh: h.cloudHigh?.[activeHourIndex] ?? null,
      visibilityM: h.visibilityM?.[activeHourIndex] ?? null,
      windMps: h.windMps?.[activeHourIndex] ?? null,
      gustMps: h.gustMps?.[activeHourIndex] ?? null,
      humidityPct: h.humidityPct?.[activeHourIndex] ?? null,
    };
  }, [activeAstro, activeHourIndex]);

  const ovationSamplePoints = useMemo(
    () => ovationPoints.map((p) => ({ lat: p.lat, lon: p.lon, prob: p.prob })),
    [ovationPoints]
  );

  const computeInspectAt = useCallback(
    (latQ: number, lonQ: number, gridOverride?: SkyGridPayload | null) => {
      const auroraProb = ovationSamplePoints.length ? sampleOvationAt(ovationSamplePoints, latQ, lonQ) : 0;

      const gridToUse = gridOverride ?? skyGrid;
      const skyScore = gridToUse ? sampleGridScore(gridToUse, latQ, lonQ) ?? 0 : 0;
      const visibleProb = Math.round(clamp((skyScore / 100) * (auroraProb / 100), 0, 1) * 100);

      return {
        lat: latQ,
        lon: lonQ,
        skyScore,
        auroraProb,
        visibleProb,
        nearestPoint: nearestGridPoint(gridToUse, latQ, lonQ),
      };
    },
    [ovationSamplePoints, skyGrid]
  );

  const clearSkyState = useCallback((preserveAstro = true) => {
    setSkyGrid(null);
    setSkyRasterUri('');
    setSkyRasterBounds([]);
    setCoverageBounds(null);
    setInspect(null);
    setInspectDetail(null);
    if (!preserveAstro) setActiveAstro(null);
    lastSkyGridKeyRef.current = '';
  }, []);

  const cancelPendingInspect = useCallback(() => {
    inspectSerialRef.current += 1;
    if (inspectDebounceRef.current) {
      clearTimeout(inspectDebounceRef.current);
      inspectDebounceRef.current = null;
    }
    if (inspectAbortRef.current) {
      inspectAbortRef.current.abort();
      inspectAbortRef.current = null;
    }
  }, []);

  const cancelPendingSkyFetch = useCallback(() => {
    fetchSerialRef.current += 1;
    if (regionDebounceRef.current) {
      clearTimeout(regionDebounceRef.current);
      regionDebounceRef.current = null;
    }
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
    if (skyFetchAbortRef.current) {
      skyFetchAbortRef.current.abort();
      skyFetchAbortRef.current = null;
    }
  }, []);

  const scheduleRetryAfterCooldown = useCallback(
    (retryFn: () => void) => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (!isFocused || !showSkyScore) return;

      const now = Date.now();
      const waitMs = Math.max(0, OM_BACKOFF.until - now) + 300;
      if (waitMs <= 0) return;

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (!isFocused || !showSkyScore) return;
        lastSkyGridKeyRef.current = '';
        retryFn();
      }, waitMs);
    },
    [isFocused, showSkyScore]
  );

  const applyGridToMap = useCallback(
  async (
    grid: SkyGridPayload,
    key: string,
    regionForInspect?: Region | null,
    opts?: { fetchId?: number; source?: 'hero' | 'regional' | 'cache' }
  ) => {
    if (!isFocused) {
      return false;
    }

    if (opts?.fetchId != null && opts.fetchId !== fetchSerialRef.current) {
      return false;
    }

    const localUri = await makeSkyRasterFromGrid(grid, key);

    if (!isFocused) {
      return false;
    }

    if (opts?.fetchId != null && opts.fetchId !== fetchSerialRef.current) {
      return false;
    }

    setSkyGridCache(key, grid);

    setSkyGrid(grid);
    setSkyRasterBounds([
      [grid.bounds.west, grid.bounds.north],
      [grid.bounds.east, grid.bounds.north],
      [grid.bounds.east, grid.bounds.south],
      [grid.bounds.west, grid.bounds.south],
    ]);
    setCoverageBounds(grid.bounds);
    setSkyRasterUri(localUri);

    const r = regionForInspect ?? lastRegionRef.current ?? initialRegion;
    const ins = computeInspectAt(r.latitude, r.longitude, grid);
    setInspect(ins);

    return true;
  },
  [computeInspectAt, initialRegion, isFocused]
);

  const refreshInspectForRegion = useCallback(
    (region: Region) => {
      if (!isFocused) return;
      cancelPendingInspect();

      inspectDebounceRef.current = setTimeout(async () => {
        const requestId = inspectSerialRef.current;
        const ctrl = new AbortController();
        inspectAbortRef.current = ctrl;

        try {
          const detail = await fetchAstroInspect({
            lat: region.latitude,
            lon: region.longitude,
            hourOffset,
            signal: ctrl.signal,
          });
          if (requestId !== inspectSerialRef.current || ctrl.signal.aborted) return;
          setInspectDetail(detail);
          setInspect((cur) => {
            const base = cur ?? computeInspectAt(region.latitude, region.longitude, skyGrid);
            const visibleProb = Math.round(clamp((detail.skyScore / 100) * (base.auroraProb / 100), 0, 1) * 100);
            return {
              ...base,
              lat: detail.lat,
              lon: detail.lon,
              skyScore: detail.skyScore,
              visibleProb,
            };
          });
        } catch (e: any) {
          if (ctrl.signal.aborted || requestId !== inspectSerialRef.current || /aborted|aborterror/i.test(String(e?.message ?? e ?? ''))) {
            return;
          }
          // keep sampled grid inspect if exact inspect fails
        } finally {
          if (inspectAbortRef.current === ctrl) {
            inspectAbortRef.current = null;
          }
        }
      }, 280);
    },
    [hourOffset, cancelPendingInspect, computeInspectAt, skyGrid, isFocused]
  );

  const refreshForRegion = useCallback(
    (region: Region) => {
      if (!isFocused) return;
      if (preloadInFlightRef.current && !didFinishInitialPreloadRef.current) return;

      if (!showSkyScore) {
        setStatusLine('SkyScore off');
        setErrorLine(null);
        clearSkyState();
        return;
      }

      if (!isSkyFetchScaleOK(region)) {
        setErrorLine(null);
        setStatusLine('Zoom in to load SkyScore.');
        clearSkyState();
        return;
      }

      const b = regionBounds(region);
      const zoom = isFiniteNum((region as any).zoom)
        ? (region as any).zoom
        : approxZoomFromLongitudeDelta(region.longitudeDelta);

      if (!hasValidBounds(b)) {
        setErrorLine(null);
        setStatusLine('Waiting for valid map bounds…');
        return;
      }

      const now = Date.now();
      if (OM_BACKOFF.until > now) {
        const waitS = Math.ceil((OM_BACKOFF.until - now) / 1000);
        setStatusLine(`Cooling down (${waitS}s) after ${OM_BACKOFF.lastStatus || 502}.`);
        lastSkyGridKeyRef.current = '';

        scheduleRetryAfterCooldown(() => {
          const r = lastRegionRef.current;
          if (r) refreshForRegion(r);
        });
        return;
      }

      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      if (skyFetchAbortRef.current) {
        fetchSerialRef.current += 1;
        skyFetchAbortRef.current.abort();
        skyFetchAbortRef.current = null;
      }
      setIsSkyLoading(true);

      regionDebounceRef.current = setTimeout(async () => {
        const fetchId = ++fetchSerialRef.current;
        const ctrl = new AbortController();
        skyFetchAbortRef.current = ctrl;

  try {
    setErrorLine(null);

    const size = chooseSkyGridSize(zoom);
    const key =
      `${b.west.toFixed(3)}:${b.south.toFixed(3)}:${b.east.toFixed(3)}:${b.north.toFixed(3)}` +
      `:z${Math.round(zoom * 10) / 10}:h${hourOffset}:s${size}:client-regional`;

    if (key === lastSkyGridKeyRef.current) {
      setIsSkyLoading(false);
      return;
    }
    lastSkyGridKeyRef.current = key;

    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    loadingTimerRef.current = setTimeout(() => {
      if (fetchId === fetchSerialRef.current && !hasUsableSkyOverlay()) {
        setStatusLine(`Loading SkyScore overlay (${formatHourLabel(hourOffset)})…`);
      }
    }, 180);

    const grid = await fetchSkyGridPayload({
      bounds: b,
      zoom,
      hourOffset,
      size,
      includePoints: true,
      mode: 'regional',
      density: 'auto',
      astroContext: activeAstro,
      signal: ctrl.signal,
    });

    if (fetchId !== fetchSerialRef.current || ctrl.signal.aborted) {
      return;
    }

    OM_BACKOFF.strikes = 0;
    OM_BACKOFF.until = 0;
    OM_BACKOFF.lastStatus = 0;

    if (!grid?.ok || !Array.isArray(grid.scores)) {
      throw new Error('SkyScore grid payload invalid');
    }
    if (!hasValidBounds(grid.bounds)) {
      throw new Error('SkyScore grid returned invalid bounds');
    }

    const applied = await applyGridToMap(grid, key, region, {
      fetchId,
      source: 'regional',
    });

    if (!applied) return;

    setIsSkyLoading(false);
    setHasEverLoadedSky(true);
    refreshInspectForRegion(region);
    setStatusLine(`Sky map ready · ${formatHourLabel(hourOffset)}`);
  } catch (e: any) {
    if (fetchId !== fetchSerialRef.current || ctrl.signal.aborted) {
      return;
    }

    const msg = String(e?.message ?? e ?? 'SkyScore failed');

    const is429 = /\b429\b/.test(msg);
    const is502 = /\b502\b/.test(msg);
    const isAbort = /aborted|aborterror/i.test(msg);

    if (isAbort) {
      return;
    }

    if (is429 || is502) {
      OM_BACKOFF.lastStatus = is429 ? 429 : 502;
      OM_BACKOFF.strikes = Math.min(6, OM_BACKOFF.strikes + 1);
      OM_BACKOFF.until = Date.now() + Math.min(12000 * Math.pow(2, OM_BACKOFF.strikes - 1), 120000);

      const r = lastRegionRef.current ?? region;
      const b2 = regionBounds(r);
      const size2 = chooseSkyGridSize(zoom);
      const retryKey =
        `${b2.west.toFixed(3)}:${b2.south.toFixed(3)}:${b2.east.toFixed(3)}:${b2.north.toFixed(3)}` +
        `:z${Math.round(zoom * 10) / 10}:h${hourOffset}:s${size2}:client-regional`;

      const cachedGrid = SKY_GRID_MEMORY_CACHE.get(retryKey) ?? skyGrid ?? null;

      if (cachedGrid) {
        const applied = await applyGridToMap(cachedGrid, retryKey, r, {
          fetchId,
          source: 'cache',
        });

        if (applied) {
          setIsSkyLoading(false);
          setHasEverLoadedSky(true);
          setStatusLine('Showing last Sky map · retrying shortly…');
          setErrorLine(null);
        }
      } else {
        setStatusLine('SkyScore is loading a wider area. Retrying shortly…');
        setErrorLine(null);
      }

      lastSkyGridKeyRef.current = '';

      scheduleRetryAfterCooldown(() => {
        const rr = lastRegionRef.current;
        if (rr) refreshForRegion(rr);
      });
      return;
    }

    setErrorLine(msg);
    setStatusLine(
      hasUsableSkyOverlay()
        ? 'Showing last Sky map · refresh failed'
        : `Sky map unavailable · ${formatHourLabel(hourOffset)}`
    );
  } finally {
    if (skyFetchAbortRef.current === ctrl) {
      skyFetchAbortRef.current = null;
    }

    if (fetchId === fetchSerialRef.current) {
      setIsSkyLoading(false);
    }

    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }
}, 320); 
    },
    [hourOffset, applyGridToMap, scheduleRetryAfterCooldown, showSkyScore, clearSkyState, skyGrid, activeAstro, refreshInspectForRegion, hasUsableSkyOverlay, isFocused]
  );

  useEffect(() => {
    if (isFocused) return;
    cancelPendingInspect();
    cancelPendingSkyFetch();
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    lastSkyGridKeyRef.current = '';
    setIsSkyLoading(false);
  }, [cancelPendingInspect, cancelPendingSkyFetch, isFocused]);

  useEffect(() => {
    return () => {
      cancelPendingInspect();
      cancelPendingSkyFetch();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      lastSkyGridKeyRef.current = '';
    };
  }, [cancelPendingInspect, cancelPendingSkyFetch]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    async function run() {
      try {
        setErrorLine(null);
        const pts = await fetchOvationPoints(2 * 60_000);
        if (cancelled) return;
        setOvationPoints(pts);
        setOvationUpdatedAt(Date.now());

      } catch (e: any) {
        if (cancelled) return;
        setErrorLine(String(e?.message ?? e ?? 'Aurora (OVATION) failed'));
        setOvationPoints([]);
      }
    }

    run();
    const t = setInterval(run, 2 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

  async function syncActivePlaceToAstro() {
    const activePlace = activeSnapshotRef.current;
    if (activeFollowKey === 'none') return;
    if (!activePlace?.lat || !activePlace?.lon) return;
    if (activeSyncTargetKey === 'none') return;
    if (lastSyncedActiveTargetRef.current === activeSyncTargetKey) return;
    if (preloadInFlightRef.current) return;

    cancelPendingInspect();
    cancelPendingSkyFetch();
    const activeHourOffset = hourOffsetRef.current;

    lastSyncedActiveTargetRef.current = activeSyncTargetKey;
    preloadInFlightRef.current = true;

    const nextRegion: Region = {
      latitude: activePlace.lat,
      longitude: activePlace.lon,
      latitudeDelta:
        lastRegionRef.current?.latitudeDelta && Number.isFinite(lastRegionRef.current.latitudeDelta)
          ? clamp(lastRegionRef.current.latitudeDelta, 0.08, 40)
          : initialRegion.latitudeDelta,
      longitudeDelta:
        lastRegionRef.current?.longitudeDelta && Number.isFinite(lastRegionRef.current.longitudeDelta)
          ? clamp(lastRegionRef.current.longitudeDelta, 0.08, 40)
          : initialRegion.longitudeDelta,
    };

    try {
      setErrorLine(null);
      setIsSkyLoading(true);
      setHasEverLoadedSky(false);
      setStatusLine(`Loading SkyScore for ${shortPlaceLabel(activePlace.name)}…`);

      lastRegionRef.current = nextRegion;
      initialRegionRef.current = nextRegion;
      lastSkyGridKeyRef.current = '';
      didFinishInitialPreloadRef.current = false;
      setViewRegion(nextRegion);

      clearSkyState(false);

        try {
          cameraRef.current?.setCamera?.({
            centerCoordinate: [activePlace.lon, activePlace.lat],
            zoomLevel: clamp(
              approxZoomFromLongitudeDelta(nextRegion.longitudeDelta),
              3,
            10
          ),
          animationDuration: 500,
        });
      } catch {
        // no-op
      }

      let astroForGrid: AstroLocationPayload | null = null;

      try {
        const astro = await fetchAstroLocation(activePlace.lat, activePlace.lon, activePlace.name);
        astroForGrid = astro;
        if (!cancelled) setActiveAstro(astro);
      } catch (e: any) {
        if (!cancelled) {
          const msg = String(e?.message ?? e ?? 'Active astro load failed');
          setErrorLine((cur) => cur ?? msg);
        }
      }

      if (cancelled) return;

      // Seed a local hero grid immediately for the newly selected place.
      const heroKey = `hero:${activePlace.lat.toFixed(3)}:${activePlace.lon.toFixed(3)}:h${activeHourOffset}:client-hero`;
      const heroGrid =
        SKY_GRID_MEMORY_CACHE.get(heroKey) ??
        (await fetchSkyGridPayload({
          bounds: buildHeroBounds(activePlace.lat, activePlace.lon),
          zoom: 7,
          hourOffset: activeHourOffset,
          size: 128,
          includePoints: true,
          mode: 'hero',
          density: 'low',
          centerLat: activePlace.lat,
          centerLon: activePlace.lon,
          astroContext: astroForGrid,
        }));

      if (cancelled) return;

      if (!hasValidBounds(heroGrid.bounds)) {
        throw new Error('Hero SkyScore grid returned invalid bounds');
      }

      const heroFetchId = ++fetchSerialRef.current;

      const applied = await applyGridToMap(heroGrid, heroKey, nextRegion, {
        fetchId: heroFetchId,
        source: 'hero',
      });

      if (cancelled || !applied) return;

      setIsSkyLoading(false);
      setHasEverLoadedSky(true);
      refreshInspectForRegion(nextRegion);
      setStatusLine(`SkyScore ready for ${shortPlaceLabel(activePlace.name)} - ${formatHourLabel(activeHourOffset)}`);

      // Then request the broader regional overlay too, using the same seeded region.
      lastSkyGridKeyRef.current = '';
      refreshForRegion(nextRegion);
    } catch (e: any) {
      if (!cancelled) {
        setIsSkyLoading(false);
        setErrorLine((cur) => cur ?? String(e?.message ?? e ?? 'Astro sync failed'));
      }
    } finally {
      preloadInFlightRef.current = false;
      didFinishInitialPreloadRef.current = true;
    }
  }

  syncActivePlaceToAstro();

  return () => {
    cancelled = true;
  };
}, [
  activeFollowKey,
  activeSyncTargetKey,
  applyGridToMap,
  cancelPendingInspect,
  cancelPendingSkyFetch,
  clearSkyState,
  initialRegion,
  isFocused,
  refreshInspectForRegion,
  refreshForRegion,
]);

useEffect(() => {
  if (!isFocused) return;
  const r = lastRegionRef.current ?? initialRegion;
  if (!r) return;
  if (hasEverLoadedSky) return;
  if (isSkyLoading) return;

  lastSkyGridKeyRef.current = '';
  refreshForRegion(r);
}, [initialRegion, hasEverLoadedSky, isSkyLoading, refreshForRegion, isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    const r = lastRegionRef.current;
    if (r) {
      lastSkyGridKeyRef.current = '';
      refreshForRegion(r);
    }
  }, [hourOffset, refreshForRegion, isFocused]);

  const auroraContoursGeojson = useMemo(() => {
    if (!showAuroraOval || !ovationPoints.length) {
      return { type: 'FeatureCollection', features: [] } as any;
    }

    const filtered = ovationPoints.filter((p) => p.prob >= 3);
    if (filtered.length < 60) return { type: 'FeatureCollection', features: [] } as any;

    return buildAuroraContourRings(
      filtered.map((p) => ({ lat: p.lat, lon: p.lon, prob: p.prob })),
      { thresholds: [5, 10, 20, 35, 50], binDeg: 1, minProbToInclude: 3 }
    );
  }, [ovationPoints, showAuroraOval]);

  const auroraContourStyle = useMemo(() => {
    return {
      lineColor: [
        'match',
        ['get', 'thr'],
        50, 'rgba(210,255,240,0.95)',
        35, 'rgba(170,255,220,0.90)',
        20, 'rgba(120,255,200,0.80)',
        10, 'rgba(90,230,190,0.70)',
        5, 'rgba(70,200,170,0.55)',
        'rgba(70,200,170,0.50)',
      ],
      lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 2.0, 4, 2.5, 7, 3.0, 10, 3.5, 12, 4.0],
      lineOpacity: ['interpolate', ['linear'], ['zoom'], 1, 0.8, 4, 0.95, 9, 1.0, 13, 1.0],
    } as const;
  }, []);

  const auroraFillStyle = useMemo(() => {
    return {
      fillColor: [
        'match',
        ['get', 'thr'],
        50, 'rgba(226,255,245,1)',
        35, 'rgba(150,255,220,1)',
        20, 'rgba(88,240,196,1)',
        10, 'rgba(72,206,186,1)',
        5, 'rgba(106,132,255,1)',
        'rgba(72,206,186,1)',
      ],
      fillOpacity: [
        'interpolate',
        ['linear'],
        ['zoom'],
        1, 0.08,
        4, 0.12,
        7, 0.16,
        10, 0.20,
        12, 0.24,
      ],
    } as const;
  }, []);

  const auroraGlowStyle = useMemo(() => {
    return {
      lineColor: [
        'match',
        ['get', 'thr'],
        50, 'rgba(220,255,245,0.95)',
        35, 'rgba(170,255,228,0.92)',
        20, 'rgba(110,255,214,0.88)',
        10, 'rgba(112,224,255,0.82)',
        5, 'rgba(150,110,255,0.78)',
        'rgba(112,224,255,0.78)',
      ],
      lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 7.0, 4, 9.0, 7, 11.0, 10, 13.0, 12, 15.0],
      lineOpacity: ['interpolate', ['linear'], ['zoom'], 1, 0.10, 4, 0.14, 8, 0.18, 12, 0.22],
      lineBlur: ['interpolate', ['linear'], ['zoom'], 1, 2.2, 4, 2.8, 8, 3.4, 12, 4.0],
    } as const;
  }, []);

  const selectedUsingActiveAstro = useMemo(() => {
    if (!inspect || !activeAstro || !active) return false;
    return approxDistanceDeg(inspect.lat, inspect.lon, active.lat, active.lon) <= 0.55;
  }, [inspect, activeAstro, active]);

  const selectedCloudTotal =
    selectedUsingActiveAstro ? activeHourDetail?.cloudTotal ?? null : inspectDetail?.cloudTotal ?? inspect?.nearestPoint?.cloudTotal ?? null;
  const selectedCloudLow =
    selectedUsingActiveAstro ? activeHourDetail?.cloudLow ?? null : inspectDetail?.cloudLow ?? inspect?.nearestPoint?.cloudLow ?? null;
  const selectedCloudMid =
    selectedUsingActiveAstro ? activeHourDetail?.cloudMid ?? null : inspectDetail?.cloudMid ?? inspect?.nearestPoint?.cloudMid ?? null;
  const selectedCloudHigh =
    selectedUsingActiveAstro ? activeHourDetail?.cloudHigh ?? null : inspectDetail?.cloudHigh ?? inspect?.nearestPoint?.cloudHigh ?? null;
  const selectedVisibilityM =
    selectedUsingActiveAstro ? activeHourDetail?.visibilityM ?? null : inspectDetail?.visibilityM ?? inspect?.nearestPoint?.visibilityM ?? null;
  const selectedWindMps =
    selectedUsingActiveAstro ? activeHourDetail?.windMps ?? null : inspectDetail?.windMps ?? inspect?.nearestPoint?.windMps ?? null;
  const selectedGustMps =
    selectedUsingActiveAstro ? activeHourDetail?.gustMps ?? null : inspectDetail?.gustMps ?? inspect?.nearestPoint?.gustMps ?? null;

  const selectedPlaceName = selectedUsingActiveAstro
    ? shortPlaceLabel(activeAstro?.placeName ?? active?.name ?? 'Selected area')
    : 'Selected area';

  const hudSkyLabel = inspect?.skyScore == null ? '—' : `${Math.round(inspect.skyScore)}`;
  const aurVisLabel = inspect?.visibleProb == null ? '—' : `${Math.round(inspect.visibleProb)}%`;

  const TAB_BAR_HEIGHT = 56;
  void ovationUpdatedAt;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        {isFocused ? (
          <MapRenderer
            key={`astro-map-${screenKey}`}
            engine="maplibre"
            initialRegion={initialRegionRef.current ?? initialRegion}
            mapStyle={baseMapStyle}
            regionEventMode="settled"
            cameraRef={cameraRef}
            onRegionChangeComplete={(r: Region) => {
              if (
                !isFiniteNum(r.latitude) ||
                !isFiniteNum(r.longitude) ||
                !isFiniteNum(r.longitudeDelta) ||
                !isFiniteNum(r.latitudeDelta)
              ) {
                return;
              }

              const prev = lastRegionRef.current;
              lastRegionRef.current = r;
              setViewRegion(r);

              setInspect(computeInspectAt(r.latitude, r.longitude));
              refreshInspectForRegion(r);

              if (regionChangeIsSignificant(prev, r)) {
                refreshForRegion(r);
              }
            }}
            radar={{ enabled: false, templates: [null, null, null], opacities: [0, 0, 0], tileMaxZ: 0, localImage: null }}
            overlays={[]}
          >
            {coverageGeojson ? (
              <MapLibreGL.ShapeSource id={`skyCoverage-src-${screenKey}`} shape={coverageGeojson as any}>
                <MapLibreGL.FillLayer
                  id={`skyCoverage-fill-${screenKey}`}
                  style={{
                    fillOpacity: 0.02,
                    fillColor: 'rgba(90,230,190,1)',
                  }}
                />
                <MapLibreGL.LineLayer
                  id={`skyCoverage-line-${screenKey}`}
                  style={{
                    lineColor: 'rgba(90,230,190,0.50)',
                    lineWidth: 1.0,
                    lineOpacity: 0.45,
                    lineDasharray: [2, 2],
                  }}
                />
              </MapLibreGL.ShapeSource>
            ) : null}
            {showSkyLoadingHud && loadingCoverageGeojson ? (
              <MapLibreGL.ShapeSource id={`skyLoading-src-${screenKey}`} shape={loadingCoverageGeojson as any}>
                <MapLibreGL.FillLayer
                  id={`skyLoading-fill-${screenKey}`}
                  style={{
                    fillOpacity: 0.12,
                    fillColor: 'rgba(90,230,190,1)',
                  }}
                />
                <MapLibreGL.LineLayer
                  id={`skyLoading-line-${screenKey}`}
                  style={{
                    lineColor: 'rgba(120,255,210,0.55)',
                    lineWidth: 1.2,
                    lineOpacity: 0.65,
                    lineDasharray: [2, 2],
                  }}
                />
              </MapLibreGL.ShapeSource>
            ) : null}

            {canShowSky ? (
              <MapLibreGL.ImageSource id={`skyRaster-src-${screenKey}`} url={skyRasterUri} coordinates={skyRasterBounds as any}>
                <MapLibreGL.RasterLayer
                  id={`skyRaster-${screenKey}`}
                  style={{
                    rasterOpacity: 0.8,
                    rasterResampling: 'linear',
                    rasterFadeDuration: 220,
                  }}
                />
              </MapLibreGL.ImageSource>
            ) : null}

            {showAuroraOval ? (
              <MapLibreGL.ShapeSource id={`auroraOval-src-${screenKey}`} shape={auroraContoursGeojson as any}>
                <MapLibreGL.FillLayer id={`auroraOval-fill-${screenKey}`} style={auroraFillStyle as any} />
                <MapLibreGL.LineLayer id={`auroraOval-glow-${screenKey}`} style={auroraGlowStyle as any} />
                <MapLibreGL.LineLayer id={`auroraOval-line-${screenKey}`} style={auroraContourStyle as any} />
              </MapLibreGL.ShapeSource>
            ) : null}
          </MapRenderer>
        ) : (
          <View style={{ flex: 1, backgroundColor: '#020617' }} />
        )}

        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
          <View
            style={{
              position: 'absolute',
              left: -10,
              top: -1,
              width: 20,
              height: 2,
              backgroundColor: 'rgba(255,255,255,0.45)',
              borderRadius: 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: -1,
              top: -10,
              width: 2,
              height: 20,
              backgroundColor: 'rgba(255,255,255,0.45)',
              borderRadius: 2,
            }}
          />
        </View>

        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            elevation: 1000,
          }}
        >
          {showSkyScore ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: insets.top + 4,
                left: 10,
                right: 240,
                alignSelf: 'flex-start',
              }}
            >
              <SkyScoreLegendSliver />
            </View>
          ) : null}

          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: insets.top + 54,
              left: 24,
              right: 84,
              alignItems: 'flex-start',
            }}
          >
            <Glass
              style={{
                maxWidth: 344,
                minWidth: 268,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 18,
                backgroundColor: 'rgba(5,12,10,0.76)',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      backgroundColor: errorLine
                        ? 'rgba(255,120,120,0.9)'
                        : showSkyLoadingHud
                          ? 'rgba(255,210,110,0.95)'
                          : 'rgba(120,255,190,0.95)',
                    }}
                  />
                  <Text
                    style={{
                      color: 'rgba(210,255,235,0.97)',
                      fontSize: 12,
                      fontWeight: '900',
                      letterSpacing: 0.6,
                      flexShrink: 1,
                    }}
                    numberOfLines={1}
                  >
                    SKY {hudSkyLabel} · {scoreLabel(inspect?.skyScore)}
                  </Text>
                </View>

                {showSkyLoadingHud ? (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      marginTop: 6,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      borderRadius: 999,
                      backgroundColor: 'rgba(255,210,110,0.14)',
                      borderWidth: 1,
                      borderColor: 'rgba(255,210,110,0.24)',
                    }}
                  >
                    <Text
                      style={{
                        color: 'rgba(255,225,160,0.96)',
                        fontSize: 11,
                        fontWeight: '900',
                        letterSpacing: 0.4,
                      }}
                    >
                      {statusLine}
                    </Text>
                  </View>
                ) : null}

                

                <Text
                  style={{
                    color: 'rgba(255,255,255,0.62)',
                    fontSize: 11,
                    fontWeight: '900',
                  }}
                  numberOfLines={1}
                >
                  {formatHourLabel(hourOffset)}
                </Text>
              </View>

              <Text
                style={{
                  marginTop: 5,
                  color: errorLine ? 'rgba(255,140,140,0.95)' : 'rgba(170,255,210,0.85)',
                  fontSize: 11,
                  lineHeight: 14,
                  fontWeight: '800',
                }}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {errorLine
                  ? errorLine
                  : `${selectedPlaceName} · Aur Vis ${aurVisLabel}`}
              </Text>

              <Text
                style={{
                  marginTop: 5,
                  color: 'rgba(255,255,255,0.56)',
                  fontSize: 10.5,
                  lineHeight: 13,
                  fontWeight: '700',
                }}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {scoreSentence(inspect?.skyScore, selectedCloudTotal, inspect?.visibleProb)}
              </Text>
            </Glass>
          </View>
        </View>

        <BottomSheet
          visible
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          bottomDock={TAB_BAR_HEIGHT + insets.bottom}
          draggable
          header={
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1, minWidth: 0, paddingRight: 4 }}>
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 22 }} numberOfLines={1}>
                    Sky {inspect?.skyScore ?? '—'}
                  </Text>
                  <Text
                    style={{ color: 'rgba(255,255,255,0.72)', fontWeight: '800', marginTop: 4, lineHeight: 18 }}
                    numberOfLines={2}
                  >
                    {selectedPlaceName} · {scoreLabel(inspect?.skyScore)}
                  </Text>
                </View>

                <Pressable
                  onPress={() => router.back()}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>Back</Text>
                </Pressable>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <MetricPill label="Aurora vis" value={fmtPct(inspect?.visibleProb)} />
                <MetricPill label="Aurora prob" value={showAuroraProb ? fmtPct(inspect?.auroraProb) : 'Hidden'} />
                <MetricPill
                  label="Bortle"
                  value={selectedUsingActiveAstro ? fmtBortle(activeAstro?.site) : fmtBortle(inspectDetail?.site)}
                />
              </View>

              <Text style={{ color: 'rgba(255,255,255,0.72)', fontWeight: '700', lineHeight: 19 }}>
                {scoreSentence(inspect?.skyScore, selectedCloudTotal, inspect?.visibleProb)}
              </Text>
            </View>
          }
        >
          <View style={{ gap: 10, marginBottom: 8 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '900', letterSpacing: 0.5 }}>CONTROLS</Text>

            <TimelineSlider value={hourOffset} onChange={(v) => setHourOffset(v)} />

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ToggleChip
                label="Sky"
                active={showSkyScore}
                onPress={() => setShowSkyScore((v) => !v)}
              />
              <ToggleChip label="Aurora %" active={showAuroraProb} onPress={() => setShowAuroraProb((v) => !v)} />
              <ToggleChip label="Aurora band" active={showAuroraOval} onPress={() => setShowAuroraOval((v) => !v)} />
            </View>
          </View>

          <Section title="Now">
            <Row label="Sky score" value={inspect?.skyScore != null ? `${inspect.skyScore}` : '—'} />
            <Row label="Quality" value={scoreLabel(inspect?.skyScore)} />
            <Row label="Aurora visibility" value={fmtPct(inspect?.visibleProb)} />
            {showAuroraProb ? <Row label="Aurora probability" value={fmtPct(inspect?.auroraProb)} /> : null}
            <Row label="Forecast time" value={formatHourLabel(hourOffset)} />
            <Row
              label="Center"
              value={`${inspect?.lat?.toFixed(3) ?? '—'}, ${inspect?.lon?.toFixed(3) ?? '—'}`}
            />
          </Section>

          <Section title="Sky conditions">
            <Row label="Low clouds" value={fmtPct(selectedCloudLow)} />
            <Row label="Mid clouds" value={fmtPct(selectedCloudMid)} />
            <Row label="High clouds" value={fmtPct(selectedCloudHigh)} />
            <Row label="Total clouds" value={fmtPct(selectedCloudTotal)} />
            <Row label="Wind" value={fmtMph(selectedWindMps)} />
            <Row label="Gusts" value={fmtMph(selectedGustMps)} />
            <Row label="Visibility" value={fmtMilesFromMeters(selectedVisibilityM)} />
            {selectedUsingActiveAstro ? (
              <Row label="Humidity" value={fmtPct(activeHourDetail?.humidityPct)} />
            ) : null}
          </Section>

          <Section title="Observing context">
            <Row label="Bortle" value={selectedUsingActiveAstro ? fmtBortle(activeAstro?.site) : fmtBortle(inspectDetail?.site)} />
            <Row
              label="Moon"
              value={fmtMoon(activeAstro?.moonDays?.[0]?.moonPhaseLabel, activeAstro?.moonDays?.[0]?.moonIlluminationPct)}
            />
            <Row label="Moonrise" value={fmtClock(activeAstro?.moonDays?.[0]?.moonrise)} />
            <Row label="Moonset" value={fmtClock(activeAstro?.moonDays?.[0]?.moonset)} />
            <Row label="Astronomical dusk" value={fmtClock(activeAstro?.twilight?.todayAstronomicalDusk)} />
            <Row label="Astronomical dawn" value={fmtClock(activeAstro?.twilight?.tomorrowAstronomicalDawn)} />
            <Row label="Sunset" value={fmtClock(activeAstro?.sun?.todaySunset)} />
            <Row label="Sunrise" value={fmtClock(activeAstro?.sun?.tomorrowSunrise)} />
          </Section>

          <Section title="What this means">
            <Text style={{ color: 'rgba(255,255,255,0.82)', lineHeight: 20, fontWeight: '700' }}>
              {scoreSentence(inspect?.skyScore, selectedCloudTotal, inspect?.visibleProb)}.
              {selectedCloudHigh != null && selectedCloudHigh >= 60
                ? ' High cloud can wash out stars even when lower clouds look okay.'
                : ''}
              {selectedGustMps != null && toMph(selectedGustMps) != null && (toMph(selectedGustMps) as number) >= 20
                ? ' Gusty conditions may make observing less comfortable and can reduce steadiness.'
                : ''}
              {activeAstro?.site?.bortleLabel
                ? ` Your saved/default site is ${activeAstro.site.bortleLabel}, which helps set the local darkness ceiling.`
                : ''}
            </Text>
          </Section>

          {(!isInCoverage || isZoomedWayOut) && (
            <Section title="Map coverage">
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '800', lineHeight: 19 }}>
                {coverageBounds
                  ? 'Zoom into the outlined region to see detailed SkyScore shading.'
                  : 'Pan or zoom to load detailed SkyScore shading.'}
              </Text>
            </Section>
          )}

          <View style={{ height: 10 }} />
        </BottomSheet>
      </View>
    </SafeAreaView>
  );
}
