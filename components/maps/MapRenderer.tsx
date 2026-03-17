// components/maps/MapRenderer.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PixelRatio, View } from 'react-native';

import { OverlayEngine, type WmsOverlayConfig } from './overlays/OverlayEngine';

export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
  zoom?: number;
};

export type RadarLocalImage = {
  url: string;
  coordinates: [[number, number], [number, number], [number, number], [number, number]];
  opacity?: number;
};

export type RadarOverlay = {
  enabled: boolean;
  templates: Array<string | null>;
  opacities: number[];
  tileMaxZ: number;
  localImage?: RadarLocalImage | null;
};

export type MapRendererProps = {
  engine?: 'maplibre';
  initialRegion: Region;
  mapStyle: 'dark' | 'light';
  customMapStyle?: any[];
  onRegionChangeComplete: (r: Region) => void;
  onPanDrag?: () => void;
  radar: RadarOverlay;
  children?: React.ReactNode;
  overlays?: WmsOverlayConfig[];

  cameraRef?: React.RefObject<any>;
  onMapPress?: (e: any) => void;
};

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function lonDeltaFromZoom(z: number) {
  return 360 / Math.pow(2, z);
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function shortHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function regionFromBounds(bounds: any): Region | null {
  if (Array.isArray(bounds) && bounds.length >= 2 && Array.isArray(bounds[0]) && Array.isArray(bounds[1])) {
    const west = Number(bounds[0][0]);
    const south = Number(bounds[0][1]);
    const east = Number(bounds[1][0]);
    const north = Number(bounds[1][1]);
    if ([west, south, east, north].every(Number.isFinite)) {
      return {
        latitude: (south + north) / 2,
        longitude: (west + east) / 2,
        latitudeDelta: Math.max(0.0001, Math.abs(north - south)),
        longitudeDelta: Math.max(0.0001, Math.abs(east - west)),
      };
    }
  }

  const sw = bounds?.sw ?? bounds?.southwest;
  const ne = bounds?.ne ?? bounds?.northeast;
  if (Array.isArray(sw) && Array.isArray(ne) && sw.length >= 2 && ne.length >= 2) {
    const west = Number(sw[0]);
    const south = Number(sw[1]);
    const east = Number(ne[0]);
    const north = Number(ne[1]);
    if ([west, south, east, north].every(Number.isFinite)) {
      return {
        latitude: (south + north) / 2,
        longitude: (west + east) / 2,
        latitudeDelta: Math.max(0.0001, Math.abs(north - south)),
        longitudeDelta: Math.max(0.0001, Math.abs(east - west)),
      };
    }
  }

  return null;
}

function regionFromBoundsPolygon(coords: any): Region | null {
  if (!Array.isArray(coords) || coords.length < 4) return null;

  const lons: number[] = [];
  const lats: number[] = [];

  for (const c of coords) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      lons.push(lon);
      lats.push(lat);
    }
  }

  if (lons.length < 2 || lats.length < 2) return null;

  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(0.0001, maxLat - minLat),
    longitudeDelta: Math.max(0.0001, maxLon - minLon),
  };
}

const MAPLIBRE_DARK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const MAPLIBRE_LIGHT_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export function MapRenderer(props: MapRendererProps) {
  const { initialRegion, mapStyle, onRegionChangeComplete, onPanDrag, radar, overlays, children, onMapPress } = props;

  const internalCameraRef = useRef<any>(null);
  const cameraRef = props.cameraRef ?? internalCameraRef;

  const mapStyleUrl = mapStyle === 'dark' ? MAPLIBRE_DARK_STYLE_URL : MAPLIBRE_LIGHT_STYLE_URL;

  const initialCamera = useMemo(() => {
    const centerCoordinate: [number, number] = [initialRegion.longitude, initialRegion.latitude];
    const zoomLevel = approxZoomFromLongitudeDelta(initialRegion.longitudeDelta);
    return { centerCoordinate, zoomLevel };
  }, [initialRegion.latitude, initialRegion.longitude, initialRegion.longitudeDelta]);

  const [liveZoom, setLiveZoom] = useState<number>(initialCamera.zoomLevel);
  const lastRegionRef = useRef<Region>(initialRegion);

  const [layout, setLayout] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dpr = PixelRatio.get();
  const overlayW = Math.max(0, Math.floor(layout.w * dpr));
  const overlayH = Math.max(0, Math.floor(layout.h * dpr));

  const [degradedUntil, setDegradedUntil] = useState<number>(0);
  const burstRef = useRef<{ t0: number; n: number }>({ t0: 0, n: 0 });

  useEffect(() => {
    if (!(MapLibreGL as any)?.Logger?.setLogCallback) return;

    (MapLibreGL as any).Logger.setLogCallback((log: any) => {
      try {
        const msg: string = String(log?.message ?? '');
        const lvl: string = String(log?.level ?? '');

        const isRadar = msg.includes('source radar-src-') || msg.includes('source radar-img-src-');
        const is503 = msg.includes('HTTP status code 503');

        if ((lvl === 'error' || lvl === 'warning') && isRadar && is503) {
          const now = Date.now();
          const windowMs = 3500;

          if (!burstRef.current.t0 || now - burstRef.current.t0 > windowMs) {
            burstRef.current = { t0: now, n: 1 };
          } else {
            burstRef.current.n += 1;
          }

          if (burstRef.current.n >= 4) {
            const until = now + 25_000;
            setDegradedUntil((cur) => Math.max(cur, until));
            burstRef.current = { t0: now, n: 0 };
          }
        }
      } catch {
        // ignore
      }
      return false;
    });
  }, []);

  const isDegraded = Date.now() < degradedUntil;

  const lastKeyRef = useRef<string>('');
  useEffect(() => {
    const key = `${initialRegion.latitude.toFixed(5)}:${initialRegion.longitude.toFixed(5)}:${initialRegion.longitudeDelta.toFixed(5)}`;

    if (!lastKeyRef.current) {
      lastKeyRef.current = key;
      return;
    }
    if (lastKeyRef.current === key) return;

    lastKeyRef.current = key;

    const z = approxZoomFromLongitudeDelta(initialRegion.longitudeDelta);
    setLiveZoom(z);

    cameraRef.current?.setCamera?.({
      centerCoordinate: initialCamera.centerCoordinate,
      zoomLevel: initialCamera.zoomLevel,
      animationDuration: 350,
    });
  }, [initialCamera.centerCoordinate, initialCamera.zoomLevel, initialRegion, cameraRef]);

  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActiveRef = useRef(false);
  const userEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleEmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isUserInteracting, setIsUserInteracting] = useState(false);

  const emitRegion = () => {
    onRegionChangeComplete(lastRegionRef.current);
  };

  const handleRegionDidChange = (e: any) => {
    const isUser = !!e?.properties?.isUserInteraction;

    const zRaw = e?.properties?.zoomLevel;
    const zoom = typeof zRaw === 'number' && Number.isFinite(zRaw) ? clamp(zRaw, 1, 20) : null;
    if (zoom !== null) setLiveZoom(zoom);

    const coords = e?.geometry?.coordinates?.[0];
    const polyRegion = regionFromBoundsPolygon(coords);

    const center = e?.properties?.centerCoordinate ?? e?.properties?.center;

    let nextRegion: Region | null = null;

    if (polyRegion) nextRegion = { ...polyRegion, zoom: zoom ?? lastRegionRef.current?.zoom };

    if (!nextRegion && Array.isArray(center) && center.length >= 2) {
      const lon = Number(center[0]);
      const lat = Number(center[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const lonDelta =
          zoom !== null ? lonDeltaFromZoom(zoom) : lastRegionRef.current?.longitudeDelta ?? initialRegion.longitudeDelta;
        const latDelta = Math.max(0.0001, lonDelta * 0.6);
        nextRegion = {
          latitude: lat,
          longitude: lon,
          latitudeDelta: latDelta,
          longitudeDelta: lonDelta,
          zoom: zoom ?? lastRegionRef.current?.zoom,
        };
      }
    }

    if (!nextRegion) {
      const bounds =
        e?.properties?.visibleBounds ?? e?.properties?.bounds ?? e?.properties?.visibleExtent ?? e?.properties?.region;
      const r = regionFromBounds(bounds);
      if (r) {
        const z2 = zoom ?? approxZoomFromLongitudeDelta(r.longitudeDelta);
        setLiveZoom(z2);
        nextRegion = { ...r, zoom: z2 };
      }
    }

    if (nextRegion) lastRegionRef.current = nextRegion;

    if (isUser && !userActiveRef.current) {
      userActiveRef.current = true;
      setIsUserInteracting(true);
      onPanDrag?.();
    }

    if (isUser) {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      regionDebounceRef.current = setTimeout(() => emitRegion(), 200);

      if (userEndTimerRef.current) clearTimeout(userEndTimerRef.current);
      userEndTimerRef.current = setTimeout(() => {
        userActiveRef.current = false;
        setIsUserInteracting(false);
        emitRegion();
      }, 250);
    } else {
      if (idleEmitTimerRef.current) clearTimeout(idleEmitTimerRef.current);
      idleEmitTimerRef.current = setTimeout(() => {
        if (!userActiveRef.current) emitRegion();
      }, 350);
    }
  };

  const localImage = radar.localImage ?? null;
  const useLocalImage = radar.enabled && !!localImage?.url && !!localImage?.coordinates?.length;

  const maxSlots = useMemo(() => {
    if (isDegraded) return 1;
    if (liveZoom >= 10.0) return 1;
    return 3;
  }, [isDegraded, liveZoom]);

  const radarTemplates = useMemo(() => {
    const base = radar.templates ?? [];
    if (!base.length) return [] as Array<string | null>;
    return base.slice(0, maxSlots);
  }, [radar.templates, maxSlots]);

  const radarOpacities = useMemo(() => {
    const base = radar.opacities ?? [];
    if (!base.length) return [] as number[];
    return base.slice(0, maxSlots);
  }, [radar.opacities, maxSlots]);

  const requestMaxZ = useMemo(() => {
    const providerMax = Math.max(0, Math.floor(radar.tileMaxZ ?? 10));
    return clamp(providerMax, 0, providerMax);
  }, [radar.tileMaxZ]);

  const layerMaxZ = 24;
  const rasterResampling: 'linear' | 'nearest' = 'linear';

  // Temporarily 0 while diagnosing jumps. If this fixes the feel,
  // you can later try 60-90 instead of 120.
  const rasterFadeDuration = 0;

  const radarRasterStyle = (opacity: number) => {
    const safeOpacity = clamp(opacity, 0, 1);
    const zoomSoftener = liveZoom < 9.5 ? 0.85 : liveZoom < 10.5 ? 0.92 : 1.0;

    return {
      rasterOpacity: safeOpacity * zoomSoftener,
      rasterResampling,
      rasterFadeDuration,
      rasterSaturation: -0.2,
      rasterContrast: 0.12,
      rasterBrightnessMin: 0.10,
      rasterBrightnessMax: 0.92,
    } as any;
  };

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout?.width ?? 0;
        const h = e.nativeEvent.layout?.height ?? 0;
        setLayout({ w, h });
      }}
    >
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        mapStyle={mapStyleUrl}
        logoEnabled={false}
        attributionEnabled={false}
        onRegionDidChange={handleRegionDidChange}
        onPress={onMapPress}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{ centerCoordinate: initialCamera.centerCoordinate, zoomLevel: initialCamera.zoomLevel }}
          animationDuration={0}
        />

        {overlays?.length && overlayW > 0 && overlayH > 0 ? (
          <OverlayEngine
            region={lastRegionRef.current}
            width={overlayW}
            height={overlayH}
            overlays={overlays}
            isUserInteracting={isUserInteracting}
          />
        ) : null}

        {useLocalImage
          ? (() => {
              const url = String(localImage!.url);
              const coords = localImage!.coordinates;
              const opacity = clamp(Number(localImage!.opacity ?? 1), 0, 1);

              const srcId = 'radar-img-src';
              const lyrId = 'radar-img-lyr';

              return (
                <MapLibreGL.ImageSource id={srcId} key={srcId} url={url} coordinates={coords}>
                  <MapLibreGL.RasterLayer
                    id={lyrId}
                    sourceID={srcId}
                    maxZoomLevel={layerMaxZ}
                    style={radarRasterStyle(opacity)}
                  />
                </MapLibreGL.ImageSource>
              );
            })()
          : null}

        {!useLocalImage && radar.enabled
          ? radarTemplates.map((tpl, slotIdx) => {
              if (!tpl) return null;

              const opacity = Number.isFinite(radarOpacities[slotIdx]) ? radarOpacities[slotIdx] : 0;

              // Force remount when template changes.
              // This is the most likely regression fix for animated radar.
              const tplKey = shortHash(tpl);
              const srcId = `radar-src-${slotIdx}-${tplKey}`;
              const lyrId = `radar-lyr-${slotIdx}-${tplKey}`;

              return (
                <MapLibreGL.RasterSource
                  key={srcId}
                  id={srcId}
                  tileUrlTemplates={[tpl]}
                  tileSize={256}
                  maxZoomLevel={requestMaxZ}
                >
                  <MapLibreGL.RasterLayer
                    id={lyrId}
                    sourceID={srcId}
                    maxZoomLevel={layerMaxZ}
                    style={radarRasterStyle(opacity)}
                  />
                </MapLibreGL.RasterSource>
              );
            })
          : null}

        {children}
      </MapLibreGL.MapView>
    </View>
  );
}