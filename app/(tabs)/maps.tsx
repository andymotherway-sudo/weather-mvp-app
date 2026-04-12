import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';

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
import { createInitialMapState, mapReducer } from '../lib/maps/state';
import type { LayerId } from '../lib/maps/types';
import { useRadarController } from '../lib/maps/useRadarController';
import { MAP_VIEWS } from '../lib/maps/views';

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, waitMs: number) {
  const fnRef = useRef(fn);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, []);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
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
  goesTrueColorEnabled: boolean;
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
    goesTrueColorEnabled,
    goesEastGeoEnabled,
    goesWestGeoEnabled,
    goesEastIrEnabled,
    goesWestIrEnabled,
    goesEastWvEnabled,
    goesWestWvEnabled,
    playing,
    frameCount,
  } = args;

  if (goesTrueColorEnabled) return 'GOES true color active';
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
    return `${wildfireEnabled ? 'Wildfire overlays active' : 'Wildfire overlays off'}${radarEnabled ? ' / Radar on' : ''}`;
  }

  if (viewId === 'aviation') {
    return radarEnabled ? `${playing ? 'Animating' : 'Paused'} / Aviation weather view` : 'Radar off';
  }

  if (viewId === 'storm') {
    return radarEnabled ? `${playing ? 'Animating' : 'Paused'} / Storm weather view` : 'Radar off';
  }

  return radarEnabled ? `${playing ? 'Animating' : 'Paused'} / ${frameCount} frames` : 'No active weather layer';
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
      count: 0,
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
    subtitle: extraCount > 0 ? `${primary.subtitle ?? 'Overlay'} / +${extraCount} more` : primary.subtitle,
    hasActiveLayers: true,
    count: enabledIds.length,
  };
}

function getViewAccent(viewId: string) {
  switch (viewId) {
    case 'wildfire':
      return 'rgba(251,146,60,0.22)';
    case 'aviation':
      return 'rgba(125,211,252,0.20)';
    case 'storm':
      return 'rgba(196,181,253,0.20)';
    case 'clouds':
      return 'rgba(148,163,184,0.22)';
    case 'radar':
    default:
      return 'rgba(96,165,250,0.18)';
  }
}

const NESDIS_GEOCOLOR_TILE_TEMPLATE =
  'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/MERGED_GeoColor/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';

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
    const coords = loc.state.currentCoords;
    if (!coords) return null;
    return { lat: coords.lat, lon: coords.lon };
  }, [loc.state.currentCoords]);

  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [sheetValue, setSheetValue] = useState<LayerSheetValue>({ baseMapStyle: 'dark', radarProvider: 'iem' });
  const [rawMode, setRawMode] = useState(false);

  const mapCameraRef = useRef<any>(null);
  const [region, setRegion] = useState<Region | null>(null);

  useEffect(() => {
    const rawView = params?.view ? String(params.view).toLowerCase() : '';
    if (!rawView) return;

    const valid = MAP_VIEWS.some((view) => view.id === rawView);
    if (!valid) return;

    dispatch({ type: 'SET_VIEW', viewId: rawView as any });
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

  const debouncedAnchorToMap = useDebouncedCallback((lat: number, lon: number) => {
    setAnchorPoint((prev) => {
      if (prev && prev.lat === lat && prev.lon === lon) return prev;
      return { lat, lon };
    });
  }, 160);

  const [mapZoom, setMapZoom] = useState<number>(4);
  const [product, setProduct] = useState<'N0Q' | 'N0B' | 'N0Z'>('N0Q');

  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;
  const wildfireEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;
  const cloudsEnabled = !!state.layers?.['sat.clouds']?.enabled;

  const goesTrueColorEnabled = !!state.layers?.['sat.goes.truecolor']?.enabled;
  const goesEastGeoEnabled = !!state.layers?.['sat.goesEast.geocolor']?.enabled;
  const goesWestGeoEnabled = !!state.layers?.['sat.goesWest.geocolor']?.enabled;
  const goesEastIrEnabled = !!state.layers?.['sat.goesEast.ir']?.enabled;
  const goesWestIrEnabled = !!state.layers?.['sat.goesWest.ir']?.enabled;
  const goesEastWvEnabled = !!state.layers?.['sat.goesEast.wv']?.enabled;
  const goesWestWvEnabled = !!state.layers?.['sat.goesWest.wv']?.enabled;

  const cloudsOpacity = Number.isFinite(state.layers?.['sat.clouds']?.opacity)
    ? state.layers['sat.clouds'].opacity
    : 0.85;

  const goesTrueColorOpacity = Number.isFinite(state.layers?.['sat.goes.truecolor']?.opacity)
    ? state.layers['sat.goes.truecolor'].opacity
    : 0.96;

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

    const shared = {
      enabled: true,
      version: '1.1.1' as const,
      crs: 'EPSG:3857' as const,
      format: 'image/png',
      transparent: true,
      tileSize: 512 as const,
      maxZoomLevel: 12,
      fadeDurationMs: 90,
      resampling: 'linear' as const,
    };

    if (goesTrueColorEnabled) {
      list.push({
        id: 'goes-truecolor',
        tileUrlTemplates: [NESDIS_GEOCOLOR_TILE_TEMPLATE],
        opacity: Math.max(0, Math.min(1, Number(goesTrueColorOpacity))),
        zIndex: 62,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 8,
        fadeDurationMs: 150,
        resampling: 'linear',
      });
    }

    if (cloudsEnabled) {
      list.push({
        id: 'goes-conus-ch02',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 60,
        ...shared,
      });
    }

    if (goesEastGeoEnabled) {
      list.push({
        id: 'goes-east-geocolor',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(goesEastGeoOpacity))),
        zIndex: 62,
        ...shared,
      });
    }

    if (goesWestGeoEnabled) {
      list.push({
        id: 'goes-west-geocolor',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(goesWestGeoOpacity))),
        zIndex: 62,
        ...shared,
      });
    }

    if (goesEastIrEnabled) {
      list.push({
        id: 'goes-east-ir',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch13',
        opacity: Math.max(0, Math.min(1, Number(goesEastIrOpacity))),
        zIndex: 63,
        ...shared,
      });
    }

    if (goesWestIrEnabled) {
      list.push({
        id: 'goes-west-ir',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch13',
        opacity: Math.max(0, Math.min(1, Number(goesWestIrOpacity))),
        zIndex: 63,
        ...shared,
      });
    }

    if (goesEastWvEnabled) {
      list.push({
        id: 'goes-east-wv',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch08',
        opacity: Math.max(0, Math.min(1, Number(goesEastWvOpacity))),
        zIndex: 64,
        ...shared,
      });
    }

    if (goesWestWvEnabled) {
      list.push({
        id: 'goes-west-wv',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch08',
        opacity: Math.max(0, Math.min(1, Number(goesWestWvOpacity))),
        zIndex: 64,
        ...shared,
      });
    }

    return list;
  }, [
    cloudsEnabled,
    cloudsOpacity,
    goesTrueColorEnabled,
    goesTrueColorOpacity,
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
    const lat = params?.lat != null ? Number(params.lat) : Number.NaN;
    const lon = params?.lon != null ? Number(params.lon) : Number.NaN;
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

    return { lat, lon, key };
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

    setStableInitialRegion((current) => {
      const isStillDefaultish =
        Math.abs(current.latitude - 39.5) < 0.5 &&
        Math.abs(current.longitude + 98.35) < 0.5 &&
        current.longitudeDelta >= 3.5;

      if (!isStillDefaultish) return current;
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
      const currentRegion = effectiveRegion;

      router.push({
        pathname,
        params: {
          from: 'maps',
          nav: String(Date.now()),
          lat: String(currentRegion.latitude),
          lon: String(currentRegion.longitude),
          latDelta: String(currentRegion.latitudeDelta),
          lonDelta: String(currentRegion.longitudeDelta),
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

  const currentViewTitle = activeLayerSummary.hasActiveLayers
    ? activeLayerSummary.title
    : (MAP_VIEWS.find((view) => view.id === state.viewId)?.title ?? 'Maps');

  const showRadarLegend = isFocused && radarEnabled && isRadarPrimaryView(String(state.viewId));

  const simpleStatus = getSimpleStatus({
    viewId: String(state.viewId),
    radarEnabled,
    cloudsEnabled,
    wildfireEnabled,
    goesTrueColorEnabled,
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
  const dockBottom = 12 + insets.bottom;
  const DOCK_ESTIMATED_HEIGHT = 114;
  const legendBottom = showTimeline ? dockBottom + DOCK_ESTIMATED_HEIGHT + 10 : dockBottom + 6;

  const accentBg = getViewAccent(String(state.viewId));
  const activeOverlayCount = activeLayerSummary.count ?? 0;
  const boundaryReliefTone =
    goesEastIrEnabled || goesWestIrEnabled
      ? 'orange'
      : cloudsEnabled || goesTrueColorEnabled || goesEastGeoEnabled || goesWestGeoEnabled
        ? 'teal'
        : null;

  const overlaySummaryText = activeLayerSummary.hasActiveLayers
    ? activeLayerSummary.subtitle ?? simpleStatus
    : simpleStatus;

  const providerLabel = sheetValue.radarProvider === 'rainviewer' ? 'RainViewer' : 'IEM radar';
  const zoomLabel = `Zoom ${Math.round(mapZoom * 10) / 10}`;
  const timelineStateLabel = !radarEnabled ? 'Layers only' : state.radarTime.playing ? 'Looping' : 'Holding';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <MapRenderer
          engine="maplibre"
          initialRegion={stableInitialRegion}
          mapStyle={sheetValue.baseMapStyle}
          boundaryReliefTone={boundaryReliefTone}
          cameraRef={mapCameraRef}
          onPanDrag={() => {
            const now = Date.now();
            if (now - lastPanMarkRef.current > 450) {
              lastPanMarkRef.current = now;
              markUserInteraction();
            }
          }}
          onRegionChangeComplete={(nextRegion: Region) => {
            setRegion(nextRegion);

            const zFloat =
              typeof (nextRegion as any).zoom === 'number' && Number.isFinite((nextRegion as any).zoom)
                ? (nextRegion as any).zoom
                : approxZoomFromLongitudeDelta(nextRegion.longitudeDelta);

            setMapZoom(zFloat);

            const userMovedRecently = Date.now() - lastUserMoveAtRef.current < 2000;

            if (!userMovedRecently) {
              dispatch({
                type: 'SET_VIEWPORT',
                viewport: { center: { lat: nextRegion.latitude, lon: nextRegion.longitude }, zoom: zFloat },
              });
            }

            debouncedAnchorToMap(nextRegion.latitude, nextRegion.longitude);
            radarCtl.refreshLocalIfNeeded();
          }}
          radar={mapRadar}
          overlays={overlays}
        />

        <View pointerEvents="box-none" style={styles.topChrome}>
          <Glass style={styles.summaryCard}>
            <View pointerEvents="none" style={[styles.summaryGlow, { backgroundColor: accentBg }]} />

            <View style={styles.summaryHeader}>
              <View style={styles.summaryBadgeRow}>
                <HudBadge label={currentViewTitle.toUpperCase()} strong />
                {activeOverlayCount > 0 ? <HudBadge label={`${activeOverlayCount} layers`} /> : null}
              </View>
              <StatusPill label={timelineStateLabel} active={state.radarTime.playing && radarEnabled} />
            </View>

            <Text style={styles.summaryTitle}>{currentViewTitle}</Text>
            <Text style={styles.summaryMeta} numberOfLines={2}>
              {overlaySummaryText || 'Layer stack ready'}
            </Text>
            <Text style={styles.summaryTimestamp}>
              {timestampLabel || 'Latest update'}
              {radarCtl.profileLabel ? ` / ${radarCtl.profileLabel}` : ''}
            </Text>

            <View style={styles.summaryFooter}>
              <InfoPill label={providerLabel} />
              <InfoPill label={zoomLabel} />
              {radarEnabled ? <InfoPill label={`${frameCount} frames`} /> : null}
              {state.nerdy ? (
                <MiniToggle label={rawMode ? 'Raw' : 'Smooth'} active={rawMode} onPress={() => setRawMode((v) => !v)} />
              ) : null}
            </View>

            {canSwitchProduct && sheetValue.radarProvider === 'iem' && isRadarPrimaryView(String(state.viewId)) ? (
              <View style={styles.productRowCompact}>
                <ChipDark active={product === 'N0Q'} label="N0Q" onPress={() => setProduct('N0Q')} />
                <ChipDark active={product === 'N0B'} label="N0B" onPress={() => setProduct('N0B')} />
                <ChipDark active={product === 'N0Z'} label="N0Z" onPress={() => setProduct('N0Z')} />
              </View>
            ) : null}
          </Glass>

          <View style={styles.quickActions}>
            <MapActionButton
              label="Layers"
              onPress={() => setLayersSheetOpen(true)}
              badge={activeOverlayCount > 0 ? String(Math.min(99, activeOverlayCount)) : undefined}
              active={layersSheetOpen}
            />
            <MapActionButton label="Locate" onPress={recenterToGps} />
          </View>
        </View>

        {showRadarLegend ? (
          <View style={[styles.legendWrap, { bottom: legendBottom }]}>
            <LegendChip title="dBZ">
              <RadarLegend style="generic" />
            </LegendChip>
          </View>
        ) : null}

        {showTimeline ? (
          <BottomDock
            center={
              <Glass style={styles.timelineDock}>
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
          onOpenAstroMap={() => {
            setLayersSheetOpen(false);
            pushSpecialMap('/astro-map');
          }}
          onOpenNauticalMap={() => {
            setLayersSheetOpen(false);
            pushSpecialMap('/nautical-map');
          }}
        />
      </View>
    </SafeAreaView>
  );
}

function HudBadge(props: { label: string; strong?: boolean }) {
  return (
    <View style={[styles.hudBadge, props.strong ? styles.hudBadgeStrong : null]}>
      <Text style={[styles.hudBadgeText, props.strong ? styles.hudBadgeTextStrong : null]}>{props.label}</Text>
    </View>
  );
}

function StatusPill(props: { label: string; active?: boolean }) {
  return (
    <View style={[styles.statusPill, props.active ? styles.statusPillActive : null]}>
      <Text style={styles.statusPillText}>{props.label}</Text>
    </View>
  );
}

function MiniToggle(props: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.statusPill, props.active ? styles.statusPillActive : null]}>
      <Text style={styles.statusPillText}>{props.label}</Text>
    </Pressable>
  );
}

function InfoPill(props: { label: string }) {
  return (
    <View style={styles.infoPill}>
      <Text style={styles.infoPillText}>{props.label}</Text>
    </View>
  );
}

function MapActionButton(props: {
  label: string;
  onPress: () => void;
  badge?: string;
  active?: boolean;
  disabled?: boolean;
}) {
  const disabled = !!props.disabled;

  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      style={[styles.actionButton, props.active ? styles.actionButtonActive : null, disabled ? styles.disabled : null]}
    >
      <Text style={styles.actionButtonText}>{props.label}</Text>
      {props.badge ? (
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>{props.badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function ChipDark(props: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.productChip, props.active ? styles.productChipActive : null]}>
      <Text style={styles.productChipText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  screen: {
    flex: 1,
  },
  topChrome: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 12,
    overflow: 'hidden',
  },
  summaryGlow: {
    position: 'absolute',
    top: -18,
    right: 18,
    width: 112,
    height: 112,
    borderRadius: 999,
    opacity: 0.28,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  hudBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  hudBadgeStrong: {
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  hudBadgeText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  hudBadgeTextStrong: {
    color: 'rgba(255,255,255,0.96)',
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  statusPillActive: {
    borderColor: 'rgba(125,211,252,0.24)',
    backgroundColor: 'rgba(96,165,250,0.16)',
  },
  statusPillText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10,
    fontWeight: '900',
  },
  summaryTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 10,
  },
  summaryMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  summaryTimestamp: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  summaryFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  productRowCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  productChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  productChipActive: {
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  productChipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },
  infoPill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  infoPillText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 10,
    fontWeight: '800',
  },
  quickActions: {
    width: 58,
    gap: 8,
  },
  actionButton: {
    width: 58,
    minHeight: 58,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(2,6,23,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionButtonActive: {
    borderColor: 'rgba(125,211,252,0.26)',
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  actionButtonText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 12,
  },
  actionBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadgeText: {
    color: '#020617',
    fontSize: 10,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.45,
  },
  legendWrap: {
    position: 'absolute',
    left: 12,
  },
  timelineDock: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
  },
});
