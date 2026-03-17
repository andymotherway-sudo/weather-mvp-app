// app/(tabs)/maps.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createInitialMapState, mapReducer } from '../lib/maps/state';
import { MAP_VIEWS } from '../lib/maps/views';

import { Glass } from '../../components/common/Glass';
import { LayerSheetModal, type LayerSheetValue } from '../../components/maps/LayerSheetModal';
import { LegendChip } from '../../components/maps/LegendChip';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { RadarLegend } from '../../components/maps/RadarLegend';
import { TimelineScrubber } from '../../components/maps/TimelineScrubber';
import type { WmsOverlayConfig } from '../../components/maps/overlays/OverlayEngine';

import { useLocations } from '../lib/locations/useLocations';
import { LAYER_CATALOG_BY_ID } from '../lib/maps/layerCatalog';
import type { LayerId } from '../lib/maps/types';
import { useRadarController } from '../lib/maps/useRadarController';

/* ============================================================================ */

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, waitMs: number) {
  const fnRef = useRef(fn);
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = null;
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (tRef.current) clearTimeout(tRef.current);
      tRef.current = setTimeout(() => {
        fnRef.current(...args);
      }, waitMs);
    },
    [waitMs],
  );
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

function isRadarPrimaryView(viewId: string) {
  return viewId === 'radar' || viewId === 'wildfire' || viewId === 'storm' || viewId === 'aviation';
}

function getSimpleStatus(args: {
  viewId: string;
  radarEnabled: boolean;
  cloudsEnabled: boolean;
  wildfireEnabled: boolean;
  goesEastGeoEnabled: boolean;
  goesWestGeoEnabled: boolean;
  goesEastIrEnabled: boolean;
  goesWestIrEnabled: boolean;
  goesEastWvEnabled: boolean;
  goesWestWvEnabled: boolean;
  playing: boolean;
  frameCount: number;
}) {
  const {
    viewId,
    radarEnabled,
    cloudsEnabled,
    wildfireEnabled,
    goesEastGeoEnabled,
    goesWestGeoEnabled,
    goesEastIrEnabled,
    goesWestIrEnabled,
    goesEastWvEnabled,
    goesWestWvEnabled,
    playing,
    frameCount,
  } = args;

  if (goesEastGeoEnabled) return 'GOES East visible active';
  if (goesWestGeoEnabled) return 'GOES West visible active';
  if (goesEastIrEnabled) return 'GOES East infrared active';
  if (goesWestIrEnabled) return 'GOES West infrared active';
  if (goesEastWvEnabled) return 'GOES East water vapor active';
  if (goesWestWvEnabled) return 'GOES West water vapor active';

  if (viewId === 'clouds') {
    return cloudsEnabled ? 'Cloud layer active' : 'Cloud layer off';
  }

  if (viewId === 'wildfire') {
    return `${wildfireEnabled ? 'Wildfire overlays active' : 'Wildfire overlays off'}${radarEnabled ? ' · Radar on' : ''}`;
  }

  if (viewId === 'aviation') {
    return radarEnabled ? `${playing ? 'Animating' : 'Paused'} · Aviation weather view` : 'Radar off';
  }

  if (viewId === 'storm') {
    return radarEnabled ? `${playing ? 'Animating' : 'Paused'} · Storm weather view` : 'Radar off';
  }

  return radarEnabled ? `${playing ? 'Animating' : 'Paused'} · ${frameCount} frames` : 'No active weather layer';
}

function getActiveLayerSummary(state: any) {
  const enabledIds = Object.entries(state.layers ?? {})
    .filter(([, runtime]: any) => runtime?.enabled)
    .map(([id]) => id as LayerId);

  if (!enabledIds.length) {
    return {
      title: 'Layers',
      subtitle: 'No overlays enabled',
      hasActiveLayers: false,
    };
  }

  const ordered = enabledIds
    .map((id) => LAYER_CATALOG_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => b.zIndex - a.zIndex);

  const primary = ordered[0];
  const extraCount = Math.max(0, ordered.length - 1);

  return {
    title: primary.title,
    subtitle: extraCount > 0 ? `${primary.subtitle ?? 'Overlay'} · +${extraCount} more` : primary.subtitle,
    hasActiveLayers: true,
  };
}

/* ============================================================================ */

export default function MapsScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    view?: string;
    lat?: string;
    lon?: string;
    label?: string;
    focus?: string;
    source?: string;
    targetType?: string;
  }>();
  const router = useRouter();
  const isFocused = useIsFocused();

  const [state, dispatch] = React.useReducer(mapReducer, undefined, () =>
    createInitialMapState({ viewId: 'radar', nerdy: false }),
  );

  const loc = useLocations();
  const permission = 'granted' as const;

  const location = useMemo(() => {
    const c = loc.state.currentCoords;
    if (!c) return null;
    return { lat: c.lat, lon: c.lon };
  }, [loc.state.currentCoords?.lat, loc.state.currentCoords?.lon]);

  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [sheetValue, setSheetValue] = useState<LayerSheetValue>({ baseMapStyle: 'dark', radarProvider: 'iem' });
  const [rawMode, setRawMode] = useState(false);

  const mapCameraRef = useRef<any>(null);
  const [region, setRegion] = useState<Region | null>(null);

  useEffect(() => {
    const raw = params?.view ? String(params.view).toLowerCase() : '';
    if (!raw) return;
    const valid = MAP_VIEWS.some((v) => v.id === raw);
    if (!valid) return;
    dispatch({ type: 'SET_VIEW', viewId: raw as any });
  }, [params?.view]);

  useEffect(() => {
    dispatch({ type: 'SET_RADAR_PLAYING', playing: true });
  }, []);

  const lastUserMoveAtRef = useRef<number>(0);
  const lastPanMarkRef = useRef<number>(0);

  const markUserInteraction = useCallback(() => {
    lastUserMoveAtRef.current = Date.now();
  }, []);

  const [anchorPoint, setAnchorPoint] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!location) return;
    setAnchorPoint((prev) => prev ?? { lat: location.lat, lon: location.lon });
  }, [location]);

  const debouncedAnchorToMap = useDebouncedCallback(
    (lat: number, lon: number) => {
      setAnchorPoint((prev) => {
        if (prev && prev.lat === lat && prev.lon === lon) return prev;
        return { lat, lon };
      });
    },
    160,
  );

  const [mapZoom, setMapZoom] = useState<number>(4);
  const [product, setProduct] = useState<'N0Q' | 'N0B' | 'N0Z'>('N0Q');

  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;
  const wildfireEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;
  const cloudsEnabled = !!state.layers?.['sat.clouds']?.enabled;

  const goesEastGeoEnabled = !!state.layers?.['sat.goesEast.geocolor']?.enabled;
  const goesWestGeoEnabled = !!state.layers?.['sat.goesWest.geocolor']?.enabled;
  const goesEastIrEnabled = !!state.layers?.['sat.goesEast.ir']?.enabled;
  const goesWestIrEnabled = !!state.layers?.['sat.goesWest.ir']?.enabled;
  const goesEastWvEnabled = !!state.layers?.['sat.goesEast.wv']?.enabled;
  const goesWestWvEnabled = !!state.layers?.['sat.goesWest.wv']?.enabled;

  const cloudsOpacity = Number.isFinite(state.layers?.['sat.clouds']?.opacity)
    ? state.layers['sat.clouds'].opacity
    : 0.85;

  const goesEastGeoOpacity = Number.isFinite(state.layers?.['sat.goesEast.geocolor']?.opacity)
    ? state.layers['sat.goesEast.geocolor'].opacity
    : 0.92;

  const goesWestGeoOpacity = Number.isFinite(state.layers?.['sat.goesWest.geocolor']?.opacity)
    ? state.layers['sat.goesWest.geocolor'].opacity
    : 0.92;

  const goesEastIrOpacity = Number.isFinite(state.layers?.['sat.goesEast.ir']?.opacity)
    ? state.layers['sat.goesEast.ir'].opacity
    : 0.94;

  const goesWestIrOpacity = Number.isFinite(state.layers?.['sat.goesWest.ir']?.opacity)
    ? state.layers['sat.goesWest.ir'].opacity
    : 0.94;

  const goesEastWvOpacity = Number.isFinite(state.layers?.['sat.goesEast.wv']?.opacity)
    ? state.layers['sat.goesEast.wv'].opacity
    : 0.94;

  const goesWestWvOpacity = Number.isFinite(state.layers?.['sat.goesWest.wv']?.opacity)
    ? state.layers['sat.goesWest.wv'].opacity
    : 0.94;

  const activeLayerSummary = useMemo(() => getActiveLayerSummary(state), [state]);

  const centerForRadar = useMemo(() => {
    if (region) return { lat: region.latitude, lon: region.longitude };
    return anchorPoint ?? { lat: 39.5, lon: -98.35 };
  }, [region, anchorPoint]);

  const radarCtl = useRadarController({
    state,
    dispatch,
    sheetValue: { radarProvider: sheetValue.radarProvider },
    centerForRadar,
    mapZoom,
    product,
    rawMode,
    region,
    localMinZoom: 7.8,
    ridgeMinZoom: 99,
  });

  const uiFrames = radarCtl.uiFrames;
  const frameCount = radarCtl.frameCount;
  const timestampLabel = radarCtl.timestampLabel;
  const canSwitchProduct = state.nerdy;

  const radarTileMaxZ = useMemo(() => {
    return Math.max(radarCtl.radarTileMaxZ, Math.ceil(mapZoom));
  }, [radarCtl.radarTileMaxZ, mapZoom]);

  const mapRadar = useMemo(() => {
    if (!isFocused) {
      return {
        enabled: false,
        templates: [null, null, null],
        opacities: [0, 0, 0],
        tileMaxZ: 0,
        localImage: null,
      };
    }

    return {
      ...radarCtl.radar,
      tileMaxZ: radarTileMaxZ,
    };
  }, [isFocused, radarCtl.radar, radarTileMaxZ]);

  const overlays = useMemo<WmsOverlayConfig[]>(() => {
    const list: WmsOverlayConfig[] = [];

    if (cloudsEnabled) {
      list.push({
        id: 'goes-conus-ch02',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 60,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    if (goesEastGeoEnabled) {
      list.push({
        id: 'goes-east-geocolor',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(goesEastGeoOpacity))),
        zIndex: 62,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    if (goesWestGeoEnabled) {
      list.push({
        id: 'goes-west-geocolor',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(goesWestGeoOpacity))),
        zIndex: 62,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    if (goesEastIrEnabled) {
      list.push({
        id: 'goes-east-ir',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch13',
        opacity: Math.max(0, Math.min(1, Number(goesEastIrOpacity))),
        zIndex: 63,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    if (goesWestIrEnabled) {
      list.push({
        id: 'goes-west-ir',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch13',
        opacity: Math.max(0, Math.min(1, Number(goesWestIrOpacity))),
        zIndex: 63,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    if (goesEastWvEnabled) {
      list.push({
        id: 'goes-east-wv',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch08',
        opacity: Math.max(0, Math.min(1, Number(goesEastWvOpacity))),
        zIndex: 64,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    if (goesWestWvEnabled) {
      list.push({
        id: 'goes-west-wv',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch08',
        opacity: Math.max(0, Math.min(1, Number(goesWestWvOpacity))),
        zIndex: 64,
        enabled: true,
        version: '1.1.1',
        crs: 'EPSG:3857',
        format: 'image/png',
        transparent: true,
      });
    }

    return list;
  }, [
    cloudsEnabled,
    cloudsOpacity,
    goesEastGeoEnabled,
    goesEastGeoOpacity,
    goesWestGeoEnabled,
    goesWestGeoOpacity,
    goesEastIrEnabled,
    goesEastIrOpacity,
    goesWestIrEnabled,
    goesWestIrOpacity,
    goesEastWvEnabled,
    goesEastWvOpacity,
    goesWestWvEnabled,
    goesWestWvOpacity,
  ]);

  const [consumedRouteFocusKey, setConsumedRouteFocusKey] = useState<string | null>(null);

  const routeFocusTarget = useMemo(() => {
    const lat = params?.lat != null ? Number(params.lat) : NaN;
    const lon = params?.lon != null ? Number(params.lon) : NaN;
    const focus = String(params?.focus ?? '');

    if (focus !== 'once') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const key = [
      focus,
      Number(lat).toFixed(4),
      Number(lon).toFixed(4),
      String(params?.label ?? ''),
      String(params?.source ?? ''),
      String(params?.targetType ?? ''),
    ].join('|');

    if (consumedRouteFocusKey === key) return null;

    return {
      lat,
      lon,
      key,
    };
  }, [
    params?.lat,
    params?.lon,
    params?.focus,
    params?.label,
    params?.source,
    params?.targetType,
    consumedRouteFocusKey,
  ]);

  const [stableInitialRegion, setStableInitialRegion] = useState<Region>(() => {
    if (routeFocusTarget) {
      return {
        latitude: routeFocusTarget.lat,
        longitude: routeFocusTarget.lon,
        latitudeDelta: 4,
        longitudeDelta: 4,
      };
    }

    return {
      latitude: 39.5,
      longitude: -98.35,
      latitudeDelta: 4,
      longitudeDelta: 4,
    };
  });

  useEffect(() => {
    if (routeFocusTarget) return;
    if (permission !== 'granted' || !location) return;

    setStableInitialRegion((cur) => {
      const isStillDefaultish =
        Math.abs(cur.latitude - 39.5) < 0.5 &&
        Math.abs(cur.longitude + 98.35) < 0.5 &&
        cur.longitudeDelta >= 3.5;
      if (!isStillDefaultish) return cur;
      return { latitude: location.lat, longitude: location.lon, latitudeDelta: 4, longitudeDelta: 4 };
    });
  }, [permission, location, routeFocusTarget]);

  useEffect(() => {
    if (!routeFocusTarget) return;
    if (!mapCameraRef.current?.setCamera) return;

    lastUserMoveAtRef.current = Date.now();

    setAnchorPoint({ lat: routeFocusTarget.lat, lon: routeFocusTarget.lon });

    dispatch({
      type: 'SET_VIEWPORT',
      viewport: {
        center: { lat: routeFocusTarget.lat, lon: routeFocusTarget.lon },
        zoom: 7,
      },
    });

    mapCameraRef.current.setCamera({
      centerCoordinate: [routeFocusTarget.lon, routeFocusTarget.lat],
      zoomLevel: 7,
      animationDuration: 700,
    });

    setConsumedRouteFocusKey(routeFocusTarget.key);

    requestAnimationFrame(() => {
      router.setParams({
        focus: undefined,
        lat: undefined,
        lon: undefined,
        label: undefined,
        source: undefined,
        targetType: undefined,
      });
    });
  }, [routeFocusTarget, router]);

  const effectiveRegion = region ?? stableInitialRegion;

  const pushSpecialMap = useCallback(
    (pathname: '/astro-map' | '/nautical-map') => {
      const r = effectiveRegion;
      router.push({
        pathname,
        params: {
          from: 'maps',
          nav: String(Date.now()),
          lat: String(r.latitude),
          lon: String(r.longitude),
          latDelta: String(r.latitudeDelta),
          lonDelta: String(r.longitudeDelta),
          zoom: String(Math.round(mapZoom * 10) / 10),
        },
      });
    },
    [router, effectiveRegion, mapZoom],
  );

  const recenterToGps = async () => {
    await loc.refreshCurrentLocation();
    const coords = loc.state.currentCoords;
    if (!coords) return;

    setAnchorPoint({ lat: coords.lat, lon: coords.lon });
    lastUserMoveAtRef.current = Date.now();

    dispatch({
      type: 'SET_VIEWPORT',
      viewport: { center: { lat: coords.lat, lon: coords.lon }, zoom: 9 },
    });

    mapCameraRef.current?.setCamera?.({
      centerCoordinate: [coords.lon, coords.lat],
      zoomLevel: 9,
      animationDuration: 450,
    });
  };

  const DOCK_ESTIMATED_HEIGHT = 78;
  const dockBottom = 12 + insets.bottom;

  const currentViewTitle = activeLayerSummary.hasActiveLayers
    ? activeLayerSummary.title
    : (MAP_VIEWS.find((v) => v.id === state.viewId)?.title ?? 'Maps');

  const showRadarLegend = isFocused && radarEnabled && isRadarPrimaryView(String(state.viewId));

  const simpleStatus = getSimpleStatus({
    viewId: String(state.viewId),
    radarEnabled,
    cloudsEnabled,
    wildfireEnabled,
    goesEastGeoEnabled,
    goesWestGeoEnabled,
    goesEastIrEnabled,
    goesWestIrEnabled,
    goesEastWvEnabled,
    goesWestWvEnabled,
    playing: state.radarTime.playing,
    frameCount,
  });

  const showTimeline = isFocused && radarEnabled && frameCount > 1;

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
          }}
          onRegionChangeComplete={(r: Region) => {
            setRegion(r);

            const zFloat =
              typeof (r as any).zoom === 'number' && Number.isFinite((r as any).zoom)
                ? (r as any).zoom
                : approxZoomFromLongitudeDelta(r.longitudeDelta);

            setMapZoom(zFloat);

            const userMovedRecently = Date.now() - lastUserMoveAtRef.current < 2000;

            if (!userMovedRecently) {
              dispatch({
                type: 'SET_VIEWPORT',
                viewport: { center: { lat: r.latitude, lon: r.longitude }, zoom: zFloat },
              });
            }

            debouncedAnchorToMap(r.latitude, r.longitude);
          }}
          radar={mapRadar}
          overlays={overlays}
        />

        <View style={{ position: 'absolute', left: 12, right: 84, top: 8 }}>
          <Glass style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Maps</Text>
                <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 2, fontWeight: '800' }} numberOfLines={1}>
                  {currentViewTitle} · {timestampLabel || 'Latest'}
                </Text>
              </View>

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
                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>
                    {rawMode ? 'Raw' : 'Smooth'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <ChipDark label="Astro Map" onPress={() => pushSpecialMap('/astro-map')} />
              <ChipDark label="Nautical Map" onPress={() => pushSpecialMap('/nautical-map')} />
              <ChipDark label="My Location" onPress={recenterToGps} />
            </View>

            {canSwitchProduct && sheetValue.radarProvider === 'iem' && isRadarPrimaryView(String(state.viewId)) ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <ChipDark active={product === 'N0Q'} label="N0Q" onPress={() => setProduct('N0Q')} />
                <ChipDark active={product === 'N0B'} label="N0B" onPress={() => setProduct('N0B')} />
                <ChipDark active={product === 'N0Z'} label="N0Z" onPress={() => setProduct('N0Z')} />
              </View>
            ) : null}

            <View style={{ marginTop: 10 }}>
              {state.nerdy ? (
                <Text style={{ color: 'rgba(255,255,255,0.78)' }} numberOfLines={2}>
                  Provider: {sheetValue.radarProvider === 'rainviewer' ? 'RainViewer' : 'IEM'}
                  {' · '}Frames: {frameCount}
                  {' · '}Zoom ~ {Math.round(mapZoom)}
                  {' · '}{state.radarTime.playing ? 'Playing' : 'Paused'}
                  {cloudsEnabled ? ` · Clouds ${Math.round(cloudsOpacity * 100)}%` : ''}
                  {goesEastGeoEnabled ? ` · East Visible ${Math.round(goesEastGeoOpacity * 100)}%` : ''}
                  {goesWestGeoEnabled ? ` · West Visible ${Math.round(goesWestGeoOpacity * 100)}%` : ''}
                  {goesEastIrEnabled ? ` · East IR ${Math.round(goesEastIrOpacity * 100)}%` : ''}
                  {goesWestIrEnabled ? ` · West IR ${Math.round(goesWestIrOpacity * 100)}%` : ''}
                  {goesEastWvEnabled ? ` · East WV ${Math.round(goesEastWvOpacity * 100)}%` : ''}
                  {goesWestWvEnabled ? ` · West WV ${Math.round(goesWestWvOpacity * 100)}%` : ''}
                </Text>
              ) : (
                <Text style={{ color: 'rgba(255,255,255,0.78)', fontWeight: '800' }} numberOfLines={1}>
                  {simpleStatus}
                </Text>
              )}
            </View>
          </Glass>
        </View>

        <Pressable
          onPress={() => setLayersSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open layers"
          style={{
            position: 'absolute',
            right: 12,
            top: 18,
            width: 56,
            height: 56,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: activeLayerSummary.hasActiveLayers
              ? 'rgba(255,255,255,0.22)'
              : 'rgba(255,255,255,0.12)',
            backgroundColor: 'rgba(2,6,23,0.84)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 24, gap: 4 }}>
            <View style={{ height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.95)' }} />
            <View style={{ height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.78)' }} />
            <View style={{ height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.62)' }} />
          </View>

          {activeLayerSummary.hasActiveLayers ? (
            <View
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: 'white',
              }}
            />
          ) : null}
        </Pressable>

        {showRadarLegend ? (
          <View style={{ position: 'absolute', left: 12, bottom: dockBottom + DOCK_ESTIMATED_HEIGHT + 10 }}>
            <LegendChip title="dBZ">
              <RadarLegend style="generic" />
            </LegendChip>
          </View>
        ) : null}

        {showTimeline ? (
          <BottomDock
            center={
              <Glass style={{ paddingVertical: 8 }}>
                <TimelineScrubber
                  frameIndex={state.radarTime.frameIndex}
                  playing={state.radarTime.playing}
                  frames={uiFrames as any}
                  onSetFrame={(frameIndex) =>
                    dispatch({ type: 'SET_RADAR_FRAME', frameIndex: clampIndex(frameIndex, frameCount) })
                  }
                  onSetPlaying={(playing) => {
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
        ) : null}

        <LayerSheetModal
          visible={layersSheetOpen}
          onClose={() => setLayersSheetOpen(false)}
          state={state}
          viewId={state.viewId}
          onChangeView={(viewId) => dispatch({ type: 'SET_VIEW', viewId })}
          nerdy={state.nerdy}
          value={sheetValue}
          onChange={(next) => setSheetValue(next)}
          allowedGroups={['weather', 'fireAir']}
          onToggleLayer={(layerId, enabled) => dispatch({ type: 'SET_LAYER_ENABLED', layerId, enabled })}
          onSetOpacity={(layerId, opacity) => dispatch({ type: 'SET_LAYER_OPACITY', layerId, opacity })}
        />
      </View>
    </SafeAreaView>
  );
}

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