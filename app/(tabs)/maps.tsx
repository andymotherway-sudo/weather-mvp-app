// app/(tabs)/maps.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, PixelRatio, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// ✅ route params for deep-linking to views (mariner/astronomer/etc)
import { useLocalSearchParams, useRouter } from 'expo-router';

// ✅ validate view ids against your view registry
import { MAP_VIEWS } from '../lib/maps/views';

import { createInitialMapState, mapReducer } from '../lib/maps/state';

import { Glass } from '../../components/common/Glass';
import { LayerSheetModal, type LayerSheetValue } from '../../components/maps/LayerSheetModal';
import { LegendChip } from '../../components/maps/LegendChip';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { RadarLegend } from '../../components/maps/RadarLegend';
import { TimelineScrubber } from '../../components/maps/TimelineScrubber';
import { ViewSelector } from '../../components/maps/ViewSelector';
import type { WmsOverlayConfig } from '../../components/maps/overlays/OverlayEngine';

import { useLocation } from '../context/LocationContext';
import { iemNationalMosaicTimestamps, resolveRadarLayer, type RadarScan } from '../lib/maps/radarIem';

// RainViewer (unchanged)
import { createRainViewerProvider } from '../lib/maps/radar/providers/rainviewer';
import type { RadarFrame } from '../lib/maps/radar/providers/types';

/* ============================================================================ */

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, waitMs: number) {
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => fn(...args), waitMs);
  };
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getRadarProfile(zoom: number, raw: boolean, nerdy: boolean) {
  const z = Math.max(2, Math.min(12, zoom));
  if (raw) return { blendMs: 0, dwellMs: 700, opacityMult: 1.0, enableTemporal3: false, label: 'Raw' };
  if (z <= 5)
    return {
      blendMs: 900,
      dwellMs: nerdy ? 2000 : 2200,
      opacityMult: nerdy ? 0.82 : 0.76,
      enableTemporal3: true,
      label: 'Smooth (wide)',
    };
  if (z <= 8)
    return { blendMs: 700, dwellMs: nerdy ? 1650 : 1800, opacityMult: nerdy ? 0.92 : 0.86, enableTemporal3: false, label: 'Smooth' };
  return { blendMs: 420, dwellMs: nerdy ? 1200 : 1350, opacityMult: 1.0, enableTemporal3: false, label: 'Smooth (local)' };
}

function BottomDock(props: { left?: React.ReactNode; center?: React.ReactNode; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: 12 + insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flexShrink: 0 }}>{props.left}</View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>{props.center}</View>
        <View style={{ flexShrink: 0 }}>{props.right}</View>
      </View>
    </View>
  );
}

/* ============================================================================ */

const IEM_WMS_BASE = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad';

function lonLatToMercatorMeters(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return { x, y };
}

function regionToBounds(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return { west, east, south, north };
}

function iemLayerForProduct(product: 'N0Q' | 'N0B' | 'N0Z') {
  if (product === 'N0B') return 'nexrad-n0b-900913';
  if (product === 'N0Z') return 'nexrad-n0z-900913';
  return 'nexrad-n0q-900913';
}

function iemWmsEndpointForProduct(product: 'N0Q' | 'N0B' | 'N0Z') {
  if (product === 'N0B') return `${IEM_WMS_BASE}/n0b.cgi`;
  if (product === 'N0Z') return `${IEM_WMS_BASE}/n0z.cgi`;
  return `${IEM_WMS_BASE}/n0q.cgi`;
}

function buildIemWmsGetMapUrl(args: {
  product: 'N0Q' | 'N0B' | 'N0Z';
  region: Region;
  widthPx: number;
  heightPx: number;
  timeIso?: string | null;
}) {
  const { product, region, widthPx, heightPx, timeIso } = args;
  const { west, east, south, north } = regionToBounds(region);

  const sw = lonLatToMercatorMeters(west, south);
  const ne = lonLatToMercatorMeters(east, north);

  const layer = iemLayerForProduct(product);
  const endpoint = iemWmsEndpointForProduct(product);

  const params: Record<string, string> = {
    service: 'WMS',
    request: 'GetMap',
    version: '1.1.1',
    layers: layer,
    styles: '',
    format: 'image/png',
    transparent: 'TRUE',
    srs: 'EPSG:3857',
    bbox: `${sw.x},${sw.y},${ne.x},${ne.y}`,
    width: String(Math.max(256, Math.min(1536, Math.floor(widthPx)))),
    height: String(Math.max(256, Math.min(1536, Math.floor(heightPx)))),
  };

  if (timeIso) params.time = timeIso;

  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  return `${endpoint}?${qs}`;
}

/* ============================================================================ */

export default function MapsScreen() {
  const insets = useSafeAreaInsets();

  // ✅ read ?view=... (mariner / astronomer / radar / clouds / wildfire / ...)
  const params = useLocalSearchParams<{ view?: string }>();
  const router = useRouter();

  const [state, dispatch] = React.useReducer(mapReducer, undefined, () => createInitialMapState({ viewId: 'radar', nerdy: false }));
  const { location, permission } = useLocation();

  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [sheetValue, setSheetValue] = useState<LayerSheetValue>({ baseMapStyle: 'dark', radarProvider: 'iem' });

  const [rawMode, setRawMode] = useState(false);

  // ✅ external camera ref so we can imperatively recenter w/o fighting region state
  const mapCameraRef = useRef<any>(null);

  // ✅ allow deep-link “views” (plus aliases) without adding new MapViewIds yet.
  useEffect(() => {
    const raw = params?.view ? String(params.view).toLowerCase() : '';
    if (!raw) return;

    // Aliases until you add first-class view IDs in types.ts + views.ts
    const mapped = raw === 'mariner' ? 'clouds' : raw === 'astronomer' ? 'clouds' : raw;

    const valid = MAP_VIEWS.some((v) => v.id === mapped);
    if (!valid) return;

    dispatch({ type: 'SET_VIEW', viewId: mapped as any });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.view]);

  useEffect(() => {
    const enabled = !!state.layers?.['radar.reflectivity']?.enabled;
    if (!enabled) {
      dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'radar.reflectivity', enabled: true });
      dispatch({ type: 'SET_LAYER_OPACITY', layerId: 'radar.reflectivity', opacity: 0.9 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dispatch({ type: 'SET_RADAR_PLAYING', playing: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =========================================================================
   * Interaction tracking
   * ========================================================================= */

  const lastUserMoveAtRef = useRef<number>(0);
  const lastPanMarkRef = useRef<number>(0);
  const lastTickReasonRef = useRef<string>('');

  const markUserInteraction = () => {
    lastUserMoveAtRef.current = Date.now();
  };
  const isUserMovingNow = () => Date.now() - lastUserMoveAtRef.current < 140;

  /* ---------------- Anchor ---------------- */

  type AnchorMode = 'gps' | 'map';
  const [anchorMode, setAnchorMode] = useState<AnchorMode>('gps');
  const [anchorPoint, setAnchorPoint] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (permission !== 'granted') return;
    if (!location) return;
    if (anchorMode !== 'gps') return;
    setAnchorPoint({ lat: location.lat, lon: location.lon });
  }, [permission, location, anchorMode]);

  useEffect(() => {
    if (anchorPoint) return;
    if (permission !== 'granted') return;
    if (!location) return;
    setAnchorPoint({ lat: location.lat, lon: location.lon });
  }, [anchorPoint, permission, location]);

  const debouncedAnchorToMap = useDebouncedCallback((lat: number, lon: number) => {
    if (anchorMode !== 'map') return;
    setAnchorPoint({ lat, lon });
  }, 160);

  const selectionPoint = anchorPoint;
  const centerForRadar = useMemo(() => selectionPoint ?? { lat: 39.5, lon: -98.35 }, [selectionPoint]);

  /* =========================================================================
   * Frames: IEM Mosaic vs RainViewer
   * ========================================================================= */

  const [mapZoom, setMapZoom] = useState<number>(4);
  const [product, setProduct] = useState<'N0Q' | 'N0B' | 'N0Z'>('N0Q');

  const baseNowRef = useRef<number>(Date.now());
  const stamps = useMemo(() => iemNationalMosaicTimestamps(), []);
  const iemFrames: RadarScan[] = useMemo(() => {
    const now = baseNowRef.current;
    const usableMinutes = Array.from({ length: stamps.length }, (_, i) => (stamps.length - 1 - i) * 5);
    return stamps.map((stamp, i) => ({ stamp, iso: new Date(now - usableMinutes[i] * 60_000).toISOString() }));
  }, [stamps]);

  const rvProviderRef = useRef(
    createRainViewerProvider({
      ttlMs: 60_000,
      includeNowcast: true,
      maxFrames: 12,
      maxZoom: 10,
    }),
  );
  const [rvFrames, setRvFrames] = useState<RadarFrame[] | null>(null);
  const [rvError, setRvError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (sheetValue.radarProvider !== 'rainviewer') return;
      try {
        setRvError(null);
        const frames = await rvProviderRef.current.getFrames();
        if (cancelled) return;
        setRvFrames(frames);
      } catch (e: any) {
        if (cancelled) return;
        setRvFrames(null);
        setRvError(String(e?.message ?? e ?? 'RainViewer failed'));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [sheetValue.radarProvider]);

  const usingRainViewer = sheetValue.radarProvider === 'rainviewer' && !!rvFrames?.length;

  /* =========================================================================
   * Hyperlocal mode (single WMS image)
   * ========================================================================= */

  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;
  const wildfireEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;

  // Clouds are first-class in your catalog but state typing may not include it yet
  const cloudsEnabled = !!(state.layers as any)?.['sat.clouds']?.enabled;
  const cloudsOpacity = Number.isFinite((state.layers as any)?.['sat.clouds']?.opacity) ? (state.layers as any)['sat.clouds'].opacity : 0.85;

  const localMinZoom = 9.5;
  const usingLocalImage = sheetValue.radarProvider === 'iem' && radarEnabled && mapZoom >= localMinZoom;

  const lastRegionRef = useRef<Region | null>(null);

  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [localImageCoords, setLocalImageCoords] = useState<[[number, number], [number, number], [number, number], [number, number]] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const windowSize = Dimensions.get('window');
  const dpr = PixelRatio.get();
  const imageW = Math.min(1536, Math.max(512, Math.floor(windowSize.width * dpr)));
  const imageH = Math.min(1536, Math.max(512, Math.floor(windowSize.height * dpr)));

  const frameCountBase = usingRainViewer && rvFrames ? rvFrames.length : iemFrames.length;
  const safeBaseIndex = clampIndex(state.radarTime.frameIndex, frameCountBase);
  const drivingIso = usingRainViewer && rvFrames ? rvFrames[safeBaseIndex]?.iso : iemFrames[safeBaseIndex]?.iso;

  const debouncedRefreshLocal = useDebouncedCallback(() => {
    const r = lastRegionRef.current;
    if (!r) return;

    try {
      setLocalError(null);

      const url = buildIemWmsGetMapUrl({
        product,
        region: r,
        widthPx: imageW,
        heightPx: imageH,
        timeIso: drivingIso ?? null,
      });

      const { west, east, south, north } = regionToBounds(r);
      const coords: [[number, number], [number, number], [number, number], [number, number]] = [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ];

      setLocalImageUrl(url);
      setLocalImageCoords(coords);
    } catch (e: any) {
      setLocalError(String(e?.message ?? e ?? 'Local image build failed'));
    }
  }, 220);

  useEffect(() => {
    if (!usingLocalImage) return;
    debouncedRefreshLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingLocalImage, product, imageW, imageH, drivingIso]);

  /* =========================================================================
   * Unified frames for scrubber
   * ========================================================================= */

  const uiFrames: Array<{ iso: string }> = useMemo(() => {
    if (usingRainViewer && rvFrames) return rvFrames.map((f) => ({ iso: f.iso }));
    return iemFrames.map((f) => ({ iso: f.iso }));
  }, [usingRainViewer, rvFrames, iemFrames]);

  const frameCount = uiFrames.length;
  const safeFrameIndex = clampIndex(state.radarTime.frameIndex, frameCount);

  useEffect(() => {
    if (frameCount <= 0) return;
    if (state.radarTime.frameIndex !== safeFrameIndex) {
      dispatch({ type: 'SET_RADAR_FRAME', frameIndex: safeFrameIndex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount, safeFrameIndex, usingRainViewer, sheetValue.radarProvider]);

  useEffect(() => {
    if (usingLocalImage && state.radarTime.playing) {
      dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
      lastTickReasonRef.current = 'paused:localImage';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingLocalImage]);

  /* =========================================================================
   * Templates for tile mode (national/mid zoom)
   * ========================================================================= */

  const computedTemplates = useMemo(() => {
    if (!radarEnabled) return [] as Array<string | null>;
    if (usingLocalImage) return [] as Array<string | null>;

    if (usingRainViewer && rvFrames?.length) {
      return rvFrames.map((f) => {
        try {
          return rvProviderRef.current.getTileUrlTemplate(f);
        } catch {
          return null;
        }
      });
    }

    return iemFrames.map((f) => {
      const choice = resolveRadarLayer(centerForRadar.lat, centerForRadar.lon, {
        zoom: mapZoom,
        product,
        localMinZoom,
        maxLocalDistanceKm: 300,
        nationalTimestamp: f.stamp,
      });
      return choice?.tileUrl ?? null;
    });
  }, [radarEnabled, usingLocalImage, usingRainViewer, rvFrames, iemFrames, centerForRadar.lat, centerForRadar.lon, mapZoom, product]);

  const heldTemplatesRef = useRef<Array<string | null>>([]);
  const [preloadTo, setPreloadTo] = useState<number | null>(null);

  type XFadeState = { from: number; to: number; t: number };
  const [xfade, setXfade] = useState<XFadeState>({ from: safeFrameIndex, to: safeFrameIndex, t: 1 });
  const prevFrameRef = useRef<number>(safeFrameIndex);

  const templates = useMemo(() => {
    if (!computedTemplates.length) return [] as Array<string | null>;

    if (!heldTemplatesRef.current.length) {
      heldTemplatesRef.current = computedTemplates;
      return computedTemplates;
    }

    const isBlendingNow = preloadTo !== null || (xfade.from !== xfade.to && xfade.t < 1);
    if (isUserMovingNow() || isBlendingNow) return heldTemplatesRef.current;

    heldTemplatesRef.current = computedTemplates;
    return computedTemplates;
  }, [computedTemplates, preloadTo, xfade.from, xfade.to, xfade.t]);

  /* =========================================================================
   * Crossfade + preload gate (tile mode only)
   * ========================================================================= */

  const profile = useMemo(() => getRadarProfile(mapZoom, rawMode, state.nerdy), [mapZoom, rawMode, state.nerdy]);

  const radarOpacity = useMemo(() => {
    const configured = state.layers?.['radar.reflectivity']?.opacity ?? 0.9;
    const base = state.nerdy ? Math.min(1, Math.max(0.55, configured)) : Math.min(1, Math.max(0.75, configured));
    return Math.max(0, Math.min(1, base * profile.opacityMult));
  }, [state.layers, state.nerdy, profile.opacityMult]);

  const preloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const xfadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (usingLocalImage) return;

    const prev = prevFrameRef.current;
    const next = safeFrameIndex;
    if (prev === next) return;

    const prevTpl = templates[clampIndex(prev, templates.length)];
    const nextTpl = templates[clampIndex(next, templates.length)];
    if (prevTpl && nextTpl && prevTpl === nextTpl) {
      prevFrameRef.current = next;
      setPreloadTo(null);
      setXfade({ from: next, to: next, t: 1 });
      return;
    }

    prevFrameRef.current = next;

    if (xfadeTimerRef.current) {
      clearInterval(xfadeTimerRef.current);
      xfadeTimerRef.current = null;
    }
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = null;
    }

    if (profile.blendMs <= 0) {
      setPreloadTo(null);
      setXfade({ from: next, to: next, t: 1 });
      return;
    }

    setPreloadTo(next);

    const preloadMs = mapZoom <= 5 ? 320 : mapZoom <= 8 ? 260 : 220;

    preloadTimerRef.current = setTimeout(() => {
      setPreloadTo(null);

      const start = Date.now();
      const duration = profile.blendMs;

      setXfade({ from: prev, to: next, t: 0 });

      xfadeTimerRef.current = setInterval(() => {
        const rawT = (Date.now() - start) / duration;
        if (rawT >= 1) {
          if (xfadeTimerRef.current) clearInterval(xfadeTimerRef.current);
          xfadeTimerRef.current = null;
          setXfade({ from: next, to: next, t: 1 });
          return;
        }
        const t = easeInOutCubic(Math.max(0, Math.min(1, rawT)));
        setXfade({ from: prev, to: next, t });
      }, 33);
    }, preloadMs);

    return () => {
      if (preloadTimerRef.current) clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = null;
      if (xfadeTimerRef.current) clearInterval(xfadeTimerRef.current);
      xfadeTimerRef.current = null;
    };
  }, [usingLocalImage, safeFrameIndex, profile.blendMs, mapZoom, templates, templates.length]);

  const perFrameOpacities = useMemo(() => {
    const n = templates.length;
    if (!n) return [] as number[];

    const out = new Array(n).fill(0);
    const from = clampIndex(xfade.from, n);
    const to = clampIndex(xfade.to, n);
    const t = Math.max(0, Math.min(1, xfade.t));

    const noBlend = profile.blendMs <= 0 || from === to;
    if (noBlend) {
      out[to] = radarOpacity;
      return out;
    }

    out[from] = radarOpacity * (1 - t);
    out[to] = radarOpacity * t;

    if (profile.enableTemporal3 && mapZoom <= 5 && t < 0.98) {
      const back = clampIndex(to - 1, n);
      if (back !== to) {
        const tailMax = 0.08;
        const tail = Math.min(tailMax, radarOpacity * 0.14 * (1 - t));
        out[back] = Math.max(out[back], tail);
      }
    }

    return out;
  }, [templates.length, xfade.from, xfade.to, xfade.t, radarOpacity, profile.blendMs, profile.enableTemporal3, mapZoom]);

  /* =========================================================================
   * Active radar slots (tiles)
   * ========================================================================= */

  const slotHoldRef = useRef<Array<string | null>>([null, null, null]);

  const activeRadar = useMemo(() => {
    const n = templates.length;
    const outTemplates: Array<string | null> = [null, null, null];
    const outOpacities: number[] = [0, 0, 0];

    if (usingLocalImage) {
      return { templates: outTemplates, opacities: outOpacities };
    }

    if (!n) {
      outTemplates[0] = slotHoldRef.current[0];
      outTemplates[1] = slotHoldRef.current[1];
      outTemplates[2] = slotHoldRef.current[2];
      return { templates: outTemplates, opacities: outOpacities };
    }

    if (preloadTo !== null) {
      const cur = clampIndex(xfade.to, n);
      const pre = clampIndex(preloadTo, n);

      outTemplates[0] = templates[cur] ?? slotHoldRef.current[0];
      outOpacities[0] = radarOpacity;

      if (pre !== cur) {
        outTemplates[1] = templates[pre] ?? null;
        outOpacities[1] = 0;
      }

      if (outTemplates[0]) slotHoldRef.current[0] = outTemplates[0];
      slotHoldRef.current[1] = outTemplates[1];
      slotHoldRef.current[2] = null;

      return { templates: outTemplates, opacities: outOpacities };
    }

    const from = clampIndex(xfade.from, n);
    const to = clampIndex(xfade.to, n);
    const back = clampIndex(to - 1, n);

    const noBlend = profile.blendMs <= 0 || from === to;
    if (noBlend) {
      outTemplates[0] = templates[to] ?? slotHoldRef.current[0];
      outOpacities[0] = radarOpacity;

      if (outTemplates[0]) slotHoldRef.current[0] = outTemplates[0];
      slotHoldRef.current[1] = null;
      slotHoldRef.current[2] = null;

      return { templates: outTemplates, opacities: outOpacities };
    }

    outTemplates[0] = templates[from] ?? slotHoldRef.current[0];
    outOpacities[0] = perFrameOpacities[from] ?? 0;

    outTemplates[1] = templates[to] ?? slotHoldRef.current[1];
    outOpacities[1] = perFrameOpacities[to] ?? 0;

    if (profile.enableTemporal3 && mapZoom <= 5 && back !== to) {
      const tailOp = perFrameOpacities[back] ?? 0;
      if (tailOp > 0.02) {
        outTemplates[2] = templates[back] ?? slotHoldRef.current[2];
        outOpacities[2] = tailOp;
      }
    }

    if (outTemplates[0]) slotHoldRef.current[0] = outTemplates[0];
    if (outTemplates[1]) slotHoldRef.current[1] = outTemplates[1];
    if (outTemplates[2]) slotHoldRef.current[2] = outTemplates[2];

    return { templates: outTemplates, opacities: outOpacities };
  }, [
    usingLocalImage,
    templates,
    templates.length,
    perFrameOpacities,
    xfade.from,
    xfade.to,
    profile.enableTemporal3,
    profile.blendMs,
    radarOpacity,
    preloadTo,
    mapZoom,
  ]);

  /* =========================================================================
   * Playback (tiles only)
   * ========================================================================= */

  const PLAY_TICK_MS = 120;

  const playingRef = useRef<boolean>(state.radarTime.playing);
  const frameCountRef = useRef<number>(frameCount);
  const safeFrameIndexRef = useRef<number>(safeFrameIndex);
  const templatesRef = useRef<Array<string | null>>(templates);
  const minDwellRef = useRef<number>(profile.dwellMs);
  const radarEnabledRef = useRef<boolean>(radarEnabled);

  useEffect(() => {
    playingRef.current = state.radarTime.playing;
  }, [state.radarTime.playing]);
  useEffect(() => {
    frameCountRef.current = frameCount;
  }, [frameCount]);
  useEffect(() => {
    safeFrameIndexRef.current = safeFrameIndex;
  }, [safeFrameIndex]);
  useEffect(() => {
    templatesRef.current = templates;
  }, [templates]);
  useEffect(() => {
    minDwellRef.current = profile.dwellMs;
  }, [profile.dwellMs]);
  useEffect(() => {
    radarEnabledRef.current = radarEnabled;
  }, [radarEnabled]);

  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAdvanceRef = useRef<number>(0);

  useEffect(() => {
    if (playTimerRef.current) clearInterval(playTimerRef.current);
    playTimerRef.current = null;

    if (usingLocalImage) {
      lastTickReasonRef.current = 'paused:localImage';
      return;
    }

    if (!state.radarTime.playing) {
      lastTickReasonRef.current = 'paused';
      return;
    }

    if (frameCount < 2) {
      dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
      lastTickReasonRef.current = 'blocked:frameCount';
      return;
    }

    playTimerRef.current = setInterval(() => {
      if (!playingRef.current) {
        lastTickReasonRef.current = 'paused';
        return;
      }
      if (!radarEnabledRef.current) {
        lastTickReasonRef.current = 'blocked:radarOff';
        return;
      }
      if (isUserMovingNow()) {
        lastTickReasonRef.current = 'blocked:userMoving';
        return;
      }
      if (preloadTo !== null) {
        lastTickReasonRef.current = 'blocked:preloading';
        return;
      }

      const dwell = minDwellRef.current;
      if (Date.now() - lastAdvanceRef.current < dwell) {
        lastTickReasonRef.current = 'blocked:dwell';
        return;
      }

      const fc = frameCountRef.current;
      const cur = safeFrameIndexRef.current;
      const next = (cur + 1) % fc;

      const nextTemplate = templatesRef.current[next];
      if (!nextTemplate) {
        lastTickReasonRef.current = 'blocked:nextTemplateNull';
        return;
      }

      lastTickReasonRef.current = 'advance';
      lastAdvanceRef.current = Date.now();
      dispatch({ type: 'SET_RADAR_FRAME', frameIndex: next });
    }, PLAY_TICK_MS);

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingLocalImage, state.radarTime.playing, frameCount, preloadTo]);

  /* =========================================================================
   * Labels + stable initial region
   * ========================================================================= */

  const timestampLabel = useMemo(() => {
    const iso = uiFrames[safeFrameIndex]?.iso;
    if (!iso) return 'Latest';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Latest';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [uiFrames, safeFrameIndex]);

  const [stableInitialRegion, setStableInitialRegion] = useState<Region>(() => ({
    latitude: 39.5,
    longitude: -98.35,
    latitudeDelta: 4,
    longitudeDelta: 4,
  }));

  useEffect(() => {
    if (permission !== 'granted' || !location) return;
    setStableInitialRegion((cur) => {
      const isStillDefaultish = Math.abs(cur.latitude - 39.5) < 0.5 && Math.abs(cur.longitude + 98.35) < 0.5 && cur.longitudeDelta >= 3.5;
      if (!isStillDefaultish) return cur;
      return { latitude: location.lat, longitude: location.lon, latitudeDelta: 4, longitudeDelta: 4 };
    });
  }, [permission, location]);

  const recenterToGps = () => {
    if (permission !== 'granted' || !location) return;

    // state
    setAnchorMode('gps');
    setAnchorPoint({ lat: location.lat, lon: location.lon });
    setStableInitialRegion({ latitude: location.lat, longitude: location.lon, latitudeDelta: 4, longitudeDelta: 4 });
    dispatch({ type: 'SET_VIEWPORT', viewport: { center: { lat: location.lat, lon: location.lon }, zoom: 9 } });
    markUserInteraction();

    // camera (immediate UX)
    mapCameraRef.current?.setCamera?.({
      centerCoordinate: [location.lon, location.lat],
      zoomLevel: 9,
      animationDuration: 450,
    });
  };

  const canSwitchProduct = state.nerdy;

  /* =========================================================================
   * tileMaxZ selection (tiles only)
   * ========================================================================= */

  const radarTileMaxZ = useMemo(() => {
    if (usingRainViewer) return (rvProviderRef.current as any)?.maxZoom ?? 10;
    if (usingLocalImage) return 10;
    return 7;
  }, [usingRainViewer, usingLocalImage]);

  const DOCK_ESTIMATED_HEIGHT = 78;
  const dockBottom = 12 + insets.bottom;

  /**
   * WMS Overlays (Clouds / GOES)
   * - gated by your layer state: sat.clouds
   */
  const overlays = useMemo<WmsOverlayConfig[]>(() => {
    if (!cloudsEnabled) return [];
    const op = Math.max(0, Math.min(1, Number(cloudsOpacity)));
    return [
      {
        id: 'goes-conus-ch02',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: op,
        zIndex: 60,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      },
    ];
  }, [cloudsEnabled, cloudsOpacity]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        <MapRenderer
          engine="maplibre"
          initialRegion={stableInitialRegion}
          mapStyle={sheetValue.baseMapStyle}
          cameraRef={mapCameraRef}
          onPanDrag={() => {
            const now = Date.now();
            if (now - lastPanMarkRef.current > 450) {
              lastPanMarkRef.current = now;
              markUserInteraction();
            }
            if (anchorMode !== 'map') setAnchorMode('map');
          }}
          onRegionChangeComplete={(r: Region) => {
            lastRegionRef.current = r;

            const zFloat =
              typeof (r as any).zoom === 'number' && Number.isFinite((r as any).zoom) ? (r as any).zoom : approxZoomFromLongitudeDelta(r.longitudeDelta);

            setMapZoom(zFloat);

            dispatch({
              type: 'SET_VIEWPORT',
              viewport: { center: { lat: r.latitude, lon: r.longitude }, zoom: zFloat },
            });

            if (anchorMode === 'map') debouncedAnchorToMap(r.latitude, r.longitude);

            if (sheetValue.radarProvider === 'iem' && radarEnabled && zFloat >= localMinZoom) {
              debouncedRefreshLocal();
            }
          }}
          radar={{
            enabled: radarEnabled,
            templates: activeRadar.templates,
            opacities: activeRadar.opacities,
            tileMaxZ: radarTileMaxZ,
            localImage: usingLocalImage && localImageUrl && localImageCoords ? { url: localImageUrl, coordinates: localImageCoords, opacity: radarOpacity } : null,
          }}
          overlays={overlays}
        />

        {/* Top controls */}
        <View style={{ position: 'absolute', left: 12, right: 12, top: 8, gap: 10 }}>
          <Glass style={{ paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Maps</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)' }}>{timestampLabel}</Text>

                {state.nerdy ? (
                  <Pressable
                    onPress={() => setRawMode((v) => !v)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.14)',
                      backgroundColor: rawMode ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{rawMode ? 'Raw' : 'Smooth'}</Text>
                  </Pressable>
                ) : null}

                <Pressable
                  onPress={() => {
                    if (state.nerdy && rawMode) setRawMode(false);
                    dispatch({ type: 'SET_NERDY', nerdy: !state.nerdy });
                  }}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: state.nerdy ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{state.nerdy ? 'Nerdy' : 'Simple'}</Text>
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <ViewSelector
                value={state.viewId}
                nerdy={state.nerdy}
                onChange={(id: any) => {
                  const view = String(id).toLowerCase();

                  // Special “Mariner” route -> Nautical Map
                  if (view === 'mariner') {
                    const r = lastRegionRef.current ?? stableInitialRegion;

                    const z =
                      typeof (r as any).zoom === 'number' && Number.isFinite((r as any).zoom) ? (r as any).zoom : mapZoom;

                    router.push({
                      pathname: '/nautical-map',
                      params: {
                        lat: String(r.latitude),
                        lon: String(r.longitude),
                        latDelta: String(r.latitudeDelta),
                        lonDelta: String(r.longitudeDelta),
                        zoom: String(z),
                        from: 'maps',
                        nav: String(Date.now()), 
                      },
                    });
                    return;
                  }

                  if (view === 'astronomer') {
              const r = lastRegionRef.current ?? stableInitialRegion;
              const z =
                typeof (r as any).zoom === 'number' && Number.isFinite((r as any).zoom) ? (r as any).zoom : mapZoom;

              router.push({
                pathname: '/astro-map', // ✅ go straight to the MapLibre screen
                params: {
                  lat: String(r.latitude),
                  lon: String(r.longitude),
                  latDelta: String(r.latitudeDelta),
                  lonDelta: String(r.longitudeDelta),
                  zoom: String(z),
                  from: 'maps',
                  nav: String(Date.now()), // ✅ unique every time
                },
              });
              return;
            }

                  dispatch({ type: 'SET_VIEW', viewId: id });
                }}
              />
            </View>

            {canSwitchProduct && sheetValue.radarProvider === 'iem' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <ChipDark active={product === 'N0Q'} label="N0Q" onPress={() => setProduct('N0Q')} />
                <ChipDark active={product === 'N0B'} label="N0B" onPress={() => setProduct('N0B')} />
                <ChipDark active={product === 'N0Z'} label="N0Z" onPress={() => setProduct('N0Z')} />
              </View>
            ) : null}

            {/* Debug HUD */}
            <View style={{ marginTop: 8 }}>
              <Text style={{ color: 'rgba(255,255,255,0.78)' }}>
                Provider: {sheetValue.radarProvider === 'rainviewer' ? 'RainViewer' : 'IEM'}
                {' · '}Mode: {usingLocalImage ? 'HYPERLOCAL IMAGE' : usingRainViewer ? 'TILES' : 'IEM MOSAIC TILES'}
                {' · '}Frames: {frameCount}
                {' · '}Zoom ~ {Math.round(mapZoom)}
                {' · '}tileMaxZ {radarTileMaxZ}
                {' · '}{state.radarTime.playing ? 'Playing' : 'Paused'}
                {' · '}{lastTickReasonRef.current}
                {isUserMovingNow() ? ' · interacting' : ''}
                {' · '}{profile.label}
                {cloudsEnabled ? ` · Clouds ON (${Math.round(cloudsOpacity * 100)}%)` : ''}
                {rvError ? ` · RV error: ${rvError}` : ''}
                {localError ? ` · Local error: ${localError}` : ''}
              </Text>
            </View>

            {localError ? (
              <View style={{ marginTop: 6 }}>
                <Text style={{ color: 'rgba(255,180,180,0.9)' }}>Local: {localError}</Text>
              </View>
            ) : null}
          </Glass>
        </View>

        {/* Right actions */}
        <View style={{ position: 'absolute', right: 12, top: 140, gap: 10 }}>
          <Fab label="Layers" onPress={() => setLayersSheetOpen(true)} />
          <Fab label="GPS" onPress={recenterToGps} disabled={permission !== 'granted' || !location} />
        </View>

        {/* Legend */}
        <View style={{ position: 'absolute', left: 12, bottom: dockBottom + DOCK_ESTIMATED_HEIGHT + 10 }}>
          <LegendChip title="dBZ">
            <RadarLegend style="generic" />
          </LegendChip>
        </View>

        {/* Bottom scrubber */}
        <BottomDock
          center={
            <Glass style={{ paddingVertical: 8 }}>
              <TimelineScrubber
                state={state}
                frames={uiFrames as any}
                onSetFrame={(frameIndex) => dispatch({ type: 'SET_RADAR_FRAME', frameIndex: clampIndex(frameIndex, frameCount) })}
                onSetPlaying={(playing) => {
                  if (usingLocalImage && playing) {
                    dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
                    return;
                  }
                  if (playing && frameCount < 2) {
                    dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
                    return;
                  }
                  dispatch({ type: 'SET_RADAR_PLAYING', playing });
                }}
              />
            </Glass>
          }
        />

        {/* Layer Sheet */}
        <LayerSheetModal
          visible={layersSheetOpen}
          onClose={() => setLayersSheetOpen(false)}
          nerdy={state.nerdy}
          value={sheetValue}
          onChange={(next) => setSheetValue(next)}
          state={state}
          radarEnabled={radarEnabled}
          wildfireEnabled={wildfireEnabled}
          onToggleRadar={(enabled: boolean) => dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'radar.reflectivity', enabled })}
          onToggleWildfire={(enabled: boolean) => dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'wildfire.perimeters', enabled })}
          onToggleLayer={(layerId, enabled) => dispatch({ type: 'SET_LAYER_ENABLED', layerId, enabled })}
          onSetOpacity={(layerId, opacity) => dispatch({ type: 'SET_LAYER_OPACITY', layerId, opacity })}
        />
      </View>
    </SafeAreaView>
  );
}

/* ============================================================================ */

function ChipDark(props: { label: string; active?: boolean; onPress: () => void }) {
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

function Fab(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(2,6,23,0.72)',
        opacity: props.disabled ? 0.5 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 10,
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900' }}>{props.label}</Text>
    </Pressable>
  );
}
