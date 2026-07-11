import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, PixelRatio } from 'react-native';

import type { RadarOverlay, Region } from '../../../components/maps/MapRenderer';
import { createRainViewerProvider } from './radar/providers/rainviewer';
import type { RadarFrame } from './radar/providers/types';
import {
  iemNationalMosaicTimestamps,
  resolveIemFrames,
  type RadarFrameUnified,
  type RadarProductId,
  type RadarScan,
} from './radarIem';
import type { MapAction } from './state';
import type { MapRuntimeState } from './types';

const OMNI_WORKER_BASE = 'https://omniwx-api.omniwx.workers.dev';

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function isoMs(iso?: string | null) {
  if (!iso) return Number.NaN;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function findNearestFrameIndex(frames: Array<{ iso: string }>, targetIso?: string | null) {
  if (!frames.length) return 0;

  const targetMs = isoMs(targetIso);
  if (!Number.isFinite(targetMs)) return frames.length - 1;

  let bestIdx = 0;
  let bestDt = Number.POSITIVE_INFINITY;

  for (let i = 0; i < frames.length; i++) {
    const ms = isoMs(frames[i]?.iso);
    if (!Number.isFinite(ms)) continue;
    const dt = Math.abs(ms - targetMs);
    if (dt < bestDt) {
      bestDt = dt;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function stableMappedFrameIndex(
  frames: Array<{ iso: string }>,
  targetIso: string | null | undefined,
  currentFrameIndex: number,
) {
  if (!frames.length) return 0;

  const mappedIndex = findNearestFrameIndex(frames, targetIso);
  const currentIndex = clampIndex(currentFrameIndex, frames.length);

  // Provider refreshes can shift the playlist so the nearest timestamp maps to
  // frame 0. That looks like an animation jump. Preserve loop position unless
  // the user was already near the beginning.
  if (mappedIndex === 0 && currentIndex > 1) return currentIndex;

  return mappedIndex;
}

function nextRenderableTileFrameIndex(templates: Array<string | null>, currentFrameIndex: number) {
  if (!templates.length) return currentFrameIndex;

  const currentIndex = clampIndex(currentFrameIndex, templates.length);
  for (let step = 1; step <= templates.length; step++) {
    const index = (currentIndex + step) % templates.length;
    if (templates[index]) return index;
  }

  return currentIndex;
}

function lonLatToMercatorMeters(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return { x, y };
}

function regionToBounds(region: Region, shrink = 0.85) {
  const lonDelta = region.longitudeDelta * shrink;
  const latDelta = region.latitudeDelta * shrink;

  const west = region.longitude - lonDelta / 2;
  const east = region.longitude + lonDelta / 2;
  const south = region.latitude - latDelta / 2;
  const north = region.latitude + latDelta / 2;
  return { west, east, south, north };
}

function buildWorkerWmsUrl(args: {
  product: 'N0Q' | 'N0B' | 'N0Z';
  region: Region;
  widthPx: number;
  heightPx: number;
  timeIso?: string | null;
  shrink?: number;
  dpr?: number;
  fmt?: 'png' | 'png32';
  stormMode?: boolean;
}) {
  const { product, region, widthPx, heightPx, timeIso } = args;

  const shrink = typeof args.shrink === 'number' ? args.shrink : 0.72;
  const dpr = typeof args.dpr === 'number' ? args.dpr : 2.5;
  const fmt = args.fmt ?? 'png32';

  const { west, east, south, north } = regionToBounds(region, 1.0);
  const sw = lonLatToMercatorMeters(west, south);
  const ne = lonLatToMercatorMeters(east, north);
  const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;

  const width = String(Math.max(768, Math.min(3072, Math.floor(widthPx))));
  const height = String(Math.max(768, Math.min(3072, Math.floor(heightPx))));

  const u = new URL(`${OMNI_WORKER_BASE}/v2/radar/wms`);
  u.searchParams.set('product', product);
  u.searchParams.set('bbox', bbox);
  u.searchParams.set('width', width);
  u.searchParams.set('height', height);
  u.searchParams.set('shrink', String(shrink));
  u.searchParams.set('dpr', String(dpr));
  u.searchParams.set('fmt', fmt);
  u.searchParams.set('bgcolor', '0x00000000');
  if (args.stormMode) u.searchParams.set('storm', '1');
  if (timeIso) u.searchParams.set('time', timeIso);

  return u.toString();
}

function localWmsProductForRadar(product: RadarProductId): 'N0Q' | 'N0B' | 'N0Z' | null {
  if (product === 'N0B') return 'N0B';
  if (product === 'N0Z') return 'N0Z';
  if (product === 'N0Q') return 'N0Q';
  return null;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export type AnimationQuality = 'smooth' | 'cinematic' | 'presentation';

function getRadarProfile(zoom: number, raw: boolean, nerdy: boolean, quality: AnimationQuality) {
  const z = Math.max(2, Math.min(12, zoom));

  if (raw) {
    return {
      blendMs: 0,
      dwellMs: 520,
      opacityMult: 1.0,
      enableTemporal3: false,
      label: 'Raw',
    };
  }

  const tune = (profile: {
    blendMs: number;
    dwellMs: number;
    opacityMult: number;
    enableTemporal3: boolean;
    label: string;
  }) => {
    if (quality === 'smooth') {
      return {
        ...profile,
        blendMs: Math.round(profile.blendMs * 0.78),
        dwellMs: Math.round(profile.dwellMs * 1.08),
        enableTemporal3: profile.enableTemporal3 && z <= 5,
        label: profile.label === 'Cinematic' ? 'Smooth' : profile.label,
      };
    }
    if (quality === 'presentation') {
      return {
        ...profile,
        blendMs: Math.round(profile.blendMs * 1.12),
        dwellMs: Math.round(profile.dwellMs * 0.88),
        enableTemporal3: true,
        label: 'Presentation',
      };
    }
    return profile;
  };

  if (z <= 5) {
    return tune({
      blendMs: 900,
      dwellMs: nerdy ? 1550 : 1700,
      opacityMult: nerdy ? 0.82 : 0.76,
      enableTemporal3: true,
      label: 'Smooth (wide)',
    });
  }

  if (z <= 8) {
    return tune({
      blendMs: 760,
      dwellMs: nerdy ? 1325 : 1450,
      opacityMult: nerdy ? 0.92 : 0.86,
      enableTemporal3: true,
      label: 'Cinematic',
    });
  }

  return tune({
    blendMs: 560,
    dwellMs: nerdy ? 1025 : 1125,
    opacityMult: 1.0,
    enableTemporal3: false,
    label: 'Smooth (local)',
  });
}

function getRadarFetchProfile(
  zoom: number,
  provider: 'iem' | 'rainviewer',
  stormMode: boolean,
  quality: AnimationQuality,
) {
  const z = Math.max(2, Math.min(12, zoom));
  const tune = (profile: { maxFrames: number; lookbackMinutes: number }) => {
    if (quality === 'smooth') {
      return {
        maxFrames: Math.max(8, Math.round(profile.maxFrames * 0.72)),
        lookbackMinutes: Math.max(45, Math.round(profile.lookbackMinutes * 0.72)),
      };
    }
    if (quality === 'presentation') {
      return {
        maxFrames: Math.min(30, Math.round(profile.maxFrames * 1.25)),
        lookbackMinutes: Math.min(180, Math.round(profile.lookbackMinutes * 1.35)),
      };
    }
    return profile;
  };

  if (provider === 'rainviewer') {
    if (z <= 5) return tune({ maxFrames: 24, lookbackMinutes: 120 });
    if (z <= 8) return tune({ maxFrames: 22, lookbackMinutes: 110 });
    return tune({ maxFrames: 18, lookbackMinutes: 90 });
  }

  if (stormMode) {
    if (z <= 6) return tune({ maxFrames: 18, lookbackMinutes: 90 });
    if (z <= 9) return tune({ maxFrames: 14, lookbackMinutes: 75 });
    return tune({ maxFrames: 10, lookbackMinutes: 55 });
  }

  if (z <= 5) return tune({ maxFrames: 24, lookbackMinutes: 120 });
  if (z <= 8) return tune({ maxFrames: 22, lookbackMinutes: 110 });
  return tune({ maxFrames: 18, lookbackMinutes: 90 });
}

export type RadarControllerSheetValue = {
  radarProvider: 'iem' | 'rainviewer';
};

function getStormMode(state: any) {
  return state?.viewId === 'storm' || state?.radarTime?.stormMode === true || state?.layers?.['radar.storm']?.enabled === true;
}

function getRadarProductStyle(product: RadarProductId): RadarOverlay['productStyle'] {
  if (product === 'N0U' || product === 'N0S' || product === 'N0Z') return 'velocity';
  if (product === 'EET' || product === 'NET') return 'echoTops';
  return 'reflectivity';
}

export function useRadarController(args: {
  state: MapRuntimeState;
  dispatch: React.Dispatch<MapAction>;
  sheetValue: RadarControllerSheetValue;
  centerForRadar: { lat: number; lon: number };
  mapZoom: number;
  product: RadarProductId;
  rawMode: boolean;
  region: Region | null;
  stationMode?: boolean;
  radarSiteId3?: string | null;
  localMinZoom?: number;
  ridgeMinZoom?: number;
  animationQuality?: AnimationQuality;
  suspendRasterTransitions?: boolean;
  playbackBlocked?: boolean;
}) {
  const { state, dispatch, sheetValue, centerForRadar, mapZoom, product, rawMode, region } = args;
  const animationQuality = args.animationQuality ?? 'cinematic';
  const suspendRasterTransitions = args.suspendRasterTransitions === true;
  const playbackBlocked = args.playbackBlocked === true;
  const stationMode = args.stationMode === true;
  const radarSiteId3 = args.radarSiteId3 ?? null;

  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;
  const stormMode = getStormMode(state);

  const profile = useMemo(
    () => getRadarProfile(mapZoom, rawMode, state.nerdy, animationQuality),
    [mapZoom, rawMode, state.nerdy, animationQuality],
  );
  const fetchProfile = useMemo(
    () => getRadarFetchProfile(mapZoom, sheetValue.radarProvider, stormMode, animationQuality),
    [mapZoom, sheetValue.radarProvider, stormMode, animationQuality],
  );

  const radarOpacity = useMemo(() => {
    const configured = state.layers?.['radar.reflectivity']?.opacity ?? 0.9;
    const base = state.nerdy ? Math.min(1, Math.max(0.55, configured)) : Math.min(1, Math.max(0.75, configured));
    return Math.max(0, Math.min(1, base * profile.opacityMult));
  }, [state.layers, state.nerdy, profile.opacityMult]);

  const localMinZoom = args.localMinZoom ?? 12.0;
  const ridgeMinZoom = args.ridgeMinZoom ?? 10.5;

  const lastRegionRef = useRef<Region | null>(null);
  useEffect(() => {
    if (region) lastRegionRef.current = region;
  }, [region]);

  /* =========================================================================
   * Base IEM frames fallback
   * ========================================================================= */
  const baseNowRef = useRef<number>(Date.now());
  const stamps = useMemo(() => iemNationalMosaicTimestamps(), []);
  const iemFramesFallback: RadarScan[] = useMemo(() => {
    const now = baseNowRef.current;
    const usableMinutes = Array.from({ length: stamps.length }, (_, i) => (stamps.length - 1 - i) * 5);
    return stamps.map((stamp, i) => ({
      stamp,
      iso: new Date(now - usableMinutes[i] * 60_000).toISOString(),
    }));
  }, [stamps]);

  /* =========================================================================
   * RainViewer frames
   * ========================================================================= */
  const rvProviderRef = useRef(
    createRainViewerProvider({
      ttlMs: 60_000,
      includeNowcast: false,
      maxFrames: 24,
      maxZoom: 7,
    }),
  );

  const [rvFrames, setRvFrames] = useState<RadarFrame[] | null>(null);
  const [rvError, setRvError] = useState<string | null>(null);
  const rainViewerSelected = sheetValue.radarProvider === 'rainviewer';

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function run() {
      if (!rainViewerSelected || !radarEnabled) return;

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
    if (rainViewerSelected && radarEnabled) {
      interval = setInterval(run, 60_000);
    } else {
      setRvFrames(null);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [rainViewerSelected, radarEnabled]);

  const usingRainViewer = rainViewerSelected && !!rvFrames?.length;

  /* =========================================================================
   * Hyperlocal WMS image mode
   * ========================================================================= */
  // The hyperlocal WMS image path is reliable for primary reflectivity. In Storm Mode,
  // also allow the alternate reflectivity product for sharper single-site inspection.
  const localWmsProduct = localWmsProductForRadar(product);
  const usingLocalImage =
    sheetValue.radarProvider === 'iem' &&
    radarEnabled &&
    !!localWmsProduct &&
    !state.radarTime.playing &&
    (
      (stationMode && stormMode) ||
      (!stationMode && !state.radarTime.playing && product === 'N0Q' && mapZoom >= localMinZoom) ||
      (stormMode && stationMode && mapZoom > 8)
    );

  const windowSize = Dimensions.get('window');
  const deviceDpr = PixelRatio.get();

  const localImageProfile = useMemo(() => {
    if (stormMode && mapZoom >= 13.5) {
      return {
        maxDimension: 3072,
        minDimension: 1600,
        dpr: 2.7,
        debounceMs: 420,
      };
    }

    if (stormMode && mapZoom >= 11.5) {
      return {
        maxDimension: 2816,
        minDimension: 1400,
        dpr: 2.45,
        debounceMs: 360,
      };
    }

    if (stormMode) {
      return {
        maxDimension: 2304,
        minDimension: 1180,
        dpr: 2.2,
        debounceMs: 300,
      };
    }

    if (mapZoom >= 14) {
      return {
        maxDimension: 2304,
        minDimension: 1180,
        dpr: 2.5,
        debounceMs: 320,
      };
    }

    if (mapZoom >= 13) {
      return {
        maxDimension: 1920,
        minDimension: 1040,
        dpr: 2.25,
        debounceMs: 280,
      };
    }

    return {
      maxDimension: 1600,
      minDimension: 900,
      dpr: 2.0,
      debounceMs: 240,
    };
  }, [mapZoom, stormMode]);

  const imageW = Math.min(
    localImageProfile.maxDimension,
    Math.max(localImageProfile.minDimension, Math.floor(windowSize.width * Math.min(deviceDpr, localImageProfile.dpr))),
  );
  const imageH = Math.min(
    localImageProfile.maxDimension,
    Math.max(localImageProfile.minDimension, Math.floor(windowSize.height * Math.min(deviceDpr, localImageProfile.dpr))),
  );

  const frameCountBase = rainViewerSelected ? (rvFrames?.length ?? 0) : iemFramesFallback.length;
  const safeBaseIndex = clampIndex(state.radarTime.frameIndex, frameCountBase);
  const drivingIso =
    rainViewerSelected ? rvFrames?.[safeBaseIndex]?.iso : iemFramesFallback[safeBaseIndex]?.iso;

  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [localImageCoords, setLocalImageCoords] = useState<
    [[number, number], [number, number], [number, number], [number, number]] | null
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const lastLocalUrlRef = useRef<string | null>(null);
  const lastCoordsKeyRef = useRef<string | null>(null);
  const localDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedRefreshLocal = () => {
    if (localDebounceRef.current) clearTimeout(localDebounceRef.current);

    localDebounceRef.current = setTimeout(() => {
      const r = lastRegionRef.current;
      if (!r) return;

      try {
        setLocalError(null);

        const wmsProduct = localWmsProduct;
        if (!wmsProduct) return;
        const url = buildWorkerWmsUrl({
          product: wmsProduct,
          region: r,
          widthPx: imageW,
          heightPx: imageH,
          timeIso: drivingIso ?? null,
          shrink: stormMode ? 0.68 : 0.78,
          dpr: localImageProfile.dpr,
          fmt: 'png32',
          stormMode,
        });

        const { west, east, south, north } = regionToBounds(r, 1.0);
        const coords: [[number, number], [number, number], [number, number], [number, number]] = [
          [west, north],
          [east, north],
          [east, south],
          [west, south],
        ];

        const coordsKey = coords.flat().join(',');

        if (lastLocalUrlRef.current !== url) {
          lastLocalUrlRef.current = url;
          setLocalImageUrl(url);
        }
        if (lastCoordsKeyRef.current !== coordsKey) {
          lastCoordsKeyRef.current = coordsKey;
          setLocalImageCoords(coords);
        }
      } catch (e: any) {
        setLocalError(String(e?.message ?? e ?? 'Local image build failed'));
      }
    }, localImageProfile.debounceMs);
  };

  useEffect(() => {
    if (!usingLocalImage) return;
    debouncedRefreshLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingLocalImage, product, imageW, imageH, drivingIso, localImageProfile.dpr, localImageProfile.debounceMs, stormMode]);

  /* =========================================================================
   * IEM unified frames
   * ========================================================================= */
  const [iemUnified, setIemUnified] = useState<{
    frames: RadarFrameUnified[];
    mode: 'mosaic' | 'ridge';
    debugLabel: string;
    radarId3?: string;
  } | null>(null);

  const [iemError, setIemError] = useState<string | null>(null);
  const [iemLoading, setIemLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (sheetValue.radarProvider !== 'iem' || !radarEnabled || usingLocalImage) {
        setIemLoading(false);
        return;
      }

      try {
        setIemError(null);
        setIemLoading(true);

        const effectiveRidgeMinZoom = stormMode ? Math.min(ridgeMinZoom, 7.5) : ridgeMinZoom;

        const out = await resolveIemFrames({
          lat: centerForRadar.lat,
          lon: centerForRadar.lon,
          opts: {
            zoom: mapZoom,
            product,
            mosaicMaxZoom: 9,
            ridgeMinZoom: stationMode ? 2 : effectiveRidgeMinZoom,
            maxFrames: fetchProfile.maxFrames,
            lookbackMinutes: fetchProfile.lookbackMinutes,
            maxLocalDistanceKm: stationMode ? 5000 : stormMode ? 260 : 350,
            allowMosaicFallback: !stormMode && !stationMode,
            force: stormMode || stationMode ? 'ridge' : undefined,
            forceRadarId3: stationMode ? radarSiteId3 : null,
          },
        });

        if (cancelled) return;
        setIemUnified(out);
        setIemLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setIemUnified(null);
        setIemError(String(e?.message ?? e ?? 'IEM frames failed'));
        setIemLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [
    sheetValue.radarProvider,
    radarEnabled,
    usingLocalImage,
    stationMode,
    radarSiteId3,
    stormMode,
    centerForRadar.lat,
    centerForRadar.lon,
    mapZoom,
    product,
    fetchProfile.maxFrames,
    fetchProfile.lookbackMinutes,
    ridgeMinZoom,
  ]);

  const iemDebugLabel = iemUnified?.debugLabel ?? null;
  const usingIemRidgeAnimated =
    sheetValue.radarProvider === 'iem' &&
    radarEnabled &&
    !usingLocalImage &&
    iemUnified?.mode === 'ridge';

  /* =========================================================================
   * Live frames/templates
   * ========================================================================= */
  const liveFrames: Array<{ iso: string }> = useMemo(() => {
    let out: Array<{ iso: string }> = [];

    if (rainViewerSelected) {
      out = rvFrames?.map((f) => ({ iso: f.iso })) ?? [];
    } else {
      const frames = iemUnified?.frames;
      if (iemUnified) out = frames?.map((f) => ({ iso: f.iso })) ?? [];
      else out = iemFramesFallback.map((f) => ({ iso: f.iso }));
    }

    return [...out].sort((a, b) => isoMs(a.iso) - isoMs(b.iso));
  }, [rainViewerSelected, rvFrames, iemUnified, iemFramesFallback]);

  const liveTemplates: Array<string | null> = useMemo(() => {
    if (!radarEnabled) return [];
    if (usingLocalImage) return [];

    if (rainViewerSelected) {
      if (!rvFrames?.length) return [];
      return rvFrames
        .map((f) => {
          if (!f?.t || !f?.iso) return null;
          let template: string | null = null;
          try {
            template = rvProviderRef.current.getTileUrlTemplate(f);
          } catch {
            template =
              `${OMNI_WORKER_BASE}/v1/radar/rainviewer/tiles/{z}/{x}/{y}.png` +
              `?ts=${encodeURIComponent(String(f.t))}` +
              `&size=512&color=2&smooth=1&snow=1`;
          }
          return {
            iso: f.iso,
            template,
          };
        })
        .filter(Boolean)
        .sort((a, b) => isoMs(a!.iso) - isoMs(b!.iso))
        .map((x) => x!.template);
    }

    const frames = iemUnified?.frames;
    if (iemUnified) {
      return [...(frames ?? [])]
        .sort((a, b) => isoMs(a.iso) - isoMs(b.iso))
        .map((f) => f.template ?? null);
    }

    return [...iemFramesFallback]
      .sort((a, b) => isoMs(a.iso) - isoMs(b.iso))
      .map(() => null);
  }, [radarEnabled, usingLocalImage, rainViewerSelected, rvFrames, iemUnified, iemFramesFallback]);

  /* =========================================================================
   * Stable playback playlist
   * ========================================================================= */
  const [playFrames, setPlayFrames] = useState<Array<{ iso: string }>>([]);
  const [playTemplates, setPlayTemplates] = useState<Array<string | null>>([]);

  const pendingFramesRef = useRef<Array<{ iso: string }> | null>(null);
  const pendingTemplatesRef = useRef<Array<string | null> | null>(null);
  const autoStartedContextRef = useRef<string | null>(null);

  const framesSignature = useMemo(() => liveFrames.map((f) => f.iso).join('|'), [liveFrames]);
  const templatesSignature = useMemo(() => liveTemplates.join('|'), [liveTemplates]);
  const playlistContextKey = useMemo(
    () => {
      const radarModeKey = stationMode
        ? `station:${stormMode ? 'storm' : 'standard'}:${radarSiteId3 ?? 'auto'}`
        : 'wide';

      return [
        sheetValue.radarProvider,
        radarModeKey,
        stationMode ? product : 'mosaic',
        usingLocalImage ? 'image' : 'tiles',
      ].join('|');
    },
    [sheetValue.radarProvider, stationMode, stormMode, radarSiteId3, product, usingLocalImage],
  );

  useEffect(() => {
    const currentIso =
      lastDisplayedIsoRef.current ??
      playFrames[clampIndex(state.radarTime.frameIndex, playFrames.length)]?.iso ??
      liveFrames[clampIndex(state.radarTime.frameIndex, liveFrames.length)]?.iso ??
      null;

    pendingFramesRef.current = null;
    pendingTemplatesRef.current = null;

    if (stormMode || stationMode) {
      slotHoldRef.current = [null, null, null];
    }

    if (xfadeTimerRef.current) clearInterval(xfadeTimerRef.current);
    xfadeTimerRef.current = null;

    if (!liveFrames.length) {
      if (stormMode || stationMode || !playFrames.length) {
        setPlayFrames([]);
        setPlayTemplates([]);
        prevFrameRef.current = 0;
        setXfade({ from: 0, to: 0, t: 1 });
      }
      return;
    }

    const mappedIndex = stableMappedFrameIndex(
      liveFrames,
      currentIso,
      state.radarTime.frameIndex,
    );

    setPlayFrames(liveFrames);
    setPlayTemplates(liveTemplates);
    prevFrameRef.current = mappedIndex;
    setXfade({ from: mappedIndex, to: mappedIndex, t: 1 });

    if (state.radarTime.frameIndex !== mappedIndex) {
      dispatch({ type: 'SET_RADAR_FRAME', frameIndex: mappedIndex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistContextKey]);

  useEffect(() => {
    if (liveFrames.length) return;
    if (!stormMode && !stationMode) return;

    setPlayFrames([]);
    setPlayTemplates([]);
    pendingFramesRef.current = null;
    pendingTemplatesRef.current = null;
    slotHoldRef.current = [null, null, null];
  }, [liveFrames.length, stationMode, stormMode]);

  useEffect(() => {
    if (!liveFrames.length) return;
    if (!playFrames.length) {
      setPlayFrames(liveFrames);
      setPlayTemplates(liveTemplates);
    }
  }, [liveFrames, liveTemplates, playFrames.length]);

  useEffect(() => {
    if (!liveFrames.length) return;

    if (!state.radarTime.playing) {
      setPlayFrames(liveFrames);
      setPlayTemplates(liveTemplates);
      pendingFramesRef.current = null;
      pendingTemplatesRef.current = null;
      return;
    }

    pendingFramesRef.current = liveFrames;
    pendingTemplatesRef.current = liveTemplates;
  }, [framesSignature, templatesSignature, liveFrames, liveTemplates, state.radarTime.playing]);

  const effectiveFrames = playFrames.length ? playFrames : liveFrames;
  const effectiveTemplates = playTemplates.length ? playTemplates : liveTemplates;

  const frameCount = effectiveFrames.length;
  const safeFrameIndex = clampIndex(state.radarTime.frameIndex, frameCount);

  useEffect(() => {
    if (!radarEnabled || frameCount < 2) {
      if (!radarEnabled) autoStartedContextRef.current = null;
      return;
    }

    const firstUsableIndex = effectiveTemplates.findIndex((template) => !!template);
    if (!usingLocalImage && firstUsableIndex < 0) return;

    if (autoStartedContextRef.current === playlistContextKey) return;
    autoStartedContextRef.current = playlistContextKey;

    const startIndex = firstUsableIndex >= 0 ? firstUsableIndex : safeFrameIndex;
    if (state.radarTime.frameIndex !== startIndex) {
      prevFrameRef.current = startIndex;
      setXfade({ from: startIndex, to: startIndex, t: 1 });
      dispatch({ type: 'SET_RADAR_FRAME', frameIndex: startIndex });
    }
    if (!state.radarTime.playing) {
      dispatch({ type: 'SET_RADAR_PLAYING', playing: true });
    }
  }, [
    dispatch,
    effectiveTemplates,
    frameCount,
    playlistContextKey,
    radarEnabled,
    safeFrameIndex,
    state.radarTime.frameIndex,
    state.radarTime.playing,
  ]);

  const lastDisplayedIsoRef = useRef<string | null>(null);
  useEffect(() => {
    lastDisplayedIsoRef.current = effectiveFrames[safeFrameIndex]?.iso ?? null;
  }, [effectiveFrames, safeFrameIndex]);

  useEffect(() => {
    if (frameCount <= 0) return;
    if (state.radarTime.frameIndex !== safeFrameIndex) {
      dispatch({ type: 'SET_RADAR_FRAME', frameIndex: safeFrameIndex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameCount, safeFrameIndex]);

  const timestampLabel = useMemo(() => {
    const iso = effectiveFrames[safeFrameIndex]?.iso;
    if (!iso) return 'Latest';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'Latest';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [effectiveFrames, safeFrameIndex]);

  /* =========================================================================
   * Crossfade + preload (tile mode only)
   * ========================================================================= */
  type XFadeState = { from: number; to: number; t: number };
  const [xfade, setXfade] = useState<XFadeState>({ from: safeFrameIndex, to: safeFrameIndex, t: 1 });

  const prevFrameRef = useRef<number>(safeFrameIndex);
  const xfadeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (usingLocalImage) return;

    const prev = prevFrameRef.current;
    const next = safeFrameIndex;
    if (prev === next) return;

    if (suspendRasterTransitions) {
      prevFrameRef.current = next;
      setXfade({ from: next, to: next, t: 1 });
      return;
    }

    const prevTpl = effectiveTemplates[clampIndex(prev, effectiveTemplates.length)];
    const nextTpl = effectiveTemplates[clampIndex(next, effectiveTemplates.length)];

    if (prevTpl && nextTpl && prevTpl === nextTpl) {
      prevFrameRef.current = next;
      setXfade({ from: next, to: next, t: 1 });
      return;
    }

    prevFrameRef.current = next;

    if (xfadeTimerRef.current) {
      clearInterval(xfadeTimerRef.current);
      xfadeTimerRef.current = null;
    }

    if (profile.blendMs <= 0) {
      setXfade({ from: next, to: next, t: 1 });
      return;
    }

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
    }, 24);

    return () => {
      if (xfadeTimerRef.current) clearInterval(xfadeTimerRef.current);
      xfadeTimerRef.current = null;
    };
  }, [
    usingLocalImage,
    safeFrameIndex,
    profile.blendMs,
    mapZoom,
    effectiveTemplates,
    effectiveTemplates.length,
    suspendRasterTransitions,
  ]);

  const perFrameOpacities = useMemo(() => {
    const n = effectiveTemplates.length;
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
        const tailMax = 0.025;
        const tail = Math.min(tailMax, radarOpacity * 0.05 * (1 - t));
        out[back] = Math.max(out[back], tail);
      }
    }

    return out;
  }, [effectiveTemplates.length, xfade.from, xfade.to, xfade.t, radarOpacity, profile.blendMs, profile.enableTemporal3, mapZoom]);

  /* =========================================================================
   * Active radar slots (tiles)
   * ========================================================================= */
  const slotHoldRef = useRef<Array<string | null>>([null, null, null]);

  const activeRadar = useMemo(() => {
    const n = effectiveTemplates.length;
    const outTemplates: Array<string | null> = [null, null, null];
    const outOpacities: number[] = [0, 0, 0];
    const warmTemplates: Array<string | null> = [];

    const addWarm = (index: number) => {
      if (n <= 1) return;
      const tpl = effectiveTemplates[clampIndex(index, n)] ?? null;
      if (!tpl) return;
      if (outTemplates.includes(tpl)) return;
      if (warmTemplates.includes(tpl)) return;
      warmTemplates.push(tpl);
    };

    if (usingLocalImage) {
      return { templates: outTemplates, opacities: outOpacities, warmTemplates };
    }

    if (!n) {
      if (stormMode || stationMode) {
        slotHoldRef.current = [null, null, null];
        return { templates: outTemplates, opacities: outOpacities, warmTemplates };
      }
      outTemplates[0] = slotHoldRef.current[0];
      outTemplates[1] = slotHoldRef.current[1];
      outTemplates[2] = slotHoldRef.current[2];
      return { templates: outTemplates, opacities: outOpacities, warmTemplates };
    }

    const from = clampIndex(xfade.from, n);
    const to = clampIndex(xfade.to, n);
    const back = clampIndex(to - 1, n);

    const noBlend = profile.blendMs <= 0 || from === to;
    if (noBlend) {
      outTemplates[0] = effectiveTemplates[to] ?? slotHoldRef.current[0];
      outOpacities[0] = radarOpacity;

      if (outTemplates[0]) slotHoldRef.current[0] = outTemplates[0];
      slotHoldRef.current[1] = null;
      slotHoldRef.current[2] = null;

      addWarm(to + 1);
      addWarm(to + 2);

      return { templates: outTemplates, opacities: outOpacities, warmTemplates };
    }

    outTemplates[0] = effectiveTemplates[from] ?? slotHoldRef.current[0];
    outOpacities[0] = perFrameOpacities[from] ?? 0;

    outTemplates[1] = effectiveTemplates[to] ?? slotHoldRef.current[1];
    outOpacities[1] = perFrameOpacities[to] ?? 0;

    if (profile.enableTemporal3 && mapZoom <= 5 && back !== to) {
      const tailOp = perFrameOpacities[back] ?? 0;
      if (tailOp > 0.02) {
        outTemplates[2] = effectiveTemplates[back] ?? slotHoldRef.current[2];
        outOpacities[2] = tailOp;
      }
    }

    if (outTemplates[0]) slotHoldRef.current[0] = outTemplates[0];
    if (outTemplates[1]) slotHoldRef.current[1] = outTemplates[1];
    if (outTemplates[2]) slotHoldRef.current[2] = outTemplates[2];

    const direction = to >= from ? 1 : -1;
    addWarm(to + direction);
    addWarm(to + direction * 2);

    return { templates: outTemplates, opacities: outOpacities, warmTemplates };
  }, [
    usingLocalImage,
    effectiveTemplates,
    perFrameOpacities,
    xfade.from,
    xfade.to,
    profile.enableTemporal3,
    profile.blendMs,
    radarOpacity,
    mapZoom,
    stationMode,
    stormMode,
  ]);

  /* =========================================================================
   * Playback (tiles only) - forward loop + edge playlist promotion
   * ========================================================================= */
  const END_HOLD_MULTIPLIER = 1.8;
  const STARTUP_ADVANCE_MS = 350;
  const autoAdvancePrimedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!radarEnabled) return;
    if (!state.radarTime.playing) return;
    if (frameCount < 2) return;
    if (playbackBlocked) return;

    const atEnd = safeFrameIndex >= frameCount - 1;
    const advanceKey = `${playlistContextKey}|${frameCount}`;
    const firstAdvanceForPlaylist = autoAdvancePrimedRef.current !== advanceKey;
    const dwellNow = atEnd ? Math.round(profile.dwellMs * END_HOLD_MULTIPLIER) : profile.dwellMs;
    const delayMs = firstAdvanceForPlaylist ? Math.min(STARTUP_ADVANCE_MS, dwellNow) : dwellNow;

    const timer = setTimeout(() => {
      // Only promote provider refreshes at the END of a completed loop. Never
      // promote at frame 0, because that looks like a jump back.
      if (atEnd && pendingFramesRef.current && pendingTemplatesRef.current) {
        const nextFrames = pendingFramesRef.current;
        const nextTemplates = pendingTemplatesRef.current;

        pendingFramesRef.current = null;
        pendingTemplatesRef.current = null;

        const mappedIndex = stableMappedFrameIndex(
          nextFrames,
          lastDisplayedIsoRef.current,
          safeFrameIndex,
        );

        setPlayFrames(nextFrames);
        setPlayTemplates(nextTemplates);

        prevFrameRef.current = mappedIndex;
        setXfade({ from: mappedIndex, to: mappedIndex, t: 1 });

        autoAdvancePrimedRef.current = advanceKey;
        dispatch({ type: 'SET_RADAR_FRAME', frameIndex: mappedIndex });
        return;
      }

      let next = safeFrameIndex >= frameCount - 1 ? 0 : safeFrameIndex + 1;

      if (!usingLocalImage) {
        next = effectiveTemplates[next] ? next : nextRenderableTileFrameIndex(effectiveTemplates, safeFrameIndex);
        if (next === safeFrameIndex) return;
      }

      autoAdvancePrimedRef.current = advanceKey;
      dispatch({ type: 'SET_RADAR_FRAME', frameIndex: next });
    }, delayMs);

    return () => clearTimeout(timer);
  }, [
    dispatch,
    effectiveTemplates,
    frameCount,
    playbackBlocked,
    playlistContextKey,
    profile.dwellMs,
    radarEnabled,
    safeFrameIndex,
    state.radarTime.playing,
    usingLocalImage,
  ]);

  /* =========================================================================
   * tileMaxZ selection
   * ========================================================================= */
  const radarTileMaxZ = useMemo(() => {
    if (usingRainViewer) return (rvProviderRef.current as any)?.maxZoom ?? 10;
    if (usingLocalImage) return 10;

    const frames = iemUnified?.frames;
    if (frames?.length) return Math.max(7, ...frames.map((f) => f.maxZ ?? 7));

    return 9;
  }, [usingRainViewer, usingLocalImage, iemUnified]);

  /* =========================================================================
   * Final switch: localImage vs templates
   * =========================================================================
   */
  const radarOverlay: RadarOverlay = useMemo(() => {
    const productStyle = getRadarProductStyle(product);

    const activeFrameTemplate = effectiveTemplates[safeFrameIndex] ?? '';
    const visibleTemplate =
      activeFrameTemplate ||
      activeRadar.templates.find((template, index) => !!template && (activeRadar.opacities[index] ?? 0) > 0.05) ||
      activeRadar.templates.find((template): template is string => !!template) ||
      '';
    const tileSourceKey = [
      playlistContextKey,
      `frame:${safeFrameIndex}`,
      `template:${visibleTemplate}`,
    ].join('|');

    const localImageSourceKey = [
      playlistContextKey,
      'local-image',
      localImageUrl ?? 'none',
    ].join('|');

    if (!radarEnabled) {
      return {
        enabled: false,
        templates: [],
        opacities: [],
        warmTemplates: [],
        sourceKey: tileSourceKey,
        tileMaxZ: radarTileMaxZ,
        productStyle,
        localImage: null,
      };
    }

    if (usingLocalImage && localImageUrl && localImageCoords) {
      return {
        enabled: true,
        templates: [],
        opacities: [],
        warmTemplates: [],
        sourceKey: localImageSourceKey,
        tileMaxZ: radarTileMaxZ,
        productStyle,
        localImage: {
          url: localImageUrl,
          coordinates: localImageCoords,
          opacity: radarOpacity,
        },
      };
    }

    return {
      enabled: true,
      templates: activeRadar.templates,
      opacities: activeRadar.opacities,
      warmTemplates: activeRadar.warmTemplates,
      sourceKey: tileSourceKey,
      tileMaxZ: radarTileMaxZ,
      productStyle,
      localImage: null,
    };
  }, [
    radarEnabled,
    radarTileMaxZ,
    product,
    usingLocalImage,
    localImageUrl,
    localImageCoords,
    radarOpacity,
    activeRadar.templates,
    activeRadar.opacities,
    activeRadar.warmTemplates,
    playlistContextKey,
    safeFrameIndex,
  ]);

  useEffect(() => {
    if (!__DEV__ || !radarEnabled) return;

    const visibleSlot = activeRadar.opacities.reduce(
      (best, opacity, index) => (opacity > (activeRadar.opacities[best] ?? -1) ? index : best),
      0,
    );
    const visibleTemplate = activeRadar.templates[visibleSlot] ?? null;
    const activeIso = effectiveFrames[safeFrameIndex]?.iso ?? null;
    const previousIso = effectiveFrames[clampIndex(xfade.from, effectiveFrames.length)]?.iso ?? null;
    const nextIso = effectiveFrames[clampIndex(xfade.to, effectiveFrames.length)]?.iso ?? null;

    console.debug('[radar:controller]', {
      frameIndex: safeFrameIndex,
      observationTimestamp: activeIso,
      source: usingRainViewer ? 'rainviewer' : sheetValue.radarProvider,
      product: stationMode ? product : 'mosaic',
      frameIdentifier: visibleTemplate,
      previousFrame: {
        index: clampIndex(xfade.from, effectiveFrames.length),
        timestamp: previousIso,
      },
      targetFrame: {
        index: clampIndex(xfade.to, effectiveFrames.length),
        timestamp: nextIso,
      },
      visibleSlot,
      opacityValues: activeRadar.opacities.map((opacity) => Number(opacity.toFixed(3))),
      complete: !!visibleTemplate,
      pendingPlaylist: !!pendingFramesRef.current,
      skippedReason: visibleTemplate ? null : 'no renderable tile template for active frame',
    });
  }, [
    activeRadar.opacities,
    activeRadar.templates,
    effectiveFrames,
    radarEnabled,
    safeFrameIndex,
    sheetValue.radarProvider,
    stationMode,
    product,
    usingRainViewer,
    xfade.from,
    xfade.to,
  ]);

  return {
    radar: radarOverlay,
    uiFrames: effectiveFrames,
    uiTemplates: effectiveTemplates,
    debug: {
      activeFrameTemplate: effectiveTemplates[safeFrameIndex] ?? null,
      xfade: {
        from: clampIndex(xfade.from, effectiveFrames.length),
        to: clampIndex(xfade.to, effectiveFrames.length),
        t: Number(Math.max(0, Math.min(1, xfade.t)).toFixed(3)),
      },
      dominantSlot: activeRadar.opacities.reduce(
        (best, opacity, index) => (opacity > (activeRadar.opacities[best] ?? -1) ? index : best),
        0,
      ),
      pendingProviderPlaylist: !!pendingFramesRef.current,
    },
    frameCount,
    safeFrameIndex,
    activeFrameIso: effectiveFrames[safeFrameIndex]?.iso ?? null,
    timestampLabel,

    usingRainViewer,
    usingLocalImage,
    radarOpacity,
    radarTileMaxZ,
    profileLabel: profile.label,

    rvError,
    localError,

    iemError,
    iemLoading,
    iemDebugLabel,
    usingIemRidgeAnimated,

    refreshLocalIfNeeded: () => {
      if (!usingLocalImage) return;
      debouncedRefreshLocal();
    },
  };
}
