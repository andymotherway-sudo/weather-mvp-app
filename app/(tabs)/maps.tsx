import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import MapLibreGL from '@maplibre/maplibre-react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Glass } from '../../components/common/Glass';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
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
import { useAviationMapData } from '../lib/maps/useAviationMapData';
import { useRadarController } from '../lib/maps/useRadarController';
import { MAP_VIEWS } from '../lib/maps/views';

const WPC_FRONTS_EXPORT_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';

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
  frontsDay1Enabled: boolean;
  frontsDay2Enabled: boolean;
  frontsDay3Enabled: boolean;
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
    frontsDay1Enabled,
    frontsDay2Enabled,
    frontsDay3Enabled,
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
  if (frontsDay1Enabled) return 'WPC Day 1 fronts active';
  if (frontsDay2Enabled) return 'WPC Day 2 fronts active';
  if (frontsDay3Enabled) return 'WPC Day 3 fronts active';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
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
  const frontsDay1Enabled = !!state.layers?.['wx.fronts.day1']?.enabled;
  const frontsDay2Enabled = !!state.layers?.['wx.fronts.day2']?.enabled;
  const frontsDay3Enabled = !!state.layers?.['wx.fronts.day3']?.enabled;
  const aviationTurbEnabled = !!state.layers?.['aviation.gairmet.turb']?.enabled;
  const aviationIceEnabled = !!state.layers?.['aviation.gairmet.ice']?.enabled;
  const aviationSigmetEnabled = !!state.layers?.['aviation.sigmet']?.enabled;
  const aviationCwaEnabled = !!state.layers?.['aviation.cwa']?.enabled;
  const aviationPirepEnabled = !!state.layers?.['aviation.pirep']?.enabled;

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
  const frontsDay1Opacity = Number.isFinite(state.layers?.['wx.fronts.day1']?.opacity)
    ? state.layers['wx.fronts.day1'].opacity
    : 0.96;
  const frontsDay2Opacity = Number.isFinite(state.layers?.['wx.fronts.day2']?.opacity)
    ? state.layers['wx.fronts.day2'].opacity
    : 0.92;
  const frontsDay3Opacity = Number.isFinite(state.layers?.['wx.fronts.day3']?.opacity)
    ? state.layers['wx.fronts.day3'].opacity
    : 0.88;

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
  const aviationTurbOpacity = Number.isFinite(state.layers?.['aviation.gairmet.turb']?.opacity)
    ? state.layers['aviation.gairmet.turb'].opacity
    : 0.72;
  const aviationIceOpacity = Number.isFinite(state.layers?.['aviation.gairmet.ice']?.opacity)
    ? state.layers['aviation.gairmet.ice'].opacity
    : 0.72;
  const aviationSigmetOpacity = Number.isFinite(state.layers?.['aviation.sigmet']?.opacity)
    ? state.layers['aviation.sigmet'].opacity
    : 0.82;
  const aviationCwaOpacity = Number.isFinite(state.layers?.['aviation.cwa']?.opacity)
    ? state.layers['aviation.cwa'].opacity
    : 0.76;
  const aviationPirepOpacity = Number.isFinite(state.layers?.['aviation.pirep']?.opacity)
    ? state.layers['aviation.pirep'].opacity
    : 0.9;

  const aviationOverlayEnabled =
    aviationTurbEnabled || aviationIceEnabled || aviationSigmetEnabled || aviationCwaEnabled || aviationPirepEnabled;
  const aviationData = useAviationMapData(aviationOverlayEnabled || state.viewId === 'aviation');

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
  const activeFrameIso = radarCtl.activeFrameIso;
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
    const sharedCloudTime = radarEnabled && cloudsEnabled && frameCount > 1 ? activeFrameIso ?? null : null;

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
        time: sharedCloudTime,
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 60,
        ...shared,
      });
    }

    if (frontsDay1Enabled) {
      list.push({
        id: 'wpc-fronts-day1',
        tileUrlTemplates: [`${WPC_FRONTS_EXPORT_URL}&layers=show:1,2`],
        opacity: Math.max(0, Math.min(1, Number(frontsDay1Opacity))),
        zIndex: 109,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 9,
        fadeDurationMs: 120,
        resampling: 'linear',
      });
    }

    if (frontsDay2Enabled) {
      list.push({
        id: 'wpc-fronts-day2',
        tileUrlTemplates: [`${WPC_FRONTS_EXPORT_URL}&layers=show:13,14`],
        opacity: Math.max(0, Math.min(1, Number(frontsDay2Opacity))),
        zIndex: 108,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 9,
        fadeDurationMs: 120,
        resampling: 'linear',
      });
    }

    if (frontsDay3Enabled) {
      list.push({
        id: 'wpc-fronts-day3',
        tileUrlTemplates: [`${WPC_FRONTS_EXPORT_URL}&layers=show:25,26`],
        opacity: Math.max(0, Math.min(1, Number(frontsDay3Opacity))),
        zIndex: 107,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 9,
        fadeDurationMs: 120,
        resampling: 'linear',
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
    activeFrameIso,
    frameCount,
    radarEnabled,
    cloudsEnabled,
    cloudsOpacity,
    frontsDay1Enabled,
    frontsDay1Opacity,
    frontsDay2Enabled,
    frontsDay2Opacity,
    frontsDay3Enabled,
    frontsDay3Opacity,
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
    (pathname: '/astro-map' | '/nautical-map' | '/aviation') => {
      const currentRegion = effectiveRegion;

      router.push({
        pathname: pathname as any,
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
    frontsDay1Enabled,
    frontsDay2Enabled,
    frontsDay3Enabled,
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
  const aviationPirepCount = aviationData.pireps?.features?.length ?? 0;
  const aviationFeatureCount =
    (aviationData.turbulence?.features?.length ?? 0) +
    (aviationData.icing?.features?.length ?? 0) +
    (aviationData.advisories?.features?.length ?? 0) +
    (aviationData.centerWeather?.features?.length ?? 0) +
    aviationPirepCount;
  const aviationStatusLabel =
    state.viewId === 'aviation'
      ? aviationData.loading
        ? 'Loading aviation overlays'
        : aviationData.error && aviationFeatureCount <= 0
          ? 'Aviation overlays unavailable'
          : aviationData.error
            ? 'Aviation overlays partial'
            : aviationFeatureCount > 0
              ? 'Aviation overlays ready'
              : 'No active aviation hazards'
      : null;
  const overlayStatusText = aviationStatusLabel
    ? [overlaySummaryText, aviationStatusLabel].filter(Boolean).join(' / ')
    : overlaySummaryText;

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
        >
          {aviationTurbEnabled ? (
            <MapLibreGL.ShapeSource id="aviation-turbulence-source" shape={aviationData.turbulence as any}>
              <MapLibreGL.FillLayer
                id="aviation-turbulence-fill"
                style={{
                  fillColor: '#f59e0b',
                  fillOpacity: Math.max(0.08, Math.min(0.5, aviationTurbOpacity * 0.32)),
                }}
              />
              <MapLibreGL.LineLayer
                id="aviation-turbulence-line"
                style={{
                  lineColor: '#fbbf24',
                  lineOpacity: Math.max(0.35, Math.min(1, aviationTurbOpacity)),
                  lineWidth: 2,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="aviation-turbulence-label"
                style={{
                  textField: ['get', 'iconLabel'],
                  symbolPlacement: 'point',
                  textSize: 10,
                  textFont: ['Open Sans Bold'],
                  textColor: ['get', 'iconTextColor'],
                  textHaloColor: ['get', 'iconBgColor'],
                  textHaloWidth: 8,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {aviationIceEnabled ? (
            <MapLibreGL.ShapeSource id="aviation-icing-source" shape={aviationData.icing as any}>
              <MapLibreGL.FillLayer
                id="aviation-icing-fill"
                style={{
                  fillColor: '#38bdf8',
                  fillOpacity: Math.max(0.08, Math.min(0.46, aviationIceOpacity * 0.3)),
                }}
              />
              <MapLibreGL.LineLayer
                id="aviation-icing-line"
                style={{
                  lineColor: '#7dd3fc',
                  lineOpacity: Math.max(0.35, Math.min(1, aviationIceOpacity)),
                  lineWidth: 2,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="aviation-icing-label"
                style={{
                  textField: ['get', 'iconLabel'],
                  symbolPlacement: 'point',
                  textSize: 10,
                  textFont: ['Open Sans Bold'],
                  textColor: ['get', 'iconTextColor'],
                  textHaloColor: ['get', 'iconBgColor'],
                  textHaloWidth: 8,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {aviationSigmetEnabled ? (
            <MapLibreGL.ShapeSource id="aviation-sigmet-source" shape={aviationData.advisories as any}>
              <MapLibreGL.LineLayer
                id="aviation-sigmet-line"
                style={{
                  lineColor: '#f87171',
                  lineOpacity: Math.max(0.35, Math.min(1, aviationSigmetOpacity)),
                  lineWidth: 2.4,
                  lineDasharray: [2, 1.4],
                }}
              />
              <MapLibreGL.SymbolLayer
                id="aviation-sigmet-label"
                style={{
                  textField: ['get', 'iconLabel'],
                  symbolPlacement: 'point',
                  textSize: 10,
                  textFont: ['Open Sans Bold'],
                  textColor: ['get', 'iconTextColor'],
                  textHaloColor: ['get', 'iconBgColor'],
                  textHaloWidth: 8,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {aviationCwaEnabled ? (
            <MapLibreGL.ShapeSource id="aviation-cwa-source" shape={aviationData.centerWeather as any}>
              <MapLibreGL.LineLayer
                id="aviation-cwa-line"
                style={{
                  lineColor: '#fde68a',
                  lineOpacity: Math.max(0.35, Math.min(1, aviationCwaOpacity)),
                  lineWidth: 2,
                  lineDasharray: [1.2, 1.2],
                }}
              />
              <MapLibreGL.SymbolLayer
                id="aviation-cwa-label"
                style={{
                  textField: ['get', 'iconLabel'],
                  symbolPlacement: 'point',
                  textSize: 10,
                  textFont: ['Open Sans Bold'],
                  textColor: ['get', 'iconTextColor'],
                  textHaloColor: ['get', 'iconBgColor'],
                  textHaloWidth: 8,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {aviationPirepEnabled ? (
            <MapLibreGL.ShapeSource
              id="aviation-pirep-source"
              shape={aviationData.pireps as any}
              cluster
              clusterRadius={42}
              clusterMaxZoomLevel={8}
            >
              <MapLibreGL.CircleLayer
                id="aviation-pirep-clusters"
                filter={['has', 'point_count']}
                style={{
                  circleColor: 'rgba(14,165,233,0.28)',
                  circleStrokeColor: 'rgba(186,230,253,0.92)',
                  circleStrokeWidth: 1.2,
                  circleOpacity: Math.max(0.35, Math.min(1, aviationPirepOpacity)),
                  circleRadius: ['step', ['get', 'point_count'], 13, 25, 17, 75, 21, 200, 25],
                }}
              />
              <MapLibreGL.SymbolLayer
                id="aviation-pirep-cluster-count"
                filter={['has', 'point_count']}
                style={{
                  textField: ['to-string', ['get', 'point_count']],
                  textSize: 12,
                  textColor: '#e0f2fe',
                  textHaloColor: 'rgba(2,6,23,0.95)',
                  textHaloWidth: 1,
                }}
              />
              <MapLibreGL.CircleLayer
                id="aviation-pirep-points"
                filter={['!', ['has', 'point_count']]}
                style={{
                  circleColor: ['coalesce', ['get', 'iconBgColor'], '#e0f2fe'],
                  circleOpacity: Math.max(0.35, Math.min(1, aviationPirepOpacity)),
                  circleRadius: ['coalesce', ['get', 'iconRadius'], 7],
                  circleStrokeColor: ['coalesce', ['get', 'iconStrokeColor'], 'rgba(2,6,23,0.95)'],
                  circleStrokeWidth: ['coalesce', ['get', 'iconStrokeWidth'], 1.25],
                }}
              />
              <MapLibreGL.SymbolLayer
                id="aviation-pirep-label"
                filter={['!', ['has', 'point_count']]}
                style={{
                  textField: ['get', 'iconLabel'],
                  textSize: 9,
                  textFont: ['Open Sans Bold'],
                  textColor: ['coalesce', ['get', 'iconTextColor'], '#020617'],
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}
        </MapRenderer>

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
              {overlayStatusText || 'Layer stack ready'}
            </Text>
            <Text style={styles.summaryTimestamp}>
              {timestampLabel || 'Latest update'}
              {radarCtl.profileLabel ? ` / ${radarCtl.profileLabel}` : ''}
              {state.viewId === 'aviation' && aviationPirepEnabled ? ` / ${aviationPirepCount} pireps` : ''}
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
              label="Overlays"
              onPress={() => setLayersSheetOpen(true)}
              badge={activeOverlayCount > 0 ? String(Math.min(99, activeOverlayCount)) : undefined}
              active={layersSheetOpen}
            />
            <MapActionButton label="Locate" onPress={recenterToGps} />
            <MapActionButton
              label="Settings"
              onPress={() => setSettingsOpen(true)}
              active={settingsOpen}
            />
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
          nerdy={state.nerdy}
          allowedGroups={['weather', 'fireAir', 'aviation']}
          onToggleLayer={(layerId, enabled) => dispatch({ type: 'SET_LAYER_ENABLED', layerId, enabled })}
          onSetOpacity={(layerId, opacity) => dispatch({ type: 'SET_LAYER_OPACITY', layerId, opacity })}
          onOpenSourceInfo={(layerId) => {
            if (layerId === 'wx.fronts.day1' || layerId === 'wx.fronts.day2' || layerId === 'wx.fronts.day3') {
              setLearnTopicId('front-types');
              setLearnOpen(true);
            }
          }}
          onOpenAstroMap={() => {
            setLayersSheetOpen(false);
            pushSpecialMap('/astro-map');
          }}
          onOpenNauticalMap={() => {
            setLayersSheetOpen(false);
            pushSpecialMap('/nautical-map');
          }}
        />

        <SettingsModal
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          value={sheetValue}
          onChange={setSheetValue}
          nerdy={state.nerdy}
        />
        <LearnMoreModal visible={learnOpen} onClose={() => setLearnOpen(false)} initialTopicId={learnTopicId} />
      </View>
    </SafeAreaView>
  );
}

function SettingsModal(props: {
  visible: boolean;
  onClose: () => void;
  value: LayerSheetValue;
  onChange: (next: LayerSheetValue) => void;
  nerdy: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { visible, onClose, value, onChange, nerdy } = props;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.settingsBackdrop}>
        <Pressable onPress={onClose} style={StyleSheet.absoluteFillObject} />

        <Glass style={[styles.settingsCard, { marginBottom: 18 + insets.bottom }]}>
          <View style={styles.settingsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingsEyebrow}>SETTINGS</Text>
              <Text style={styles.settingsTitle}>Map settings</Text>
              <Text style={styles.settingsSubtitle}>Adjust presentation and advanced map behavior.</Text>
            </View>

            <Pressable onPress={onClose} style={styles.settingsDone}>
              <Text style={styles.settingsDoneText}>Done</Text>
            </Pressable>
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Base map</Text>
            <View style={styles.settingsRow}>
              <SegmentChip
                label="Dark"
                active={value.baseMapStyle === 'dark'}
                onPress={() => onChange({ ...value, baseMapStyle: 'dark' })}
              />
              <SegmentChip
                label="Light"
                active={value.baseMapStyle === 'light'}
                onPress={() => onChange({ ...value, baseMapStyle: 'light' })}
              />
            </View>
          </View>

          {nerdy ? (
            <View style={[styles.settingsSection, { marginTop: 12 }]}>
              <Text style={styles.settingsSectionTitle}>Radar provider</Text>
              <View style={styles.settingsRow}>
                <SegmentChip
                  label="RainViewer"
                  active={value.radarProvider === 'rainviewer'}
                  onPress={() => onChange({ ...value, radarProvider: 'rainviewer' })}
                />
                <SegmentChip
                  label="IEM"
                  active={value.radarProvider === 'iem'}
                  onPress={() => onChange({ ...value, radarProvider: 'iem' })}
                />
              </View>
            </View>
          ) : null}
        </Glass>
      </View>
    </Modal>
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

function SegmentChip(props: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.segmentChip, props.active ? styles.segmentChipActive : null]}>
      <Text style={styles.segmentChipText}>{props.label}</Text>
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
    fontSize: 9,
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
  settingsBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  settingsCard: {
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  settingsEyebrow: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  settingsTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 6,
  },
  settingsSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    marginTop: 4,
    lineHeight: 18,
  },
  settingsDone: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  settingsDoneText: {
    color: 'white',
    fontWeight: '900',
  },
  settingsSection: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 18,
    padding: 12,
  },
  settingsSectionTitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    fontWeight: '900',
  },
  settingsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  segmentChip: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  segmentChipActive: {
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  segmentChipText: {
    color: 'white',
    fontWeight: '900',
  },
});
