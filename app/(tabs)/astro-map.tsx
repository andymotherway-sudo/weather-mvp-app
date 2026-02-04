// app/(tabs)/astro-map.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';


import { Glass } from '../../components/common/Glass';
import { AtmosphericLegend } from '../../components/maps/AtmosphericLegend';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';

// ✅ Use the shared aurora module
import {
  boundsFromPoints as boundsFromOvationPoints,
  buildAuroraContourRings,
  fetchOvationPoints as fetchOvationPointsLib,
  sampleOvationAt,
  type OvationPoint as OvationPointLib,
} from '../lib/aurora/ovation';

/* =============================================================================
 * utils
 * ============================================================================= */

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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

function roundTo(x: number, step: number) {
  return Math.round(x / step) * step;
}

function boundsKey(
  b: { west: number; east: number; south: number; north: number },
  zoom: number,
  stepDeg: number,
  hourOffset: number
) {
  const r = (v: number) => roundTo(v, 0.05).toFixed(2);
  const zBucket = Math.round(zoom * 2) / 2; // 0.5 zoom buckets
  return `b:${r(b.west)}:${r(b.east)}:${r(b.south)}:${r(b.north)}:z${zBucket}:s${stepDeg}:h${hourOffset}`;
}

// MapLibre safety helpers (prevents “latitude must be between…” crash)
function clampLat(lat: number) {
  return clamp(lat, -85, 85);
}
function normLon(lon: number) {
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}
function isValidNum(n: any) {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Bounds containment for the MVP “coverage” message. */
function pointInBounds(lat: number, lon: number, b: { west: number; east: number; south: number; north: number }) {
  // Note: assumes bounds don’t cross the dateline. Good enough for MVP because fetched raster bounds won’t.
  return lon >= b.west && lon <= b.east && lat >= b.south && lat <= b.north;
}

/** Build a GeoJSON polygon feature from bounds (for coverage outline). */
function boundsToPolygonFeature(b: { west: number; east: number; south: number; north: number }) {
  return {
    type: 'Feature',
    properties: { kind: 'skyscoreCoverage' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [b.west, b.south],
          [b.east, b.south],
          [b.east, b.north],
          [b.west, b.north],
          [b.west, b.south],
        ],
      ],
    },
  } as const;
}

/* =============================================================================
 * SkyScore inputs (Open-Meteo grid)
 * ============================================================================= */

type AstroInputs = {
  lat: number;
  lon: number;
  cloudTotal: number | null; // %
  cloudLow: number | null; // %
  cloudMid: number | null; // %
  cloudHigh: number | null; // %
  visibilityM: number | null;
  wind: number | null;
  gust: number | null;
};

type SkyPoint = {
  lat: number;
  lon: number;
  score: number; // 0..100
  score01: number; // 0..1
  parts: { weather: number; darkness: number };
  inputs: AstroInputs;
};

type AstroGridCacheEntry = { fetchedAt: number; stepUsed: number; inputs: AstroInputs[] };
const ASTRO_GRID_CACHE = new Map<string, AstroGridCacheEntry>();

// ✅ Backoff so 429s don't spiral when panning/scrubbing
const OM_BACKOFF = { until: 0, lastStatus: 0, strikes: 0 };

function chooseStepDeg(zoom: number) {
  const z = clamp(zoom, 2, 12);
  if (z <= 3) return 2;
  if (z <= 5) return 1;
  if (z <= 7) return 0.5;
  if (z <= 9) return 0.25;
  return 0.2;
}

function buildGrid(bounds: { west: number; east: number; south: number; north: number }, stepDeg: number, maxPts = 500) {
  const pts: Array<{ lat: number; lon: number }> = [];

  const latMin = Math.min(bounds.south, bounds.north);
  const latMax = Math.max(bounds.south, bounds.north);
  const lonMin = Math.min(bounds.west, bounds.east);
  const lonMax = Math.max(bounds.west, bounds.east);

  const estCount = (step: number) => {
    const nLat = Math.max(1, Math.floor((latMax - latMin) / step) + 1);
    const nLon = Math.max(1, Math.floor((lonMax - lonMin) / step) + 1);
    return nLat * nLon;
  };

  let step = stepDeg;
  while (estCount(step) > maxPts && step < 6) step *= 1.5;

  const lat0 = Math.floor(latMin / step) * step;
  const lon0 = Math.floor(lonMin / step) * step;

  for (let lat = lat0; lat <= latMax + 1e-9; lat += step) {
    for (let lon = lon0; lon <= lonMax + 1e-9; lon += step) {
      pts.push({ lat, lon });
    }
  }

  return { pts, stepUsed: step };
}

/**
 * Open-Meteo multi-point chunking.
 * hourOffset is index into hourly arrays (0 = now, 24 ~ 24h)
 */
async function fetchAstroInputsGrid(args: {
  bounds: { west: number; east: number; south: number; north: number };
  zoom: number;
  hourOffset: number;
  ttlMs?: number;
}): Promise<{ inputs: AstroInputs[]; stepUsed: number }> {
  const ttlMs = args.ttlMs ?? 8 * 60_000;

  const stepDeg = chooseStepDeg(args.zoom);

  // 🔧 reduce point count to avoid 429s
  const maxPts = args.zoom >= 8 ? 220 : args.zoom >= 6 ? 160 : 120;
  const { pts, stepUsed } = buildGrid(args.bounds, stepDeg, maxPts);

  const cacheKey = boundsKey(args.bounds, args.zoom, stepUsed, args.hourOffset);
  const now = Date.now();
  const cached = ASTRO_GRID_CACHE.get(cacheKey);
  if (cached && now - cached.fetchedAt < ttlMs) return { inputs: cached.inputs, stepUsed };

  // ✅ Backoff gate
  if (OM_BACKOFF.until > now) {
    const waitS = Math.ceil((OM_BACKOFF.until - now) / 1000);
    throw new Error(`Open-Meteo cooling down (${waitS}s) after ${OM_BACKOFF.lastStatus || 429}.`);
  }

  const hourly = [
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
  ].join(',');

  const chunkSize = 20;
  const chunks: Array<Array<{ lat: number; lon: number }>> = [];
  for (let i = 0; i < pts.length; i += chunkSize) chunks.push(pts.slice(i, i + chunkSize));

  const results: AstroInputs[] = [];
  const concurrency = 1;
  let idx = 0;

  async function runOneChunk(chunk: Array<{ lat: number; lon: number }>) {
    const lats = chunk.map((p) => p.lat.toFixed(3)).join(',');
    const lons = chunk.map((p) => p.lon.toFixed(3)).join(',');

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(lats)}` +
      `&longitude=${encodeURIComponent(lons)}` +
      `&hourly=${encodeURIComponent(hourly)}` +
      `&timezone=auto`;

    const res = await fetch(url);

    if (!res.ok) {
      if (res.status === 429 || res.status >= 500) {
        OM_BACKOFF.lastStatus = res.status;

        if (res.status === 429) OM_BACKOFF.strikes = Math.min(6, OM_BACKOFF.strikes + 1);
        else OM_BACKOFF.strikes = Math.min(3, OM_BACKOFF.strikes + 1);

        const retryAfter = Number(res.headers.get('retry-after') ?? '');
        const baseMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : res.status === 429
              ? 20_000
              : 8_000;

        const jitter = Math.round(Math.random() * 600);
        const penaltyMs = baseMs * Math.pow(2, OM_BACKOFF.strikes - 1) + jitter;

        OM_BACKOFF.until = Date.now() + Math.min(penaltyMs, 3 * 60_000);
      }

      throw new Error(`Open-Meteo astro grid failed: ${res.status}`);
    }

    // ✅ success: reset strikes
    OM_BACKOFF.strikes = 0;

    const json = await res.json();
    const rows: any[] = Array.isArray(json) ? json : [json];

    const hourIdx = clamp(Math.floor(args.hourOffset), 0, 23);

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const h = r?.hourly ?? {};

      const pick = (name: string) => {
        const arr = h?.[name];
        const v = Array.isArray(arr) ? arr[hourIdx] : null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const lat = chunk[i]?.lat ?? Number(r?.latitude);
      const lon = chunk[i]?.lon ?? Number(r?.longitude);

      results.push({
        lat,
        lon,
        cloudTotal: pick('cloud_cover'),
        cloudLow: pick('cloud_cover_low'),
        cloudMid: pick('cloud_cover_mid'),
        cloudHigh: pick('cloud_cover_high'),
        visibilityM: pick('visibility'),
        wind: pick('wind_speed_10m'),
        gust: pick('wind_gusts_10m'),
      });
    }
  }

  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < chunks.length) {
      const myIdx = idx++;
      await runOneChunk(chunks[myIdx]);
    }
  });

  await Promise.all(workers);

  ASTRO_GRID_CACHE.set(cacheKey, { fetchedAt: now, stepUsed, inputs: results });
  return { inputs: results, stepUsed };
}

function computeSkyScoreGrid(args: {
  inputs: AstroInputs[];
  darknessScoreAt?: (lat: number, lon: number) => number; // 0..1
  smokePenaltyAt?: (lat: number, lon: number) => number; // 0..1
}): SkyPoint[] {
  const darknessScoreAt = args.darknessScoreAt ?? (() => 1);
  const smokePenaltyAt = args.smokePenaltyAt ?? (() => 0);

  const pct01 = (p: number | null) => (p == null ? null : clamp(p / 100, 0, 1));

  return args.inputs.map((p) => {
    const low = pct01(p.cloudLow) ?? 0;
    const mid = pct01(p.cloudMid) ?? 0;
    const high = pct01(p.cloudHigh) ?? 0;

    // heavier penalty for high clouds
    const cloudPenalty = clamp(0.3 * low + 0.55 * mid + 0.9 * high, 0, 1);

    const visKm = p.visibilityM != null ? p.visibilityM / 1000 : null;
    const visPenalty = visKm == null ? 0.18 : clamp((20 - clamp(visKm, 0, 20)) / 20, 0, 1) * 0.55;

    const gust = p.gust ?? p.wind ?? 0;
    const windPenalty = clamp((gust - 6) / 16, 0, 1) * 0.35;

    const smokePenaltyV = clamp(smokePenaltyAt(p.lat, p.lon), 0, 1) * 0.55;

    const weather01 = clamp(1 - (cloudPenalty * 0.85 + visPenalty + windPenalty + smokePenaltyV), 0, 1);
    const darkness01 = clamp(darknessScoreAt(p.lat, p.lon), 0, 1);

    const score01 = clamp(weather01 * darkness01, 0, 1);
    const score = Math.round(score01 * 100);

    return {
      lat: p.lat,
      lon: p.lon,
      score,
      score01,
      parts: { weather: weather01, darkness: darkness01 },
      inputs: p,
    };
  });
}

/* =============================================================================
 * SkyScore raster (Skia) — Android-safe: write to file://
 * ============================================================================= */

type RasterCacheEntry = { madeAt: number; fileUri: string; width: number; height: number };
const SKY_RASTER_CACHE = new Map<string, RasterCacheEntry>();

// SkyScore overlay intent:
// - 0 = very bad -> strong colored overlay
// - 100 = very good -> almost no overlay (transparent)
const SKY_STOPS: Array<{ s: number; rgba: [number, number, number, number] }> = [
  { s: 0, rgba: [110, 30, 200, 185] },
  { s: 15, rgba: [95, 45, 215, 170] },
  { s: 30, rgba: [70, 85, 235, 150] },
  { s: 45, rgba: [45, 135, 245, 125] },
  { s: 60, rgba: [40, 185, 235, 95] },
  { s: 72, rgba: [35, 215, 195, 70] },
  { s: 82, rgba: [25, 235, 150, 50] },
  { s: 92, rgba: [15, 245, 110, 30] },
  { s: 100, rgba: [0, 0, 0, 0] },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

function buildGridLookup(points: SkyPoint[], stepUsed: number) {
  const key = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const m = new Map<string, SkyPoint>();
  for (const p of points) {
    const lat = Math.round(p.lat / stepUsed) * stepUsed;
    const lon = Math.round(p.lon / stepUsed) * stepUsed;
    m.set(key(lat, lon), p);
  }
  return {
    get(lat: number, lon: number) {
      const la = Math.round(lat / stepUsed) * stepUsed;
      const lo = Math.round(lon / stepUsed) * stepUsed;
      return m.get(key(la, lo)) ?? null;
    },
  };
}

function sampleScoreBilinear(
  lookup: ReturnType<typeof buildGridLookup>,
  stepUsed: number,
  lat: number,
  lon: number
): number {
  const lat0 = Math.floor(lat / stepUsed) * stepUsed;
  const lat1 = lat0 + stepUsed;
  const lon0 = Math.floor(lon / stepUsed) * stepUsed;
  const lon1 = lon0 + stepUsed;

  const q11 = lookup.get(lat0, lon0);
  const q12 = lookup.get(lat0, lon1);
  const q21 = lookup.get(lat1, lon0);
  const q22 = lookup.get(lat1, lon1);

  if (!q11 || !q12 || !q21 || !q22) {
    const cand = [q11, q12, q21, q22].filter(Boolean) as SkyPoint[];
    if (!cand.length) return 100;
    let best = cand[0].score;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of cand) {
      const d = Math.abs(c.lat - lat) + Math.abs(c.lon - lon);
      if (d < bestD) {
        bestD = d;
        best = c.score;
      }
    }
    return best;
  }

  const t = clamp((lon - lon0) / stepUsed, 0, 1);
  const u = clamp((lat - lat0) / stepUsed, 0, 1);

  const s11 = q11.score;
  const s12 = q12.score;
  const s21 = q21.score;
  const s22 = q22.score;

  const s1 = lerp(s11, s12, t);
  const s2 = lerp(s21, s22, t);
  return lerp(s1, s2, u);
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function hashKey(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

/** Android-safe: returns a file:// URI */
async function makeSkyRasterFileUri(args: {
  bounds: { west: number; east: number; south: number; north: number };
  points: SkyPoint[];
  stepUsed: number;
  width: number;
  height: number;
  cacheKey: string;
  ttlMs?: number;
}): Promise<string> {
  const ttlMs = args.ttlMs ?? 8 * 60_000;
  const now = Date.now();

  const cached = SKY_RASTER_CACHE.get(args.cacheKey);
  if (cached && now - cached.madeAt < ttlMs) return cached.fileUri;

  const { bounds, points, stepUsed, width, height } = args;
  if (!points.length) return '';

  const lookup = buildGridLookup(points, stepUsed);
  const pixels = new Uint8Array(width * height * 4);

  const lonSpan = bounds.east - bounds.west;
  const latSpan = bounds.north - bounds.south;

  for (let y = 0; y < height; y++) {
    const v = y / Math.max(1, height - 1);
    const lat = bounds.north - v * latSpan;

    for (let x = 0; x < width; x++) {
      const u = x / Math.max(1, width - 1);
      const lon = bounds.west + u * lonSpan;

      const score = sampleScoreBilinear(lookup, stepUsed, lat, lon);
      const [r, g, b, a] = colorForScore(score);

      const i = (y * width + x) * 4;
      pixels[i + 0] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }

    if (y % 10 === 0) await tick();
  }

  const data = Skia.Data.fromBytes(pixels);
  const img = Skia.Image.MakeImage(
    { width, height, alphaType: AlphaType.Premul, colorType: ColorType.RGBA_8888 },
    data,
    width * 4
  );

  if (!img) {
    throw new Error(`Skia.Image.MakeImage returned null (len=${pixels.length} expected=${width * height * 4})`);
  }

  const pngBytes = img.encodeToBytes();
  if (!pngBytes) return '';

  const b64 = Buffer.from(pngBytes).toString('base64');
  const cacheDir = (FileSystem as any).cacheDirectory ?? 'file:///data/user/0/host.exp.exponent/cache/';
  const fileName = `sky_${hashKey(args.cacheKey)}_${width}x${height}.png`;
  const fileUri = `${cacheDir}${fileName}`;

  await FileSystem.writeAsStringAsync(fileUri, b64, { encoding: 'base64' as any });

  SKY_RASTER_CACHE.set(args.cacheKey, { madeAt: now, fileUri, width, height });
  return fileUri;
}
/* =============================================================================
 * Aurora + Go Oval
 * ============================================================================= */

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

function zoomFromLonDelta(lonDelta: number) {
  // Similar to approxZoomFromLongitudeDelta but returns float.
  const d = clamp(lonDelta, 0.05, 360);
  return Math.log2(360 / d);
}

function midpointLon(a: number, b: number) {
  // midpoint on a circle (-180..180)
  const aR = (a * Math.PI) / 180;
  const bR = (b * Math.PI) / 180;
  const x = Math.cos(aR) + Math.cos(bR);
  const y = Math.sin(aR) + Math.sin(bR);
  return normLon((Math.atan2(y, x) * 180) / Math.PI);
}

function lonSpanWrapped(minLon: number, maxLon: number) {
  const a = normLon(minLon);
  const b = normLon(maxLon);
  const direct = Math.abs(b - a);
  return Math.min(direct, 360 - direct);
}

function tryGoOval(
  cameraRef: React.RefObject<any>,
  points: OvationPoint[],
  threshold = 5,
  opts?: { padding?: number; durationMs?: number }
) {
  const pts = points.filter((p) => p.prob >= threshold);
  if (pts.length < 20) return;

  const b = boundsFromOvationPoints(pts);
  if (!isValidNum(b?.minLat) || !isValidNum(b?.maxLat) || !isValidNum(b?.minLon) || !isValidNum(b?.maxLon)) return;

  const padLat = 6;
  const padLon = 10;

  const maxLat = clampLat(b.maxLat + padLat);
  const minLat = clampLat(b.minLat - padLat);

  // Keep lons normalized but allow a dateline-safe span calc
  const rawMaxLon = normLon(b.maxLon + padLon);
  const rawMinLon = normLon(b.minLon - padLon);

  // Determine whether it crosses the dateline by looking at wrapped span
  const spanLon = lonSpanWrapped(rawMinLon, rawMaxLon);
  const crossesDateline = spanLon > 180;

  // For fitBounds, MapLibre expects ne/sw in the same lon domain; dateline crossing is tricky.
  // We'll prefer center+zoom approach when crossing the dateline.
  const durationMs = opts?.durationMs ?? 650;
  const padding = opts?.padding ?? 40;

  const centerLon = crossesDateline ? midpointLon(rawMinLon, rawMaxLon) : normLon((rawMinLon + rawMaxLon) / 2);
  const centerLat = clampLat((minLat + maxLat) / 2);

  const latSpan = Math.abs(maxLat - minLat);
  const span = Math.max(spanLon, latSpan * 1.35);
  const targetZoom = clamp(zoomFromLonDelta(span) - 0.4, 2, 8);

  // ✅ If not crossing the dateline and fitBounds exists, use it…
  // BUT: still follow with a tiny setCamera "nudge" to avoid the sticky/locked feel on some builds.
  if (!crossesDateline && typeof cameraRef.current?.fitBounds === 'function') {
    const ne: [number, number] = [rawMaxLon, maxLat];
    const sw: [number, number] = [rawMinLon, minLat];

    cameraRef.current.fitBounds(ne, sw, padding, durationMs);

    // "unlock" nudge: after fit completes, re-assert a normal camera state
    setTimeout(() => {
      cameraRef.current?.setCamera?.({
        centerCoordinate: [centerLon, centerLat],
        zoomLevel: targetZoom,
        animationDuration: 120,
      });
    }, durationMs + 40);

    return;
  }

  // ✅ Fallback / dateline-safe path: center + zoom (no bounds => no lock feel)
  cameraRef.current?.setCamera?.({
    centerCoordinate: [centerLon, centerLat],
    zoomLevel: targetZoom,
    animationDuration: durationMs,
  });
}


/* =============================================================================
 * Timeline slider (0..24h)
 * ============================================================================= */

function formatHourLabel(h: number) {
  if (h === 0) return 'Now';
  return `+${h}h`;
}

function TimelineSlider(props: { value: number; onChange: (v: number) => void }) {
  const v = clamp(Math.round(props.value), 0, 24);

  const trackWRef = useRef(1);
  const setFromX = (x: number) => {
    const w = Math.max(1, trackWRef.current);
    const pct = clamp(x / w, 0, 1);
    const next = Math.round(pct * 24);
    props.onChange(next);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
        onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
      }),
    []
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



/** ---------- Small UI helpers ---------- */

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}
function fmtNum(n: number | null | undefined, digits = 0) {
  if (n == null || !Number.isFinite(n)) return '—';
  return digits === 0 ? `${Math.round(n)}` : n.toFixed(digits);
}
function aqLabel(aqPct: number) {
  // matches your legend: Ex 85–100, Good 70–85, Fair 50–70, Poor 0–50
  if (aqPct >= 85) return 'Ex';
  if (aqPct >= 70) return 'Good';
  if (aqPct >= 50) return 'Fair';
  return 'Poor';
}

function CloudsBar(props: { low: number | null; mid: number | null; high: number | null }) {
  const l = Math.max(0, Math.min(100, Number(props.low ?? 0)));
  const m = Math.max(0, Math.min(100, Number(props.mid ?? 0)));
  const h = Math.max(0, Math.min(100, Number(props.high ?? 0)));

  // weighted “felt” cloudiness: high clouds count more
  const felt = Math.max(0, Math.min(100, 0.3 * l + 0.55 * m + 0.9 * h));
  const w = Math.round(felt);

  return (
    <View style={{ width: 58 }}>
      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: 'rgba(255,255,255,0.10)',
          overflow: 'hidden',
        }}
      >
        <View style={{ width: `${w}%`, height: 6, backgroundColor: 'rgba(120,255,210,0.40)' }} />
      </View>
      <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.70)', fontWeight: '900', fontSize: 11 }}>
        {w}%
      </Text>
    </View>
  );
}

function isSkyFetchScaleOK(region: Region) {
  // Tune these thresholds to taste.
  // Goal: don't call Open-Meteo when user is basically viewing continents/world.
  const lonSpan = Math.abs(region.longitudeDelta);
  const latSpan = Math.abs(region.latitudeDelta);

  if (lonSpan >= 60 || latSpan >= 45) return false; // <- key guard
  return true;
}

/** ---------- Bottom sheet ---------- */

type SheetSnap = 'collapsed' | 'half' | 'full';

function BottomSheet(props: {
  visible: boolean;
  header?: React.ReactNode;
  children: React.ReactNode;
  snap?: SheetSnap;            // optional controlled snap
  bottomDock?: number;
  draggable?: boolean;         // drag handle only
  onSnapChange?: (s: SheetSnap) => void; // optional callback
}) {
  const { visible, children, header, bottomDock = 0, draggable = false } = props;

  // If parent provides snap, treat it as controlled; else internal
  const isControlled = props.snap != null;
  const [snapInternal, setSnapInternal] = React.useState<SheetSnap>(props.snap ?? 'collapsed');
  const snap = (isControlled ? props.snap : snapInternal) as SheetSnap;

  const screenH = Dimensions.get('window').height;

  // snap top positions (Y from top)
  const fullY = 90; // leave room for HUD
  const halfY = Math.round(screenH * 0.48);
  const collapsedY = screenH - (110 + bottomDock); // ✅ dock near bottom/tabbar

  const yForSnap = (s: SheetSnap) => (s === 'full' ? fullY : s === 'half' ? halfY : collapsedY);

  const translateY = React.useRef(new Animated.Value(yForSnap(snap))).current;
  const lastY = React.useRef(yForSnap(snap));

  const setSnap = React.useCallback(
    (next: SheetSnap) => {
      if (!isControlled) setSnapInternal(next);
      props.onSnapChange?.(next);

      const y = yForSnap(next);
      lastY.current = y;
      Animated.spring(translateY, {
        toValue: y,
        useNativeDriver: true,
        tension: 90,
        friction: 14,
      }).start();
    },
    [isControlled, props, translateY]
  );

  // when the sheet becomes visible, jump to current snap (no animation)
  React.useEffect(() => {
    if (!visible) return;
    const y = yForSnap(snap);
    lastY.current = y;
    translateY.setValue(y);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // when controlled snap changes, animate to it
  React.useEffect(() => {
    if (!visible) return;
    if (!isControlled) return;
    setSnap(snap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, visible, isControlled]);

  const pickSnap = (y: number) => {
    const candidates: Array<{ s: SheetSnap; y: number }> = [
      { s: 'full', y: fullY },
      { s: 'half', y: halfY },
      { s: 'collapsed', y: collapsedY },
    ];
    candidates.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
    return candidates[0].s;
  };

  const pan = React.useMemo(() => {
    if (!draggable) return null;

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        translateY.stopAnimation((v: number) => {
          lastY.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const next = clamp(lastY.current + g.dy, fullY, collapsedY);
        translateY.setValue(next);
      },
      onPanResponderRelease: (_, g) => {
        const projected = clamp(lastY.current + g.dy + g.vy * 120, fullY, collapsedY);
        setSnap(pickSnap(projected));
      },
    });
  }, [draggable, translateY, fullY, collapsedY, setSnap]);

  if (!visible) return null;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      {/* scrim: let touches pass through to map/buttons */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.10)',
        }}
      />

      <Animated.View
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          height: screenH,
          transform: [{ translateY }],
        }}
      >
        <Glass style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20 }}>
          {/* grab handle (tap toggles; drag optional) */}
          <View style={{ alignItems: 'center', paddingBottom: 8 }} {...(pan ? pan.panHandlers : {})}>
            <Pressable
              onPress={() => setSnap(snap === 'collapsed' ? 'half' : 'collapsed')}
              style={{ paddingVertical: 6, paddingHorizontal: 20 }}
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
            </Pressable>
          </View>

          {header ? <View style={{ marginBottom: 8 }}>{header}</View> : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}>
            {children}
          </ScrollView>
        </Glass>
      </Animated.View>
    </View>
  );
}


function Row(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
      <Text style={{ color: 'rgba(255,255,255,0.70)', fontWeight: '900' }}>{props.label}</Text>
      <Text style={{ color: 'white', fontWeight: '900', textAlign: 'right', flexShrink: 1 }}>
        {props.value}
      </Text>
    </View>
  );
}

/* =============================================================================
 * screen
 * ============================================================================= */

export default function AstroMapScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  // 🔧 Fix “white screen on return”: force MapLibre/MapRenderer to remount on focus
  const [focusKey, setFocusKey] = useState(0);
  const [renderMap, setRenderMap] = useState(true);
  const [instanceKey, setInstanceKey] = useState(0);

  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchKeyRef = useRef<string>('');
  const rasterJobIdRef = useRef(0);

  // ✅ Programmatic camera move guard (fixes “Go” snap-back / lock feel)
  const isProgrammaticMoveRef = useRef(false);
  const pendingPostGoRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastFetchRegionRef = useRef<Region | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Force a clean native surface remount (fixes all-white return)
      setRenderMap(false);

      const t = setTimeout(() => {
        setRenderMap(true);
        setFocusKey((k) => k + 1);
        setInstanceKey((k) => k + 1);
      }, 200);

      return () => {
        clearTimeout(t);

        setRenderMap(false);

        if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
        regionDebounceRef.current = null;

        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;

        if (pendingPostGoRefreshRef.current) clearTimeout(pendingPostGoRefreshRef.current);
        pendingPostGoRefreshRef.current = null;

        rasterJobIdRef.current += 1;
        lastFetchKeyRef.current = '';
        lastFetchRegionRef.current = null;
      };
    }, [])
  );

  const screenKey = `${navKey}:${focusKey}`;

  const lat = toNum(params.lat);
  const lon = toNum(params.lon);
  const latDelta = toNum(params.latDelta);
  const lonDelta = toNum(params.lonDelta);
  const zoomParam = toNum(params.zoom);

  const initialRegion: Region = useMemo(() => {
    const fallback: Region = {
      latitude: 39.5,
      longitude: -98.35,
      latitudeDelta: 6,
      longitudeDelta: 6,
    };

    if (lat == null || lon == null) return fallback;

    if (latDelta != null && lonDelta != null) {
      return {
        latitude: lat,
        longitude: lon,
        latitudeDelta: clamp(latDelta, 0.05, 80),
        longitudeDelta: clamp(lonDelta, 0.05, 80),
      };
    }

    const z = zoomParam != null ? clamp(zoomParam, 2, 12) : 6;
    const d = clamp(360 / Math.pow(2, z), 0.1, 60);

    return {
      latitude: lat,
      longitude: lon,
      latitudeDelta: d,
      longitudeDelta: d,
    };
  }, [lat, lon, latDelta, lonDelta, zoomParam]);

  const initialRegionRef = useRef<Region | null>(null);
  const lastRegionRef = useRef<Region | null>(null);

  useEffect(() => {
    initialRegionRef.current = initialRegion;
    lastRegionRef.current = initialRegion;
    lastFetchKeyRef.current = '';
    lastFetchRegionRef.current = null;
  }, [screenKey, initialRegion]);

  function shouldRefetch(prev: Region | null, next: Region, stepDeg: number) {
    if (!prev) return true;

    const moveLat = Math.abs(next.latitude - prev.latitude);
    const moveLon = Math.abs(next.longitude - prev.longitude);

    const zoomPrev = approxZoomFromLongitudeDelta(prev.longitudeDelta);
    const zoomNext = approxZoomFromLongitudeDelta(next.longitudeDelta);
    const zoomChanged = Math.abs(zoomNext - zoomPrev) >= 0.75;

    return moveLat > stepDeg * 0.6 || moveLon > stepDeg * 0.6 || zoomChanged;
  }

  const cameraRef = useRef<any>(null);

  const [baseMapStyle, setBaseMapStyle] = useState<'dark' | 'light'>('dark');

  // 🔧 Android: default OFF to avoid 429 spiral and heavy rendering
  const [showSkyScore, setShowSkyScore] = useState(Platform.OS === 'ios');
  const [showAuroraProb, setShowAuroraProb] = useState(true);
  const [showAuroraOval, setShowAuroraOval] = useState(true);

  const [hourOffset, setHourOffset] = useState(0);

  const [skyPoints, setSkyPoints] = useState<SkyPoint[]>([]);
  const [skyMeta, setSkyMeta] = useState<{ stepDeg: number; updatedAt: number; zoom: number } | null>(null);

  const [ovationPoints, setOvationPoints] = useState<OvationPoint[]>([]);
  const [ovationUpdatedAt, setOvationUpdatedAt] = useState<number | null>(null);

  const [statusLine, setStatusLine] = useState<string>('Loading SkyScore + Aurora…');
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const [skyRasterUri, setSkyRasterUri] = useState<string>('');
  const [skyRasterBounds, setSkyRasterBounds] = useState<[number, number][]>([]);

  // ✅ Coverage: store last successful bounds so we can render an outline and show “global planned” messaging
  const [coverageBounds, setCoverageBounds] = useState<{
    west: number;
    east: number;
    south: number;
    north: number;
  } | null>(null);

  const [uiCompact, setUiCompact] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('collapsed');

  const [inspect, setInspect] = useState<{
    lat: number;
    lon: number;
    score: number;
    weather01: number;
    darkness01: number;
    cloudL: number | null;
    cloudM: number | null;
    cloudH: number | null;
    cloudT: number | null;
    visKm: number | null;
    wind: number | null;
    gust: number | null;
    auroraProb: number;
    visibleProb: number;
    bortle?: string;
    sqm?: string;
  } | null>(null);

  const canShowSky =
    showSkyScore &&
    typeof skyRasterUri === 'string' &&
    skyRasterUri.length > 0 &&
    skyRasterBounds.length === 4 &&
    (Platform.OS !== 'android' || /^file:\/\//.test(skyRasterUri) || /^https?:\/\//.test(skyRasterUri));

  // ✅ “Where am I” for MVP coverage messaging
  const currentCenter = useMemo(() => {
    const r = lastRegionRef.current ?? initialRegion;
    return { lat: r.latitude, lon: r.longitude, lonDelta: r.longitudeDelta, latDelta: r.latitudeDelta };
  }, [initialRegion, screenKey, instanceKey]);

  const isInCoverage = useMemo(() => {
    if (!coverageBounds) return false;
    return pointInBounds(currentCenter.lat, currentCenter.lon, coverageBounds);
  }, [coverageBounds, currentCenter.lat, currentCenter.lon]);

  const isZoomedWayOut = useMemo(() => {
    // When viewing most of the world, we don’t want the SkyScore panel to feel “wrong”
    return currentCenter.lonDelta >= 120 || currentCenter.latDelta >= 80;
  }, [currentCenter.lonDelta, currentCenter.latDelta]);

  const coverageGeojson = useMemo(() => {
    if (!coverageBounds) return null;
    return { type: 'FeatureCollection', features: [boundsToPolygonFeature(coverageBounds)] } as any;
  }, [coverageBounds]);

  // ✅ Lookup used for bilinear score sampling (so inspect matches raster)
  const skyLookup = useMemo(() => {
    if (!skyMeta?.stepDeg || !skyPoints.length) return null;
    return buildGridLookup(skyPoints, skyMeta.stepDeg);
  }, [skyPoints, skyMeta?.stepDeg]);

  const computeInspectAt = useCallback(
    (latQ: number, lonQ: number) => {
      if (!skyPoints.length) return null;

      // nearest point for inputs/details
      let best: SkyPoint | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const p of skyPoints) {
        const d = Math.abs(p.lat - latQ) + Math.abs(p.lon - lonQ);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!best) return null;

      // ✅ score sampled to match overlay
      let score = best.score;
      if (skyLookup && skyMeta?.stepDeg) {
        score = Math.round(sampleScoreBilinear(skyLookup, skyMeta.stepDeg, latQ, lonQ));
      }

      const auroraProb = ovationPoints.length
        ? sampleOvationAt(
            ovationPoints.map((p) => ({ lat: p.lat, lon: p.lon, prob: p.prob })),
            latQ,
            lonQ
          )
        : 0;

      const visibleProb = Math.round(clamp((score / 100) * (auroraProb / 100), 0, 1) * 100);
      const visKm = best.inputs.visibilityM != null ? best.inputs.visibilityM / 1000 : null;

      return {
        lat: latQ,
        lon: lonQ,
        score,
        weather01: best.parts.weather,
        darkness01: best.parts.darkness,
        cloudL: best.inputs.cloudLow,
        cloudM: best.inputs.cloudMid,
        cloudH: best.inputs.cloudHigh,
        cloudT: best.inputs.cloudTotal,
        visKm,
        wind: best.inputs.wind,
        gust: best.inputs.gust,
        auroraProb,
        visibleProb,
        bortle: '—',
        sqm: '—',
      };
    },
    [skyPoints, skyLookup, skyMeta?.stepDeg, ovationPoints]
  );

  const scheduleRetryAfterCooldown = useCallback(
    (retryFn: () => void) => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (!showSkyScore) return;

      const now = Date.now();
      const waitMs = Math.max(0, OM_BACKOFF.until - now) + 300;
      if (waitMs <= 0) return;

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        lastFetchKeyRef.current = '';
        retryFn();
      }, waitMs);
    },
    [showSkyScore]
  );

  const refreshForRegion = useCallback(
    (region: Region) => {
      // If Sky is toggled off, don't hit Open-Meteo at all.
      if (!showSkyScore) {
        setStatusLine('SkyScore off');
        setErrorLine(null);

        const center = { lat: region.latitude, lon: region.longitude };
        const ins = computeInspectAt(center.lat, center.lon);
        if (ins) setInspect(ins);
        return;
      }

      const b = regionBounds(region);
      const zoom = isFiniteNum((region as any).zoom)
        ? (region as any).zoom
        : approxZoomFromLongitudeDelta(region.longitudeDelta);

      const stepGuess = chooseStepDeg(zoom);

      if (!shouldRefetch(lastFetchRegionRef.current, region, stepGuess)) return;

      // ✅ Avoid Open-Meteo at world scale (prevents 429 + "fails at this level")
      if (!isSkyFetchScaleOK(region)) {
        setErrorLine(null);
        setStatusLine('Zoom in to load SkyScore (world view is display-only).');
        // Do NOT clear lastFetchKeyRef here; we just don't want to fetch at this scale.
        return;
      }

      // ✅ cooldown gate BEFORE “consuming” region
      const now = Date.now();
      if (OM_BACKOFF.until > now) {
        const waitS = Math.ceil((OM_BACKOFF.until - now) / 1000);
        setStatusLine(`Open-Meteo cooling down (${waitS}s) after ${OM_BACKOFF.lastStatus || 429}.`);
        lastFetchKeyRef.current = '';

        scheduleRetryAfterCooldown(() => {
          // ✅ ensure retry is not blocked by previous region
          lastFetchRegionRef.current = null;
          const r = lastRegionRef.current;
          if (r) refreshForRegion(r);
        });

        return;
      }

      // ✅ only now do we “consume” the region
      lastFetchRegionRef.current = { ...region };

      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      regionDebounceRef.current = setTimeout(async () => {
        const jobId = ++rasterJobIdRef.current;

        try {
          setErrorLine(null);
          setStatusLine(`Updating SkyScore (${formatHourLabel(hourOffset)})…`);

          const { inputs, stepUsed } = await fetchAstroInputsGrid({
            bounds: b,
            zoom,
            hourOffset,
            ttlMs: 8 * 60_000,
          });

          const scores = computeSkyScoreGrid({
            inputs,
            darknessScoreAt: () => 1,
            smokePenaltyAt: () => 0,
          });

          // ✅ commit the *actual* key (uses stepUsed)
          const kActual = boundsKey(b, zoom, stepUsed, hourOffset);
          lastFetchKeyRef.current = kActual;

          setSkyPoints(scores);
          setSkyMeta({ stepDeg: stepUsed, updatedAt: Date.now(), zoom });

          // ✅ Update coverage on success (this is what we outline in world view)
          setCoverageBounds(b);

          const coords: [number, number][] = [
            [b.west, b.north],
            [b.east, b.north],
            [b.east, b.south],
            [b.west, b.south],
          ];
          setSkyRasterBounds(coords);

          const targetW = clamp(Math.round(180 + zoom * 10), 180, 300);
          const targetH = targetW;

          // ✅ raster cache key MUST use kActual, not a guess key
          const rasterKey = `${kActual}:w${targetW}:h${targetH}`;

          const uri = await makeSkyRasterFileUri({
            bounds: b,
            points: scores,
            stepUsed,
            width: targetW,
            height: targetH,
            cacheKey: rasterKey,
            ttlMs: 8 * 60_000,
          });

          if (jobId !== rasterJobIdRef.current) return;
          if (uri) setSkyRasterUri(uri);

          const center = { lat: region.latitude, lon: region.longitude };
          const ins = computeInspectAt(center.lat, center.lon);
          if (ins) setInspect(ins);

          setStatusLine(`SkyScore ready · ${formatHourLabel(hourOffset)} · step ${stepUsed}° · zoom ~ ${Math.round(zoom)}`);
        } catch (e: any) {
          if (jobId !== rasterJobIdRef.current) return;

          const msg = String(e?.message ?? e ?? 'SkyScore failed');

          // ✅ if 429/cooldown, keep last good raster and schedule a retry
          if (/cooling down/i.test(msg) || /\b429\b/.test(msg) || /failed:\s*429\b/i.test(msg)) {
            setStatusLine(msg);
            setErrorLine(null);
            lastFetchKeyRef.current = '';

            scheduleRetryAfterCooldown(() => {
              lastFetchRegionRef.current = null; // ✅ critical
              const r = lastRegionRef.current;
              if (r) refreshForRegion(r);
            });

            return;
          }

          setErrorLine(msg);
          lastFetchKeyRef.current = '';
        }
      }, 1100);
    },
    [hourOffset, computeInspectAt, showSkyScore, scheduleRetryAfterCooldown]
  );

  // OVATION pull
  useEffect(() => {
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
  }, []);

  // Recompute when timeline changes
  useEffect(() => {
    const r = lastRegionRef.current;
    if (r) {
      lastFetchKeyRef.current = '';
      lastFetchRegionRef.current = null;
      refreshForRegion(r);
    }
  }, [hourOffset, refreshForRegion]);

  const auroraContoursGeojson = useMemo(() => {
    if (!showAuroraOval) return { type: 'FeatureCollection', features: [] } as any;
    if (!ovationPoints.length) return { type: 'FeatureCollection', features: [] } as any;

    const filtered = ovationPoints.filter((p) => p.prob >= 3);
    if (filtered.length < 60) return { type: 'FeatureCollection', features: [] } as any;

    return buildAuroraContourRings(
      filtered.map((p) => ({ lat: p.lat, lon: p.lon, prob: p.prob })),
      { thresholds: [5, 10, 20, 35, 50], binDeg: 1, minProbToInclude: 3 }
    );
  }, [ovationPoints, showAuroraOval]);

  const onGoOval = () => {
    if (!ovationPoints.length) {
      setErrorLine('Aurora points not loaded yet (OVATION unavailable).');
      return;
    }

    try {
      // Guard only while the animation is happening
      isProgrammaticMoveRef.current = true;

      // Cancel any prior guard timer
      if (pendingPostGoRefreshRef.current) clearTimeout(pendingPostGoRefreshRef.current);

      tryGoOval(cameraRef, ovationPoints, 5);

      // ✅ IMPORTANT: do NOT trigger refreshForRegion here.
      pendingPostGoRefreshRef.current = setTimeout(() => {
        isProgrammaticMoveRef.current = false;
        pendingPostGoRefreshRef.current = null;

        // clear so next user pan triggers refresh naturally
        lastFetchKeyRef.current = '';
        lastFetchRegionRef.current = null;
      }, 700);
    } catch (e: any) {
      isProgrammaticMoveRef.current = false;
      pendingPostGoRefreshRef.current = null;
      setErrorLine(String(e?.message ?? e ?? 'Go failed'));
    }
  };

  const auroraContourStyle = useMemo(() => {
    return {
      lineColor: [
        'match',
        ['get', 'thr'],
        50,
        'rgba(210,255,240,0.95)',
        35,
        'rgba(170,255,220,0.90)',
        20,
        'rgba(120,255,200,0.80)',
        10,
        'rgba(90,230,190,0.70)',
        5,
        'rgba(70,200,170,0.55)',
        'rgba(70,200,170,0.50)',
      ],
      lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 2.0, 4, 2.5, 7, 3.0, 10, 3.5, 12, 4.0],
      lineOpacity: ['interpolate', ['linear'], ['zoom'], 1, 0.8, 4, 0.95, 9, 1.0, 13, 1.0],
    } as const;
  }, []);

  const TAB_BAR_HEIGHT = Platform.select({ ios: 60, android: 56, default: 56 }) as number;
  const aurVisLabel = inspect?.visibleProb == null ? '—' : `${Math.round(inspect.visibleProb)}%`;

  if (!renderMap) {
    return <View style={{ flex: 1, backgroundColor: '#020617' }} />;
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        <MapRenderer
          key={`astro-map-${screenKey}-${instanceKey}`}
          engine="maplibre"
          initialRegion={initialRegionRef.current ?? initialRegion}
          mapStyle={baseMapStyle}
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

            // Always track last region so user can pan freely after “Go”
            lastRegionRef.current = r;

            // During programmatic moves, DO NOT kick off refresh loops.
            if (isProgrammaticMoveRef.current) return;

            refreshForRegion(r);

            const z = isFiniteNum((r as any).zoom) ? (r as any).zoom : approxZoomFromLongitudeDelta(r.longitudeDelta);
            if (!skyMeta) setStatusLine(`Astro · zoom ~ ${Math.round(z)}`);
          }}
          radar={{ enabled: false, templates: [null, null, null], opacities: [0, 0, 0], tileMaxZ: 0, localImage: null }}
          overlays={[]}
        >
          {/* Coverage outline */}
          {coverageGeojson ? (
            <MapLibreGL.ShapeSource id={`skyCoverage-src-${screenKey}`} shape={coverageGeojson as any}>
              <MapLibreGL.FillLayer
                id={`skyCoverage-fill-${screenKey}`}
                style={{
                  fillOpacity: 0.05,
                  fillColor: 'rgba(90,230,190,1)',
                }}
              />
              <MapLibreGL.LineLayer
                id={`skyCoverage-line-${screenKey}`}
                style={{
                  lineColor: 'rgba(90,230,190,0.95)',
                  lineWidth: 1.5,
                  lineOpacity: 0.85,
                  lineDasharray: [2, 2],
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {/* SkyScore raster overlay */}
          {canShowSky ? (
            <MapLibreGL.ImageSource id={`skyRaster-src-${screenKey}`} url={skyRasterUri} coordinates={skyRasterBounds as any}>
              <MapLibreGL.RasterLayer id={`skyRaster-${screenKey}`} style={{ rasterOpacity: 0.6, rasterResampling: 'linear' }} />
            </MapLibreGL.ImageSource>
          ) : null}

          {/* Oval lines */}
          {showAuroraOval ? (
            <MapLibreGL.ShapeSource id={`auroraOval-src-${screenKey}`} shape={auroraContoursGeojson as any}>
              <MapLibreGL.LineLayer id={`auroraOval-line-${screenKey}`} style={auroraContourStyle as any} />
            </MapLibreGL.ShapeSource>
          ) : null}
        </MapRenderer>

        {/* Crosshair */}
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

        {/* ===== Overlay layer (top of map) ===== */}
        {(() => {
          const HUD_MAX_W = 260; // must match Glass maxWidth
          const GAP = 10;

          return (
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
              {/* LEFT: sliver legend, constrained to NOT enter HUD lane */}
              {showSkyScore ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: insets.top + 4,
                    left: 10,
                    right: 10 + HUD_MAX_W + GAP, // ✅ never overlaps HUD
                    alignSelf: 'flex-start',
                  }}
                >
                  <AtmosphericLegend compact sliver />
                </View>
              ) : null}
              {/* RIGHT: HUD (status only — controls live in bottom sheet) */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: insets.top + 32,
                  right: 10,
                  alignItems: 'flex-end',
                }}
              >
                <Glass
                  style={{
                    maxWidth: HUD_MAX_W,
                    minWidth: 170,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 16,
                    backgroundColor: 'rgba(5,12,10,0.72)',
                  }}
                >
                  {/* header row (no buttons) */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text
                      style={{
                        color: 'rgba(210,255,235,0.95)',
                        fontSize: 12,
                        fontWeight: '900',
                        letterSpacing: 0.8,
                        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                        flexShrink: 1,
                      }}
                      numberOfLines={1}
                    >
                      ASTRO
                    </Text>

                    {/* optional: tiny badge to indicate mode */}
                    <Text
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        fontSize: 11,
                        fontWeight: '900',
                        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                      }}
                      numberOfLines={1}
                    >
                      {formatHourLabel(hourOffset)}
                    </Text>
                  </View>

                  {/* status */}
                  <Text
                    style={{
                      marginTop: 6,
                      color: 'rgba(170,255,210,0.85)',
                      fontSize: 11,
                      lineHeight: 14,
                      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                    }}
                    numberOfLines={3}
                    ellipsizeMode="tail"
                  >
                    {statusLine}
                  </Text>

                  {/* error */}
                  {errorLine ? (
                    <Text
                      style={{
                        marginTop: 4,
                        color: 'rgba(255,140,140,0.95)',
                        fontSize: 11,
                        lineHeight: 14,
                        fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                      }}
                      numberOfLines={2}
                      ellipsizeMode="tail"
                    >
                      ! {errorLine}
                    </Text>
                  ) : null}

                  {/* meta */}
                  {!uiCompact ? (
                    <View style={{ marginTop: 6, gap: 2 }}>
                      {skyMeta ? (
                        <Text
                          style={{
                            color: 'rgba(255,255,255,0.55)',
                            fontSize: 11,
                            fontWeight: '800',
                            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                          }}
                          numberOfLines={1}
                        >
                          Sky {Math.round((Date.now() - skyMeta.updatedAt) / 1000)}s · step {skyMeta.stepDeg}°
                        </Text>
                      ) : null}

                      {ovationUpdatedAt ? (
                        <Text
                          style={{
                            color: 'rgba(255,255,255,0.55)',
                            fontSize: 11,
                            fontWeight: '800',
                            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                          }}
                          numberOfLines={1}
                        >
                          Aur {Math.round((Date.now() - ovationUpdatedAt) / 1000)}s · OVATION
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </Glass>
              </View>

            </View>
          );
        })()}

        {/* Bottom sheet */}
        <BottomSheet
          visible
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          bottomDock={TAB_BAR_HEIGHT}
          draggable={false}
          header={
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>
                Sky {inspect?.score ?? '—'} · Aur Vis {aurVisLabel}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable
                  onPress={onGoOval}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: ovationPoints.length ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                    opacity: ovationPoints.length ? 1 : 0.55,
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>Go</Text>
                </Pressable>

                <Pressable
                  onPress={() => setUiCompact((v) => !v)}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{uiCompact ? 'More' : 'Less'}</Text>
                </Pressable>

                <Pressable
                  onPress={() => router.back()}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>Back</Text>
                </Pressable>
              </View>
            </View>
          }
        >
          <View style={{ gap: 10, marginBottom: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '900', letterSpacing: 0.5 }}>CONTROLS</Text>

            <TimelineSlider value={hourOffset} onChange={(v) => setHourOffset(v)} />

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <ToggleChip
                label="Sky"
                active={showSkyScore}
                onPress={() => {
                  if (!showSkyScore) setShowSkyScore(true);
                  setSheetSnap('half');
                }}
              />
              <ToggleChip label="Aur" active={showAuroraProb} onPress={() => setShowAuroraProb((v) => !v)} />
              <ToggleChip label="Band" active={showAuroraOval} onPress={() => setShowAuroraOval((v) => !v)} />
              <ToggleChip
                label={baseMapStyle === 'dark' ? 'Dark' : 'Light'}
                active
                onPress={() => setBaseMapStyle((s) => (s === 'dark' ? 'light' : 'dark'))}
              />
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4 }} />
          </View>

          {/* Content */}
          {inspect ? (
            <View style={{ gap: 10 }}>
              <Row
                label="Clouds L/M/H"
                value={`${inspect.cloudL ?? '—'}% / ${inspect.cloudM ?? '—'}% / ${inspect.cloudH ?? '—'}% (T ${
                  inspect.cloudT ?? '—'
                }%)`}
              />
              <Row label="Visibility" value={inspect.visKm != null ? `${inspect.visKm.toFixed(0)} km` : '—'} />
              <Row
                label="Wind / Gust"
                value={`${inspect.wind != null ? inspect.wind.toFixed(0) : '—'} / ${
                  inspect.gust != null ? inspect.gust.toFixed(0) : '—'
                } mph`}
              />
              <Row label="Aurora Prob" value={fmtPct(inspect.auroraProb)} />
              <Row label="Aurora Vis" value={fmtPct(inspect.visibleProb)} />
              <Row label="Atmospheric Quality" value={`Ex · ${Math.round(inspect.weather01 * 100)}%`} />
              <Row label="Darkness" value={`${Math.round(inspect.darkness01 * 100)}%`} />
              <Row label="Center" value={`${inspect.lat.toFixed(3)}, ${inspect.lon.toFixed(3)}`} />
            </View>
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '800' }}>Move the map to load SkyScore.</Text>
          )}

          {/* coverage hint */}
          {(!isInCoverage || isZoomedWayOut) && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '900' }}>
                SkyScore {coverageBounds ? 'available in covered regions' : 'not loaded yet'}
              </Text>
              <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.65)', fontWeight: '800' }}>
                {coverageBounds
                  ? 'Zoom into the outlined area to view SkyScore (global planned).'
                  : 'Pan/zoom to fetch SkyScore (global planned).'}
              </Text>
            </View>
          )}
        </BottomSheet>
      </View>
    </SafeAreaView>
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
