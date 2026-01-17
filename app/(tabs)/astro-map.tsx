// app/(tabs)/astro-map.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../../components/common/Glass';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';

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

function boundsKey(b: { west: number; east: number; south: number; north: number }, zoom: number, stepDeg: number) {
  // round so tiny pans don’t refetch
  const r = (v: number) => roundTo(v, 0.05).toFixed(2);
  return `b:${r(b.west)}:${r(b.east)}:${r(b.south)}:${r(b.north)}:z${Math.round(zoom)}:s${stepDeg}`;
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
  wind: number | null; // (unit depends on API default; treated as relative)
  gust: number | null;
};

type SkyPoint = {
  lat: number;
  lon: number;
  score: number; // 0..100
  parts: { weather: number; darkness: number };
};

type AstroGridCacheEntry = { fetchedAt: number; inputs: AstroInputs[] };
const ASTRO_GRID_CACHE = new Map<string, AstroGridCacheEntry>();

function buildGrid(bounds: { west: number; east: number; south: number; north: number }, stepDeg: number, maxPts = 1200) {
  const pts: Array<{ lat: number; lon: number }> = [];

  const latMin = Math.min(bounds.south, bounds.north);
  const latMax = Math.max(bounds.south, bounds.north);
  const lonMin = Math.min(bounds.west, bounds.east);
  const lonMax = Math.max(bounds.west, bounds.east);

  // adaptively coarsen step to respect maxPts
  const estCount = () => {
    const nLat = Math.max(1, Math.floor((latMax - latMin) / stepDeg) + 1);
    const nLon = Math.max(1, Math.floor((lonMax - lonMin) / stepDeg) + 1);
    return nLat * nLon;
  };

  let step = stepDeg;
  while (estCount() > maxPts && step < 5) step *= 1.5;

  for (let lat = latMin; lat <= latMax + 1e-9; lat += step) {
    for (let lon = lonMin; lon <= lonMax + 1e-9; lon += step) {
      pts.push({ lat, lon });
    }
  }
  return { pts, stepUsed: step };
}

async function fetchAstroInputsGrid(args: {
  bounds: { west: number; east: number; south: number; north: number };
  zoom: number;
  ttlMs?: number;
}): Promise<{ inputs: AstroInputs[]; stepUsed: number }> {
  const ttlMs = args.ttlMs ?? 10 * 60_000;

  // choose a reasonable step based on zoom
  const z = clamp(args.zoom, 2, 12);
  const stepDeg = z <= 3 ? 2 : z <= 5 ? 1 : z <= 7 ? 0.5 : 0.25;

  const { pts, stepUsed } = buildGrid(args.bounds, stepDeg, 1100);
  const cacheKey = boundsKey(args.bounds, args.zoom, stepUsed);
  const now = Date.now();
  const cached = ASTRO_GRID_CACHE.get(cacheKey);
  if (cached && now - cached.fetchedAt < ttlMs) return { inputs: cached.inputs, stepUsed };

  // Open-Meteo supports multiple points via comma-separated latitude/longitude lists.
  const lats = pts.map((p) => p.lat.toFixed(3)).join(',');
  const lons = pts.map((p) => p.lon.toFixed(3)).join(',');

  const hourly = [
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
  ].join(',');

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lats)}` +
    `&longitude=${encodeURIComponent(lons)}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo astro grid failed: ${res.status}`);

  const json = await res.json();
  const rows: any[] = Array.isArray(json) ? json : [json];

  // MVP: pick the first hourly index.
  const idx = 0;

  const out: AstroInputs[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const h = r?.hourly ?? {};

    const pick = (name: string) => {
      const arr = h?.[name];
      const v = Array.isArray(arr) ? arr[idx] : null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    out.push({
      lat: pts[i]?.lat ?? Number(r?.latitude),
      lon: pts[i]?.lon ?? Number(r?.longitude),
      cloudTotal: pick('cloud_cover'),
      cloudLow: pick('cloud_cover_low'),
      cloudMid: pick('cloud_cover_mid'),
      cloudHigh: pick('cloud_cover_high'),
      visibilityM: pick('visibility'),
      wind: pick('wind_speed_10m'),
      gust: pick('wind_gusts_10m'),
    });
  }

  ASTRO_GRID_CACHE.set(cacheKey, { fetchedAt: now, inputs: out });
  return { inputs: out, stepUsed };
}

function computeSkyScoreGrid(args: {
  inputs: AstroInputs[];
  // later: plug Bortle/VIIRS; MVP uses 1.0
  darknessScoreAt?: (lat: number, lon: number) => number; // 0..1
  // later: smoke/aerosols
  smokePenaltyAt?: (lat: number, lon: number) => number; // 0..1
}): SkyPoint[] {
  const darknessScoreAt = args.darknessScoreAt ?? (() => 1);
  const smokePenaltyAt = args.smokePenaltyAt ?? (() => 0);

  const pct01 = (p: number | null) => (p == null ? null : clamp(p / 100, 0, 1));

  return args.inputs.map((p) => {
    // clouds: weight high > mid > low (transparency killer)
    const low = pct01(p.cloudLow) ?? 0;
    const mid = pct01(p.cloudMid) ?? 0;
    const high = pct01(p.cloudHigh) ?? 0;

    const cloudPenalty = clamp(0.35 * low + 0.55 * mid + 0.85 * high, 0, 1);

    // visibility: <10km haze; >20km good (rough proxy)
    const visKm = p.visibilityM != null ? p.visibilityM / 1000 : null;
    const visPenalty = visKm == null ? 0.15 : clamp((20 - clamp(visKm, 0, 20)) / 20, 0, 1) * 0.6;

    // wind/gust: seeing proxy + stability
    const gust = p.gust ?? p.wind ?? 0;
    const windPenalty = clamp((gust - 6) / 14, 0, 1) * 0.35;

    // smoke/aerosols penalty hook (0..1)
    const smokePenalty = clamp(smokePenaltyAt(p.lat, p.lon), 0, 1) * 0.5;

    const weather01 = clamp(1 - (cloudPenalty * 0.75 + visPenalty + windPenalty + smokePenalty), 0, 1);
    const darkness01 = clamp(darknessScoreAt(p.lat, p.lon), 0, 1);

    const score01 = clamp(weather01 * darkness01, 0, 1);
    const score = Math.round(score01 * 100);

    return { lat: p.lat, lon: p.lon, score, parts: { weather: weather01, darkness: darkness01 } };
  });
}

function sampleNearestScore(points: SkyPoint[], lat: number, lon: number) {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const d = Math.abs(p.lat - lat) + Math.abs(p.lon - lon);
    if (d < bestD) {
      bestD = d;
      best = p.score;
    }
  }
  return best;
}

/* =============================================================================
 * Aurora (NOAA SWPC OVATION)
 * ============================================================================= */

type OvationPoint = { lat: number; lon: number; prob: number };
type OvationCache = { fetchedAt: number; points: OvationPoint[] };
const OVATION_CACHE: { cur: OvationCache | null } = { cur: null };

const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

async function fetchOvationPoints(ttlMs = 2 * 60_000): Promise<OvationPoint[]> {
  const now = Date.now();
  if (OVATION_CACHE.cur && now - OVATION_CACHE.cur.fetchedAt < ttlMs) return OVATION_CACHE.cur.points;

  const res = await fetch(OVATION_URL);
  if (!res.ok) throw new Error(`OVATION fetch failed: ${res.status}`);

  const data = await res.json();
  const pts: OvationPoint[] = [];

  // Case A: [{lat, lon, prob}, ...]
  if (Array.isArray(data)) {
    for (const row of data) {
      const lat = Number(row?.lat ?? row?.latitude);
      const lon = Number(row?.lon ?? row?.longitude);
      const prob = Number(row?.prob ?? row?.value ?? row?.aurora ?? row?.probability);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(prob)) {
        pts.push({ lat, lon, prob: clamp(prob, 0, 100) });
      }
    }
  }

  // Case B: flattened grid fallback
  if (!pts.length && data && typeof data === 'object') {
    const values = (data as any)?.values ?? (data as any)?.data ?? (data as any)?.ovation;
    if (Array.isArray(values) && values.length >= 360 * 181) {
      let idx = 0;
      for (let latI = 0; latI < 181; latI++) {
        const lat = -90 + latI;
        for (let lonI = 0; lonI < 360; lonI++) {
          const lon = -180 + lonI;
          const prob = Number(values[idx++]);
          if (Number.isFinite(prob) && prob > 0) pts.push({ lat, lon, prob: clamp(prob, 0, 100) });
        }
      }
    }
  }

  if (!pts.length) throw new Error('OVATION parse produced 0 points (schema changed).');

  OVATION_CACHE.cur = { fetchedAt: now, points: pts };
  return pts;
}

function sampleOvationAt(points: OvationPoint[], lat: number, lon: number) {
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const d = Math.abs(p.lat - lat) + Math.abs(p.lon - lon);
    if (d < bestD) {
      bestD = d;
      best = p.prob;
    }
  }
  return best;
}

/**
 * MVP “oval” boundary: convex hull of points above a probability threshold.
 * This is not a scientific oval, but it gives you a real, responsive boundary now.
 */
function buildAuroraOvalHull(points: OvationPoint[], thresholdProb: number): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const pts = points.filter((p) => p.prob >= thresholdProb && Math.abs(p.lat) >= 40);
  if (pts.length < 30) return null;

  const arr = pts.map((p) => [p.lon, p.lat] as [number, number]).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of arr) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return null;

  const ring = hull.concat([hull[0]]);
  return { type: 'Feature', properties: { thresholdProb }, geometry: { type: 'Polygon', coordinates: [ring] } };
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

  const navKey = String(params?.nav ?? '0'); // forces fresh mount if caller provides nav token

  const lat = toNum(params.lat);
  const lon = toNum(params.lon);
  const latDelta = toNum(params.latDelta);
  const lonDelta = toNum(params.lonDelta);
  const zoomParam = toNum(params.zoom);

  const initialRegion: Region = useMemo(() => {
    const fallback: Region = { latitude: 39.5, longitude: -98.35, latitudeDelta: 6, longitudeDelta: 6 };
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
    return { latitude: lat, longitude: lon, latitudeDelta: d, longitudeDelta: d };
  }, [lat, lon, latDelta, lonDelta, zoomParam]);

  const cameraRef = useRef<any>(null);
  const lastRegionRef = useRef<Region | null>(initialRegion);

  const [baseMapStyle, setBaseMapStyle] = useState<'dark' | 'light'>('dark');

  const [showSkyScore, setShowSkyScore] = useState(true);
  const [showAuroraProb, setShowAuroraProb] = useState(true);
  const [showAuroraOval, setShowAuroraOval] = useState(true);

  const [skyPoints, setSkyPoints] = useState<SkyPoint[]>([]);
  const [skyMeta, setSkyMeta] = useState<{ stepDeg: number; updatedAt: number } | null>(null);

  const [ovationPoints, setOvationPoints] = useState<OvationPoint[]>([]);
  const [ovationUpdatedAt, setOvationUpdatedAt] = useState<number | null>(null);

  const [statusLine, setStatusLine] = useState<string>('Loading Sky Score + Aurora…');
  const [errorLine, setErrorLine] = useState<string | null>(null);

  const [readout, setReadout] = useState<{
    lat: number;
    lon: number;
    skyScore: number;
    auroraProb: number;
    visibleProb: number;
  } | null>(null);

  // debounce region-driven fetches
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchKeyRef = useRef<string>('');

  const refreshForRegion = (region: Region) => {
    const b = regionBounds(region);
    const zoom =
      typeof (region as any).zoom === 'number' && Number.isFinite((region as any).zoom)
        ? (region as any).zoom
        : approxZoomFromLongitudeDelta(region.longitudeDelta);

    // compute likely step so key is stable-ish
    const z = clamp(zoom, 2, 12);
    const stepGuess = z <= 3 ? 2 : z <= 5 ? 1 : z <= 7 ? 0.5 : 0.25;

    const k = boundsKey(b, zoom, stepGuess);
    if (k === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = k;

    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    regionDebounceRef.current = setTimeout(async () => {
      try {
        setErrorLine(null);
        setStatusLine('Updating Sky Score…');

        const { inputs, stepUsed } = await fetchAstroInputsGrid({ bounds: b, zoom, ttlMs: 10 * 60_000 });
        const scores = computeSkyScoreGrid({
          inputs,
          // hooks: later you’ll plug Bortle/VIIRS + smoke
          darknessScoreAt: () => 1,
          smokePenaltyAt: () => 0,
        });

        setSkyPoints(scores);
        setSkyMeta({ stepDeg: stepUsed, updatedAt: Date.now() });

        setStatusLine(`Sky Score ready · grid ${stepUsed}° · points ${scores.length} · zoom ~ ${Math.round(zoom)}`);
      } catch (e: any) {
        setErrorLine(String(e?.message ?? e ?? 'Sky Score failed'));
      }
    }, 300);
  };

  // load ovation on mount + TTL refresh
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
      }
    }

    run();
    const t = setInterval(run, 2 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // geojson sources
  const skyGeojson = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: skyPoints.map((p) => ({
        type: 'Feature',
        properties: { score: p.score },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    } as GeoJSON.FeatureCollection;
  }, [skyPoints]);

  // Keep aurora points lean at low zoom (performance)
  const auroraGeojson = useMemo(() => {
    // Filter out tiny probabilities to reduce draw load.
    const filtered = ovationPoints.filter((p) => p.prob >= 3);
    return {
      type: 'FeatureCollection',
      features: filtered.map((p) => ({
        type: 'Feature',
        properties: { prob: p.prob },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      })),
    } as GeoJSON.FeatureCollection;
  }, [ovationPoints]);

  const ovalFeature = useMemo(() => {
    if (!ovationPoints.length) return null;
    return buildAuroraOvalHull(ovationPoints, 10);
  }, [ovationPoints]);

  // “Tap-to-probability” without MapView press:
  // MVP uses map CENTER as the selection point (consistent + reliable).
  // Drag map so the crosshair is over your site, then press “Read”.
  const readAtCenter = () => {
    const r = lastRegionRef.current;
    if (!r) return;
    const lat = r.latitude;
    const lon = r.longitude;

    const skyScore = skyPoints.length ? sampleNearestScore(skyPoints, lat, lon) : 0;
    const auroraProb = ovationPoints.length ? sampleOvationAt(ovationPoints, lat, lon) : 0;

    const visibleProb = Math.round(clamp((skyScore / 100) * (auroraProb / 100), 0, 1) * 100);

    setReadout({ lat, lon, skyScore, auroraProb, visibleProb });
  };

  return (
    <SafeAreaView key={navKey} style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        <MapRenderer
          engine="maplibre"
          initialRegion={initialRegion}
          mapStyle={baseMapStyle}
          cameraRef={cameraRef}
          onRegionChangeComplete={(r: Region) => {
            lastRegionRef.current = r;

            const z =
              typeof (r as any).zoom === 'number' && Number.isFinite((r as any).zoom)
                ? (r as any).zoom
                : approxZoomFromLongitudeDelta(r.longitudeDelta);

            // drive fetches from region settle
            refreshForRegion(r);

            // keep a short UI status
            if (!skyMeta) setStatusLine(`Astro · zoom ~ ${Math.round(z)}`);
          }}
          radar={{ enabled: false, templates: [null, null, null], opacities: [0, 0, 0], tileMaxZ: 0, localImage: null }}
          overlays={[]}
        >
          {/* MapLibre overlays (real sources/layers) */}
          {showSkyScore ? (
            <MapLibreGL.ShapeSource id="skyScore-src" shape={skyGeojson as any}>
              <MapLibreGL.CircleLayer
                id="skyScore-pts"
                style={{
                  circleRadius: [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    2, 2,
                    5, 4,
                    8, 8,
                    11, 14,
                  ],
                  circleOpacity: 0.45,
                  circleColor: [
                    'interpolate',
                    ['linear'],
                    ['get', 'score'],
                    0, 'rgba(60, 40, 120, 1)',
                    20, 'rgba(120, 80, 200, 1)',
                    40, 'rgba(120, 140, 255, 1)',
                    60, 'rgba(140, 205, 255, 1)',
                    80, 'rgba(210, 235, 255, 1)',
                    100, 'rgba(245, 250, 255, 1)',
                  ],
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {showAuroraProb ? (
            <MapLibreGL.ShapeSource id="auroraProb-src" shape={auroraGeojson as any}>
              <MapLibreGL.CircleLayer
                id="auroraProb-pts"
                style={{
                  circleRadius: [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    2, 1.5,
                    5, 3,
                    8, 6,
                    11, 10,
                  ],
                  circleOpacity: 0.35,
                  circleColor: [
                    'interpolate',
                    ['linear'],
                    ['get', 'prob'],
                    0, 'rgba(0,0,0,0)',
                    5, 'rgba(80, 255, 160, 0.6)',
                    20, 'rgba(120, 255, 180, 0.85)',
                    50, 'rgba(170, 255, 210, 1)',
                    80, 'rgba(240, 255, 250, 1)',
                  ],
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {showAuroraOval && ovalFeature ? (
            <MapLibreGL.ShapeSource id="auroraOval-src" shape={ovalFeature as any}>
              <MapLibreGL.FillLayer
                id="auroraOval-fill"
                style={{
                  fillOpacity: 0.08,
                  fillColor: 'rgba(140, 255, 190, 1)',
                }}
              />
              <MapLibreGL.LineLayer
                id="auroraOval-line"
                style={{
                  lineWidth: 2,
                  lineOpacity: 0.85,
                  lineColor: 'rgba(160, 255, 210, 1)',
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}
        </MapRenderer>

        {/* Crosshair (center readout target) */}
        <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
          <View
            style={{
              position: 'absolute',
              left: -10,
              top: -1,
              width: 20,
              height: 2,
              backgroundColor: 'rgba(255,255,255,0.55)',
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
              backgroundColor: 'rgba(255,255,255,0.55)',
              borderRadius: 2,
            }}
          />
        </View>

        {/* Top HUD */}
        <View style={{ position: 'absolute', left: 12, right: 12, top: 8 + insets.top, gap: 10 }}>
          <Glass style={{ paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Astro</Text>

              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Pressable
                  onPress={readAtCenter}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>Read</Text>
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

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.78)' }}>{statusLine}</Text>
              {errorLine ? <Text style={{ marginTop: 4, color: 'rgba(255,170,170,0.95)' }}>{errorLine}</Text> : null}
              {skyMeta ? (
                <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.55)' }}>
                  SkyScore updated {Math.round((Date.now() - skyMeta.updatedAt) / 1000)}s ago · step {skyMeta.stepDeg}°
                </Text>
              ) : null}
              {ovationUpdatedAt ? (
                <Text style={{ marginTop: 2, color: 'rgba(255,255,255,0.55)' }}>
                  Aurora updated {Math.round((Date.now() - ovationUpdatedAt) / 1000)}s ago · source OVATION
                </Text>
              ) : null}
              <Text style={{ marginTop: 6, color: 'rgba(255,255,255,0.55)' }}>
                Tip: drag the map so your site is under the crosshair, then hit <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '900' }}>Read</Text>.
              </Text>
            </View>

            {/* Toggles */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <ToggleChip label="SkyScore" active={showSkyScore} onPress={() => setShowSkyScore((v) => !v)} />
              <ToggleChip label="Aurora Prob" active={showAuroraProb} onPress={() => setShowAuroraProb((v) => !v)} />
              <ToggleChip label="Aurora Oval" active={showAuroraOval} onPress={() => setShowAuroraOval((v) => !v)} />
              <ToggleChip
                label={baseMapStyle === 'dark' ? 'Dark' : 'Light'}
                active
                onPress={() => setBaseMapStyle((s) => (s === 'dark' ? 'light' : 'dark'))}
              />
            </View>

            {/* Readout */}
            {readout ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: 'white', fontWeight: '900' }}>
                  Visibility: {readout.visibleProb}%{' '}
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontWeight: '800' }}>
                    (Aurora {readout.auroraProb}% × SkyScore {readout.skyScore})
                  </Text>
                </Text>
                <Text style={{ marginTop: 4, color: 'rgba(255,255,255,0.65)' }}>
                  Center: {readout.lat.toFixed(3)}, {readout.lon.toFixed(3)}
                </Text>
              </View>
            ) : null}
          </Glass>
        </View>
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
