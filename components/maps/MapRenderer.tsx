// components/maps/MapRenderer.tsx
import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

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
  templates: (string | null)[];
  opacities: number[];
  warmTemplates?: (string | null)[];
  tileMaxZ: number;
  sourceKey?: string;
  productStyle?: 'reflectivity' | 'velocity' | 'echoTops';
  localImage?: RadarLocalImage | null;
};

const RADAR_CRISP_MIN_ZOOM = 10.5;

export type MapRendererProps = {
  engine?: 'maplibre';
  initialRegion: Region;
  mapStyle: 'dark' | 'light';
  customMapStyle?: any[];
  boundaryReliefTone?: 'teal' | 'orange' | null;
  regionEventMode?: 'continuous' | 'settled';
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

function radarTileSizeForTemplate(template?: string | null) {
  if (!template) return 256;
  try {
    const size = new URL(template.replace('{z}', '0').replace('{x}', '0').replace('{y}', '0')).searchParams.get('size');
    return size === '512' ? 512 : 256;
  } catch {
    return template.includes('size=512') ? 512 : 256;
  }
}

function safeMapSourceKey(value?: string | null) {
  const raw = value?.trim() || 'default';
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  const suffix = Math.abs(hash).toString(36);
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 56) || 'default';
  return `${cleaned}-${suffix}`;
}

function radarTemplateKey(template?: string | null) {
  if (!template) return 'empty';
  let hash = 0;
  for (let i = 0; i < template.length; i += 1) {
    hash = (hash * 33 + template.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
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
const BOUNDARY_VECTOR_SOURCE_URL = 'https://tiles.basemaps.cartocdn.com/vector/carto.streets/v1/tiles.json';
const MAPTILER_API_KEY = process.env.EXPO_PUBLIC_MAPTILER_API_KEY?.trim();

function mapStyleUrlFor(style: 'dark' | 'light') {
  if (!MAPTILER_API_KEY) {
    return style === 'dark' ? MAPLIBRE_DARK_STYLE_URL : MAPLIBRE_LIGHT_STYLE_URL;
  }

  const mapId = style === 'dark' ? 'dataviz-v4-dark' : 'dataviz-v4-light';
  return `https://api.maptiler.com/maps/${mapId}/style.json?key=${encodeURIComponent(MAPTILER_API_KEY)}`;
}

const BOUNDARY_RELIEF = {
  teal: {
    glow: 'rgba(45,212,191,0.90)',
    core: 'rgba(153,246,228,0.96)',
    county: 'rgba(94,234,212,0.46)',
  },
  orange: {
    glow: 'rgba(251,146,60,0.96)',
    core: 'rgba(255,237,213,0.98)',
    county: 'rgba(253,186,116,0.52)',
  },
} as const;

function BoundaryReliefLayers({ tone }: { tone: 'teal' | 'orange' }) {
  const palette = BOUNDARY_RELIEF[tone];

  return (
    <MapLibreGL.VectorSource id={`boundary-relief-source-${tone}`} url={BOUNDARY_VECTOR_SOURCE_URL}>
      <MapLibreGL.LineLayer
        id={`boundary-country-glow-${tone}`}
        sourceLayerID="boundary"
        layerIndex={901}
        minZoomLevel={1}
        filter={['all', ['==', 'admin_level', 2], ['==', 'maritime', 0]] as any}
        style={{
          lineColor: palette.glow,
          lineOpacity: ['interpolate', ['linear'], ['zoom'], 1, 0.38, 4, 0.66, 7, 0.82],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 1.2, 4, 2.4, 7, 4.2],
          lineBlur: ['interpolate', ['linear'], ['zoom'], 1, 0.8, 4, 1.3, 7, 1.8],
        } as any}
      />

      <MapLibreGL.LineLayer
        id={`boundary-country-core-${tone}`}
        sourceLayerID="boundary"
        layerIndex={902}
        minZoomLevel={1}
        filter={['all', ['==', 'admin_level', 2], ['==', 'maritime', 0]] as any}
        style={{
          lineColor: palette.core,
          lineOpacity: ['interpolate', ['linear'], ['zoom'], 1, 0.42, 4, 0.82, 7, 0.96],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 1.2, 7, 2.0],
        } as any}
      />

      <MapLibreGL.LineLayer
        id={`boundary-state-glow-${tone}`}
        sourceLayerID="boundary"
        layerIndex={903}
        minZoomLevel={3}
        filter={['all', ['==', 'admin_level', 4], ['==', 'maritime', 0]] as any}
        style={{
          lineColor: palette.glow,
          lineOpacity: ['interpolate', ['linear'], ['zoom'], 3, 0.48, 6, 0.78, 10, 0.96],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 3, 1.5, 6, 3.0, 10, 5.2],
          lineBlur: ['interpolate', ['linear'], ['zoom'], 3, 0.9, 6, 1.5, 10, 2.1],
        } as any}
      />

      <MapLibreGL.LineLayer
        id={`boundary-state-core-${tone}`}
        sourceLayerID="boundary"
        layerIndex={904}
        minZoomLevel={3}
        filter={['all', ['==', 'admin_level', 4], ['==', 'maritime', 0]] as any}
        style={{
          lineColor: palette.core,
          lineOpacity: ['interpolate', ['linear'], ['zoom'], 3, 0.56, 6, 0.90, 10, 1.0],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 3, 0.75, 6, 1.5, 10, 2.6],
        } as any}
      />

      <MapLibreGL.LineLayer
        id={`boundary-county-core-${tone}`}
        sourceLayerID="boundary"
        layerIndex={905}
        minZoomLevel={7}
        filter={['all', ['==', 'admin_level', 6], ['==', 'maritime', 0]] as any}
        style={{
          lineColor: palette.county,
          lineOpacity: ['interpolate', ['linear'], ['zoom'], 7, 0.0, 8, 0.20, 10, 0.42, 12, 0.58],
          lineWidth: ['interpolate', ['linear'], ['zoom'], 7, 0.25, 10, 0.55, 12, 0.85],
        } as any}
      />
    </MapLibreGL.VectorSource>
  );
}

export function MapRenderer(props: MapRendererProps) {
  const {
    initialRegion,
    mapStyle,
    boundaryReliefTone,
    regionEventMode = 'continuous',
    onRegionChangeComplete,
    onPanDrag,
    radar,
    overlays,
    children,
    onMapPress,
  } = props;

  const internalCameraRef = useRef<any>(null);
  const cameraRef = props.cameraRef ?? internalCameraRef;

  const mapStyleUrl = mapStyleUrlFor(mapStyle);

  const mountInitialRegionRef = useRef<Region>(initialRegion);
  const startRegion = mountInitialRegionRef.current;
  const mountInitialCameraRef = useRef<{
    centerCoordinate: [number, number];
    zoomLevel: number;
  }>({
    centerCoordinate: [startRegion.longitude, startRegion.latitude],
    zoomLevel: approxZoomFromLongitudeDelta(startRegion.longitudeDelta),
  });
  const initialCamera = mountInitialCameraRef.current;

  const [liveZoom, setLiveZoom] = useState<number>(initialCamera.zoomLevel);
  const lastRegionRef = useRef<Region>(mountInitialRegionRef.current);

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

  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userActiveRef = useRef(false);
  const userEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      if (userEndTimerRef.current) clearTimeout(userEndTimerRef.current);
    };
  }, []);

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
          zoom !== null
            ? lonDeltaFromZoom(zoom)
            : lastRegionRef.current?.longitudeDelta ?? mountInitialRegionRef.current.longitudeDelta;
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
      onPanDrag?.();
    }

    if (regionEventMode === 'continuous') {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      regionDebounceRef.current = setTimeout(() => emitRegion(), 200);
    }

    if (userEndTimerRef.current) clearTimeout(userEndTimerRef.current);
    userEndTimerRef.current = setTimeout(() => {
      userActiveRef.current = false;
      emitRegion();
    }, isUser ? 250 : 80);

    if (!isUser && regionEventMode !== 'continuous') {
      emitRegion();
    }
  };

  const localImage = radar.localImage ?? null;
  const useLocalImage = radar.enabled && !!localImage?.url && !!localImage?.coordinates?.length;
  const radarSourceKey = useMemo(() => safeMapSourceKey(radar.sourceKey), [radar.sourceKey]);

  const maxSlots = useMemo(() => {
    if (isDegraded) return 1;
    const hasPreloadSlot = !!radar.templates?.[1];
    const activeRadarSlots = (radar.templates ?? []).filter((tpl, idx) => {
      const opacity = radar.opacities?.[idx] ?? 0;
      return !!tpl && opacity > 0.001;
    }).length;
    if (activeRadarSlots >= 2) return 2;
    if (hasPreloadSlot) return 2;
    if (liveZoom >= 8.5) return 1;
    return 2;
  }, [isDegraded, liveZoom, radar.opacities, radar.templates]);

  const warmRadarTemplates = useMemo(() => {
    if (useLocalImage || isDegraded) return [] as string[];
    return (radar.warmTemplates ?? []).filter((tpl): tpl is string => !!tpl).slice(0, liveZoom >= 8.5 ? 1 : 2);
  }, [isDegraded, liveZoom, radar.warmTemplates, useLocalImage]);

  const radarTemplates = useMemo(() => {
    const base = radar.templates ?? [];
    if (!base.length) return [] as (string | null)[];
    return base.slice(0, maxSlots);
  }, [radar.templates, maxSlots]);

  const radarOpacities = useMemo(() => {
    const base = radar.opacities ?? [];
    if (!base.length) return [] as number[];
    return base.slice(0, maxSlots);
  }, [radar.opacities, maxSlots]);

  const requestMaxZ = useMemo(() => {
    const providerMax = Math.max(0, Math.floor(radar.tileMaxZ ?? 10));
    return clamp(providerMax, 0, 22);
  }, [radar.tileMaxZ]);

  const layerMaxZ = 24;
  const radarResampling: 'linear' | 'nearest' = liveZoom >= RADAR_CRISP_MIN_ZOOM ? 'nearest' : 'linear';

  const rasterFadeDuration = 0;

  const radarRasterStyle = (opacity: number) => {
    const safeOpacity = clamp(opacity, 0, 1);
    const zoomSoftener = liveZoom < 9.5 ? 0.85 : liveZoom < 10.5 ? 0.92 : 1.0;
    const productStyle = radar.productStyle ?? 'reflectivity';
    const productTuning =
      productStyle === 'velocity'
        ? { saturation: -0.05, contrast: 0.18, brightnessMin: 0.08, brightnessMax: 0.96 }
        : productStyle === 'echoTops'
          ? { saturation: 0, contrast: 0, brightnessMin: 0, brightnessMax: 1.0 }
          : { saturation: -0.2, contrast: 0.12, brightnessMin: 0.10, brightnessMax: 0.92 };

    return {
      rasterOpacity: safeOpacity * zoomSoftener,
      rasterResampling: radarResampling,
      rasterFadeDuration,
      rasterSaturation: productTuning.saturation,
      rasterContrast: productTuning.contrast,
      rasterBrightnessMin: productTuning.brightnessMin,
      rasterBrightnessMax: productTuning.brightnessMax,
    } as any;
  };

  return (
    <View
      style={{ flex: 1 }}
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
          followUserLocation={false}
          animationDuration={0}
        />

        {overlays?.length ? <OverlayEngine overlays={overlays} /> : null}

        {useLocalImage
          ? (() => {
              const url = String(localImage!.url);
              const coords = localImage!.coordinates;
              const opacity = clamp(Number(localImage!.opacity ?? 1), 0, 1);

              const srcId = `radar-img-src-${radarSourceKey}`;
              const lyrId = `radar-img-lyr-${radarSourceKey}`;

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

        {!useLocalImage && radar.enabled && warmRadarTemplates.length
          ? warmRadarTemplates.map((tpl, slotIdx) => {
              const tplKey = radarTemplateKey(tpl);
              const srcId = `radar-warm-src-${radarSourceKey}-${slotIdx}-${tplKey}`;
              const lyrId = `radar-warm-lyr-${radarSourceKey}-${slotIdx}-${tplKey}`;
              const tileSize = radarTileSizeForTemplate(tpl);

              return (
                <MapLibreGL.RasterSource
                  key={srcId}
                  id={srcId}
                  tileUrlTemplates={[tpl]}
                  tileSize={tileSize}
                  maxZoomLevel={requestMaxZ}
                >
                  <MapLibreGL.RasterLayer
                    id={lyrId}
                    sourceID={srcId}
                    maxZoomLevel={layerMaxZ}
                    style={radarRasterStyle(0.01)}
                  />
                </MapLibreGL.RasterSource>
              );
            })
          : null}

        {!useLocalImage && radar.enabled
          ? radarTemplates.map((tpl, slotIdx) => {
              if (!tpl) return null;

              const opacity = Number.isFinite(radarOpacities[slotIdx]) ? radarOpacities[slotIdx] : 0;
              const tplKey = radarTemplateKey(tpl);
              const srcId = `radar-src-${radarSourceKey}-${slotIdx}-${tplKey}`;
              const lyrId = `radar-lyr-${radarSourceKey}-${slotIdx}-${tplKey}`;
              const tileSize = radarTileSizeForTemplate(tpl);

              return (
                <MapLibreGL.RasterSource
                  key={srcId}
                  id={srcId}
                  tileUrlTemplates={[tpl]}
                  tileSize={tileSize}
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

        {boundaryReliefTone ? <BoundaryReliefLayers tone={boundaryReliefTone} /> : null}

        {children}
      </MapLibreGL.MapView>
    </View>
  );
}
