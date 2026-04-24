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

import { useFireContext } from '../lib/fire/useFireContext';
import { useLocations } from '../lib/locations/useLocations';
import { LAYER_CATALOG_BY_ID } from '../lib/maps/layerCatalog';
import { createInitialMapState, mapReducer } from '../lib/maps/state';
import type { LayerId } from '../lib/maps/types';
import { useAviationMapData } from '../lib/maps/useAviationMapData';
import { useWildfireMapData } from '../lib/maps/useWildfireMapData';
import { useRadarController } from '../lib/maps/useRadarController';
import { MAP_VIEWS } from '../lib/maps/views';

const WPC_FRONTS_EXPORT_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';
const USFS_WHP_EXPORT_URL =
  'https://apps.fs.usda.gov/arcx/rest/services/RDW_Wildfire/RMRS_WildfireHazardPotential_2023/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';
const SPC_FIREWX_EXPORT_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';
const WFIGS_CURRENT_PERIMETERS_QUERY_URL =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query';

type WildfireIncidentDetails = {
  incidentName: string;
  percentContained: number | null;
  acres: number | null;
  updatedAt: string | null;
  source: string | null;
  county: string | null;
  state: string | null;
  city: string | null;
  geometrySource: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
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
  wildfireHotspotsEnabled: boolean;
  wildfireSmokeEnabled: boolean;
  wildfireEnabled: boolean;
  wildfireHazardEnabled: boolean;
  wildfireFireWxEnabled: boolean;
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
    wildfireHotspotsEnabled,
    wildfireSmokeEnabled,
    wildfireEnabled,
    wildfireHazardEnabled,
    wildfireFireWxEnabled,
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
    const parts = [
      wildfireHotspotsEnabled ? 'Incidents on' : null,
      wildfireSmokeEnabled ? 'Smoke on' : null,
      wildfireEnabled ? 'Perimeters on' : null,
      wildfireHazardEnabled ? 'Fire danger on' : null,
      wildfireFireWxEnabled ? 'Fire weather on' : null,
    ].filter(Boolean);
    return `${parts.length ? parts.join(' / ') : 'Wildfire overlays off'}${radarEnabled ? ' / Radar on' : ''}`;
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
  const [selectedWildfire, setSelectedWildfire] = useState<WildfireIncidentDetails | null>(null);
  const [wildfireDetailLoading, setWildfireDetailLoading] = useState(false);

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

  const lastPanMarkRef = useRef<number>(0);

  const [anchorPoint, setAnchorPoint] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (!location) return;
    setAnchorPoint((prev) => prev ?? { lat: location.lat, lon: location.lon });
  }, [location]);

  const [mapZoom, setMapZoom] = useState<number>(4);
  const [product, setProduct] = useState<'N0Q' | 'N0B' | 'N0Z'>('N0Q');

  const handleMapPress = useCallback(
    async (e: any) => {
      if (state.viewId !== 'wildfire' || !wildfireEnabled) {
        setSelectedWildfire(null);
        return;
      }

      const coords = e?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      try {
        setWildfireDetailLoading(true);
        const detail = await queryWildfireIncidentAtPoint(lat, lon);
        setSelectedWildfire(
          detail
            ? {
                ...detail,
                latitude: detail.latitude ?? lat,
                longitude: detail.longitude ?? lon,
              }
            : null
        );
      } catch {
        setSelectedWildfire(null);
      } finally {
        setWildfireDetailLoading(false);
      }
    },
    [state.viewId, state.layers]
  );

  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;
  const wildfireSmokeEnabled = !!state.layers?.['wildfire.smoke']?.enabled;
  const wildfireEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;
  const wildfireHotspotsEnabled = !!state.layers?.['wildfire.hotspots']?.enabled;
  const wildfireHazardEnabled = !!state.layers?.['wildfire.hazard']?.enabled;
  const wildfireFireWxEnabled = !!state.layers?.['wildfire.firewx']?.enabled;
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
  const wildfireSmokeOpacity = Number.isFinite(state.layers?.['wildfire.smoke']?.opacity)
    ? state.layers['wildfire.smoke'].opacity
    : 0.55;
  const wildfireHazardOpacity = Number.isFinite(state.layers?.['wildfire.hazard']?.opacity)
    ? state.layers['wildfire.hazard'].opacity
    : 0.58;
  const wildfireFireWxOpacity = Number.isFinite(state.layers?.['wildfire.firewx']?.opacity)
    ? state.layers['wildfire.firewx'].opacity
    : 0.76;

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

    if (wildfireHazardEnabled) {
      list.push({
        id: 'wildfire-hazard',
        tileUrlTemplates: [`${USFS_WHP_EXPORT_URL}&layers=show:1`],
        opacity: Math.max(0, Math.min(1, Number(wildfireHazardOpacity))),
        zIndex: 86,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 10,
        fadeDurationMs: 140,
        resampling: 'linear',
      });
    }

    if (wildfireFireWxEnabled) {
      list.push({
        id: 'wildfire-firewx',
        tileUrlTemplates: [`${SPC_FIREWX_EXPORT_URL}&layers=show:1,2`],
        opacity: Math.max(0, Math.min(1, Number(wildfireFireWxOpacity))),
        zIndex: 87,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 9,
        fadeDurationMs: 140,
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
    wildfireHazardEnabled,
    wildfireHazardOpacity,
    wildfireFireWxEnabled,
    wildfireFireWxOpacity,
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

    mapCameraRef.current.setCamera({
      centerCoordinate: [routeFocusTarget.lon, routeFocusTarget.lat],
      zoomLevel: 7,
      animationDuration: 700,
      followUserLocation: false,
    });
    setAnchorPoint({ lat: routeFocusTarget.lat, lon: routeFocusTarget.lon });

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
  const wildfireVectorEnabled =
    state.viewId === 'wildfire';
  const wildfireData = useWildfireMapData(wildfireVectorEnabled, effectiveRegion);
  const selectedWildfireSmokeBands = useMemo(
    () => getNearbySmokeBands(selectedWildfire, wildfireData.smoke),
    [selectedWildfire, wildfireData.smoke]
  );
  const wildfireFireContext = useFireContext({
    lat: selectedWildfire?.latitude ?? 0,
    lon: selectedWildfire?.longitude ?? 0,
    enabled:
      state.viewId === 'wildfire' &&
      selectedWildfire != null &&
      Number.isFinite(selectedWildfire?.latitude) &&
      Number.isFinite(selectedWildfire?.longitude),
  });
  const wildfireRestrictionSummary =
    wildfireFireContext.data?.restrictions?.summary ??
    (wildfireFireContext.loading ? 'Checking nearby fire restrictions.' : null);
  const wildfireRestrictionInEffect = wildfireFireContext.data?.restrictions?.inEffect === true;
  const wildfireRestrictionSupported = wildfireFireContext.data?.restrictions?.supported === true;
  const wildfireForestLabel = wildfireFireContext.data?.forest?.name ?? null;
  const wildfireFireWeatherSummary = wildfireFireContext.data?.fireWeather?.summary ?? null;

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
    const coords = loc.state.currentCoords ?? (await loc.refreshCurrentLocation());
    if (!coords) return;
    setAnchorPoint({ lat: coords.lat, lon: coords.lon });
    mapCameraRef.current?.setCamera?.({
      centerCoordinate: [coords.lon, coords.lat],
      zoomLevel: 9,
      animationDuration: 450,
      followUserLocation: false,
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
    wildfireHotspotsEnabled,
    wildfireSmokeEnabled,
    wildfireEnabled,
    wildfireHazardEnabled,
    wildfireFireWxEnabled,
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
  const radarUpdatedLabel = timestampLabel ? `Updated ${timestampLabel}` : 'Latest frame';
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
          onMapPress={handleMapPress}
          onPanDrag={() => {
            const now = Date.now();
            if (now - lastPanMarkRef.current > 450) {
              lastPanMarkRef.current = now;
            }
          }}
          onRegionChangeComplete={(nextRegion: Region) => {
            setRegion(nextRegion);

            const zFloat =
              typeof (nextRegion as any).zoom === 'number' && Number.isFinite((nextRegion as any).zoom)
                ? (nextRegion as any).zoom
                : approxZoomFromLongitudeDelta(nextRegion.longitudeDelta);

            setMapZoom(zFloat);

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

          {wildfireSmokeEnabled ? (
            <MapLibreGL.ShapeSource id="wildfire-smoke-source" shape={wildfireData.smoke as any}>
              <MapLibreGL.FillLayer
                id="wildfire-smoke-fill"
                style={{
                  fillColor: ['coalesce', ['get', 'fillColor'], 'rgba(148,163,184,0.18)'],
                  fillOpacity: Math.max(0.08, Math.min(0.5, wildfireSmokeOpacity)),
                }}
              />
              <MapLibreGL.LineLayer
                id="wildfire-smoke-line"
                style={{
                  lineColor: ['coalesce', ['get', 'lineColor'], 'rgba(226,232,240,0.45)'],
                  lineOpacity: Math.max(0.2, Math.min(0.72, wildfireSmokeOpacity * 0.9)),
                  lineWidth: 1.4,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {wildfireEnabled ? (
            <MapLibreGL.ShapeSource id="wildfire-perimeter-source" shape={wildfireData.perimeters as any}>
              <MapLibreGL.FillLayer
                id="wildfire-perimeter-fill"
                style={{
                  fillColor: 'rgba(251,146,60,0.12)',
                  fillOpacity: 0.18,
                }}
              />
              <MapLibreGL.LineLayer
                id="wildfire-perimeter-line"
                style={{
                  lineColor: '#fb923c',
                  lineOpacity: 0.95,
                  lineWidth: 2.2,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {state.viewId === 'wildfire' ? (
            <MapLibreGL.ShapeSource id="wildfire-incident-source" shape={wildfireData.incidents as any}>
              <MapLibreGL.CircleLayer
                id="wildfire-incident-halo"
                minZoomLevel={3}
                style={{
                  circleColor: ['coalesce', ['get', 'markerHaloColor'], 'rgba(251,146,60,0.24)'],
                  circleOpacity: 0.95,
                  circleRadius: ['coalesce', ['get', 'markerHaloRadius'], 16],
                  circleBlur: 0.45,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="wildfire-incident-circle"
                minZoomLevel={3}
                style={{
                  circleColor: ['coalesce', ['get', 'markerColor'], '#fb923c'],
                  circleOpacity: 0.95,
                  circleRadius: ['coalesce', ['get', 'markerRadius'], 8],
                  circleStrokeColor: ['coalesce', ['get', 'markerStrokeColor'], 'rgba(255,255,255,0.9)'],
                  circleStrokeWidth: ['coalesce', ['get', 'markerStrokeWidth'], 1.5],
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="wildfire-incident-center"
                minZoomLevel={4}
                style={{
                  circleColor: 'rgba(17,24,39,0.92)',
                  circleOpacity: 1,
                  circleRadius: ['coalesce', ['get', 'markerCenterRadius'], 3.5],
                  circleStrokeColor: 'rgba(255,255,255,0.88)',
                  circleStrokeWidth: 0.8,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.SymbolLayer
                id="wildfire-incident-label"
                minZoomLevel={5.5}
                style={{
                  textField: ['get', 'incidentName'],
                  textSize: 11,
                  textFont: ['Open Sans Bold'],
                  textColor: 'rgba(255,245,245,0.96)',
                  textHaloColor: 'rgba(2,6,23,0.98)',
                  textHaloWidth: 1.5,
                  textOffset: [0, 1.6],
                  textMaxWidth: 12,
                  textOptional: true,
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
              {radarUpdatedLabel}
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
            <MapActionButton label="Center" onPress={recenterToGps} />
            <MapActionButton
              label="Settings"
              onPress={() => setSettingsOpen(true)}
              active={settingsOpen}
            />
          </View>
        </View>

        {showRadarLegend ? (
          <View style={[styles.legendWrap, { bottom: legendBottom }]}>
            <LegendChip title="Radar">
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

        {(state.viewId === 'wildfire' && (wildfireDetailLoading || selectedWildfire)) ? (
          <View pointerEvents="box-none" style={[styles.fireDetailWrap, { bottom: 24 + insets.bottom }]}>
            <Glass style={styles.fireDetailCard}>
              <View style={styles.fireDetailHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.fireDetailEyebrow}>ACTIVE WILDFIRE</Text>
                  <Text style={styles.fireDetailTitle} numberOfLines={2}>
                    {wildfireDetailLoading ? 'Loading incident details' : selectedWildfire?.incidentName ?? 'No fire selected'}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedWildfire(null)} style={styles.fireDetailClose}>
                  <Text style={styles.fireDetailCloseText}>Close</Text>
                </Pressable>
              </View>

              {wildfireDetailLoading ? (
                <Text style={styles.fireDetailMeta}>Looking up the nearest current wildfire incident.</Text>
              ) : selectedWildfire ? (
                <>
                  <View style={styles.fireDetailPills}>
                    <HudBadge label="Active" strong />
                    {selectedWildfireSmokeBands.map((band) => (
                      <HudBadge key={band} label={band} />
                    ))}
                    {wildfireRestrictionInEffect ? <HudBadge label="Restrictions in effect" /> : null}
                    {selectedWildfire.percentContained != null ? (
                      <HudBadge label={`${Math.round(selectedWildfire.percentContained)}% contained`} />
                    ) : null}
                    {selectedWildfire.acres != null ? (
                      <HudBadge label={`${Math.round(selectedWildfire.acres).toLocaleString()} acres`} />
                    ) : null}
                  </View>

                  <Text style={styles.fireDetailMeta}>
                    {selectedWildfire.source ? `${selectedWildfire.source}` : 'NIFC / WFIGS'} • {formatWildfireUpdated(selectedWildfire.updatedAt)}
                  </Text>
                  <Text style={styles.fireDetailMeta}>
                    {[selectedWildfire.city, selectedWildfire.county, selectedWildfire.state].filter(Boolean).join(', ') || 'Location details pending'}
                  </Text>
                  {wildfireForestLabel ? (
                    <Text style={styles.fireDetailMeta}>Nearby forest unit: {wildfireForestLabel}</Text>
                  ) : null}

                  <View style={styles.fireDetailRows}>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Containment</Text>
                      <Text style={styles.fireDetailValue}>
                        {selectedWildfire.percentContained != null ? `${Math.round(selectedWildfire.percentContained)}%` : 'Pending'}
                      </Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Estimated size</Text>
                      <Text style={styles.fireDetailValue}>
                        {selectedWildfire.acres != null ? `${Math.round(selectedWildfire.acres).toLocaleString()} acres` : 'Pending'}
                      </Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Reported by</Text>
                      <Text style={styles.fireDetailValue}>NIFC / WFIGS</Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Fire restrictions</Text>
                      <Text style={styles.fireDetailValue}>
                        {wildfireRestrictionSummary ??
                          (wildfireRestrictionSupported ? 'No active restrictions listed' : 'Restrictions unavailable')}
                      </Text>
                    </View>
                    {wildfireFireWeatherSummary ? (
                      <View style={styles.fireDetailRow}>
                        <Text style={styles.fireDetailLabel}>Fire weather</Text>
                        <Text style={styles.fireDetailValue}>{wildfireFireWeatherSummary}</Text>
                      </View>
                    ) : null}
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Geometry source</Text>
                      <Text style={styles.fireDetailValue} numberOfLines={1}>
                        {selectedWildfire.geometrySource ?? 'Current perimeter feed'}
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <Text style={styles.fireDetailMeta}>Tap a wildfire perimeter area to inspect the current incident.</Text>
              )}
            </Glass>
          </View>
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

function safeNum(value: any) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

function geometryBbox(geometry: any) {
  const coords: number[][] = [];

  const walk = (node: any) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      coords.push([node[0], node[1]]);
      return;
    }
    node.forEach(walk);
  };

  walk(geometry?.coordinates);
  if (!coords.length) return null;

  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  coords.forEach(([lon, lat]) => {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  return { minLon, maxLon, minLat, maxLat };
}

function getNearbySmokeBands(selectedWildfire: WildfireIncidentDetails | null, smoke: any) {
  if (!selectedWildfire || selectedWildfire.latitude == null || selectedWildfire.longitude == null) return [];
  const features = Array.isArray(smoke?.features) ? smoke.features : [];
  const hit = new Set<string>();

  for (const feature of features) {
    const bbox = geometryBbox(feature?.geometry);
    if (!bbox) continue;
    const inBox =
      selectedWildfire.longitude >= bbox.minLon &&
      selectedWildfire.longitude <= bbox.maxLon &&
      selectedWildfire.latitude >= bbox.minLat &&
      selectedWildfire.latitude <= bbox.maxLat;
    if (!inBox) continue;
    const label =
      typeof feature?.properties?.densityCategory === 'string' ? feature.properties.densityCategory : null;
    if (label) hit.add(label);
  }

  return Array.from(hit).sort((a, b) => {
    const order = (label: string) =>
      label.includes('Heavy') ? 3 : label.includes('Medium') ? 2 : label.includes('Light') ? 1 : 0;
    return order(a) - order(b);
  });
}

function formatWildfireUpdated(value?: string | null) {
  if (!value) return 'Update time pending';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Update time pending';
  const diffMs = Date.now() - d.getTime();
  const diffHr = Math.round(diffMs / (60 * 60 * 1000));
  if (diffHr < 1) return 'Updated within the last hour';
  if (diffHr < 24) return `Updated ${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.round(diffHr / 24);
  return `Updated ${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
}

async function queryWildfireIncidentAtPoint(lat: number, lon: number): Promise<WildfireIncidentDetails | null> {
  const outFields = [
    'poly_IncidentName',
    'poly_GISAcres',
    'poly_Source',
    'poly_DateCurrent',
    'attr_ModifiedOnDateTime_dt',
    'attr_PercentContained',
    'attr_IncidentSize',
    'attr_POOCounty',
    'attr_POOState',
    'attr_POOCity',
    'attr_InitialLatitude',
    'attr_InitialLongitude',
    'attr_Source',
  ].join(',');

  const buildUrl = (geometry: string, geometryType: 'esriGeometryPoint' | 'esriGeometryEnvelope') => {
    const url = new URL(WFIGS_CURRENT_PERIMETERS_QUERY_URL);
    url.searchParams.set('f', 'pjson');
    url.searchParams.set('where', '1=1');
    url.searchParams.set('geometry', geometry);
    url.searchParams.set('geometryType', geometryType);
    url.searchParams.set('inSR', '4326');
    url.searchParams.set('spatialRel', 'esriSpatialRelIntersects');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('outFields', outFields);
    return url.toString();
  };

  const toIncident = (attrs: any): WildfireIncidentDetails | null => {
    const incidentName =
      typeof attrs?.poly_IncidentName === 'string' && attrs.poly_IncidentName.trim()
        ? attrs.poly_IncidentName.trim()
        : null;
    if (!incidentName) return null;

    return {
      incidentName,
      percentContained: safeNum(attrs?.attr_PercentContained),
      acres: safeNum(attrs?.poly_GISAcres) ?? safeNum(attrs?.attr_IncidentSize),
      updatedAt:
        typeof attrs?.attr_ModifiedOnDateTime_dt === 'string'
          ? attrs.attr_ModifiedOnDateTime_dt
          : typeof attrs?.poly_DateCurrent === 'string'
            ? attrs.poly_DateCurrent
            : null,
      source: typeof attrs?.attr_Source === 'string' ? attrs.attr_Source : 'NIFC / WFIGS',
      county: typeof attrs?.attr_POOCounty === 'string' ? attrs.attr_POOCounty : null,
      state: typeof attrs?.attr_POOState === 'string' ? attrs.attr_POOState : null,
      city: typeof attrs?.attr_POOCity === 'string' ? attrs.attr_POOCity : null,
      geometrySource: typeof attrs?.poly_Source === 'string' ? attrs.poly_Source : null,
      latitude: safeNum(attrs?.attr_InitialLatitude),
      longitude: safeNum(attrs?.attr_InitialLongitude),
    };
  };

  const pointRes = await fetch(buildUrl(`${lon},${lat}`, 'esriGeometryPoint'));
  if (!pointRes.ok) throw new Error(`Wildfire query failed (${pointRes.status})`);
  const pointJson = await pointRes.json();
  const pointFeatures = Array.isArray(pointJson?.features) ? pointJson.features : [];
  if (pointFeatures.length) {
    return toIncident(pointFeatures[0]?.attributes ?? null);
  }

  const radiusDeg = 0.35;
  const env = `${lon - radiusDeg},${lat - radiusDeg},${lon + radiusDeg},${lat + radiusDeg}`;
  const envRes = await fetch(buildUrl(env, 'esriGeometryEnvelope'));
  if (!envRes.ok) throw new Error(`Wildfire nearby query failed (${envRes.status})`);
  const envJson = await envRes.json();
  const envFeatures = Array.isArray(envJson?.features) ? envJson.features : [];
  if (!envFeatures.length) return null;

  const nearest = envFeatures
    .map((feature: any) => {
      const attrs = feature?.attributes ?? {};
      const fl = safeNum(attrs?.attr_InitialLatitude);
      const fn = safeNum(attrs?.attr_InitialLongitude);
      const distanceMi =
        fl != null && fn != null ? haversineMiles(lat, lon, fl, fn) : Number.POSITIVE_INFINITY;
      return { attrs, distanceMi };
    })
    .sort((a: any, b: any) => {
      if (a.distanceMi !== b.distanceMi) return a.distanceMi - b.distanceMi;
      return (safeNum(b.attrs?.poly_GISAcres) ?? 0) - (safeNum(a.attrs?.poly_GISAcres) ?? 0);
    })[0];

  return toIncident(nearest?.attrs ?? null);
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
  fireDetailWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  fireDetailCard: {
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fireDetailHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  fireDetailEyebrow: {
    color: 'rgba(248,113,113,0.86)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  fireDetailTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  fireDetailClose: {
    paddingVertical: 8,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  fireDetailCloseText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '900',
  },
  fireDetailPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  fireDetailMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 8,
  },
  fireDetailRows: {
    marginTop: 12,
    gap: 8,
  },
  fireDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  fireDetailLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  fireDetailValue: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
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
