import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import MapLibreGL from '@maplibre/maplibre-react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Glass } from '../../components/common/Glass';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { LayerSheetModal } from '../../components/maps/LayerSheetModal';
import { AviationAltitudeSelector } from '../../components/maps/aviation/AviationAltitudeSelector';
import { AviationFeatureInspector } from '../../components/maps/aviation/AviationFeatureInspector';
import { AviationMapControls } from '../../components/maps/aviation/AviationMapControls';
import { AviationStatusStrip } from '../../components/maps/aviation/AviationStatusStrip';
import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { RadarLegend } from '../../components/maps/RadarLegend';
import { TimelineScrubber } from '../../components/maps/TimelineScrubber';
import type { WmsOverlayConfig } from '../../components/maps/overlays/OverlayEngine';

import { useFireContext } from '../lib/fire/useFireContext';
import { useFireRestrictionsMapData } from '../lib/maps/useFireRestrictionsMapData';
import { useLocations } from '../lib/locations/useLocations';
import { filterAviationFeatures, pickCurrentValidTime, toggleFilterValue } from '../lib/aviation/filters';
import { aviationFeaturesToFeatureCollection, normalizeAviationFeatureCollection } from '../lib/aviation/normalize';
import type { AviationFeature, AviationHazardType, AviationProductType } from '../lib/aviation/types';
import { aviationFillColorExpression, aviationLineColorExpression } from '../lib/aviation/colors';
import { LAYER_CATALOG_BY_ID } from '../lib/maps/layerCatalog';
import { createInitialMapState, mapReducer } from '../lib/maps/state';
import type { LayerId } from '../lib/maps/types';
import type { RadarProductId } from '../lib/maps/radarIem';
import { useAviationMapData } from '../lib/maps/useAviationMapData';
import { useWildfireMapData } from '../lib/maps/useWildfireMapData';
import { useRadarController } from '../lib/maps/useRadarController';
import { MAP_VIEWS } from '../lib/maps/views';
import { usePlace } from '../context/PlaceContext';
import { useSettings } from '../context/SettingsContext';

const WPC_FRONTS_EXPORT_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';
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

const RADAR_PRODUCT_META: Record<
  RadarProductId,
  {
    chipLabel: string;
    summaryLabel: string;
    legendStyle: 'reflectivity' | 'velocity';
    legendTitle: string;
    legendLeft: string;
    legendMid: string;
    legendRight: string;
    legendNote: string;
  }
> = {
  N0Q: {
    chipLabel: 'Reflectivity',
    summaryLabel: 'Reflectivity',
    legendStyle: 'reflectivity',
    legendTitle: 'Reflectivity',
    legendLeft: 'Light',
    legendMid: 'Moderate',
    legendRight: 'Severe',
    legendNote: 'Shows precipitation intensity and storm structure.',
  },
  N0B: {
    chipLabel: 'N0B Refl',
    summaryLabel: 'High-res reflectivity',
    legendStyle: 'reflectivity',
    legendTitle: 'High-res Reflectivity',
    legendLeft: 'Light',
    legendMid: 'Moderate',
    legendRight: 'Severe',
    legendNote: 'Single-site high-resolution reflectivity for storm structure.',
  },
  N0Z: {
    chipLabel: 'Velocity',
    summaryLabel: 'Velocity',
    legendStyle: 'velocity',
    legendTitle: 'Velocity',
    legendLeft: 'Away',
    legendMid: 'Neutral',
    legendRight: 'Toward',
    legendNote: 'Shows wind motion relative to the radar, not rain intensity.',
  },
  N0U: {
    chipLabel: 'N0U Vel',
    summaryLabel: 'Base velocity',
    legendStyle: 'velocity',
    legendTitle: 'Base Velocity',
    legendLeft: 'Away',
    legendMid: 'Neutral',
    legendRight: 'Toward',
    legendNote: 'Single-site radial velocity for inbound/outbound wind signatures.',
  },
  N0S: {
    chipLabel: 'N0S SRV',
    summaryLabel: 'Storm-relative velocity',
    legendStyle: 'velocity',
    legendTitle: 'Storm-Relative Velocity',
    legendLeft: 'Away',
    legendMid: 'Neutral',
    legendRight: 'Toward',
    legendNote: 'Velocity with storm motion removed to make rotation easier to inspect.',
  },
};

const STORM_RADAR_PRODUCTS: RadarProductId[] = ['N0B', 'N0U', 'N0S'];

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

type SatelliteFrame = {
  index: number;
  iso: string;
};

function buildSatelliteFrames(opts?: { minutesBack?: number; stepMinutes?: number; now?: Date }): SatelliteFrame[] {
  const minutesBack = opts?.minutesBack ?? 150;
  const stepMinutes = opts?.stepMinutes ?? 10;
  const now = opts?.now ?? new Date();
  if (minutesBack <= 0 || stepMinutes <= 0) return [];

  const alignedMs = Math.floor(now.getTime() / (stepMinutes * 60_000)) * stepMinutes * 60_000;
  const latestMs = alignedMs - stepMinutes * 60_000;
  const frameCount = Math.floor(minutesBack / stepMinutes) + 1;

  return Array.from({ length: frameCount }, (_, index) => {
    const minutesAgo = (frameCount - 1 - index) * stepMinutes;
    return { index, iso: new Date(latestMs - minutesAgo * 60_000).toISOString() };
  });
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
  fireRestrictionsEnabled: boolean;
  radarEnabled: boolean;
  frontsDay1Enabled: boolean;
  frontsDay2Enabled: boolean;
  frontsDay3Enabled: boolean;
  cloudsEnabled: boolean;
  wildfireHotspotsEnabled: boolean;
  wildfireSmokeEnabled: boolean;
  wildfireEnabled: boolean;
  wildfireFireWxEnabled: boolean;
  goesTrueColorEnabled: boolean;
  goesEastIrEnabled: boolean;
  goesEastWvEnabled: boolean;
  goesWestWvEnabled: boolean;
  playing: boolean;
  frameCount: number;
}) {
  const {
    viewId,
    fireRestrictionsEnabled,
    radarEnabled,
    frontsDay1Enabled,
    frontsDay2Enabled,
    frontsDay3Enabled,
    cloudsEnabled,
    wildfireHotspotsEnabled,
    wildfireSmokeEnabled,
    wildfireEnabled,
    wildfireFireWxEnabled,
    goesTrueColorEnabled,
    goesEastIrEnabled,
    goesEastWvEnabled,
    goesWestWvEnabled,
    playing,
    frameCount,
  } = args;

  if (goesTrueColorEnabled) return 'GOES true color active';
  if (cloudsEnabled) return 'GOES visible active';
  if (goesEastIrEnabled) return 'GOES infrared active';
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
      fireRestrictionsEnabled ? 'Restrictions on' : null,
      wildfireHotspotsEnabled ? 'Incidents on' : null,
      wildfireSmokeEnabled ? 'Smoke on' : null,
      wildfireEnabled ? 'Perimeters on' : null,
      wildfireFireWxEnabled ? 'Fire weather on' : null,
    ].filter(Boolean);
    return `${parts.length ? parts.join(' / ') : 'Wildfire overlays off'}${radarEnabled ? ' / Radar on' : ''}`;
  }

  if (viewId === 'aviation') {
    return radarEnabled ? `${playing ? 'Animating' : 'Paused'} / Experimental aviation hazards` : 'Radar off';
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
  const { active: activePlace } = usePlace();

  const [state, dispatch] = React.useReducer(mapReducer, undefined, () =>
    createInitialMapState({ viewId: 'radar', nerdy: false }),
  );

  const loc = useLocations();
  const permission = 'granted' as const;

  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
  const [rawMode, setRawMode] = useState(false);
  const [stormProduct, setStormProduct] = useState<RadarProductId>('N0B');
  const [cameraDebugLabel, setCameraDebugLabel] = useState('idle');
  const [selectedWildfire, setSelectedWildfire] = useState<WildfireIncidentDetails | null>(null);
  const [selectedAviationFeature, setSelectedAviationFeature] = useState<AviationFeature | null>(null);
  const [selectedAviationProducts, setSelectedAviationProducts] = useState<AviationProductType[]>([
    'gairmet',
    'sigmet',
    'convectiveSigmet',
  ]);
  const [selectedAviationHazards, setSelectedAviationHazards] = useState<AviationHazardType[]>([
    'ice',
    'turb',
    'llws',
    'ifr',
    'mtnObscuration',
    'ts',
  ]);
  const [selectedAviationAltitudeFt, setSelectedAviationAltitudeFt] = useState<number | null>(null);
  const [selectedAviationValidTime, setSelectedAviationValidTime] = useState<Date>(new Date());
  const [showUnknownAviationAltitude, setShowUnknownAviationAltitude] = useState(false);
  const [selectedRestrictionPoint, setSelectedRestrictionPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [wildfireDetailLoading, setWildfireDetailLoading] = useState(false);

  const mapCameraRef = useRef<any>(null);
  const locateSeedRegionRef = useRef<Region | null>(null);
  const routeFocusSeedRegionRef = useRef<Region | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [mapResetKey, setMapResetKey] = useState(0);
  const { baseMapStyle } = useSettings();

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
  const locateRequestIdRef = useRef(0);
  const wildfireLookupRef = useRef<{ incidents: any; perimeters: any; symbols: any }>({
    incidents: null,
    perimeters: null,
    symbols: null,
  });

  const [mapZoom, setMapZoom] = useState<number>(4);
  const stormMode = state.viewId === 'storm';
  const product: RadarProductId = stormMode ? stormProduct : 'N0Q';
  const effectiveRadarProvider = stormMode ? 'iem' : 'rainviewer';

  const handleMapPress = useCallback(
    async (e: any) => {
      const wildfireInteractionEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;
      if (!wildfireInteractionEnabled) {
        setSelectedWildfire(null);
        setSelectedRestrictionPoint(null);
        if (state.viewId !== 'aviation') setSelectedAviationFeature(null);
        return;
      }

      const pressCoords = getMapPressLonLat(e);
      if (!pressCoords) return;
      const { lat, lon } = pressCoords;

      setSelectedRestrictionPoint({ lat, lon });

      try {
        setWildfireDetailLoading(true);
        const localDetail = findNearestLoadedWildfireDetail(lat, lon, wildfireLookupRef.current);
        if (localDetail) {
          setSelectedWildfire({
            ...localDetail,
            latitude: localDetail.latitude ?? lat,
            longitude: localDetail.longitude ?? lon,
          });
          return;
        }

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
  const fireRestrictionsEnabled = !!state.layers?.['fire.restrictions']?.enabled;
  const wildfireSmokeEnabled = !!state.layers?.['wildfire.smoke']?.enabled;
  const wildfireEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;
  const wildfireHotspotsEnabled = !!state.layers?.['wildfire.hotspots']?.enabled;
  const wildfireFireWxEnabled = !!state.layers?.['wildfire.firewx']?.enabled;
  const cloudsEnabled = !!state.layers?.['sat.clouds']?.enabled;
  const frontsDay1Enabled = !!state.layers?.['wx.fronts.day1']?.enabled;
  const frontsDay2Enabled = !!state.layers?.['wx.fronts.day2']?.enabled;
  const frontsDay3Enabled = !!state.layers?.['wx.fronts.day3']?.enabled;
  const aviationModeActive = state.viewId === 'aviation';
  const aviationTurbEnabled = !aviationModeActive && !!state.layers?.['aviation.gairmet.turb']?.enabled;
  const aviationIceEnabled = !aviationModeActive && !!state.layers?.['aviation.gairmet.ice']?.enabled;
  const aviationSigmetEnabled = !aviationModeActive && !!state.layers?.['aviation.sigmet']?.enabled;
  const aviationCwaEnabled = !aviationModeActive && !!state.layers?.['aviation.cwa']?.enabled;
  const aviationPirepEnabled = !aviationModeActive && !!state.layers?.['aviation.pirep']?.enabled;

  const goesTrueColorEnabled = !!state.layers?.['sat.goes.truecolor']?.enabled;
  const goesEastIrEnabled = !!state.layers?.['sat.goesEast.ir']?.enabled;
  const goesEastWvEnabled = !!state.layers?.['sat.goesEast.wv']?.enabled;
  const goesWestWvEnabled = !!state.layers?.['sat.goesWest.wv']?.enabled;
  const animatedSatelliteEnabled = cloudsEnabled || goesEastIrEnabled || goesEastWvEnabled || goesWestWvEnabled;
  const anySatelliteEnabled = animatedSatelliteEnabled || goesTrueColorEnabled;
  const [satelliteFrames, setSatelliteFrames] = useState<SatelliteFrame[]>(() => buildSatelliteFrames());
  const [satelliteFrameIndex, setSatelliteFrameIndex] = useState(() => Math.max(0, buildSatelliteFrames().length - 1));
  const [satellitePlaying, setSatellitePlaying] = useState(false);
  const [satelliteBlend, setSatelliteBlend] = useState<{ from: number; to: number; t: number }>({
    from: satelliteFrameIndex,
    to: satelliteFrameIndex,
    t: 1,
  });
  const satelliteWasActiveRef = useRef(false);
  const satelliteFrameIndexRef = useRef(satelliteFrameIndex);

  useEffect(() => {
    if (!animatedSatelliteEnabled) {
      satelliteWasActiveRef.current = false;
      setSatellitePlaying(false);
      return;
    }

    if (!satelliteWasActiveRef.current) {
      satelliteWasActiveRef.current = true;
      setSatelliteFrames(buildSatelliteFrames());
      setSatelliteFrameIndex((current) => {
        const frames = buildSatelliteFrames();
        return clampIndex(current > 0 ? current : frames.length - 1, frames.length);
      });
      setSatellitePlaying(true);
    }
  }, [animatedSatelliteEnabled]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) return;

    const refresh = setInterval(() => {
      setSatelliteFrames((current) => {
        const next = buildSatelliteFrames();
        if (current.length && current[current.length - 1]?.iso === next[next.length - 1]?.iso) return current;
        setSatelliteFrameIndex((index) => clampIndex(index + (next.length - current.length), next.length));
        return next;
      });
    }, 5 * 60_000);

    return () => clearInterval(refresh);
  }, [animatedSatelliteEnabled]);

  useEffect(() => {
    if (!animatedSatelliteEnabled || !satellitePlaying || satelliteFrames.length < 2) return;

    const timer = setInterval(() => {
      setSatelliteFrameIndex((current) => (clampIndex(current, satelliteFrames.length) + 1) % satelliteFrames.length);
    }, 1450);

    return () => clearInterval(timer);
  }, [animatedSatelliteEnabled, satelliteFrames.length, satellitePlaying]);

  useEffect(() => {
    if (!animatedSatelliteEnabled || satelliteFrames.length < 2) {
      setSatelliteBlend({ from: satelliteFrameIndex, to: satelliteFrameIndex, t: 1 });
      satelliteFrameIndexRef.current = satelliteFrameIndex;
      return;
    }

    const previous = clampIndex(satelliteFrameIndexRef.current, satelliteFrames.length);
    const next = clampIndex(satelliteFrameIndex, satelliteFrames.length);
    if (previous === next) {
      setSatelliteBlend({ from: next, to: next, t: 1 });
      satelliteFrameIndexRef.current = next;
      return;
    }

    const startedAt = Date.now();
    const blendMs = 650;
    setSatelliteBlend({ from: previous, to: next, t: 0 });
    satelliteFrameIndexRef.current = next;

    const timer = setInterval(() => {
      const raw = (Date.now() - startedAt) / blendMs;
      const t = Math.max(0, Math.min(1, raw));
      setSatelliteBlend({ from: previous, to: next, t });
      if (t >= 1) clearInterval(timer);
    }, 40);

    return () => clearInterval(timer);
  }, [animatedSatelliteEnabled, satelliteFrameIndex, satelliteFrames.length]);

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
  const fireRestrictionsOpacity = Number.isFinite(state.layers?.['fire.restrictions']?.opacity)
    ? state.layers['fire.restrictions'].opacity
    : 0.48;
  const wildfireSmokeOpacity = Number.isFinite(state.layers?.['wildfire.smoke']?.opacity)
    ? state.layers['wildfire.smoke'].opacity
    : 0.55;
  const wildfireFireWxOpacity = Number.isFinite(state.layers?.['wildfire.firewx']?.opacity)
    ? state.layers['wildfire.firewx'].opacity
    : 0.76;

  const goesTrueColorOpacity = Number.isFinite(state.layers?.['sat.goes.truecolor']?.opacity)
    ? state.layers['sat.goes.truecolor'].opacity
    : 0.96;

  const goesEastIrOpacity = Number.isFinite(state.layers?.['sat.goesEast.ir']?.opacity)
    ? state.layers['sat.goesEast.ir'].opacity
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
  const aviationData = useAviationMapData(aviationOverlayEnabled || aviationModeActive);
  const aviationAvailableTimes = aviationData.validTimes ?? [];

  useEffect(() => {
    if (!aviationModeActive || !aviationAvailableTimes.length) return;
    const currentMs = selectedAviationValidTime.getTime();
    const stillAvailable = aviationAvailableTimes.some((value) => Math.abs(Date.parse(value) - currentMs) < 60 * 1000);
    if (!stillAvailable) setSelectedAviationValidTime(pickCurrentValidTime(aviationAvailableTimes));
  }, [aviationAvailableTimes, aviationModeActive, selectedAviationValidTime]);

  const normalizedAviationHazards = useMemo(
    () => normalizeAviationFeatureCollection(aviationData.allHazards),
    [aviationData.allHazards],
  );
  const normalizedAviationPireps = useMemo(
    () => normalizeAviationFeatureCollection(aviationData.pireps),
    [aviationData.pireps],
  );
  const visibleAviationHazards = useMemo(
    () =>
      filterAviationFeatures({
        features: normalizedAviationHazards,
        selectedProducts: selectedAviationProducts,
        selectedHazards: selectedAviationHazards,
        selectedAltitudeFt: selectedAviationAltitudeFt,
        selectedValidTime: selectedAviationValidTime,
        showUnknownAltitude: showUnknownAviationAltitude,
      }),
    [
      normalizedAviationHazards,
      selectedAviationAltitudeFt,
      selectedAviationHazards,
      selectedAviationProducts,
      selectedAviationValidTime,
      showUnknownAviationAltitude,
    ],
  );
  const visibleAviationPireps = useMemo(
    () =>
      selectedAviationProducts.includes('pirep')
        ? filterAviationFeatures({
            features: normalizedAviationPireps,
            selectedProducts: ['pirep'],
            selectedHazards: selectedAviationHazards,
            selectedAltitudeFt: selectedAviationAltitudeFt,
            selectedValidTime: selectedAviationValidTime,
            showUnknownAltitude: true,
            includeMissingValidTime: true,
          })
        : [],
    [
      normalizedAviationPireps,
      selectedAviationAltitudeFt,
      selectedAviationHazards,
      selectedAviationProducts,
      selectedAviationValidTime,
    ],
  );
  const aviationHazardsFc = useMemo(
    () => aviationFeaturesToFeatureCollection(visibleAviationHazards),
    [visibleAviationHazards],
  );
  const aviationPirepsFc = useMemo(
    () => aviationFeaturesToFeatureCollection(visibleAviationPireps),
    [visibleAviationPireps],
  );

  const handleAviationFeaturePress = useCallback(
    (e: any) => {
      const id = String(e?.features?.[0]?.properties?.id ?? e?.features?.[0]?.id ?? '');
      const feature = [...visibleAviationHazards, ...visibleAviationPireps].find((item) => item.id === id);
      if (feature) setSelectedAviationFeature(feature);
    },
    [visibleAviationHazards, visibleAviationPireps],
  );

  const aviationFiltered = useMemo(
    () => ({
      turbulence: aviationData.turbulence,
      icing: aviationData.icing,
      advisories: aviationData.advisories,
      centerWeather: aviationData.centerWeather,
    }),
    [aviationData.advisories, aviationData.centerWeather, aviationData.icing, aviationData.turbulence],
  );

  const activeLayerSummary = useMemo(() => getActiveLayerSummary(state), [state]);

  const centerForRadar = useMemo(() => {
    if (region) return { lat: region.latitude, lon: region.longitude };
    return { lat: 39.5, lon: -98.35 };
  }, [region]);

  const radarCtl = useRadarController({
    state,
    dispatch,
    sheetValue: { radarProvider: effectiveRadarProvider },
    centerForRadar,
    mapZoom,
    product,
    rawMode,
    region,
    localMinZoom: Number.POSITIVE_INFINITY,
    ridgeMinZoom: stormMode ? 7.4 : 8.6,
  });

  const uiFrames = radarCtl.uiFrames;
  const frameCount = radarCtl.frameCount;
  const activeFrameIso = radarCtl.activeFrameIso;
  const timestampLabel = radarCtl.timestampLabel;
  const radarProductMeta = RADAR_PRODUCT_META[product];

  const radarTileMaxZ = useMemo(() => {
    if (effectiveRadarProvider === 'rainviewer') return radarCtl.radarTileMaxZ;
    return Math.max(radarCtl.radarTileMaxZ, Math.ceil(mapZoom));
  }, [effectiveRadarProvider, radarCtl.radarTileMaxZ, mapZoom]);

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
    const satelliteFromFrame = satelliteFrames[clampIndex(satelliteBlend.from, satelliteFrames.length)] ?? null;
    const satelliteToFrame = satelliteFrames[clampIndex(satelliteBlend.to, satelliteFrames.length)] ?? null;
    const satelliteFade = Math.max(0, Math.min(1, satelliteBlend.t));

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

    const addAnimatedSatelliteWms = (args: {
      id: string;
      url: string;
      layers: string;
      opacity: number;
      zIndex: number;
    }) => {
      const opacity = Math.max(0, Math.min(1, Number(args.opacity)));
      const fromIso = satelliteFromFrame?.iso ?? null;
      const toIso = satelliteToFrame?.iso ?? fromIso;
      const sameFrame = !fromIso || fromIso === toIso || satelliteFade >= 1;

      if (!sameFrame && fromIso) {
        list.push({
          id: `${args.id}-prev`,
          url: args.url,
          layers: args.layers,
          time: fromIso,
          opacity: opacity * (1 - satelliteFade),
          zIndex: args.zIndex,
          ...shared,
          fadeDurationMs: 240,
        });
      }

      list.push({
        id: args.id,
        url: args.url,
        layers: args.layers,
        time: toIso,
        opacity: opacity * (sameFrame ? 1 : satelliteFade),
        zIndex: args.zIndex + 0.01,
        ...shared,
        fadeDurationMs: 240,
      });
    };

    if (goesTrueColorEnabled) {
      list.push({
        id: 'goes-truecolor',
        tileUrlTemplates: [NESDIS_GEOCOLOR_TILE_TEMPLATE],
        opacity: Math.max(0, Math.min(1, Number(goesTrueColorOpacity))),
        zIndex: 62,
        enabled: true,
        tileSize: 512,
        maxZoomLevel: 12,
        fadeDurationMs: 150,
        resampling: 'linear',
      });
    }

    if (cloudsEnabled) {
      addAnimatedSatelliteWms({
        id: 'goes-east-visible',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 60,
      });
      addAnimatedSatelliteWms({
        id: 'goes-west-visible',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 61,
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

    if (goesEastIrEnabled) {
      addAnimatedSatelliteWms({
        id: 'goes-east-ir',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch13',
        opacity: Math.max(0, Math.min(1, Number(goesEastIrOpacity))),
        zIndex: 63,
      });
      addAnimatedSatelliteWms({
        id: 'goes-west-ir',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch13',
        opacity: Math.max(0, Math.min(1, Number(goesEastIrOpacity))),
        zIndex: 63,
      });
    }

    if (goesEastWvEnabled) {
      addAnimatedSatelliteWms({
        id: 'goes-east-wv',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch08',
        opacity: Math.max(0, Math.min(1, Number(goesEastWvOpacity))),
        zIndex: 64,
      });
    }

    if (goesWestWvEnabled) {
      addAnimatedSatelliteWms({
        id: 'goes-west-wv',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch08',
        opacity: Math.max(0, Math.min(1, Number(goesWestWvOpacity))),
        zIndex: 64,
      });
    }

    return list;
  }, [
    cloudsEnabled,
    cloudsOpacity,
    frontsDay1Enabled,
    frontsDay1Opacity,
    frontsDay2Enabled,
    frontsDay2Opacity,
    frontsDay3Enabled,
    frontsDay3Opacity,
    wildfireFireWxEnabled,
    wildfireFireWxOpacity,
    goesTrueColorEnabled,
    goesTrueColorOpacity,
    goesEastIrEnabled,
    goesEastIrOpacity,
    goesEastWvEnabled,
    goesEastWvOpacity,
    goesWestWvEnabled,
    goesWestWvOpacity,
    satelliteBlend.from,
    satelliteBlend.t,
    satelliteBlend.to,
    satelliteFrames,
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

  const [stableInitialRegion] = useState<Region>(() => {
    if (activePlace && activePlace.source !== 'gps') {
      return {
        latitude: activePlace.lat,
        longitude: activePlace.lon,
        latitudeDelta: 2.5,
        longitudeDelta: 2.5,
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
    if (!routeFocusTarget) return;

    const nextRegion: Region = {
      latitude: routeFocusTarget.lat,
      longitude: routeFocusTarget.lon,
      latitudeDelta: 2,
      longitudeDelta: 2,
      zoom: approxZoomFromLongitudeDelta(2),
    };

    setCameraDebugLabel(`route-focus:${routeFocusTarget.lat.toFixed(2)},${routeFocusTarget.lon.toFixed(2)}`);
    routeFocusSeedRegionRef.current = nextRegion;
    setRegion(nextRegion);
    setMapZoom(nextRegion.zoom ?? approxZoomFromLongitudeDelta(nextRegion.longitudeDelta));
    setMapResetKey((value) => value + 1);
    setConsumedRouteFocusKey(routeFocusTarget.key);

    requestAnimationFrame(() => {
      routeFocusSeedRegionRef.current = null;
      router.setParams({
        focus: 'consumed',
        lat: '',
        lon: '',
        label: '',
        source: '',
        targetType: '',
      });
    });
  }, [routeFocusTarget, router]);

  const effectiveRegion = region ?? stableInitialRegion;
  const wildfireVectorEnabled =
    state.viewId === 'wildfire' || wildfireSmokeEnabled || wildfireEnabled || wildfireHotspotsEnabled;
  const fireRestrictionsData = useFireRestrictionsMapData(fireRestrictionsEnabled, effectiveRegion);
  const wildfireData = useWildfireMapData(wildfireVectorEnabled, effectiveRegion);
  const visibleWildfirePerimeters = useMemo(
    () => filterVisibleWildfirePerimeters(wildfireData.perimeters),
    [wildfireData.perimeters]
  );
  const wildfireSymbolData = useMemo(
    () => buildWildfireSymbolFeatureCollection(visibleWildfirePerimeters),
    [visibleWildfirePerimeters]
  );
  useEffect(() => {
    wildfireLookupRef.current = {
      incidents: wildfireData.incidents,
      perimeters: visibleWildfirePerimeters,
      symbols: wildfireSymbolData,
    };
  }, [wildfireData.incidents, visibleWildfirePerimeters, wildfireSymbolData]);
  const selectedWildfireSmokeBands = useMemo(
    () => getNearbySmokeBands(selectedWildfire, wildfireData.smoke),
    [selectedWildfire, wildfireData.smoke]
  );
  const handleWildfireFeaturePress = useCallback((e: any) => {
    const feature = e?.features?.[0] ?? e?.feature ?? null;
    const pressCoords = getMapPressLonLat(e);
    const pressLon = pressCoords?.lon ?? null;
    const pressLat = pressCoords?.lat ?? null;
    const detail = wildfireFeatureToIncidentDetails(feature, pressLat, pressLon);

    if (pressLat != null && pressLon != null) {
      setSelectedRestrictionPoint({ lat: pressLat, lon: pressLon });
    } else if (detail?.latitude != null && detail?.longitude != null) {
      setSelectedRestrictionPoint({ lat: detail.latitude, lon: detail.longitude });
    }

    if (detail) {
      setWildfireDetailLoading(false);
      setSelectedWildfire(detail);
    }
  }, []);
  const wildfireFireContext = useFireContext({
    lat: selectedWildfire?.latitude ?? selectedRestrictionPoint?.lat ?? 0,
    lon: selectedWildfire?.longitude ?? selectedRestrictionPoint?.lon ?? 0,
    enabled:
      wildfireEnabled &&
      ((selectedWildfire != null &&
        Number.isFinite(selectedWildfire?.latitude) &&
        Number.isFinite(selectedWildfire?.longitude)) ||
        (selectedRestrictionPoint != null &&
          Number.isFinite(selectedRestrictionPoint?.lat) &&
          Number.isFinite(selectedRestrictionPoint?.lon))),
  });
  const wildfireRestrictionSummary =
    wildfireFireContext.data?.restrictions?.summary ??
    (wildfireFireContext.loading ? 'Checking nearby fire restrictions.' : null);
  const wildfireRestrictionInEffect = wildfireFireContext.data?.restrictions?.inEffect === true;
  const wildfireRestrictionSupported = wildfireFireContext.data?.restrictions?.supported === true;
  const wildfireForestLabel = wildfireFireContext.data?.forest?.name ?? null;
  const wildfireFireWeatherSummary = wildfireFireContext.data?.fireWeather?.summary ?? null;
  const wildfireRestrictionCards = wildfireFireContext.data?.restrictions?.cards ?? [];
  const wildfireRestrictionOrder = wildfireRestrictionCards[0]?.forestOrder ?? null;
  const wildfireRestrictionStartDate = wildfireRestrictionCards[0]?.startDate ?? null;
  const wildfireRestrictionSourceUrl = wildfireRestrictionCards[0]?.url ?? wildfireFireContext.data?.restrictions?.source ?? null;

  const pushSpecialMap = useCallback(
    (pathname: '/astro-map' | '/nautical-map') => {
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

  const recenterToGps = () => {
    locateRequestIdRef.current += 1;
    const cachedCoords = loc.state.currentCoords;
    if (cachedCoords && Number.isFinite(cachedCoords.lat) && Number.isFinite(cachedCoords.lon)) {
      const longitudeDelta =
        region?.longitudeDelta && Number.isFinite(region.longitudeDelta) ? region.longitudeDelta : stableInitialRegion.longitudeDelta;
      const latitudeDelta =
        region?.latitudeDelta && Number.isFinite(region.latitudeDelta) ? region.latitudeDelta : stableInitialRegion.latitudeDelta;

      locateSeedRegionRef.current = {
        latitude: cachedCoords.lat,
        longitude: cachedCoords.lon,
        latitudeDelta,
        longitudeDelta,
      };
      setCameraDebugLabel(`locate-reset:${cachedCoords.lat.toFixed(2)},${cachedCoords.lon.toFixed(2)}`);
      setMapResetKey((value) => value + 1);
      requestAnimationFrame(() => {
        locateSeedRegionRef.current = null;
      });
      return;
    }
    setCameraDebugLabel('locate-unavailable');
  };

  const currentViewTitle = activeLayerSummary.hasActiveLayers
    ? activeLayerSummary.title
    : (MAP_VIEWS.find((view) => view.id === state.viewId)?.title ?? 'Maps');

  const showRadarLegend = isFocused && radarEnabled && isRadarPrimaryView(String(state.viewId));

  const simpleStatus = getSimpleStatus({
    viewId: String(state.viewId),
    fireRestrictionsEnabled,
    radarEnabled,
    frontsDay1Enabled,
    frontsDay2Enabled,
    frontsDay3Enabled,
    cloudsEnabled,
    wildfireHotspotsEnabled,
    wildfireSmokeEnabled,
    wildfireEnabled,
    wildfireFireWxEnabled,
    goesTrueColorEnabled,
    goesEastIrEnabled,
    goesEastWvEnabled,
    goesWestWvEnabled,
    playing: state.radarTime.playing,
    frameCount,
  });

  const satelliteFrameCount = satelliteFrames.length;
  const satelliteTimelineActive = !radarEnabled && animatedSatelliteEnabled && satelliteFrameCount > 1;
  const timelineFrames = radarEnabled ? uiFrames : satelliteFrames;
  const timelineFrameIndex = radarEnabled ? state.radarTime.frameIndex : satelliteFrameIndex;
  const timelinePlaying = radarEnabled ? state.radarTime.playing : satellitePlaying;
  const showTimeline = isFocused && ((radarEnabled && frameCount > 1) || satelliteTimelineActive);
  const dockBottom = 12 + insets.bottom;
  const DOCK_ESTIMATED_HEIGHT = 102;
  const legendBottom = showTimeline ? dockBottom + DOCK_ESTIMATED_HEIGHT + 10 : dockBottom + 6;

  const accentBg = getViewAccent(String(state.viewId));
  const activeOverlayCount = activeLayerSummary.count ?? 0;
  const boundaryReliefTone =
    goesEastIrEnabled
      ? 'orange'
      : cloudsEnabled || goesTrueColorEnabled
        ? 'teal'
        : null;

  const overlaySummaryText = activeLayerSummary.hasActiveLayers
    ? activeLayerSummary.subtitle ?? simpleStatus
    : simpleStatus;

  const providerLabel = stormMode ? 'Single-site radar' : effectiveRadarProvider === 'rainviewer' ? 'RainViewer' : 'IEM radar';
  const radarProductLabel = stormMode ? radarProductMeta.summaryLabel : null;
  const radarUpdatedLabel = timestampLabel ? `Updated ${timestampLabel}` : 'Latest frame';
  const zoomLabel = `Zoom ${Math.round(mapZoom * 10) / 10}`;
  const timelineStateLabel = radarEnabled
    ? state.radarTime.playing
      ? 'Looping'
      : 'Holding'
    : anySatelliteEnabled
      ? satellitePlaying
        ? 'Satellite loop'
        : 'Satellite hold'
      : 'Layers only';
  const aviationPirepCount = visibleAviationPireps.length;
  const aviationFeatureCount = visibleAviationHazards.length + aviationPirepCount;
  const aviationPolygonCount = visibleAviationHazards.length;
  const aviationTimeSummary = getAviationTimeSummaryFromNormalized(visibleAviationHazards);
  const aviationStatusLabel =
    state.viewId === 'aviation'
      ? aviationData.loading
        ? 'Loading aviation overlays'
        : aviationData.error && aviationFeatureCount <= 0
          ? 'Experimental aviation hazards unavailable'
          : aviationData.error
            ? 'Experimental aviation hazards partial'
            : aviationFeatureCount > 0
              ? `Aviation weather: ${aviationPolygonCount} polygons`
              : 'No active aviation hazards'
      : null;
  const fireRestrictionsStatusLabel =
    fireRestrictionsEnabled
      ? fireRestrictionsData.loading
        ? 'Loading restriction units'
        : fireRestrictionsData.error
          ? 'Restriction units partial'
          : fireRestrictionsData.geojson.features.length > 0
            ? 'Restriction units ready'
            : 'No nearby restriction units'
      : null;
  const overlayStatusText = aviationStatusLabel
    ? [overlaySummaryText, aviationStatusLabel].filter(Boolean).join(' / ')
    : [overlaySummaryText, fireRestrictionsStatusLabel].filter(Boolean).join(' / ');
  const fireInteractionEnabled = wildfireEnabled || selectedWildfire != null || selectedRestrictionPoint != null;
  const showRestrictionDetail =
    fireInteractionEnabled &&
    selectedWildfire == null &&
    selectedRestrictionPoint != null &&
    (wildfireFireContext.loading || wildfireFireContext.data != null || wildfireFireContext.error != null);
  const showFireDetailPanel = fireInteractionEnabled && (wildfireDetailLoading || selectedWildfire != null || showRestrictionDetail);
  const showAviationPanel = state.viewId === 'aviation' && aviationOverlayEnabled;

  return (
    <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <MapRenderer
            key={`map-${mapResetKey}`}
            engine="maplibre"
            initialRegion={routeFocusSeedRegionRef.current ?? locateSeedRegionRef.current ?? stableInitialRegion}
            mapStyle={baseMapStyle}
              boundaryReliefTone={boundaryReliefTone}
            cameraRef={mapCameraRef}
            onMapPress={handleMapPress}
            onPanDrag={() => {
              locateRequestIdRef.current += 1;
              const now = Date.now();
              if (now - lastPanMarkRef.current > 450) {
                lastPanMarkRef.current = now;
                setCameraDebugLabel('user-pan');
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
          {aviationModeActive ? (
            <>
              <MapLibreGL.ShapeSource
                id="aviation-mode-hazards-source"
                shape={aviationHazardsFc as any}
                onPress={handleAviationFeaturePress}
              >
                <MapLibreGL.FillLayer
                  id="aviation-mode-hazards-fill"
                  style={{
                    fillColor: aviationFillColorExpression() as any,
                    fillOpacity: [
                      'match',
                      ['get', 'severity'],
                      'severe',
                      0.34,
                      'extreme',
                      0.42,
                      'moderate',
                      0.24,
                      0.18,
                    ] as any,
                  }}
                />
                <MapLibreGL.LineLayer
                  id="aviation-mode-hazards-line"
                  style={{
                    lineColor: aviationLineColorExpression() as any,
                    lineOpacity: 0.88,
                    lineWidth: ['match', ['get', 'severity'], 'severe', 2.8, 'extreme', 3.2, 1.8] as any,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="aviation-mode-hazards-labels"
                  minZoomLevel={5}
                  style={{
                    textField: ['get', 'label'],
                    textSize: ['interpolate', ['linear'], ['zoom'], 5, 9, 8, 11, 11, 13] as any,
                    textColor: '#f8fafc',
                    textHaloColor: 'rgba(2,6,23,0.96)',
                    textHaloWidth: 1.4,
                    textAllowOverlap: false,
                    textOptional: true,
                  }}
                />
              </MapLibreGL.ShapeSource>

              <MapLibreGL.ShapeSource id="aviation-mode-pireps-source" shape={aviationPirepsFc as any}>
                <MapLibreGL.CircleLayer
                  id="aviation-mode-pireps-points"
                  minZoomLevel={4}
                  style={{
                    circleColor: ['coalesce', ['get', 'iconBgColor'], '#bae6fd'] as any,
                    circleOpacity: 0.9,
                    circleRadius: ['interpolate', ['linear'], ['zoom'], 4, 4.5, 7, 6.5, 10, 8] as any,
                    circleStrokeColor: ['coalesce', ['get', 'iconStrokeColor'], 'rgba(2,6,23,0.95)'] as any,
                    circleStrokeWidth: 1.2,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="aviation-mode-pireps-label"
                  minZoomLevel={6}
                  style={{
                    textField: ['coalesce', ['get', 'iconLabel'], 'UA'] as any,
                    textSize: 9,
                    textColor: ['coalesce', ['get', 'iconTextColor'], '#020617'] as any,
                    textAllowOverlap: true,
                    textIgnorePlacement: true,
                  }}
                />
              </MapLibreGL.ShapeSource>
            </>
          ) : null}

          {aviationTurbEnabled ? (
            <MapLibreGL.ShapeSource
              id="aviation-turbulence-source"
              shape={aviationFiltered.turbulence as any}
              onPress={handleAviationFeaturePress}
            >
              <MapLibreGL.FillLayer
                id="aviation-turbulence-fill"
                style={{
                  fillColor: [
                    'match',
                    ['get', 'severityLabel'],
                    'Severe',
                    '#fb923c',
                    'Moderate',
                    '#f59e0b',
                    '#d97706',
                  ],
                  fillOpacity: Math.max(0.08, Math.min(0.5, aviationTurbOpacity * 0.32)),
                }}
              />
              <MapLibreGL.LineLayer
                id="aviation-turbulence-line"
                style={{
                  lineColor: [
                    'match',
                    ['get', 'severityLabel'],
                    'Severe',
                    '#fed7aa',
                    'Moderate',
                    '#fbbf24',
                    '#f59e0b',
                  ],
                  lineOpacity: Math.max(0.35, Math.min(1, aviationTurbOpacity)),
                  lineWidth: ['match', ['get', 'severityLabel'], 'Severe', 2.8, 2] as any,
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
            <MapLibreGL.ShapeSource
              id="aviation-icing-source"
              shape={aviationFiltered.icing as any}
              onPress={handleAviationFeaturePress}
            >
              <MapLibreGL.FillLayer
                id="aviation-icing-fill"
                style={{
                  fillColor: [
                    'match',
                    ['get', 'severityLabel'],
                    'Severe',
                    '#0284c7',
                    'Moderate',
                    '#38bdf8',
                    '#0ea5e9',
                  ],
                  fillOpacity: Math.max(0.08, Math.min(0.46, aviationIceOpacity * 0.3)),
                }}
              />
              <MapLibreGL.LineLayer
                id="aviation-icing-line"
                style={{
                  lineColor: [
                    'match',
                    ['get', 'severityLabel'],
                    'Severe',
                    '#bae6fd',
                    'Moderate',
                    '#7dd3fc',
                    '#38bdf8',
                  ],
                  lineOpacity: Math.max(0.35, Math.min(1, aviationIceOpacity)),
                  lineWidth: ['match', ['get', 'severityLabel'], 'Severe', 2.8, 2] as any,
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
            <MapLibreGL.ShapeSource
              id="aviation-sigmet-source"
              shape={aviationFiltered.advisories as any}
              onPress={handleAviationFeaturePress}
            >
              <MapLibreGL.LineLayer
                id="aviation-sigmet-line"
                style={{
                  lineColor: [
                    'match',
                    ['get', 'severityLabel'],
                    'Severe',
                    '#fecaca',
                    'Moderate',
                    '#f87171',
                    '#ef4444',
                  ],
                  lineOpacity: Math.max(0.35, Math.min(1, aviationSigmetOpacity)),
                  lineWidth: ['match', ['get', 'severityLabel'], 'Severe', 3.2, 2.4] as any,
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
            <MapLibreGL.ShapeSource
              id="aviation-cwa-source"
              shape={aviationFiltered.centerWeather as any}
              onPress={handleAviationFeaturePress}
            >
              <MapLibreGL.LineLayer
                id="aviation-cwa-line"
                style={{
                  lineColor: [
                    'match',
                    ['get', 'severityLabel'],
                    'Severe',
                    '#fee2e2',
                    'Moderate',
                    '#fde68a',
                    '#facc15',
                  ],
                  lineOpacity: Math.max(0.35, Math.min(1, aviationCwaOpacity)),
                  lineWidth: ['match', ['get', 'severityLabel'], 'Severe', 2.8, 2] as any,
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

          {fireRestrictionsEnabled ? (
            <MapLibreGL.ShapeSource id="fire-restrictions-source" shape={fireRestrictionsData.geojson as any}>
                <MapLibreGL.FillLayer
                  id="fire-restrictions-fill-other"
                  filter={['!=', ['get', 'agency'], 'USFS'] as any}
                  style={{
                  fillColor: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    '#dc2626',
                    'restrictions',
                    '#f59e0b',
                    'none',
                    '#16a34a',
                    '#6b7280',
                  ],
                    fillOpacity: [
                      'match',
                      ['get', 'status'],
                      'closure',
                      Math.max(0.26, Math.min(0.46, fireRestrictionsOpacity * 0.94)),
                      'restrictions',
                      Math.max(0.24, Math.min(0.42, fireRestrictionsOpacity * 0.9)),
                      'none',
                      Math.max(0.12, Math.min(0.22, fireRestrictionsOpacity * 0.48)),
                      Math.max(0.14, Math.min(0.24, fireRestrictionsOpacity * 0.54)),
                    ] as any,
                  }}
                />
              <MapLibreGL.FillLayer
                id="fire-restrictions-fill-usfs"
                filter={['==', ['get', 'agency'], 'USFS'] as any}
                style={{
                  fillColor: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    '#dc2626',
                    'restrictions',
                    '#f59e0b',
                    'none',
                    '#16a34a',
                    '#6b7280',
                  ],
                    fillOpacity: [
                      'match',
                      ['get', 'status'],
                      'closure',
                      Math.max(0.3, Math.min(0.52, fireRestrictionsOpacity * 1.04)),
                      'restrictions',
                      Math.max(0.28, Math.min(0.48, fireRestrictionsOpacity * 0.98)),
                      'none',
                      Math.max(0.16, Math.min(0.26, fireRestrictionsOpacity * 0.58)),
                      Math.max(0.18, Math.min(0.3, fireRestrictionsOpacity * 0.66)),
                    ] as any,
                  }}
                />
              <MapLibreGL.LineLayer
                id="fire-restrictions-line-other"
                filter={['!=', ['get', 'agency'], 'USFS'] as any}
                style={{
                  lineColor: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    '#fee2e2',
                    'restrictions',
                    '#fef3c7',
                    'none',
                    '#dcfce7',
                    '#f3f4f6',
                  ],
                  lineOpacity: Math.max(0.42, Math.min(0.88, fireRestrictionsOpacity * 0.95)),
                  lineWidth: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    2.2,
                    'restrictions',
                    2,
                    'none',
                    1.45,
                    1.6,
                  ] as any,
                }}
              />
              <MapLibreGL.LineLayer
                id="fire-restrictions-line-usfs"
                filter={['==', ['get', 'agency'], 'USFS'] as any}
                style={{
                  lineColor: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    '#fff1f2',
                    'restrictions',
                    '#fffbeb',
                    'none',
                    '#ecfdf5',
                    '#f9fafb',
                  ],
                  lineOpacity: Math.max(0.76, Math.min(1, fireRestrictionsOpacity * 1.6)),
                  lineWidth: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    3.2,
                    'restrictions',
                    2.9,
                    'none',
                    2.4,
                    2.6,
                  ] as any,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="fire-restrictions-label-usfs"
                filter={['==', ['get', 'agency'], 'USFS'] as any}
                minZoomLevel={4.8}
                style={{
                  textField: ['get', 'forestName'],
                  textSize: 10,
                  textFont: ['Open Sans Bold'],
                  textColor: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    '#fff1f2',
                    'restrictions',
                    '#fffbeb',
                    'none',
                    '#f0fdf4',
                    '#f9fafb',
                  ],
                  textHaloColor: 'rgba(2,6,23,0.96)',
                  textHaloWidth: 1.35,
                  textMaxWidth: 10,
                  textOptional: true,
                  textAllowOverlap: false,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="fire-restrictions-label-other"
                filter={['!=', ['get', 'agency'], 'USFS'] as any}
                minZoomLevel={5.2}
                style={{
                  textField: ['get', 'forestName'],
                  textSize: 9,
                  textFont: ['Open Sans Bold'],
                  textColor: [
                    'match',
                    ['get', 'status'],
                    'closure',
                    '#fff1f2',
                    'restrictions',
                    '#fffbeb',
                    'none',
                    '#f0fdf4',
                    '#f9fafb',
                  ],
                  textHaloColor: 'rgba(2,6,23,0.94)',
                  textHaloWidth: 1.15,
                  textMaxWidth: 10,
                  textOptional: true,
                  textAllowOverlap: false,
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
            <MapLibreGL.ShapeSource
              id="wildfire-perimeter-source"
              shape={visibleWildfirePerimeters as any}
              onPress={handleWildfireFeaturePress}
              hitbox={{ width: 56, height: 56 }}
            >
              <MapLibreGL.FillLayer
                id="wildfire-perimeter-fill"
                style={{
                  fillColor: 'rgba(251,146,60,0.12)',
                  fillOpacity: 0.18,
                }}
              />
              <MapLibreGL.FillLayer
                id="wildfire-perimeter-hit-fill"
                style={{
                  fillColor: '#fb923c',
                  fillOpacity: 0.01,
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
              <MapLibreGL.LineLayer
                id="wildfire-perimeter-hit-line"
                style={{
                  lineColor: '#fb923c',
                  lineOpacity: 0.01,
                  lineWidth: 24,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {wildfireEnabled ? (
            <MapLibreGL.ShapeSource
              id="wildfire-incident-source"
              shape={wildfireSymbolData as any}
              onPress={handleWildfireFeaturePress}
              hitbox={{ width: 72, height: 72 }}
            >
              <MapLibreGL.CircleLayer
                id="wildfire-incident-hit-target"
                minZoomLevel={2}
                style={{
                  circleColor: '#fb923c',
                  circleOpacity: 0.01,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 20, 5, 28, 10, 38] as any,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="wildfire-incident-halo"
                minZoomLevel={2}
                style={{
                  circleColor: ['coalesce', ['get', 'markerHaloColor'], 'rgba(251,146,60,0.24)'],
                  circleOpacity: 0.95,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 14, 10, 20] as any,
                  circleBlur: 0.45,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="wildfire-incident-circle"
                minZoomLevel={2}
                style={{
                  circleColor: ['coalesce', ['get', 'markerColor'], '#fb923c'],
                  circleOpacity: 0.95,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 4.5, 5, 7, 10, 10] as any,
                  circleStrokeColor: ['coalesce', ['get', 'markerStrokeColor'], 'rgba(255,255,255,0.9)'],
                  circleStrokeWidth: ['coalesce', ['get', 'markerStrokeWidth'], 1.5],
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="wildfire-incident-center"
                minZoomLevel={2}
                style={{
                  circleColor: 'rgba(17,24,39,0.92)',
                  circleOpacity: 1,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 2.6, 6, 3.8, 10, 5] as any,
                  circleStrokeColor: 'rgba(255,255,255,0.88)',
                  circleStrokeWidth: 0.8,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.SymbolLayer
                id="wildfire-incident-label"
                minZoomLevel={5.8}
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
          <View style={styles.topChromeSpacer} />
          <View style={styles.quickActions}>
            <LayersButton count={activeOverlayCount} active={layersSheetOpen} onPress={() => setLayersSheetOpen(true)} />
            <LocationButton onPress={recenterToGps} />
          </View>
        </View>

        {showRadarLegend ? (
          <View style={[styles.legendWrap, styles.topLegendWrap]}>
            <Glass style={styles.legendCard}>
              <RadarLegend
                style={effectiveRadarProvider === 'iem' ? radarProductMeta.legendStyle : 'rainviewer'}
                title={radarProductMeta.legendTitle}
                leftLabel={radarProductMeta.legendLeft}
                midLabel={radarProductMeta.legendMid}
                rightLabel={radarProductMeta.legendRight}
                compact
              />
              <Text style={styles.legendCardMeta}>
                {effectiveRadarProvider === 'iem'
                  ? `${radarProductMeta.legendTitle} · ${radarProductMeta.legendNote}`
                  : 'RainViewer colors vary slightly by provider frame.'}
              </Text>
              {stormMode ? (
                <View style={styles.stormProductRow}>
                  {STORM_RADAR_PRODUCTS.map((id) => (
                    <MiniToggle
                      key={id}
                      label={RADAR_PRODUCT_META[id].chipLabel}
                      active={product === id}
                      onPress={() => {
                        setStormProduct(id);
                        dispatch({ type: 'SET_RADAR_FRAME', frameIndex: 0 });
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </Glass>
          </View>
        ) : null}

        {fireRestrictionsEnabled ? (
          <View
            style={[
              styles.legendWrap,
              showRadarLegend ? styles.restrictionsLegendWrapWithRadar : styles.restrictionsLegendWrap,
            ]}
          >
            <Glass style={styles.legendCard}>
              <View style={styles.restrictionLegend}>
                <Text style={styles.legendCardTitle}>Restrictions</Text>
                <Text style={styles.restrictionLegendTitle}>USFS, BLM, and Minnesota DNR status</Text>
                <View style={styles.restrictionLegendGrid}>
                  <View style={styles.restrictionLegendItem}>
                    <View style={[styles.restrictionLegendSwatch, { backgroundColor: '#16a34a', borderColor: '#dcfce7' }]} />
                    <Text style={styles.restrictionLegendLabel}>No active restrictions listed</Text>
                  </View>
                  <View style={styles.restrictionLegendItem}>
                    <View style={[styles.restrictionLegendSwatch, { backgroundColor: '#f59e0b', borderColor: '#fef3c7' }]} />
                    <Text style={styles.restrictionLegendLabel}>Restrictions in effect</Text>
                  </View>
                  <View style={styles.restrictionLegendItem}>
                    <View style={[styles.restrictionLegendSwatch, { backgroundColor: '#dc2626', borderColor: '#fee2e2' }]} />
                    <Text style={styles.restrictionLegendLabel}>Closure</Text>
                  </View>
                  <View style={styles.restrictionLegendItem}>
                    <View style={[styles.restrictionLegendSwatch, { backgroundColor: '#6b7280', borderColor: '#f3f4f6' }]} />
                    <Text style={styles.restrictionLegendLabel}>Unknown or unavailable</Text>
                  </View>
                </View>
              </View>
            </Glass>
          </View>
        ) : null}

        {aviationModeActive ? (
          <>
            <AviationStatusStrip
              loading={aviationData.loading}
              error={aviationData.error}
              updatedAt={aviationTimeSummary.issuedTime}
              validFrom={selectedAviationValidTime.toISOString()}
              validTo={aviationTimeSummary.expiresTime}
            />
            <AviationAltitudeSelector
              selectedAltitudeFt={selectedAviationAltitudeFt}
              showUnknownAltitude={showUnknownAviationAltitude}
              onSelectAltitude={setSelectedAviationAltitudeFt}
              onToggleUnknown={() => setShowUnknownAviationAltitude((value) => !value)}
            />
            <AviationMapControls
              selectedProducts={selectedAviationProducts}
              selectedHazards={selectedAviationHazards}
              validTimes={aviationAvailableTimes}
              selectedValidTime={selectedAviationValidTime}
              onToggleProduct={(value) =>
                setSelectedAviationProducts((current) => toggleFilterValue(current, value))
              }
              onToggleHazard={(value) =>
                setSelectedAviationHazards((current) => toggleFilterValue(current, value))
              }
              onSelectValidTime={setSelectedAviationValidTime}
              bottomOffset={16 + insets.bottom}
            />
            <AviationFeatureInspector
              feature={selectedAviationFeature}
              onClose={() => setSelectedAviationFeature(null)}
            />
          </>
        ) : null}

        {showTimeline ? (
          <BottomDock
            center={
              <View style={styles.timelineStack}>
                <Glass style={styles.timelineDock}>
                  <TimelineScrubber
                    frameIndex={timelineFrameIndex}
                    playing={timelinePlaying}
                    frames={timelineFrames as any}
                    onSetFrame={(frameIndex) => {
                      if (radarEnabled) {
                        dispatch({ type: 'SET_RADAR_FRAME', frameIndex: clampIndex(frameIndex, frameCount) });
                        return;
                      }

                      setSatelliteFrameIndex(clampIndex(frameIndex, satelliteFrameCount));
                    }}
                    onSetPlaying={(playing) => {
                      if (radarEnabled) {
                        if (playing && frameCount < 2) {
                          dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
                          return;
                        }

                        dispatch({ type: 'SET_RADAR_PLAYING', playing });
                        return;
                      }

                      if (playing && satelliteFrameCount < 2) {
                        setSatellitePlaying(false);
                        return;
                      }

                      setSatellitePlaying(playing);
                    }}
                  />
                </Glass>
              </View>
            }
          />
        ) : null}

        {showFireDetailPanel ? (
          <View pointerEvents="box-none" style={[styles.fireDetailWrap, { bottom: 24 + insets.bottom }]}>
            <Glass style={styles.fireDetailCard}>
              <View style={styles.fireDetailHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.fireDetailEyebrow}>{selectedWildfire ? 'ACTIVE WILDFIRE' : 'FIRE RESTRICTIONS'}</Text>
                  <Text style={styles.fireDetailTitle} numberOfLines={2}>
                    {wildfireDetailLoading
                      ? 'Loading incident details'
                      : selectedWildfire?.incidentName ??
                        wildfireForestLabel ??
                        (wildfireFireContext.loading ? 'Checking nearby restrictions' : 'No unit selected')}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setSelectedWildfire(null);
                    setSelectedRestrictionPoint(null);
                  }}
                  style={styles.fireDetailClose}
                >
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
              ) : wildfireFireContext.loading ? (
                <Text style={styles.fireDetailMeta}>Checking the nearest administrative unit for current restrictions.</Text>
              ) : wildfireFireContext.data ? (
                <>
                  <View style={styles.fireDetailPills}>
                    {wildfireRestrictionInEffect ? <HudBadge label="Restrictions in effect" strong /> : <HudBadge label="No active restrictions listed" strong />}
                    {wildfireRestrictionSupported ? <HudBadge label="USFS source" /> : <HudBadge label="Status uncertain" />}
                  </View>

                  {wildfireForestLabel ? (
                    <Text style={styles.fireDetailMeta}>Nearby forest unit: {wildfireForestLabel}</Text>
                  ) : null}
                  <Text style={styles.fireDetailMeta}>
                    {wildfireRestrictionSummary ??
                      (wildfireRestrictionSupported ? 'No active restrictions listed.' : 'Restriction status unavailable.')}
                  </Text>

                  <View style={styles.fireDetailRows}>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Restriction status</Text>
                      <Text style={styles.fireDetailValue}>
                        {wildfireRestrictionInEffect
                          ? 'Restrictions in effect'
                          : wildfireRestrictionSupported
                            ? 'No active restrictions listed'
                            : 'Unknown'}
                      </Text>
                    </View>
                    {wildfireRestrictionOrder ? (
                      <View style={styles.fireDetailRow}>
                        <Text style={styles.fireDetailLabel}>Order</Text>
                        <Text style={styles.fireDetailValue}>{wildfireRestrictionOrder}</Text>
                      </View>
                    ) : null}
                    {wildfireRestrictionStartDate ? (
                      <View style={styles.fireDetailRow}>
                        <Text style={styles.fireDetailLabel}>Start date</Text>
                        <Text style={styles.fireDetailValue}>{wildfireRestrictionStartDate}</Text>
                      </View>
                    ) : null}
                    {wildfireFireWeatherSummary ? (
                      <View style={styles.fireDetailRow}>
                        <Text style={styles.fireDetailLabel}>Fire weather</Text>
                        <Text style={styles.fireDetailValue}>{wildfireFireWeatherSummary}</Text>
                      </View>
                    ) : null}
                    {wildfireRestrictionSourceUrl ? (
                      <View style={styles.fireDetailRow}>
                        <Text style={styles.fireDetailLabel}>Source</Text>
                        <Text style={styles.fireDetailValue} numberOfLines={1}>
                          Forest Service order
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : wildfireFireContext.error ? (
                <Text style={styles.fireDetailMeta}>{wildfireFireContext.error}</Text>
              ) : (
                <Text style={styles.fireDetailMeta}>Tap the map to inspect current restrictions for the nearest forest unit.</Text>
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
          onOpenStandardMap={() => {
            setLayersSheetOpen(false);
            dispatch({ type: 'SET_VIEW', viewId: 'radar' });
          }}
          onOpenAstroMap={() => {
            setLayersSheetOpen(false);
            pushSpecialMap('/astro-map');
          }}
          onOpenNauticalMap={() => {
            setLayersSheetOpen(false);
            pushSpecialMap('/nautical-map');
          }}
          onOpenAviationMap={() => {
            setLayersSheetOpen(false);
            dispatch({ type: 'SET_VIEW', viewId: 'aviation' });
          }}
        />

        <LearnMoreModal visible={learnOpen} onClose={() => setLearnOpen(false)} initialTopicId={learnTopicId} />
      </View>
    </SafeAreaView>
  );
}

function LayersButton(props: { count: number; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={[styles.layerButton, props.active ? styles.layerButtonActive : null]}>
      <View style={styles.layerGlyph}>
        <View style={[styles.layerGlyphLine, styles.layerGlyphLineTop]} />
        <View style={styles.layerGlyphLine} />
        <View style={[styles.layerGlyphLine, styles.layerGlyphLineBottom]} />
      </View>
      <Text style={styles.layerButtonText}>Layers</Text>
      {props.count > 0 ? (
        <View style={styles.actionBadge}>
          <Text style={styles.actionBadgeText}>{String(Math.min(99, props.count))}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function LocationButton(props: { onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.locationButton}>
      <View style={styles.locationRing}>
        <View style={styles.locationDot} />
      </View>
    </Pressable>
  );
}

function safeNum(value: any) {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function getMapPressLonLat(e: any): { lat: number; lon: number } | null {
  const candidates = [
    e?.geometry?.coordinates,
    e?.coordinates,
    e?.coordinate,
    e?.lngLat,
    e?.properties?.coordinates,
  ];

  for (const coords of candidates) {
    if (Array.isArray(coords) && coords.length >= 2) {
      const lon = safeNum(coords[0]);
      const lat = safeNum(coords[1]);
      if (lat != null && lon != null) return { lat, lon };
    }

    const lat = safeNum(coords?.lat ?? coords?.latitude);
    const lon = safeNum(coords?.lng ?? coords?.lon ?? coords?.longitude);
    if (lat != null && lon != null) return { lat, lon };
  }

  return null;
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

function firstString(...values: any[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(...values: any[]) {
  for (const value of values) {
    const n = safeNum(value);
    if (n != null) return n;
  }
  return null;
}

function formatArcGisDate(value: any) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  const n = safeNum(value);
  if (n == null) return null;
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function wildfireFeatureToIncidentDetails(
  feature: any,
  fallbackLat: number | null,
  fallbackLon: number | null
): WildfireIncidentDetails | null {
  const props = feature?.properties ?? {};
  const geometry = feature?.geometry ?? null;
  const bbox = geometryBbox(geometry);
  const incidentName = firstString(
    props.incidentName,
    props.IncidentName,
    props.poly_IncidentName,
    props.Label,
    props.ComplexName,
    props.FireName
  );

  if (!incidentName) return null;

  const pointCoords = geometry?.type === 'Point' && Array.isArray(geometry.coordinates) ? geometry.coordinates : null;
  const pointLon = pointCoords ? safeNum(pointCoords[0]) : null;
  const pointLat = pointCoords ? safeNum(pointCoords[1]) : null;
  const attrLat = firstNumber(props.attr_InitialLatitude, props.InitialLatitude, props.POOLatitude, props.Latitude);
  const attrLon = firstNumber(props.attr_InitialLongitude, props.InitialLongitude, props.POOLongitude, props.Longitude);

  return {
    incidentName,
    percentContained: firstNumber(props.attr_PercentContained, props.PercentContained, props.PercentContainedValue),
    acres: firstNumber(
      props.acres,
      props.poly_GISAcres,
      props.GISAcres,
      props.DailyAcres,
      props.CalculatedAcres,
      props.attr_IncidentSize,
      props.IncidentSize
    ),
    updatedAt: formatArcGisDate(
      props.attr_ModifiedOnDateTime_dt ??
        props.ModifiedOnDateTime_dt ??
        props.poly_DateCurrent ??
        props.DateCurrent ??
        props.FireDiscoveryDateTime
    ),
    source: firstString(props.attr_Source, props.Source, props.poly_Source) ?? 'NIFC / WFIGS',
    county: firstString(props.attr_POOCounty, props.POOCounty, props.County),
    state: firstString(props.attr_POOState, props.POOState, props.State),
    city: firstString(props.attr_POOCity, props.POOCity, props.City),
    geometrySource: firstString(props.poly_Source, props.GeometrySource, props.Source) ?? 'Current incident feed',
    latitude: attrLat ?? pointLat ?? fallbackLat ?? (bbox ? (bbox.minLat + bbox.maxLat) / 2 : null),
    longitude: attrLon ?? pointLon ?? fallbackLon ?? (bbox ? (bbox.minLon + bbox.maxLon) / 2 : null),
  };
}

function normalizedFireNameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function wildfireFeatureUpdatedMs(props: any) {
  const raw =
    props?.attr_ModifiedOnDateTime_dt ??
    props?.ModifiedOnDateTime_dt ??
    props?.poly_DateCurrent ??
    props?.DateCurrent ??
    props?.FireDiscoveryDateTime;
  const n = safeNum(raw);
  if (n != null) return n;
  const parsed = Date.parse(String(raw ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function isStaleContainedWildfireFeature(feature: any) {
  const props = feature?.properties ?? {};
  const contained = firstNumber(props.attr_PercentContained, props.PercentContained, props.PercentContainedValue);
  if (contained == null || contained < 100) return false;
  const updatedMs = wildfireFeatureUpdatedMs(props);
  if (updatedMs == null) return false;
  return Date.now() - updatedMs > 45 * 24 * 60 * 60 * 1000;
}

function filterVisibleWildfirePerimeters(perimeters: any) {
  const features = (Array.isArray(perimeters?.features) ? perimeters.features : []).filter(
    (feature: any) => !isStaleContainedWildfireFeature(feature)
  );
  return { type: 'FeatureCollection', features };
}

function buildWildfireSymbolFeatureCollection(perimeters: any) {
  const features: any[] = [];
  const seen = new Set<string>();
  const addPoint = (feature: any, fallbackId: string) => {
    const geometry = feature?.geometry;
    const props = feature?.properties ?? {};
    const point =
      geometry?.type === 'Point'
        ? geometry
        : geometryCenterPoint(geometry);
    const coords = point?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    const lon = safeNum(coords[0]);
    const lat = safeNum(coords[1]);
    if (lat == null || lon == null) return;
    const name = firstString(props.incidentName, props.IncidentName, props.poly_IncidentName, props.Label, props.FireName) ?? fallbackId;
    const key = normalizedFireNameKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    features.push({
      type: 'Feature',
      id: feature?.id ?? fallbackId,
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        ...props,
        incidentName: name,
        markerColor: props.markerColor ?? '#fb923c',
        markerHaloColor: props.markerHaloColor ?? 'rgba(251,146,60,0.28)',
        markerRadius: props.markerRadius ?? 9,
        markerHaloRadius: props.markerHaloRadius ?? 19,
        geometrySource: props.geometrySource ?? props.GeometrySource ?? props.poly_Source ?? 'Current perimeter feed',
      },
    });
  };

  (Array.isArray(perimeters?.features) ? perimeters.features : []).forEach((feature: any, idx: number) =>
    addPoint(feature, `perimeter-${idx}`)
  );

  return { type: 'FeatureCollection', features };
}

function geometryCenterPoint(geometry: any) {
  const bbox = geometryBbox(geometry);
  if (!bbox) return null;
  return {
    type: 'Point',
    coordinates: [(bbox.minLon + bbox.maxLon) / 2, (bbox.minLat + bbox.maxLat) / 2],
  };
}

function pointInRing(lon: number, lat: number, ring: any[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = safeNum(ring[i]?.[0]);
    const yi = safeNum(ring[i]?.[1]);
    const xj = safeNum(ring[j]?.[0]);
    const yj = safeNum(ring[j]?.[1]);
    if (xi == null || yi == null || xj == null || yj == null) continue;
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry: any, lat: number, lon: number) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const rings = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    if (!rings.length) return false;
    const inOuter = pointInRing(lon, lat, rings[0] ?? []);
    const inHole = rings.slice(1).some((ring: any[]) => pointInRing(lon, lat, ring));
    return inOuter && !inHole;
  }

  if (geometry.type === 'MultiPolygon') {
    return (Array.isArray(geometry.coordinates) ? geometry.coordinates : []).some((polygon: any[]) =>
      geometryContainsPoint({ type: 'Polygon', coordinates: polygon }, lat, lon)
    );
  }

  return false;
}

function distanceToBboxMiles(lat: number, lon: number, bbox: ReturnType<typeof geometryBbox>) {
  if (!bbox) return Number.POSITIVE_INFINITY;
  const clampedLat = Math.max(bbox.minLat, Math.min(bbox.maxLat, lat));
  const clampedLon = Math.max(bbox.minLon, Math.min(bbox.maxLon, lon));
  return haversineMiles(lat, lon, clampedLat, clampedLon);
}

function findNearestLoadedWildfireDetail(
  lat: number,
  lon: number,
  data: { incidents: any; perimeters: any; symbols: any }
): WildfireIncidentDetails | null {
  const candidates: Array<{ detail: WildfireIncidentDetails; distanceMi: number }> = [];
  const collect = (fc: any, maxDistanceMi: number) => {
    const features = Array.isArray(fc?.features) ? fc.features : [];
    features.forEach((feature: any) => {
      const geometry = feature?.geometry;
      const point = geometry?.type === 'Point' ? geometry : geometryCenterPoint(geometry);
      const coords = point?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return;
      const featureLon = safeNum(coords[0]);
      const featureLat = safeNum(coords[1]);
      if (featureLat == null || featureLon == null) return;
      const distanceMi =
        geometry?.type === 'Point'
          ? haversineMiles(lat, lon, featureLat, featureLon)
          : geometryContainsPoint(geometry, lat, lon)
            ? 0
            : Math.min(haversineMiles(lat, lon, featureLat, featureLon), distanceToBboxMiles(lat, lon, geometryBbox(geometry)));
      if (distanceMi > maxDistanceMi) return;

      const detail = wildfireFeatureToIncidentDetails(feature, lat, lon);
      if (detail) candidates.push({ detail, distanceMi });
    });
  };

  collect(data.symbols, 35);
  collect(data.incidents, 35);
  collect(data.perimeters, 35);

  candidates.sort((a, b) => a.distanceMi - b.distanceMi);
  return candidates[0]?.detail ?? null;
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

function filterAviationCollection(
  fc: any,
  selectedTime: string | null,
  productFilter: any,
  hazardFilter: any,
  altitudeFilter: any
) {
  const features = Array.isArray(fc?.features) ? fc.features : [];

  return {
    type: 'FeatureCollection' as const,
    features: features.filter((feature: any) => {
      const props = feature?.properties ?? {};
      if (selectedTime && !aviationTimeMatches(props, selectedTime)) return false;
      if (productFilter !== 'all' && props.productKey !== productFilter) return false;
      if (hazardFilter !== 'all' && props.hazardKey !== hazardFilter) return false;
      if (altitudeFilter !== 'all') {
        const bands = String(props.altitudeBands ?? '')
          .split(',')
          .map((band) => band.trim())
          .filter(Boolean);
        if (!bands.includes(altitudeFilter)) return false;
      }
      return true;
    }),
  };
}

function pickCurrentAviationValidTime(times: string[]) {
  if (!times.length) return null;
  const now = Date.now();
  return times.find((value) => Date.parse(value) >= now) ?? times[times.length - 1] ?? null;
}

function aviationTimeMatches(props: any, selectedTime: string) {
  const selectedMs = Date.parse(selectedTime);
  const validKey = typeof props?.validKey === 'string' ? props.validKey : null;
  if (validKey === selectedTime) return true;
  if (!Number.isFinite(selectedMs)) return validKey == null;

  const from = Date.parse(props?.validFrom ?? props?.validTime ?? props?.validKey ?? '');
  const to = Date.parse(props?.expiresTime ?? props?.validTime ?? props?.validKey ?? '');
  if (Number.isFinite(from) && Number.isFinite(to)) return selectedMs >= from && selectedMs <= to;
  if (Number.isFinite(from)) return Math.abs(selectedMs - from) < 60 * 1000;
  return !validKey;
}

function getAviationTimeSummary(features: any[]) {
  let issuedMs = Number.NEGATIVE_INFINITY;
  let expiresMs = Number.NEGATIVE_INFINITY;

  features.forEach((feature) => {
    const props = feature?.properties ?? {};
    const issued = Date.parse(props.issuedTime ?? '');
    const expires = Date.parse(props.expiresTime ?? props.validTime ?? props.validFrom ?? '');
    if (Number.isFinite(issued)) issuedMs = Math.max(issuedMs, issued);
    if (Number.isFinite(expires)) expiresMs = Math.max(expiresMs, expires);
  });

  return {
    issuedTime: Number.isFinite(issuedMs) ? new Date(issuedMs).toISOString() : null,
    expiresTime: Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null,
  };
}

function getAviationTimeSummaryFromNormalized(features: AviationFeature[]) {
  let issuedMs = Number.NEGATIVE_INFINITY;
  let expiresMs = Number.NEGATIVE_INFINITY;

  features.forEach((feature) => {
    const issued = Date.parse(feature.issuedAt ?? '');
    const expires = Date.parse(feature.validTo ?? feature.validFrom ?? '');
    if (Number.isFinite(issued)) issuedMs = Math.max(issuedMs, issued);
    if (Number.isFinite(expires)) expiresMs = Math.max(expiresMs, expires);
  });

  return {
    issuedTime: Number.isFinite(issuedMs) ? new Date(issuedMs).toISOString() : null,
    expiresTime: Number.isFinite(expiresMs) ? new Date(expiresMs).toISOString() : null,
  };
}

function formatAviationTime(value?: string | null) {
  if (!value) return 'pending';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'pending';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAviationChipTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Time';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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

function AviationDetailRow(props: { label: string; value?: any }) {
  const value =
    props.value == null || props.value === ''
      ? 'Pending'
      : typeof props.value === 'string'
        ? props.value
        : String(props.value);

  return (
    <View style={styles.fireDetailRow}>
      <Text style={styles.fireDetailLabel}>{props.label}</Text>
      <Text style={styles.fireDetailValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
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
  topChromeSpacer: {
    flex: 1,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 24,
    paddingHorizontal: 11,
    paddingVertical: 10,
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
    paddingHorizontal: 7,
    paddingVertical: 3,
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
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  hudBadgeTextStrong: {
    color: 'rgba(255,255,255,0.96)',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    fontSize: 9,
    fontWeight: '900',
  },
  summaryTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
    marginTop: 8,
  },
  summaryMeta: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    marginTop: 3,
  },
  summaryTimestamp: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  summaryFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 8,
  },
  infoPill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  infoPillText: {
    color: 'rgba(255,255,255,0.84)',
    fontSize: 9,
    fontWeight: '800',
  },
  quickActions: {
    width: 58,
    alignItems: 'flex-end',
    gap: 10,
  },
  layerButton: {
    width: 58,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(2,6,23,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    gap: 5,
  },
  layerButtonActive: {
    borderColor: 'rgba(125,211,252,0.30)',
    backgroundColor: 'rgba(15,23,42,0.94)',
  },
  layerGlyph: {
    width: 22,
    height: 15,
    position: 'relative',
  },
  layerGlyphLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(191,219,254,0.48)',
    backgroundColor: 'rgba(59,130,246,0.18)',
  },
  layerGlyphLineTop: {
    top: 0,
  },
  layerGlyphLineBottom: {
    top: 10,
  },
  layerButtonText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(2,6,23,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationRing: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.7,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  actionButton: {
    width: 54,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(2,6,23,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  actionButtonActive: {
    borderColor: 'rgba(125,211,252,0.26)',
    backgroundColor: 'rgba(15,23,42,0.92)',
  },
  actionButtonText: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 11,
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
  topLegendWrap: {
      top: 8,
      right: 84,
      left: 12,
    },
  restrictionsLegendWrap: {
      top: 76,
      right: 84,
      left: 12,
    },
  restrictionsLegendWrapWithRadar: {
      top: 76,
      right: 84,
      left: 12,
    },
  aviationPanelWrap: {
    position: 'absolute',
    left: 12,
    right: 84,
  },
  aviationPanel: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  aviationEyebrow: {
    color: 'rgba(125,211,252,0.92)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  aviationTitle: {
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 4,
  },
  aviationFilterGroup: {
    marginTop: 10,
  },
  aviationFilterLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  legendCard: {
    width: 264,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    gap: 6,
  },
  legendCardTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },
  legendCardMeta: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    display: 'none',
  },
  stormProductRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  restrictionLegend: {
    gap: 6,
  },
  restrictionLegendInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 6,
    rowGap: 4,
  },
  restrictionLegendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 6,
  },
  restrictionLegendTitle: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 2,
  },
  restrictionLegendItem: {
    width: 114,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  restrictionLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  restrictionLegendSwatch: {
    width: 11,
    height: 11,
    borderRadius: 3,
    borderWidth: 1,
  },
  restrictionLegendLabel: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
    lineHeight: 13,
  },
  timelineStack: {
    gap: 8,
  },
  timelineDock: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 18,
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
    backgroundColor: 'rgba(2,6,23,0.95)',
    borderColor: 'rgba(148,163,184,0.24)',
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
