// app/(tabs)/astro-map.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { Buffer } from 'buffer';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '../../components/common/Glass';
import { AtmosphericLegend } from '../../components/maps/AtmosphericLegend';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';

import {
  boundsFromPoints as boundsFromOvationPoints,
  buildAuroraContourRings,
  fetchOvationPoints as fetchOvationPointsLib,
  sampleOvationAt,
  type OvationPoint as OvationPointLib,
} from '../lib/aurora/ovation';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
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
  'https://omniwx-api.omniwx.workers.dev';

const OM_BACKOFF = { until: 0, lastStatus: 0, strikes: 0 };

function formatHourLabel(h: number) {
  if (h === 0) return 'Now';
  return `+${h}h`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n)}%`;
}

function isSkyFetchScaleOK(region: Region) {
  const lonSpan = Math.abs(region.longitudeDelta);
  const latSpan = Math.abs(region.latitudeDelta);
  return !(lonSpan >= 60 || latSpan >= 45);
}

function chooseSkyGridSize(zoom: number) {
  if (zoom >= 9) return 320;
  if (zoom >= 7) return 256;
  return 224;
}

function hashKey(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
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

function zoomFromLonDelta(lonDelta: number) {
  const d = clamp(lonDelta, 0.05, 360);
  return Math.log2(360 / d);
}

function midpointLon(a: number, b: number) {
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
  const rawMaxLon = normLon(b.maxLon + padLon);
  const rawMinLon = normLon(b.minLon - padLon);

  const spanLon = lonSpanWrapped(rawMinLon, rawMaxLon);
  const crossesDateline = spanLon > 180;

  const durationMs = opts?.durationMs ?? 650;
  const padding = opts?.padding ?? 40;

  const centerLon = crossesDateline ? midpointLon(rawMinLon, rawMaxLon) : normLon((rawMinLon + rawMaxLon) / 2);
  const centerLat = clampLat((minLat + maxLat) / 2);

  const latSpan = Math.abs(maxLat - minLat);
  const span = Math.max(spanLon, latSpan * 1.35);
  const targetZoom = clamp(zoomFromLonDelta(span) - 0.4, 2, 8);

  if (!crossesDateline && typeof cameraRef.current?.fitBounds === 'function') {
    const ne: [number, number] = [rawMaxLon, maxLat];
    const sw: [number, number] = [rawMinLon, minLat];

    cameraRef.current.fitBounds(ne, sw, padding, durationMs);

    setTimeout(() => {
      cameraRef.current?.setCamera?.({
        centerCoordinate: [centerLon, centerLat],
        zoomLevel: targetZoom,
        animationDuration: 120,
      });
    }, durationMs + 40);
    return;
  }

  cameraRef.current?.setCamera?.({
    centerCoordinate: [centerLon, centerLat],
    zoomLevel: targetZoom,
    animationDuration: durationMs,
  });
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
  const { visible, children, header, bottomDock = 0, draggable = false } = props;
  const isControlled = props.snap != null;
  const [snapInternal, setSnapInternal] = React.useState<SheetSnap>(props.snap ?? 'collapsed');
  const snap = (isControlled ? props.snap : snapInternal) as SheetSnap;

  const screenH = Dimensions.get('window').height;
  const fullY = 90;
  const halfY = Math.round(screenH * 0.48);
  const collapsedY = screenH - (126 + bottomDock);
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

  React.useEffect(() => {
    if (!visible) return;
    const y = yForSnap(snap);
    lastY.current = y;
    translateY.setValue(y);
  }, [visible, snap]);

  React.useEffect(() => {
    if (!visible || !isControlled) return;
    setSnap(snap);
  }, [snap, visible, isControlled, setSnap]);

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
          <View style={{ alignItems: 'center', paddingBottom: 8 }} {...(pan ? pan.panHandlers : {})}>
            <Pressable
              onPress={() => setSnap(snap === 'collapsed' ? 'half' : 'collapsed')}
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
                  color: 'rgba(255,255,255,0.42)',
                  fontSize: 10,
                  fontWeight: '900',
                  letterSpacing: 0.7,
                }}
              >
                DETAILS
              </Text>
            </Pressable>
          </View>

          {header ? <View style={{ marginBottom: 8 }}>{header}</View> : null}

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: bottomDock + 64 }}
          >
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
  fetchedAt: string;
};

type SkyInspect = {
  lat: number;
  lon: number;
  skyScore: number;
  auroraProb: number;
  visibleProb: number;
};

const SKY_STOPS: Array<{ s: number; rgba: [number, number, number, number] }> = [
  { s: 0, rgba: [110, 30, 200, 188] },
  { s: 15, rgba: [95, 45, 215, 172] },
  { s: 30, rgba: [70, 85, 235, 152] },
  { s: 45, rgba: [45, 135, 245, 124] },
  { s: 60, rgba: [40, 185, 235, 92] },
  { s: 72, rgba: [35, 215, 195, 68] },
  { s: 82, rgba: [25, 235, 150, 46] },
  { s: 92, rgba: [15, 245, 110, 24] },
  { s: 100, rgba: [0, 0, 0, 0] },
];

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

  const [focusKey, setFocusKey] = useState(0);
  const [renderMap, setRenderMap] = useState(true);
  const [instanceKey, setInstanceKey] = useState(0);

  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSerialRef = useRef(0);
  const lastSkyGridKeyRef = useRef<string>('');
  const isProgrammaticMoveRef = useRef(false);
  const pendingPostGoRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRegionRef = useRef<Region | null>(null);

  useFocusEffect(
    useCallback(() => {
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
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        if (pendingPostGoRefreshRef.current) clearTimeout(pendingPostGoRefreshRef.current);
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);

        regionDebounceRef.current = null;
        retryTimerRef.current = null;
        pendingPostGoRefreshRef.current = null;
        loadingTimerRef.current = null;
        lastSkyGridKeyRef.current = '';
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

  useEffect(() => {
    initialRegionRef.current = initialRegion;
    lastRegionRef.current = initialRegion;
    lastSkyGridKeyRef.current = '';
  }, [screenKey, initialRegion]);

  const cameraRef = useRef<any>(null);

  const [baseMapStyle, setBaseMapStyle] = useState<'dark' | 'light'>('dark');
  const [showSkyScore, setShowSkyScore] = useState(true);
  const [showAuroraProb, setShowAuroraProb] = useState(true);
  const [showAuroraOval, setShowAuroraOval] = useState(true);
  const [hourOffset, setHourOffset] = useState(0);

  const [ovationPoints, setOvationPoints] = useState<OvationPoint[]>([]);
  const [ovationUpdatedAt, setOvationUpdatedAt] = useState<number | null>(null);

  const [statusLine, setStatusLine] = useState<string>('Loading SkyScore + Aurora…');
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

  const [uiCompact, setUiCompact] = useState(true);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('collapsed');

  const [inspect, setInspect] = useState<SkyInspect | null>(null);

  const canShowSky =
    showSkyScore &&
    typeof skyRasterUri === 'string' &&
    skyRasterUri.length > 0 &&
    skyRasterBounds.length === 4;

  const currentCenter = useMemo(() => {
    const r = lastRegionRef.current ?? initialRegion;
    return { lat: r.latitude, lon: r.longitude, lonDelta: r.longitudeDelta, latDelta: r.latitudeDelta };
  }, [initialRegion, screenKey, instanceKey]);

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

  const computeInspectAt = useCallback(
    (latQ: number, lonQ: number, gridOverride?: SkyGridPayload | null) => {
      const auroraProb = ovationPoints.length
        ? sampleOvationAt(
            ovationPoints.map((p) => ({ lat: p.lat, lon: p.lon, prob: p.prob })),
            latQ,
            lonQ
          )
        : 0;

      const gridToUse = gridOverride ?? skyGrid;
      const skyScore = gridToUse ? sampleGridScore(gridToUse, latQ, lonQ) ?? 0 : 0;
      const visibleProb = Math.round(clamp((skyScore / 100) * (auroraProb / 100), 0, 1) * 100);

      return {
        lat: latQ,
        lon: lonQ,
        skyScore,
        auroraProb,
        visibleProb,
      };
    },
    [ovationPoints, skyGrid]
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
        lastSkyGridKeyRef.current = '';
        retryFn();
      }, waitMs);
    },
    [showSkyScore]
  );

  const refreshForRegion = useCallback(
    (region: Region) => {
      if (!showSkyScore) {
        setStatusLine('SkyScore off');
        setErrorLine(null);
        return;
      }

      if (!isSkyFetchScaleOK(region)) {
        setErrorLine(null);
        setStatusLine('Zoom in to load SkyScore (world view is display-only).');
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
        setStatusLine(`Open-Meteo cooling down (${waitS}s) after ${OM_BACKOFF.lastStatus || 429}.`);
        lastSkyGridKeyRef.current = '';

        scheduleRetryAfterCooldown(() => {
          const r = lastRegionRef.current;
          if (r) refreshForRegion(r);
        });
        return;
      }

      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);

      regionDebounceRef.current = setTimeout(async () => {
        const fetchId = ++fetchSerialRef.current;

        try {
          setErrorLine(null);

          const size = chooseSkyGridSize(zoom);

          const key =
            `${b.west.toFixed(3)}:${b.south.toFixed(3)}:${b.east.toFixed(3)}:${b.north.toFixed(3)}` +
            `:z${Math.round(zoom * 10) / 10}:h${hourOffset}:s${size}`;

          if (key === lastSkyGridKeyRef.current) return;
          lastSkyGridKeyRef.current = key;

          if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
          loadingTimerRef.current = setTimeout(() => {
            if (fetchId === fetchSerialRef.current && !skyRasterUri) {
              setStatusLine(`Updating SkyScore (${formatHourLabel(hourOffset)})…`);
            }
          }, 180);

          const skyUrl =
            `${OMNIWX_API_BASE}/api/astro/skyscore-grid` +
            `?west=${encodeURIComponent(String(b.west))}` +
            `&south=${encodeURIComponent(String(b.south))}` +
            `&east=${encodeURIComponent(String(b.east))}` +
            `&north=${encodeURIComponent(String(b.north))}` +
            `&zoom=${encodeURIComponent(String(zoom))}` +
            `&hour=${encodeURIComponent(String(hourOffset))}` +
            `&w=${encodeURIComponent(String(size))}` +
            `&h=${encodeURIComponent(String(size))}`;

          const res = await fetch(skyUrl);

          if (!res.ok) {
            if (res.status === 429 || res.status >= 500) {
              OM_BACKOFF.lastStatus = res.status;
              OM_BACKOFF.strikes = Math.min(6, OM_BACKOFF.strikes + 1);
              const retryAfter = Number(res.headers.get('retry-after') ?? '');
              const baseMs =
                Number.isFinite(retryAfter) && retryAfter > 0
                  ? retryAfter * 1000
                  : res.status === 429
                    ? 20000
                    : 8000;
              OM_BACKOFF.until = Date.now() + Math.min(baseMs * Math.pow(2, OM_BACKOFF.strikes - 1), 180000);
            }
            throw new Error(`SkyScore grid failed: ${res.status}`);
          }

          OM_BACKOFF.strikes = 0;

          const grid = (await res.json()) as SkyGridPayload;
          if (!grid?.ok || !Array.isArray(grid.scores)) {
            throw new Error('SkyScore grid payload invalid');
          }

          if (!hasValidBounds(grid.bounds)) {
            throw new Error('SkyScore grid returned invalid bounds');
          }

          const localUri = await makeSkyRasterFromGrid(grid, key);

          setSkyGrid(grid);
          setSkyRasterBounds([
            [grid.bounds.west, grid.bounds.north],
            [grid.bounds.east, grid.bounds.north],
            [grid.bounds.east, grid.bounds.south],
            [grid.bounds.west, grid.bounds.south],
          ]);
          setCoverageBounds(grid.bounds);
          setSkyRasterUri(localUri);

          const center = { lat: region.latitude, lon: region.longitude };
          const ins = computeInspectAt(center.lat, center.lon, grid);
          if (ins) setInspect(ins);

          setStatusLine(`SkyScore ready · ${formatHourLabel(hourOffset)}`);
        } catch (e: any) {
          const msg = String(e?.message ?? e ?? 'SkyScore failed');

          if (/cooling down/i.test(msg) || /\b429\b/.test(msg) || /failed:\s*429\b/i.test(msg)) {
            setStatusLine(msg);
            setErrorLine(null);
            lastSkyGridKeyRef.current = '';

            scheduleRetryAfterCooldown(() => {
              const r = lastRegionRef.current;
              if (r) refreshForRegion(r);
            });
            return;
          }

          setErrorLine(msg);
          lastSkyGridKeyRef.current = '';
        } finally {
          if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current);
            loadingTimerRef.current = null;
          }
        }
      }, 250);
    },
    [hourOffset, computeInspectAt, scheduleRetryAfterCooldown, showSkyScore, skyRasterUri]
  );

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

  useEffect(() => {
    const r = lastRegionRef.current;
    if (r) {
      lastSkyGridKeyRef.current = '';
      refreshForRegion(r);
    }
  }, [hourOffset, refreshForRegion]);

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

  const onGoOval = () => {
    if (!ovationPoints.length) {
      setErrorLine('Aurora points not loaded yet (OVATION unavailable).');
      return;
    }

    try {
      isProgrammaticMoveRef.current = true;

      if (pendingPostGoRefreshRef.current) clearTimeout(pendingPostGoRefreshRef.current);
      tryGoOval(cameraRef, ovationPoints, 5);

      pendingPostGoRefreshRef.current = setTimeout(() => {
        isProgrammaticMoveRef.current = false;
        pendingPostGoRefreshRef.current = null;
        lastSkyGridKeyRef.current = '';
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

  const TAB_BAR_HEIGHT = Platform.select({ ios: 60, android: 56, default: 56 }) as number;
  const aurVisLabel = inspect?.visibleProb == null ? '—' : `${Math.round(inspect.visibleProb)}%`;
  const hudSkyLabel = inspect?.skyScore == null ? '—' : `${Math.round(inspect.skyScore)}`;

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

            lastRegionRef.current = r;
            if (isProgrammaticMoveRef.current) return;
            refreshForRegion(r);
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

          {canShowSky ? (
            <MapLibreGL.ImageSource id={`skyRaster-src-${screenKey}`} url={skyRasterUri} coordinates={skyRasterBounds as any}>
              <MapLibreGL.RasterLayer
                id={`skyRaster-${screenKey}`}
                style={{
                  rasterOpacity: 0.68,
                  rasterResampling: 'linear',
                  rasterFadeDuration: 220,
                }}
              />
            </MapLibreGL.ImageSource>
          ) : null}

          {showAuroraOval ? (
            <MapLibreGL.ShapeSource id={`auroraOval-src-${screenKey}`} shape={auroraContoursGeojson as any}>
              <MapLibreGL.LineLayer id={`auroraOval-line-${screenKey}`} style={auroraContourStyle as any} />
            </MapLibreGL.ShapeSource>
          ) : null}
        </MapRenderer>

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

        {(() => {
          const HUD_MAX_W = 260;
          const GAP = 10;
          const hudActivityColor = errorLine
            ? 'rgba(255,120,120,0.9)'
            : statusLine.toLowerCase().includes('loading') || statusLine.toLowerCase().includes('updating')
              ? 'rgba(255,210,110,0.95)'
              : 'rgba(120,255,190,0.95)';

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
              {showSkyScore ? (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: insets.top + 4,
                    left: 10,
                    right: 10 + HUD_MAX_W + GAP,
                    alignSelf: 'flex-start',
                  }}
                >
                  <AtmosphericLegend compact sliver />
                </View>
              ) : null}

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
                    minWidth: 176,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    borderRadius: 16,
                    backgroundColor: 'rgba(5,12,10,0.72)',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1 }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: hudActivityColor,
                        }}
                      />
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
                        SKY {hudSkyLabel}
                      </Text>
                    </View>

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

                  <Text
                    style={{
                      marginTop: 6,
                      color: errorLine ? 'rgba(255,140,140,0.95)' : 'rgba(170,255,210,0.85)',
                      fontSize: 11,
                      lineHeight: 14,
                      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                    }}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                  >
                    {errorLine ? `! ${errorLine}` : `Aur Vis ${aurVisLabel} · ${statusLine}`}
                  </Text>

                  {!uiCompact ? (
                    <View style={{ marginTop: 6, gap: 2 }}>
                      {skyGrid ? (
                        <Text
                          style={{
                            color: 'rgba(255,255,255,0.55)',
                            fontSize: 11,
                            fontWeight: '800',
                            fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
                          }}
                          numberOfLines={1}
                        >
                          Sky src {skyGrid.sourceStepDeg.toFixed(2)}° · grid {skyGrid.width}×{skyGrid.height}
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

        <BottomSheet
          visible
          snap={sheetSnap}
          onSnapChange={setSheetSnap}
          bottomDock={TAB_BAR_HEIGHT}
          draggable={false}
          header={
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>
                Sky {inspect?.skyScore ?? '—'} · Aur Vis {aurVisLabel}
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
                  setShowSkyScore((v) => !v);
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

          {inspect ? (
            <View style={{ gap: 10 }}>
              <Row label="Sky Score" value={`${inspect.skyScore}`} />
              <Row label="Aurora Vis" value={fmtPct(inspect.visibleProb)} />
              {showAuroraProb ? <Row label="Aurora Prob" value={fmtPct(inspect.auroraProb)} /> : null}
              <Row label="Center" value={`${inspect.lat.toFixed(3)}, ${inspect.lon.toFixed(3)}`} />
            </View>
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.75)', fontWeight: '800' }}>Move the map to load SkyScore.</Text>
          )}

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