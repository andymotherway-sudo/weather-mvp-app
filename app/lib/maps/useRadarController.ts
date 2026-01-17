// app/lib/maps/useRadarController.ts
//
// Shared radar controller for MapRenderer.
// Extracted from maps.tsx so multiple tabs (Maps + Nautical super-map) can reuse radar logic.
//
// Usage:
//   const radarCtl = useRadarController({ state, dispatch, sheetValue, centerForRadar, mapZoom, product, rawMode, region });
//
// Then pass to MapRenderer:
//   radar={radarCtl.radar}
// And use for UI:
//   radarCtl.uiFrames, radarCtl.timestampLabel, radarCtl.usingLocalImage, radarCtl.radarTileMaxZ, radarCtl.errors...

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, PixelRatio } from 'react-native';

import type { RadarOverlay, Region } from '../../../components/maps/MapRenderer';
import type { MapAction } from './state';
import type { MapRuntimeState } from './types';

// IEM logic (you already have this)
import {
    iemNationalMosaicTimestamps,
    resolveRadarLayer,
    type RadarScan,
} from './radarIem';

// RainViewer (you already have this)
import { createRainViewerProvider } from './radar/providers/rainviewer';
import type { RadarFrame } from './radar/providers/types';

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

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

const IEM_WMS_BASE = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad';

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

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getRadarProfile(zoom: number, raw: boolean, nerdy: boolean) {
  const z = Math.max(2, Math.min(12, zoom));
  if (raw) return { blendMs: 0, dwellMs: 700, opacityMult: 1.0, enableTemporal3: false, label: 'Raw' };
  if (z <= 5)
    return { blendMs: 900, dwellMs: nerdy ? 2000 : 2200, opacityMult: nerdy ? 0.82 : 0.76, enableTemporal3: true, label: 'Smooth (wide)' };
  if (z <= 8) return { blendMs: 700, dwellMs: nerdy ? 1650 : 1800, opacityMult: nerdy ? 0.92 : 0.86, enableTemporal3: false, label: 'Smooth' };
  return { blendMs: 420, dwellMs: nerdy ? 1200 : 1350, opacityMult: 1.0, enableTemporal3: false, label: 'Smooth (local)' };
}

export type RadarControllerSheetValue = {
  radarProvider: 'iem' | 'rainviewer';
};

export function useRadarController(args: {
  state: MapRuntimeState;
  dispatch: React.Dispatch<MapAction>;
  sheetValue: RadarControllerSheetValue;

  // “anchor” used for choosing the best radar source
  centerForRadar: { lat: number; lon: number };

  // current map zoom (float ok)
  mapZoom: number;

  // NEXRAD product (nerdy-only in UI, but the controller supports it always)
  product: 'N0Q' | 'N0B' | 'N0Z';

  // raw vs smooth
  rawMode: boolean;

  // the latest region emitted by MapRenderer (used to build local WMS image bounds)
  region: Region | null;

  // optional tuning
  localMinZoom?: number;
}) {
  const { state, dispatch, sheetValue, centerForRadar, mapZoom, product, rawMode, region } = args;

  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;

  const profile = useMemo(
    () => getRadarProfile(mapZoom, rawMode, state.nerdy),
    [mapZoom, rawMode, state.nerdy],
  );

  const radarOpacity = useMemo(() => {
    const configured = state.layers?.['radar.reflectivity']?.opacity ?? 0.9;
    const base = state.nerdy ? Math.min(1, Math.max(0.55, configured)) : Math.min(1, Math.max(0.75, configured));
    return Math.max(0, Math.min(1, base * profile.opacityMult));
  }, [state.layers, state.nerdy, profile.opacityMult]);

  const localMinZoom = args.localMinZoom ?? 9.5;

  // Track last region (so we can rebuild local image on timer/changes)
  const lastRegionRef = useRef<Region | null>(null);
  useEffect(() => {
    if (region) lastRegionRef.current = region;
  }, [region]);

  /* =========================================================================
   * Frames: IEM Mosaic vs RainViewer
   * ========================================================================= */

  const baseNowRef = useRef<number>(Date.now());
  const stamps = useMemo(() => iemNationalMosaicTimestamps(), []);
  const iemFrames: RadarScan[] = useMemo(() => {
    const now = baseNowRef.current;
    const usableMinutes = Array.from({ length: stamps.length }, (_, i) => (stamps.length - 1 - i) * 5);
    return stamps.map((stamp, i) => ({
      stamp,
      iso: new Date(now - usableMinutes[i] * 60_000).toISOString(),
    }));
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
      if (!radarEnabled) return;
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
  }, [sheetValue.radarProvider, radarEnabled]);

  const usingRainViewer = sheetValue.radarProvider === 'rainviewer' && !!rvFrames?.length;

  /* =========================================================================
   * Hyperlocal mode (single WMS image)
   * ========================================================================= */

  const usingLocalImage =
    sheetValue.radarProvider === 'iem' && radarEnabled && mapZoom >= localMinZoom;

  const windowSize = Dimensions.get('window');
  const dpr = PixelRatio.get();
  const imageW = Math.min(1536, Math.max(512, Math.floor(windowSize.width * dpr)));
  const imageH = Math.min(1536, Math.max(512, Math.floor(windowSize.height * dpr)));

  const frameCountBase = usingRainViewer && rvFrames ? rvFrames.length : iemFrames.length;
  const safeBaseIndex = clampIndex(state.radarTime.frameIndex, frameCountBase);
  const drivingIso = usingRainViewer && rvFrames
    ? rvFrames[safeBaseIndex]?.iso
    : iemFrames[safeBaseIndex]?.iso;

  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [localImageCoords, setLocalImageCoords] = useState<
    [[number, number], [number, number], [number, number], [number, number]] | null
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // debounce (local image rebuild)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefreshLocal = () => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
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
  };

  useEffect(() => {
    if (!usingLocalImage) return;
    debouncedRefreshLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingLocalImage, product, imageW, imageH, drivingIso]);

  // If local image is on, pause playing (same as maps.tsx)
  useEffect(() => {
    if (usingLocalImage && state.radarTime.playing) {
      dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingLocalImage]);

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

  const timestampLabel = useMemo(() => {
    const iso = uiFrames[safeFrameIndex]?.iso;
    if (!iso) return 'Latest';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Latest';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [uiFrames, safeFrameIndex]);

  /* =========================================================================
   * Templates (tile mode)
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
  }, [
    radarEnabled,
    usingLocalImage,
    usingRainViewer,
    rvFrames,
    iemFrames,
    centerForRadar.lat,
    centerForRadar.lon,
    mapZoom,
    product,
    localMinZoom,
  ]);

  const templates = computedTemplates;

  /* =========================================================================
   * Crossfade + preload (tile mode only)
   * ========================================================================= */

  const [preloadTo, setPreloadTo] = useState<number | null>(null);
  type XFadeState = { from: number; to: number; t: number };
  const [xfade, setXfade] = useState<XFadeState>({
    from: safeFrameIndex,
    to: safeFrameIndex,
    t: 1,
  });
  const prevFrameRef = useRef<number>(safeFrameIndex);

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
  }, [
    templates.length,
    xfade.from,
    xfade.to,
    xfade.t,
    radarOpacity,
    profile.blendMs,
    profile.enableTemporal3,
    mapZoom,
  ]);

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

    if (usingLocalImage) return;

    if (!state.radarTime.playing) return;

    if (frameCount < 2) {
      dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
      return;
    }

    playTimerRef.current = setInterval(() => {
      if (!playingRef.current) return;
      if (!radarEnabledRef.current) return;
      if (preloadTo !== null) return;

      const dwell = minDwellRef.current;
      if (Date.now() - lastAdvanceRef.current < dwell) return;

      const fc = frameCountRef.current;
      const cur = safeFrameIndexRef.current;
      const next = (cur + 1) % fc;

      const nextTemplate = templatesRef.current[next];
      if (!nextTemplate) return;

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
   * tileMaxZ selection (tiles only)
   * ========================================================================= */

  const radarTileMaxZ = useMemo(() => {
    if (usingRainViewer) return (rvProviderRef.current as any)?.maxZoom ?? 10;
    if (usingLocalImage) return 10;
    return 7;
  }, [usingRainViewer, usingLocalImage]);

  const radarOverlay: RadarOverlay = useMemo(() => {
    if (!radarEnabled) {
      return { enabled: false, templates: [], opacities: [], tileMaxZ: radarTileMaxZ, localImage: null };
    }

    // Local WMS image mode
    if (
      usingLocalImage &&
      localImageUrl &&
      localImageCoords
    ) {
      return {
        enabled: true,
        templates: [],
        opacities: [],
        tileMaxZ: radarTileMaxZ,
        localImage: { url: localImageUrl, coordinates: localImageCoords, opacity: radarOpacity },
      };
    }

    // Tiles mode
    return {
      enabled: true,
      templates: activeRadar.templates,
      opacities: activeRadar.opacities,
      tileMaxZ: radarTileMaxZ,
      localImage: null,
    };
  }, [
    radarEnabled,
    radarTileMaxZ,
    usingLocalImage,
    localImageUrl,
    localImageCoords,
    radarOpacity,
    activeRadar.templates,
    activeRadar.opacities,
  ]);

  return {
    // What MapRenderer needs
    radar: radarOverlay,

    // For UI (scrubber + label + debug)
    uiFrames,
    frameCount,
    safeFrameIndex,
    timestampLabel,

    // Flags + tuning
    usingRainViewer,
    usingLocalImage,
    radarOpacity,
    radarTileMaxZ,
    profileLabel: profile.label,

    // Errors
    rvError,
    localError,

    // If a caller wants to force a local refresh after region changes:
    refreshLocalIfNeeded: () => {
      if (!usingLocalImage) return;
      debouncedRefreshLocal();
    },
  };
}
