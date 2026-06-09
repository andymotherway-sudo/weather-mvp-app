import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import MapLibreGL from '@maplibre/maplibre-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Glass } from '../../components/common/Glass';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { AnimationCompositor, type AnimationBufferStatus } from '../../components/maps/AnimationCompositor';
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
import { useLocations, type FavoriteLocation } from '../lib/locations/useLocations';
import { useAllBuoyDetails } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';
import { MARINE_AREAS, type MarineArea } from '../lib/nautical/areas';
import { useMarineZonesByBbox } from '../lib/nautical/useMarineZonesByBbox';
import type { NauticalZone } from '../lib/nautical/zones';
import { filterAviationFeatures, pickCurrentValidTime, toggleFilterValue } from '../lib/aviation/filters';
import { aviationFeaturesToFeatureCollection, normalizeAviationFeatureCollection } from '../lib/aviation/normalize';
import type { AviationFeature, AviationHazardType, AviationProductType } from '../lib/aviation/types';
import { aviationFillColorExpression, aviationLineColorExpression } from '../lib/aviation/colors';
import { LAYER_CATALOG_BY_ID } from '../lib/maps/layerCatalog';
import { createInitialMapState, mapReducer } from '../lib/maps/state';
import type { LayerId } from '../lib/maps/types';
import type { RadarProductId } from '../lib/maps/radarIem';
import { NEXRAD_SITES, type NexradSite } from '../lib/maps/nexradSites';
import { normalizeRadarSiteId } from '../lib/maps/radarIem';
import { resolveNearestRadar } from '../lib/maps/resolveNearestRadar';
import { useAviationMapData } from '../lib/maps/useAviationMapData';
import { alertFeatureToDetail, type WeatherAlertDetail, useAlertMapData } from '../lib/maps/useAlertMapData';
import { useWildfireMapData } from '../lib/maps/useWildfireMapData';
import { useRadarController, type AnimationQuality } from '../lib/maps/useRadarController';
import { canExportAnimationVideo, exportAnimationVideo, type AnimationVideoFrame } from '../lib/maps/videoExport';
import { MAP_VIEWS } from '../lib/maps/views';
import { apiUrl } from '../lib/net/apiBase';
import { fetchWithTimeout } from '../lib/net/fetchWithTimeout';
import { usePlace } from '../context/PlaceContext';
import { useSettings } from '../context/SettingsContext';

const WPC_FRONTS_EXPORT_URL =
  'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=png32&transparent=true&f=image';

const RADAR_MODE_STORAGE_KEY = 'omniwx:maps:radarMode:v1';
const STATION_PRODUCT_STORAGE_KEY = 'omniwx:maps:stationProduct:v1';
const STATION_PRODUCT_IDS = new Set<RadarProductId>(['N0B', 'N0U', 'N0Z', 'N0S', 'EET', 'NET']);
const AUTO_NEXRAD_MIN_ZOOM = 8.6;
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
  isHotspot?: boolean;
  confidence?: number | null;
  frp?: number | null;
};

type SelectedMarineFeature =
  | { kind: 'buoy'; id: string }
  | { kind: 'zone'; id: string }
  | { kind: 'model-area'; id: string }
  | null;

type WeatherAlertForecastTarget =
  | { kind: 'marine'; zoneId: string; name?: string | null; wfo?: string | null }
  | { kind: 'land'; lat: number; lon: number }
  | null;

const RADAR_PRODUCT_META: Record<
  RadarProductId,
  {
    chipLabel: string;
    summaryLabel: string;
    legendStyle: 'reflectivity' | 'velocity' | 'echoTops';
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
  EET: {
    chipLabel: 'Echo Tops',
    summaryLabel: 'Enhanced echo tops',
    legendStyle: 'echoTops',
    legendTitle: 'Echo Tops',
    legendLeft: 'LOW TOPS',
    legendMid: 'Storm top height',
    legendRight: 'HIGH TOPS',
    legendNote: '8-bit echo top height. This is height, not wind or rain intensity.',
  },
  NET: {
    chipLabel: 'Echo Tops',
    summaryLabel: 'Echo tops',
    legendStyle: 'echoTops',
    legendTitle: 'Echo Tops',
    legendLeft: 'LOW TOPS',
    legendMid: 'Storm top height',
    legendRight: 'HIGH TOPS',
    legendNote: 'Legacy echo top height fallback. This is height, not wind or rain intensity.',
  },
};

type StationRadarProduct = {
  id: RadarProductId | string;
  label: string;
  subtitle: string;
  enabled: boolean;
  learnTopicId: string;
};

const STATION_RADAR_PRODUCTS: StationRadarProduct[] = [
  {
    id: 'N0B',
    label: 'Base Reflectivity',
    subtitle: 'Precip intensity',
    enabled: true,
    learnTopicId: 'radar-base-reflectivity',
  },
  {
    id: 'N0U',
    label: 'Base Velocity',
    subtitle: 'Radial wind latest',
    enabled: true,
    learnTopicId: 'radar-base-velocity',
  },
  {
    id: 'N0Z',
    label: 'Legacy Velocity',
    subtitle: 'Radial wind latest',
    enabled: true,
    learnTopicId: 'radar-base-velocity',
  },
  {
    id: 'N0S',
    label: 'Storm Relative Velocity',
    subtitle: 'Storm-scale wind',
    enabled: true,
    learnTopicId: 'radar-storm-relative-velocity',
  },
  {
    id: 'CC',
    label: 'Correlation Coef',
    subtitle: 'Live source needed',
    enabled: false,
    learnTopicId: 'radar-correlation-coefficient',
  },
  {
    id: 'ZDR',
    label: 'Differential Refl',
    subtitle: 'Live source needed',
    enabled: false,
    learnTopicId: 'radar-differential-reflectivity',
  },
  {
    id: 'EET',
    label: 'Echo Tops',
    subtitle: 'Echo top height latest',
    enabled: true,
    learnTopicId: 'radar-echo-tops',
  },
  {
    id: 'VIL',
    label: 'VIL',
    subtitle: 'Live source needed',
    enabled: false,
    learnTopicId: 'radar-vil',
  },
];

const STATION_RANGE_RINGS_MI = [25, 50, 100, 150];
const SKY_LEGEND_SWATCHES = [
  'rgba(255,92,92,0.88)',
  'rgba(255,146,82,0.84)',
  'rgba(204,112,224,0.80)',
  'rgba(112,113,255,0.78)',
  'rgba(66,154,255,0.74)',
  'rgba(34,211,181,0.70)',
  'rgba(74,222,128,0.68)',
  'rgba(187,247,208,0.64)',
] as const;

function clampIndex(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function nearestFrameIndexByIso(frames: Array<{ iso?: string | null }>, iso?: string | null) {
  if (!iso || !frames.length) return -1;
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return -1;

  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  frames.forEach((frame, index) => {
    const time = frame?.iso ? new Date(frame.iso).getTime() : Number.NaN;
    if (!Number.isFinite(time)) return;
    const distance = Math.abs(time - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatAstroHourLabel(hourOffset: number) {
  const hour = Math.round(hourOffset);
  return hour === 0 ? 'Now' : `+${hour}h`;
}

function skyScoreLabel(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score)) return '--';
  if (score >= 88) return 'Excellent';
  if (score >= 75) return 'Very good';
  if (score >= 62) return 'Good';
  if (score >= 48) return 'Fair';
  if (score >= 32) return 'Poor';
  return 'Very poor';
}

function skyScoreSentence(score: number, auroraVisibility: number) {
  const quality = skyScoreLabel(score).toLowerCase();
  const aurora =
    auroraVisibility >= 45
      ? 'aurora may be worth checking'
      : auroraVisibility >= 18
        ? 'slight aurora potential'
        : 'aurora unlikely now';
  return `Estimated ${quality} observing conditions for this map area; ${aurora}.`;
}

type SatelliteFrame = {
  index: number;
  iso: string;
  sourceName?: string;
  rasterId?: number;
};

const SATELLITE_LOOP_MINUTES_BACK = 120;
const SATELLITE_FRAME_STEP_MINUTES = 5;
const SATELLITE_PLAY_INTERVAL_MS = 950;
const SATELLITE_WARM_OPACITY = 0.01;
const SATELLITE_LOOP_HOUR_OPTIONS = [2, 3, 5] as const;
const GIBS_DAILY_FRAME_COUNT = 5;
const GIBS_IMERG_FRAME_STEP_MINUTES = 30;
const GIBS_IMERG_SOURCE_LAG_MINUTES = 12 * 60;
type SatelliteLoopHours = (typeof SATELLITE_LOOP_HOUR_OPTIONS)[number];
type AnimationCompositorKind = 'radar' | 'truecolor' | 'ir' | 'wv-east' | 'wv-west' | 'clouds';
const BEST_ANIMATION_QUALITY: AnimationQuality = 'presentation';

const NESDIS_GEOCOLOR_ARCHIVE_EXPORT_URL =
  'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/MERGEDGC_Last_24hr/ImageServer/exportImage';
const NESDIS_ABI13_ARCHIVE_EXPORT_URL =
  'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/ABI13_Last_24hr/ImageServer/exportImage';
const OMNI_WORKER_BASE = 'https://omniwx-api.omniwx.workers.dev';
const EXPORT_BASEMAP_TEMPLATE_DARK = 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png';
const EXPORT_BASEMAP_BOUNDARIES_TEMPLATE = 'https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png';
const EXPORT_BASEMAP_LABELS_TEMPLATE_DARK = 'https://a.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png';
const GIBS_WMTS_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best';

function arcGisLockedRasterParam(rasterId?: number | null) {
  if (rasterId == null || !Number.isFinite(rasterId)) return '';
  return `&mosaicRule=${encodeURIComponent(
    JSON.stringify({ mosaicMethod: 'esriMosaicLockRaster', lockRasterIds: [Math.round(rasterId)] }),
  )}`;
}

function arcGisImageServerTileTemplate(baseUrl: string, iso?: string | null, tileSize = 512, rasterId?: number | null) {
  const timeMs = iso ? new Date(iso).getTime() : Number.NaN;
  const timeParam = Number.isFinite(timeMs) ? `&time=${Math.round(timeMs)}` : '';
  const mosaicParam = arcGisLockedRasterParam(rasterId);
  const size = Math.max(512, Math.min(1024, Math.round(tileSize)));
  return `${baseUrl}?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=${size},${size}&format=png32&transparent=true${timeParam}${mosaicParam}&f=image`;
}

function isoDateDaysAgo(daysAgo: number, now = new Date()) {
  const d = new Date(now.getTime() - Math.max(0, daysAgo) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function gibsWmtsTileTemplate(args: {
  layer: string;
  matrixSet: string;
  extension: 'jpeg' | 'png';
  time?: string | null;
}) {
  const timePath = args.time?.trim() ? `/${encodeURIComponent(args.time.trim())}` : '';
  return `${GIBS_WMTS_BASE}/${args.layer}/default${timePath}/${args.matrixSet}/{z}/{y}/{x}.${args.extension}`;
}

function lonLatToMercatorMeters(lon: number, lat: number) {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return { x, y };
}

function regionBounds(region: Region, pad = 1) {
  const lonDelta = Math.max(0.0001, region.longitudeDelta * pad);
  const latDelta = Math.max(0.0001, region.latitudeDelta * pad);
  return {
    west: region.longitude - lonDelta / 2,
    east: region.longitude + lonDelta / 2,
    south: region.latitude - latDelta / 2,
    north: region.latitude + latDelta / 2,
  };
}

function animationCoordinates(region: Region): [[number, number], [number, number], [number, number], [number, number]] {
  const { west, east, south, north } = regionBounds(region, 1);
  return [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];
}

function mercatorBbox(region: Region) {
  const { west, east, south, north } = regionBounds(region, 1);
  const sw = lonLatToMercatorMeters(west, south);
  const ne = lonLatToMercatorMeters(east, north);
  return `${sw.x},${sw.y},${ne.x},${ne.y}`;
}

function mercatorAspect(region: Region) {
  const { west, east, south, north } = regionBounds(region, 1);
  const sw = lonLatToMercatorMeters(west, south);
  const ne = lonLatToMercatorMeters(east, north);
  const mercatorWidth = Math.max(1, Math.abs(ne.x - sw.x));
  const mercatorHeight = Math.max(1, Math.abs(ne.y - sw.y));
  return mercatorWidth / mercatorHeight;
}

function regionForViewportAspect(region: Region, viewport?: { width: number; height: number }) {
  const vw = viewport?.width && Number.isFinite(viewport.width) ? viewport.width : 0;
  const vh = viewport?.height && Number.isFinite(viewport.height) ? viewport.height : 0;
  if (vw <= 0 || vh <= 0) return region;

  const targetAspect = Math.max(0.35, Math.min(2.2, vw / vh));
  const currentAspect = Math.max(0.01, mercatorAspect(region));
  if (Math.abs(currentAspect - targetAspect) / targetAspect < 0.04) return region;

  if (currentAspect > targetAspect) {
    return {
      ...region,
      latitudeDelta: Math.min(170, Math.max(0.0001, region.latitudeDelta * (currentAspect / targetAspect))),
    };
  }

  return {
    ...region,
    longitudeDelta: Math.min(360, Math.max(0.0001, region.longitudeDelta * (targetAspect / currentAspect))),
  };
}

function evenDimension(value: number, minValue = 480, maxValue = 1600) {
  const clamped = Math.max(minValue, Math.min(maxValue, Math.round(value)));
  return clamped % 2 === 0 ? clamped : clamped - 1;
}

function satelliteQualityForZoom(zoom: number) {
  const z = Number.isFinite(zoom) ? zoom : 5;
  if (z >= 8.5) {
    return {
      tileSize: 1024,
      exportLongEdge: 1920,
      maxZoomLevel: 18,
      label: 'local',
    };
  }
  if (z >= 6.5) {
    return {
      tileSize: z >= 7.5 ? 1024 : 512,
      exportLongEdge: 1600,
      maxZoomLevel: 17,
      label: 'regional',
    };
  }
  return {
    tileSize: 512,
    exportLongEdge: 1280,
    maxZoomLevel: 16,
    label: 'wide',
  };
}

function animationExportDimensions(
  region: Region,
  kind?: AnimationCompositorKind | null,
  zoom = 5,
  viewport?: { width: number; height: number },
) {
  const quality = satelliteQualityForZoom(zoom);
  const vw = viewport?.width && Number.isFinite(viewport.width) ? viewport.width : 0;
  const vh = viewport?.height && Number.isFinite(viewport.height) ? viewport.height : 0;
  const viewportAspect = vw > 0 && vh > 0 ? vw / vh : null;
  const geographicAspect = (() => {
    return mercatorAspect(region);
  })();
  const aspect =
    kind === 'radar' && !viewportAspect
      ? 16 / 9
      : Math.max(0.35, Math.min(2.2, viewportAspect ?? geographicAspect));
  const satelliteVideoLongEdge =
    kind === 'truecolor' || kind === 'ir' || kind === 'wv-east' || kind === 'wv-west' || kind === 'clouds'
      ? Math.min(1280, quality.exportLongEdge)
      : quality.exportLongEdge;
  const longEdge = kind === 'radar' ? 1280 : satelliteVideoLongEdge;

  if (aspect >= 1) {
    return { width: evenDimension(longEdge, 480, 1920), height: evenDimension(longEdge / aspect, 480, 1920) };
  }

  return { width: evenDimension(longEdge * aspect, 480, 1920), height: evenDimension(longEdge, 480, 1920) };
}

function buildArcGisImageExportUrl(args: {
  baseUrl: string;
  region: Region;
  iso?: string | null;
  rasterId?: number | null;
  width: number;
  height: number;
}) {
  const timeMs = args.iso ? new Date(args.iso).getTime() : Number.NaN;
  const timeParam = Number.isFinite(timeMs) ? `&time=${Math.round(timeMs)}` : '';
  const mosaicParam = arcGisLockedRasterParam(args.rasterId);
  return `${args.baseUrl}?bbox=${encodeURIComponent(mercatorBbox(args.region))}&bboxSR=3857&imageSR=3857&size=${Math.round(
    args.width,
  )},${Math.round(args.height)}&format=png32&transparent=true${timeParam}${mosaicParam}&f=image`;
}

function buildGoesWmsImageUrl(args: {
  endpoint: string;
  layer: string;
  region: Region;
  iso?: string | null;
  width: number;
  height: number;
}) {
  const params = new URLSearchParams({
    service: 'WMS',
    request: 'GetMap',
    version: '1.1.1',
    layers: args.layer,
    styles: '',
    format: 'image/png',
    transparent: 'TRUE',
    width: String(Math.round(args.width)),
    height: String(Math.round(args.height)),
    exceptions: 'application/vnd.ogc.se_inimage',
    srs: 'EPSG:3857',
    bbox: mercatorBbox(args.region),
  });
  if (args.iso) params.set('time', args.iso);
  return `${args.endpoint}?${params.toString()}`;
}

function buildRadarCompositorUrl(args: {
  product: RadarProductId;
  region: Region;
  iso?: string | null;
  width: number;
  height: number;
  stormMode: boolean;
}) {
  const radarProduct = args.product === 'N0B' ? 'N0B' : args.product === 'N0Z' ? 'N0Z' : 'N0Q';
  const u = new URL(`${OMNI_WORKER_BASE}/v2/radar/wms`);
  u.searchParams.set('product', radarProduct);
  u.searchParams.set('bbox', mercatorBbox(args.region));
  u.searchParams.set('width', String(Math.round(args.width)));
  u.searchParams.set('height', String(Math.round(args.height)));
  u.searchParams.set('shrink', args.stormMode ? '0.68' : '0.78');
  u.searchParams.set('dpr', '2.5');
  u.searchParams.set('fmt', 'png32');
  u.searchParams.set('bgcolor', '0x00000000');
  if (args.stormMode) u.searchParams.set('storm', '1');
  if (args.iso) u.searchParams.set('time', args.iso);
  return u.toString();
}

function buildSatelliteFrames(opts?: { minutesBack?: number; stepMinutes?: number; now?: Date }): SatelliteFrame[] {
  const minutesBack = opts?.minutesBack ?? SATELLITE_LOOP_MINUTES_BACK;
  const stepMinutes = opts?.stepMinutes ?? SATELLITE_FRAME_STEP_MINUTES;
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

function buildGibsDailyFrames(opts?: { days?: number; now?: Date }): SatelliteFrame[] {
  const count = Math.max(2, Math.round(opts?.days ?? GIBS_DAILY_FRAME_COUNT));
  const now = opts?.now ?? new Date();
  return Array.from({ length: count }, (_, index) => {
    const daysAgo = count - index;
    const date = isoDateDaysAgo(daysAgo, now);
    return { index, iso: `${date}T12:00:00.000Z` };
  });
}

function buildGibsImergFrames(opts?: { minutesBack?: number; now?: Date }): SatelliteFrame[] {
  const minutesBack = Math.max(GIBS_IMERG_FRAME_STEP_MINUTES, opts?.minutesBack ?? SATELLITE_LOOP_MINUTES_BACK);
  const now = opts?.now ?? new Date();
  const stepMs = GIBS_IMERG_FRAME_STEP_MINUTES * 60_000;
  const sourceLagMs = GIBS_IMERG_SOURCE_LAG_MINUTES * 60_000;
  const alignedMs = Math.floor((now.getTime() - sourceLagMs) / stepMs) * stepMs;
  const frameCount = Math.floor(minutesBack / GIBS_IMERG_FRAME_STEP_MINUTES) + 1;

  return Array.from({ length: frameCount }, (_, index) => {
    const minutesAgo = (frameCount - 1 - index) * GIBS_IMERG_FRAME_STEP_MINUTES;
    return { index, iso: new Date(alignedMs - minutesAgo * 60_000).toISOString() };
  });
}

function gibsDailyTime(frame?: { iso?: string | null } | null) {
  const iso = frame?.iso;
  if (!iso) return isoDateDaysAgo(1);
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return isoDateDaysAgo(1);
  return new Date(ms).toISOString().slice(0, 10);
}

function gibsHalfHourTime(frame?: { iso?: string | null } | null) {
  const iso = frame?.iso;
  const ms = iso ? new Date(iso).getTime() : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  const stepMs = GIBS_IMERG_FRAME_STEP_MINUTES * 60_000;
  return new Date(Math.floor(ms / stepMs) * stepMs).toISOString().replace('.000Z', 'Z');
}

async function fetchNesdisImageServerFrames(exportUrl: string, minutesBack: number): Promise<SatelliteFrame[]> {
  const query = new URL(`${exportUrl.replace(/\/exportImage$/, '')}/query`);
  query.searchParams.set('f', 'json');
  query.searchParams.set('where', 'end_time is not null');
  query.searchParams.set('outFields', 'objectid,name,start_time,end_time');
  query.searchParams.set('returnGeometry', 'false');
  query.searchParams.set('orderByFields', 'end_time desc');
  query.searchParams.set('resultRecordCount', '240');

  const res = await fetchWithTimeout(query.toString(), 14000);
  if (!res.ok) throw new Error(`NESDIS catalog returned ${res.status}.`);
  const json = await res.json();
  const features = Array.isArray(json?.features) ? json.features : [];
  const cutoff = Date.now() - Math.max(30, minutesBack + 30) * 60_000;
  const seen = new Set<string>();

  const frames = features
    .map((feature: any) => {
      const attrs = feature?.attributes ?? {};
      const objectId = Number(attrs.objectid ?? attrs.OBJECTID ?? attrs.ObjectID);
      const start = Number(attrs.start_time ?? attrs.Start_Time);
      const end = Number(attrs.end_time ?? attrs.End_Time);
      const name = String(attrs.name ?? attrs.Name ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < cutoff) return null;

      // Ask ArcGIS for a time inside the raster's valid window instead of a synthetic boundary.
      const midpoint = start + Math.max(0, Math.min(end - start, 4 * 60_000));
      const key = name || String(end);
      if (seen.has(key)) return null;
      seen.add(key);
      return {
        index: 0,
        iso: new Date(midpoint).toISOString(),
        sourceName: name || undefined,
        rasterId: Number.isFinite(objectId) ? objectId : undefined,
      } satisfies SatelliteFrame;
    })
    .filter(Boolean) as SatelliteFrame[];

  return frames
    .sort((a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime())
    .map((frame: SatelliteFrame, index: number) => ({ ...frame, index }));
}

async function fetchNesdisGeoColorFrames(minutesBack: number): Promise<SatelliteFrame[]> {
  return fetchNesdisImageServerFrames(NESDIS_GEOCOLOR_ARCHIVE_EXPORT_URL, minutesBack);
}

async function fetchNesdisAbi13Frames(minutesBack: number): Promise<SatelliteFrame[]> {
  return fetchNesdisImageServerFrames(NESDIS_ABI13_ARCHIVE_EXPORT_URL, minutesBack);
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function isNexradSite(site: NexradSite) {
  return String(site.ownerType ?? '').toUpperCase() === 'NEXRAD';
}

function getStationDisplayId(site?: NexradSite | null) {
  if (!site?.id) return '---';
  const id3 = normalizeRadarSiteId(site.id);
  return id3.length === 3 ? `K${id3}` : site.id;
}

function getRadarAnchor(activePlace: any, currentCoords: { lat: number; lon: number } | null | undefined) {
  if (activePlace && Number.isFinite(activePlace.lat) && Number.isFinite(activePlace.lon)) {
    return { lat: Number(activePlace.lat), lon: Number(activePlace.lon) };
  }
  if (currentCoords && Number.isFinite(currentCoords.lat) && Number.isFinite(currentCoords.lon)) {
    return { lat: currentCoords.lat, lon: currentCoords.lon };
  }
  return { lat: 39.5, lon: -98.35 };
}

function nearestRadarSites(lat: number, lon: number, limit = 8) {
  return NEXRAD_SITES
    .filter(isNexradSite)
    .map((site) => {
      const dMi = haversineMiles(lat, lon, site.lat, site.lon);
      return { site, distanceMi: dMi };
    })
    .filter((item) => Number.isFinite(item.distanceMi))
    .sort((a, b) => a.distanceMi - b.distanceMi)
    .slice(0, limit);
}

function destinationPoint(lat: number, lon: number, bearingDegValue: number, distanceMi: number) {
  const radiusMi = 3958.7613;
  const delta = distanceMi / radiusMi;
  const theta = (bearingDegValue * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lon * Math.PI) / 180;

  const sinPhi2 =
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(Math.max(-1, Math.min(1, sinPhi2)));
  const y = Math.sin(theta) * Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2);
  const lambda2 = lambda1 + Math.atan2(y, x);

  return [(lambda2 * 180) / Math.PI, (phi2 * 180) / Math.PI];
}

function buildRadarStationGeoJson(site: NexradSite | null) {
  if (!site) return { type: 'FeatureCollection', features: [] };

  const features: any[] = [
    {
      type: 'Feature',
      properties: { kind: 'station', label: getStationDisplayId(site) },
      geometry: { type: 'Point', coordinates: [site.lon, site.lat] },
    },
  ];

  for (const radiusMi of STATION_RANGE_RINGS_MI) {
    const coords = Array.from({ length: 145 }, (_, index) =>
      destinationPoint(site.lat, site.lon, (index / 144) * 360, radiusMi),
    );
    features.push({
      type: 'Feature',
      properties: { kind: 'ring', radiusMi, label: `${radiusMi} mi` },
      geometry: { type: 'LineString', coordinates: coords },
    });
    features.push({
      type: 'Feature',
      properties: { kind: 'ring-label', radiusMi, label: `${radiusMi} mi` },
      geometry: { type: 'Point', coordinates: destinationPoint(site.lat, site.lon, 80, radiusMi) },
    });
  }

  return { type: 'FeatureCollection', features };
}

function regionToBbox(region: Region | null | undefined) {
  if (!region) return null;
  const latDelta = Number(region.latitudeDelta);
  const lonDelta = Number(region.longitudeDelta);
  const lat = Number(region.latitude);
  const lon = Number(region.longitude);
  if (![latDelta, lonDelta, lat, lon].every(Number.isFinite)) return null;

  return {
    west: lon - lonDelta / 2,
    south: lat - latDelta / 2,
    east: lon + lonDelta / 2,
    north: lat + latDelta / 2,
  };
}

function closeRingIfNeeded(coords: Array<[number, number]>) {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first?.[0] === last?.[0] && first?.[1] === last?.[1]) return coords;
  return [...coords, first];
}

function marineZonesToFeatureCollection(zones: NauticalZone[]) {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((zone) => {
      let geometry: any = zone.geometry ?? null;

      if (!geometry && Array.isArray(zone.polygon) && zone.polygon.length) {
        geometry = {
          type: 'Polygon' as const,
          coordinates: [
            closeRingIfNeeded(zone.polygon.map((point) => [point.longitude, point.latitude] as [number, number])),
          ],
        };
      }

      return {
        type: 'Feature' as const,
        id: zone.id,
        properties: {
          id: zone.id,
          name: zone.name,
          wfo: zone.wfo,
          type: zone.type,
        },
        geometry: geometry ?? { type: 'Point' as const, coordinates: [zone.centroid.longitude, zone.centroid.latitude] },
      };
    }),
  };
}

function bboxIntersects(
  a: { west: number; south: number; east: number; north: number } | null | undefined,
  b: { west: number; south: number; east: number; north: number },
) {
  if (!a) return true;
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function marineAreaToPolygon(area: MarineArea) {
  const { minLat, maxLat, minLon, maxLon } = area.bounds;
  return closeRingIfNeeded([
    [minLon, minLat],
    [maxLon, minLat],
    [maxLon, maxLat],
    [minLon, maxLat],
  ] as Array<[number, number]>);
}

function marineModelAreasToFeatureCollection(areas: MarineArea[]) {
  return {
    type: 'FeatureCollection' as const,
    features: areas.map((area) => ({
      type: 'Feature' as const,
      id: area.id,
      properties: {
        id: area.id,
        name: area.name,
        region: area.region,
        ocean: area.ocean,
        kind: area.kind,
        sourceType: 'model-area',
      },
      geometry: {
        type: 'Polygon' as const,
        coordinates: [marineAreaToPolygon(area)],
      },
    })),
  };
}

function marineBuoySeverity(waveM?: number | null, windKts?: number | null) {
  const waveFt = waveM != null ? waveM * 3.28084 : null;
  const wind = windKts ?? 0;
  if ((waveFt == null || waveFt < 3) && wind < 15) return 'calm';
  if (waveFt != null && waveFt < 6 && wind < 25) return 'moderate';
  if ((waveFt != null && waveFt < 10) || wind < 35) return 'rough';
  return 'extreme';
}

function buoysToFeatureCollection(buoys: BuoyDetailData[]) {
  return {
    type: 'FeatureCollection' as const,
    features: buoys
      .filter((buoy) => Number.isFinite(buoy.lat) && Number.isFinite(buoy.lon))
      .map((buoy) => ({
        type: 'Feature' as const,
        id: buoy.id,
        properties: {
          id: buoy.id,
          name: buoy.name ?? buoy.id,
          severity: marineBuoySeverity(buoy.waveHeightM ?? null, buoy.windSpeedKts ?? null),
          wind: buoy.windSpeedKts != null ? `${Math.round(buoy.windSpeedKts)} kt` : '--',
          waves: buoy.waveHeightM != null ? `${Math.round(buoy.waveHeightM * 3.28084)} ft` : '--',
        },
        geometry: { type: 'Point' as const, coordinates: [buoy.lon, buoy.lat] as [number, number] },
      })),
  };
}

function circlePolygonFeature(args: {
  id: string;
  lat: number;
  lon: number;
  radiusMi: number;
  properties: Record<string, any>;
}) {
  return {
    type: 'Feature' as const,
    id: args.id,
    properties: args.properties,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        Array.from({ length: 97 }, (_, index) =>
          destinationPoint(args.lat, args.lon, (index / 96) * 360, args.radiusMi),
        ),
      ],
    },
  };
}

function buildSkyScoreOverlay(lat: number, lon: number) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      circlePolygonFeature({
        id: 'sky-score-core',
        lat,
        lon,
        radiusMi: 90,
        properties: { band: 'good', label: 'SkyScore' },
      }),
      circlePolygonFeature({
        id: 'sky-score-context',
        lat,
        lon,
        radiusMi: 180,
        properties: { band: 'context', label: 'Observing area' },
      }),
      {
        type: 'Feature' as const,
        id: 'sky-score-center',
        properties: { label: 'SkyScore' },
        geometry: { type: 'Point' as const, coordinates: [lon, lat] as [number, number] },
      },
    ],
  };
}

function buildAuroraOverlay() {
  const band = (id: string, south: number, north: number, color: string, label: string) => ({
    type: 'Feature' as const,
    id,
    properties: { color, label },
    geometry: {
      type: 'Polygon' as const,
      coordinates: [[[-170, south], [-50, south], [-50, north], [-170, north], [-170, south]]],
    },
  });

  return {
    type: 'FeatureCollection' as const,
    features: [
      band('aurora-watch', 45, 55, '#7c3aed', 'Aurora watch'),
      band('aurora-favored', 55, 67, '#22d3ee', 'Aurora favored'),
      band('aurora-oval', 67, 74, '#a7f3d0', 'Aurora oval'),
    ],
  };
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
  globalTrueColorEnabled: boolean;
  globalCloudTopsEnabled: boolean;
  globalInfraredEnabled: boolean;
  globalPrecipEnabled: boolean;
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
    globalTrueColorEnabled,
    globalCloudTopsEnabled,
    globalInfraredEnabled,
    globalPrecipEnabled,
    playing,
    frameCount,
  } = args;

  if (globalPrecipEnabled) return 'Global satellite precip active';
  if (globalCloudTopsEnabled) return 'Global cloud tops active';
  if (globalInfraredEnabled) return 'Global infrared active';
  if (globalTrueColorEnabled) return 'Global true color active';
  if (goesTrueColorEnabled) return 'GOES true color active';
  if (cloudsEnabled) return 'GOES visible active';
  if (goesEastIrEnabled) return 'GOES infrared active';
  if (goesEastWvEnabled) return 'GOES East water vapor active';
  if (goesWestWvEnabled) return 'GOES West water vapor active';
  if (frontsDay1Enabled) return 'WPC Day 1 fronts active';
  if (frontsDay2Enabled) return 'WPC Day 2 fronts active';
  if (frontsDay3Enabled) return 'WPC Day 3 fronts active';

  if (viewId === 'clouds') {
    return cloudsEnabled || globalCloudTopsEnabled || globalTrueColorEnabled ? 'Cloud layer active' : 'Cloud layer off';
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

type FavoriteTemperatureState = {
  temp: number | null;
  loading: boolean;
  updatedAt: number;
  unit: 'F' | 'C';
};

const FAVORITE_TEMP_REFRESH_MS = 10 * 60 * 1000;

function favoriteKey(place: Pick<FavoriteLocation, 'id' | 'lat' | 'lon'>) {
  return `${place.id || 'fav'}:${Number(place.lat).toFixed(4)},${Number(place.lon).toFixed(4)}`;
}

function dedupeFavoriteLocations(items: Array<FavoriteLocation | any>) {
  const out: FavoriteLocation[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const lat = Number(item?.lat);
    const lon = Number(item?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      id: String(item?.id ?? `fav:${key}`),
      name: String(item?.name ?? 'Saved place'),
      lat,
      lon,
    });
  }

  return out;
}

function tempCircleColor(temp: number | null, unit: 'F' | 'C') {
  if (temp == null) return 'rgba(15,23,42,0.92)';
  const f = unit === 'C' ? temp * 1.8 + 32 : temp;
  if (f <= 32) return '#60a5fa';
  if (f <= 55) return '#22d3ee';
  if (f <= 75) return '#34d399';
  if (f <= 90) return '#facc15';
  if (f <= 105) return '#fb923c';
  return '#ef4444';
}

function tempCircleTextColor(temp: number | null, unit: 'F' | 'C') {
  if (temp == null) return '#e5e7eb';
  const f = unit === 'C' ? temp * 1.8 + 32 : temp;
  return f >= 72 && f <= 105 ? '#111827' : '#f8fafc';
}

function formatMapTemp(temp: number | null) {
  return temp == null ? '--' : `${Math.round(temp)}°`;
}

function formatMarineWaterTemp(valueC: number | undefined, unit: 'F' | 'C') {
  if (!Number.isFinite(valueC)) return '--';
  const c = Number(valueC);
  if (unit === 'C') return `${Math.round(c)} C`;
  return `${Math.round((c * 9) / 5 + 32)} F`;
}

function formatMarineUpdated(value?: string | null) {
  if (!value) return 'Latest report';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Latest report';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

async function fetchFavoriteTemperature(
  place: FavoriteLocation,
  unit: 'F' | 'C',
  signal: AbortSignal,
): Promise<number | null> {
  const units = unit === 'C' ? 'metric' : 'imperial';
  let url: string;

  try {
    url = apiUrl(`/api/current?lat=${encodeURIComponent(String(place.lat))}&lon=${encodeURIComponent(String(place.lon))}&units=${units}`);
  } catch {
    const temperatureUnit = unit === 'C' ? 'celsius' : 'fahrenheit';
    url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(String(place.lat))}` +
      `&longitude=${encodeURIComponent(String(place.lon))}` +
      `&current=temperature_2m&temperature_unit=${temperatureUnit}&timezone=auto`;
  }

  const res = await fetchWithTimeout(url, 8000, { signal });
  if (!res.ok) throw new Error(`Favorite temperature failed (${res.status})`);
  const json = await res.json();
  return safeNum(json?.temp ?? json?.current?.temperature_2m);
}

function useFavoriteTemperatures(favorites: FavoriteLocation[], unit: 'F' | 'C') {
  const [lookup, setLookup] = useState<Record<string, FavoriteTemperatureState>>({});
  const favoriteSignature = useMemo(
    () => favorites.map((place) => favoriteKey(place)).join('|'),
    [favorites],
  );

  useEffect(() => {
    if (!favorites.length) {
      setLookup({});
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const now = Date.now();
    const places = favorites.slice(0, 30);
    const stale = places.filter((place) => {
      const key = favoriteKey(place);
      const existing = lookup[key];
      return !existing || existing.unit !== unit || now - existing.updatedAt > FAVORITE_TEMP_REFRESH_MS;
    });

    if (!stale.length) return () => controller.abort();

    setLookup((current) => {
      const next = { ...current };
      stale.forEach((place) => {
        const key = favoriteKey(place);
        next[key] = {
          temp: current[key]?.unit === unit ? current[key]?.temp ?? null : null,
          loading: true,
          updatedAt: current[key]?.updatedAt ?? 0,
          unit,
        };
      });
      return next;
    });

    async function run() {
      for (let i = 0; i < stale.length; i += 4) {
        const batch = stale.slice(i, i + 4);
        await Promise.all(
          batch.map(async (place) => {
            const key = favoriteKey(place);
            try {
              const temp = await fetchFavoriteTemperature(place, unit, controller.signal);
              if (cancelled) return;
              setLookup((current) => ({
                ...current,
                [key]: { temp, loading: false, updatedAt: Date.now(), unit },
              }));
            } catch {
              if (cancelled) return;
              setLookup((current) => ({
                ...current,
                [key]: {
                  temp: current[key]?.unit === unit ? current[key]?.temp ?? null : null,
                  loading: false,
                  updatedAt: Date.now(),
                  unit,
                },
              }));
            }
          }),
        );
      }
    }

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [favoriteSignature, favorites, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  return lookup;
}

function buildFavoriteTemperatureGeoJson(args: {
  favorites: FavoriteLocation[];
  temperatures: Record<string, FavoriteTemperatureState>;
  activePlace?: { id?: string; lat?: number; lon?: number } | null;
  activeFavoriteId?: string | null;
  unit: 'F' | 'C';
}) {
  const features = args.favorites.map((place) => {
    const key = favoriteKey(place);
    const state = args.temperatures[key];
    const temp = state?.temp ?? null;
    const activeById = args.activeFavoriteId === place.id || args.activePlace?.id === place.id;
    const activeByCoords =
      args.activePlace?.lat != null &&
      args.activePlace?.lon != null &&
      Math.abs(Number(args.activePlace.lat) - place.lat) < 0.0005 &&
      Math.abs(Number(args.activePlace.lon) - place.lon) < 0.0005;
    const active = activeById || activeByCoords;

    return {
      type: 'Feature' as const,
      id: place.id,
      properties: {
        id: place.id,
        name: place.name,
        tempText: state?.loading && temp == null ? '...' : formatMapTemp(temp),
        circleColor: tempCircleColor(temp, args.unit),
        textColor: tempCircleTextColor(temp, args.unit),
        strokeColor: active ? '#f8fafc' : 'rgba(15,23,42,0.92)',
        strokeWidth: active ? 3 : 2,
        isActive: active ? 1 : 0,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [place.lon, place.lat],
      },
    };
  });

  return { type: 'FeatureCollection' as const, features };
}

export default function MapsScreen() {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{
    view?: string;
    lat?: string;
    lon?: string;
    label?: string;
    focus?: string;
    source?: string;
    targetType?: string;
    buoyId?: string;
  }>();
  const router = useRouter();
  const isFocused = useIsFocused();
  const {
    active: activePlace,
    favorites: placeFavorites,
    setActive: setPlaceActive,
  } = usePlace();

  const [state, dispatch] = React.useReducer(mapReducer, undefined, () =>
    createInitialMapState({ viewId: 'radar', nerdy: false }),
  );

  const loc = useLocations();
  const { baseMapStyle, tempUnit } = useSettings();
  const permission = 'granted' as const;
  const mapFavoriteLocations = useMemo(
    () => dedupeFavoriteLocations([...(loc.state.favorites ?? []), ...(placeFavorites ?? [])]),
    [loc.state.favorites, placeFavorites],
  );
  const favoriteTemperatures = useFavoriteTemperatures(mapFavoriteLocations, tempUnit);

  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
  const [rawMode, setRawMode] = useState(false);
  const [animationRecordMode, setAnimationRecordMode] = useState(false);
  const [animationRecordRegion, setAnimationRecordRegion] = useState<Region | null>(null);
  const [animationBufferStatus, setAnimationBufferStatus] = useState<AnimationBufferStatus | null>(null);
  const [animationExporting, setAnimationExporting] = useState(false);
  const [animationExportStatus, setAnimationExportStatus] = useState<string | null>(null);
  const [radarMode, setRadarMode] = useState<'mosaic' | 'station'>('mosaic');
  const [stationProduct, setStationProduct] = useState<RadarProductId>('N0B');
  const [stationPanelCollapsed, setStationPanelCollapsed] = useState(false);
  const [stationAnchor, setStationAnchor] = useState<{ lat: number; lon: number } | null>(null);
  const [manualRadarSiteId3, setManualRadarSiteId3] = useState<string | null>(null);
  const [cameraDebugLabel, setCameraDebugLabel] = useState('idle');
  const radarPrefsHydratedRef = useRef(false);

  useEffect(() => {
    if (animationRecordMode) return;
    setAnimationRecordRegion(null);
    setAnimationBufferStatus(null);
    setAnimationExportStatus(null);
  }, [animationRecordMode]);
  const [selectedWildfire, setSelectedWildfire] = useState<WildfireIncidentDetails | null>(null);
  const [selectedWeatherAlert, setSelectedWeatherAlert] = useState<WeatherAlertDetail | null>(null);
  const [selectedWeatherAlertForecastTarget, setSelectedWeatherAlertForecastTarget] =
    useState<WeatherAlertForecastTarget>(null);
  const [selectedMarineFeature, setSelectedMarineFeature] = useState<SelectedMarineFeature>(null);
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
  const [wildfireLegendExpanded, setWildfireLegendExpanded] = useState(true);
  const [astroDrawerExpanded, setAstroDrawerExpanded] = useState(false);
  const [astroHourOffset, setAstroHourOffset] = useState(0);

  const mapCameraRef = useRef<any>(null);
  const locateSeedRegionRef = useRef<Region | null>(null);
  const routeFocusSeedRegionRef = useRef<Region | null>(null);
  const radarStationSeedRegionRef = useRef<Region | null>(null);
  const lastCenteredRadarSiteRef = useRef<string | null>(null);
  const [region, setRegion] = useState<Region | null>(null);
  const [mapResetKey, setMapResetKey] = useState(0);

  useEffect(() => {
    const rawView = params?.view ? String(params.view).toLowerCase() : '';
    if (!rawView) return;

    if (rawView === 'astronomer' || rawView === 'astronomy' || rawView === 'astro') {
      router.replace({
        pathname: '/astro-map',
        params: {
          lat: params?.lat ? String(params.lat) : '',
          lon: params?.lon ? String(params.lon) : '',
          from: 'maps-astronomy-mode',
          nav: String(Date.now()),
        },
      } as any);
      return;
    }

    const valid = MAP_VIEWS.some((view) => view.id === rawView);
    if (!valid) return;

    dispatch({ type: 'SET_VIEW', viewId: rawView as any });
  }, [params?.lat, params?.lon, params?.view, router]);

  useEffect(() => {
    dispatch({ type: 'SET_RADAR_PLAYING', playing: true });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateRadarPrefs() {
      try {
        const [storedMode, storedProduct] = await Promise.all([
          AsyncStorage.getItem(RADAR_MODE_STORAGE_KEY),
          AsyncStorage.getItem(STATION_PRODUCT_STORAGE_KEY),
        ]);

        if (cancelled) return;

        if (storedMode === 'station' || storedMode === 'mosaic') {
          setRadarMode('mosaic');
        }

        if (storedProduct && STATION_PRODUCT_IDS.has(storedProduct as RadarProductId)) {
          setStationProduct(storedProduct === 'NET' ? 'EET' : (storedProduct as RadarProductId));
        }
      } finally {
        if (!cancelled) radarPrefsHydratedRef.current = true;
      }
    }

    hydrateRadarPrefs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!radarPrefsHydratedRef.current) return;
    AsyncStorage.setItem(RADAR_MODE_STORAGE_KEY, radarMode).catch(() => {});
  }, [radarMode]);

  useEffect(() => {
    if (!radarPrefsHydratedRef.current) return;
    AsyncStorage.setItem(STATION_PRODUCT_STORAGE_KEY, stationProduct).catch(() => {});
  }, [stationProduct]);

  const lastPanMarkRef = useRef<number>(0);
  const locateRequestIdRef = useRef(0);
  const wildfireLookupRef = useRef<{ incidents: any; perimeters: any; symbols: any }>({
    incidents: null,
    perimeters: null,
    symbols: null,
  });

  const [mapZoom, setMapZoom] = useState<number>(4);
  const radarEnabled = !!state.layers?.['radar.reflectivity']?.enabled;
  const stormMode = (state.viewId === 'radar' && state.radarTime.stormMode === true) || state.viewId === 'storm';
  const manualStationRadarMode = state.viewId === 'radar' && radarMode === 'station';
  const radarAnchor = useMemo(
    () => {
      if (manualStationRadarMode && stationAnchor) return stationAnchor;
      if (region) return { lat: region.latitude, lon: region.longitude };
      return getRadarAnchor(activePlace, loc.state.currentCoords);
    },
    [activePlace, loc.state.currentCoords, manualStationRadarMode, region, stationAnchor],
  );
  const radarAnchorKey = `${radarAnchor.lat.toFixed(4)},${radarAnchor.lon.toFixed(4)}`;
  const autoNearestRadar = useMemo(
    () =>
      resolveNearestRadar(radarAnchor.lat, radarAnchor.lon, {
        filter: isNexradSite,
        maxDistanceKm: 480,
      }),
    [radarAnchor.lat, radarAnchor.lon],
  );
  const localRadarAvailable = !!autoNearestRadar?.site;
  const autoNearestRadarMode =
    radarEnabled &&
    state.viewId === 'radar' &&
    !stormMode &&
    !manualStationRadarMode &&
    localRadarAvailable &&
    mapZoom >= AUTO_NEXRAD_MIN_ZOOM;
  const stationRadarMode = (stormMode || manualStationRadarMode || autoNearestRadarMode) && localRadarAvailable;
  const showAdvancedRadarControls = (stormMode || manualStationRadarMode) && localRadarAvailable;
  const nearbyRadarSites = useMemo(
    () => nearestRadarSites(radarAnchor.lat, radarAnchor.lon, 8),
    [radarAnchor.lat, radarAnchor.lon],
  );
  const selectedRadarSite = useMemo(() => {
    const id3 = manualRadarSiteId3 ?? (autoNearestRadar?.site ? normalizeRadarSiteId(autoNearestRadar.site.id) : null);
    if (!id3) return autoNearestRadar?.site ?? null;
    return NEXRAD_SITES.find((site) => isNexradSite(site) && normalizeRadarSiteId(site.id) === id3) ?? autoNearestRadar?.site ?? null;
  }, [autoNearestRadar, manualRadarSiteId3]);
  const selectedRadarDistanceMi = useMemo(() => {
    if (!selectedRadarSite) return null;
    return haversineMiles(radarAnchor.lat, radarAnchor.lon, selectedRadarSite.lat, selectedRadarSite.lon);
  }, [radarAnchor.lat, radarAnchor.lon, selectedRadarSite]);
  const selectedRadarId3 = selectedRadarSite ? normalizeRadarSiteId(selectedRadarSite.id) : null;
  const stationRangeRings = useMemo(() => buildRadarStationGeoJson(stationRadarMode ? selectedRadarSite : null), [
    stationRadarMode,
    selectedRadarSite,
  ]);
  const product: RadarProductId = showAdvancedRadarControls
    ? stationProduct
    : stationRadarMode
      ? 'N0B'
      : 'N0Q';
  const effectiveRadarProvider = stationRadarMode || stormMode ? 'iem' : 'rainviewer';

  useEffect(() => {
    setManualRadarSiteId3(null);
    lastCenteredRadarSiteRef.current = null;
    dispatch({ type: 'SET_RADAR_FRAME', frameIndex: 0 });
  }, [radarAnchorKey]);

  const handleMapPress = useCallback(
    async (e: any) => {
      const wildfireInteractionEnabled =
        !!state.layers?.['wildfire.perimeters']?.enabled || !!state.layers?.['wildfire.hotspots']?.enabled;
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

  const fireRestrictionsEnabled = !!state.layers?.['fire.restrictions']?.enabled;
  const wildfireSmokeEnabled = !!state.layers?.['wildfire.smoke']?.enabled;
  const wildfireEnabled = !!state.layers?.['wildfire.perimeters']?.enabled;
  const wildfireHotspotsEnabled = !!state.layers?.['wildfire.hotspots']?.enabled;
  const wildfireFireWxEnabled = !!state.layers?.['wildfire.firewx']?.enabled;
  const showWildfireLegend =
    wildfireEnabled || wildfireHotspotsEnabled || (state.viewId === 'wildfire' && wildfireSmokeEnabled);
  const alertsEnabled = !!state.layers?.['alerts.polygons']?.enabled;
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
  const marineConditionsEnabled = state.viewId === 'mariner' || !!state.layers?.['marine.conditions']?.enabled;
  const skyScoreEnabled = !!state.layers?.['astro.skyScore']?.enabled;
  const auroraProbEnabled = !!state.layers?.['space.aurora.prob']?.enabled;
  const auroraOvalEnabled = !!state.layers?.['space.aurora.oval']?.enabled;

  const goesTrueColorEnabled = !!state.layers?.['sat.goes.truecolor']?.enabled;
  const goesEastIrEnabled = !!state.layers?.['sat.goesEast.ir']?.enabled;
  const goesEastWvEnabled = !!state.layers?.['sat.goesEast.wv']?.enabled;
  const goesWestWvEnabled = !!state.layers?.['sat.goesWest.wv']?.enabled;
  const globalTrueColorEnabled = !!state.layers?.['sat.global.truecolor']?.enabled;
  const globalCloudTopsEnabled = !!state.layers?.['sat.global.cloudtops']?.enabled;
  const globalInfraredEnabled = !!state.layers?.['sat.global.infrared']?.enabled;
  const globalPrecipEnabled = !!state.layers?.['sat.global.precip']?.enabled;
  const animatedSatelliteEnabled =
    cloudsEnabled ||
    goesTrueColorEnabled ||
    goesEastIrEnabled ||
    goesEastWvEnabled ||
    goesWestWvEnabled ||
    globalTrueColorEnabled ||
    globalCloudTopsEnabled ||
    globalInfraredEnabled ||
    globalPrecipEnabled;
  const anySatelliteEnabled =
    animatedSatelliteEnabled ||
    goesTrueColorEnabled ||
    globalTrueColorEnabled ||
    globalCloudTopsEnabled ||
    globalInfraredEnabled ||
    globalPrecipEnabled;
  const [satelliteLoopHours, setSatelliteLoopHours] = useState<SatelliteLoopHours>(2);
  const satelliteLoopMinutes = satelliteLoopHours * 60;
  const satelliteFrameStepMinutes = SATELLITE_FRAME_STEP_MINUTES;
  const satellitePlayIntervalMs = SATELLITE_PLAY_INTERVAL_MS;
  const [satelliteFrames, setSatelliteFrames] = useState<SatelliteFrame[]>(() =>
    buildSatelliteFrames({ minutesBack: SATELLITE_LOOP_MINUTES_BACK }),
  );
  const [trueColorFrames, setTrueColorFrames] = useState<SatelliteFrame[]>([]);
  const [trueColorFrameStatus, setTrueColorFrameStatus] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  const [infraredFrames, setInfraredFrames] = useState<SatelliteFrame[]>([]);
  const [infraredFrameStatus, setInfraredFrameStatus] = useState<'idle' | 'loading' | 'ready' | 'fallback'>('idle');
  const [satelliteFrameIndex, setSatelliteFrameIndex] = useState(() =>
    Math.max(0, buildSatelliteFrames({ minutesBack: SATELLITE_LOOP_MINUTES_BACK }).length - 1),
  );
  const [satellitePlaying, setSatellitePlaying] = useState(false);
  const [satelliteBlend, setSatelliteBlend] = useState<{ from: number; to: number; t: number }>({
    from: satelliteFrameIndex,
    to: satelliteFrameIndex,
    t: 1,
  });
  const satelliteWasActiveRef = useRef(false);
  const satelliteFrameIndexRef = useRef(satelliteFrameIndex);
  const gibsImergFrames = useMemo(
    () => buildGibsImergFrames({ minutesBack: satelliteLoopMinutes }),
    [satelliteLoopMinutes],
  );
  const gibsDailyFrames = useMemo(() => buildGibsDailyFrames(), []);
  const satellitePlaybackFrames =
    goesTrueColorEnabled && trueColorFrames.length > 1
      ? trueColorFrames
      : goesEastIrEnabled && infraredFrames.length > 1
        ? infraredFrames
        : globalPrecipEnabled
          ? gibsImergFrames
          : globalTrueColorEnabled || globalCloudTopsEnabled || globalInfraredEnabled
            ? gibsDailyFrames
            : satelliteFrames;
  const satellitePlaybackFrameCount = satellitePlaybackFrames.length;
  const trueColorUsingCatalog = goesTrueColorEnabled && trueColorFrames.length > 1;
  const infraredUsingCatalog = goesEastIrEnabled && infraredFrames.length > 1;

  useEffect(() => {
    if (!goesTrueColorEnabled) {
      setTrueColorFrames([]);
      setTrueColorFrameStatus('idle');
      return;
    }

    let cancelled = false;
    setTrueColorFrameStatus('loading');
    fetchNesdisGeoColorFrames(satelliteLoopMinutes)
      .then((frames) => {
        if (cancelled) return;
        if (frames.length > 1) {
          setTrueColorFrames(frames);
          setSatelliteFrameIndex(frames.length - 1);
          setTrueColorFrameStatus('ready');
        } else {
          setTrueColorFrames([]);
          setTrueColorFrameStatus('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setTrueColorFrames([]);
        setTrueColorFrameStatus('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [goesTrueColorEnabled, satelliteLoopMinutes]);

  useEffect(() => {
    if (!goesEastIrEnabled) {
      setInfraredFrames([]);
      setInfraredFrameStatus('idle');
      return;
    }

    let cancelled = false;
    setInfraredFrameStatus('loading');
    fetchNesdisAbi13Frames(satelliteLoopMinutes)
      .then((frames) => {
        if (cancelled) return;
        if (frames.length > 1) {
          setInfraredFrames(frames);
          setSatelliteFrameIndex(frames.length - 1);
          setInfraredFrameStatus('ready');
        } else {
          setInfraredFrames([]);
          setInfraredFrameStatus('fallback');
        }
      })
      .catch(() => {
        if (cancelled) return;
        setInfraredFrames([]);
        setInfraredFrameStatus('fallback');
      });

    return () => {
      cancelled = true;
    };
  }, [goesEastIrEnabled, satelliteLoopMinutes]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) {
      satelliteWasActiveRef.current = false;
      setSatellitePlaying(false);
      return;
    }

    if (!satelliteWasActiveRef.current) {
      satelliteWasActiveRef.current = true;
      setSatelliteFrames(buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes }));
      setSatelliteFrameIndex((current) => {
        const frames = buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes });
        return clampIndex(current > 0 ? current : frames.length - 1, frames.length);
      });
      setSatellitePlaying(true);
    }
  }, [animatedSatelliteEnabled, satelliteLoopMinutes, satelliteFrameStepMinutes]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) return;

    const refresh = setInterval(() => {
      setSatelliteFrames((current) => {
        const next = buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes });
        if (current.length && current[current.length - 1]?.iso === next[next.length - 1]?.iso) return current;
        setSatelliteFrameIndex((index) => clampIndex(index + (next.length - current.length), next.length));
        return next;
      });
    }, 5 * 60_000);

    return () => clearInterval(refresh);
  }, [animatedSatelliteEnabled, satelliteLoopMinutes, satelliteFrameStepMinutes]);

  useEffect(() => {
    if (!animatedSatelliteEnabled) return;

    const next = buildSatelliteFrames({ minutesBack: satelliteLoopMinutes, stepMinutes: satelliteFrameStepMinutes });
    setSatelliteFrames((currentFrames) => {
      setSatelliteFrameIndex((current) => clampIndex(current + (next.length - currentFrames.length), next.length));
      return next;
    });
  }, [animatedSatelliteEnabled, satelliteLoopMinutes, satelliteFrameStepMinutes]);

  useEffect(() => {
    if (radarEnabled || !animatedSatelliteEnabled || !satellitePlaying || satellitePlaybackFrameCount < 2) return;

    const timer = setInterval(() => {
      setSatelliteFrameIndex((current) => (clampIndex(current, satellitePlaybackFrameCount) + 1) % satellitePlaybackFrameCount);
    }, satellitePlayIntervalMs);

    return () => clearInterval(timer);
  }, [animatedSatelliteEnabled, radarEnabled, satellitePlaybackFrameCount, satellitePlaying, satellitePlayIntervalMs]);

  useEffect(() => {
    if (!animatedSatelliteEnabled || satellitePlaybackFrameCount < 2) {
      setSatelliteBlend({ from: satelliteFrameIndex, to: satelliteFrameIndex, t: 1 });
      satelliteFrameIndexRef.current = satelliteFrameIndex;
      return;
    }

    const previous = clampIndex(satelliteFrameIndexRef.current, satellitePlaybackFrameCount);
    const next = clampIndex(satelliteFrameIndex, satellitePlaybackFrameCount);
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
  }, [animatedSatelliteEnabled, satelliteFrameIndex, satellitePlaybackFrameCount]);

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
  const alertsOpacity = Number.isFinite(state.layers?.['alerts.polygons']?.opacity)
    ? state.layers['alerts.polygons'].opacity
    : 0.95;

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

  const globalTrueColorOpacity = Number.isFinite(state.layers?.['sat.global.truecolor']?.opacity)
    ? state.layers['sat.global.truecolor'].opacity
    : 0.82;

  const globalCloudTopsOpacity = Number.isFinite(state.layers?.['sat.global.cloudtops']?.opacity)
    ? state.layers['sat.global.cloudtops'].opacity
    : 0.72;

  const globalInfraredOpacity = Number.isFinite(state.layers?.['sat.global.infrared']?.opacity)
    ? state.layers['sat.global.infrared'].opacity
    : 0.72;

  const globalPrecipOpacity = Number.isFinite(state.layers?.['sat.global.precip']?.opacity)
    ? state.layers['sat.global.precip'].opacity
    : 0.78;
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
  const marineConditionsOpacity = Number.isFinite(state.layers?.['marine.conditions']?.opacity)
    ? state.layers['marine.conditions'].opacity
    : 0.9;
  const skyScoreOpacity = Number.isFinite(state.layers?.['astro.skyScore']?.opacity)
    ? state.layers['astro.skyScore'].opacity
    : 0.85;
  const auroraProbOpacity = Number.isFinite(state.layers?.['space.aurora.prob']?.opacity)
    ? state.layers['space.aurora.prob'].opacity
    : 0.75;
  const auroraOvalOpacity = Number.isFinite(state.layers?.['space.aurora.oval']?.opacity)
    ? state.layers['space.aurora.oval'].opacity
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
    if (stationRadarMode && selectedRadarSite) return { lat: selectedRadarSite.lat, lon: selectedRadarSite.lon };
    if (region) return { lat: region.latitude, lon: region.longitude };
    return { lat: 39.5, lon: -98.35 };
  }, [region, selectedRadarSite, stationRadarMode]);

  const radarCtl = useRadarController({
    state,
    dispatch,
    sheetValue: { radarProvider: effectiveRadarProvider },
    centerForRadar,
    mapZoom,
    product,
    rawMode,
    region,
    stationMode: stationRadarMode,
    radarSiteId3: selectedRadarId3,
    localMinZoom: stormMode ? 10.5 : 12,
    ridgeMinZoom: stationRadarMode ? 2 : stormMode ? 7.4 : 8.6,
    animationQuality: BEST_ANIMATION_QUALITY,
  });

  const uiFrames = radarCtl.uiFrames;
  const uiTemplates = radarCtl.uiTemplates ?? [];
  const frameCount = radarCtl.frameCount;
  const activeFrameIso = radarCtl.activeFrameIso;
  const timestampLabel = radarCtl.timestampLabel;
  const radarProductMeta = RADAR_PRODUCT_META[product];
  const stationProductLoading = stationRadarMode && radarCtl.iemLoading;
  const stationProductUnavailable = stationRadarMode && !stationProductLoading && frameCount <= 0;
  const stationProductLatestOnly = product === 'N0U' || product === 'N0Z';
  const stationProductSourceLabel =
    product === 'EET' || product === 'NET'
      ? 'echo tops mosaic'
      : stationProductLatestOnly
      ? 'single-site latest tile'
      : radarCtl.usingIemRidgeAnimated
        ? 'single-site RIDGE'
        : stationProductUnavailable
          ? 'source unavailable'
          : 'loading station scans';

  useEffect(() => {
    if (!radarEnabled || !animatedSatelliteEnabled || satellitePlaybackFrames.length < 2 || !activeFrameIso) return;
    const nearestIndex = nearestFrameIndexByIso(satellitePlaybackFrames, activeFrameIso);
    if (nearestIndex < 0) return;
    setSatelliteFrameIndex((current) => (current === nearestIndex ? current : nearestIndex));
    setSatellitePlaying(state.radarTime.playing);
  }, [
    activeFrameIso,
    animatedSatelliteEnabled,
    radarEnabled,
    satellitePlaybackFrames,
    state.radarTime.playing,
  ]);

  const radarTileMaxZ = useMemo(() => {
    return radarCtl.radarTileMaxZ;
  }, [radarCtl.radarTileMaxZ]);

  const activeAnimationKind: AnimationCompositorKind | null =
    radarEnabled
      ? 'radar'
      : goesTrueColorEnabled
        ? 'truecolor'
        : goesEastIrEnabled
          ? 'ir'
          : goesEastWvEnabled
            ? 'wv-east'
            : goesWestWvEnabled
              ? 'wv-west'
              : cloudsEnabled
                ? 'clouds'
                : null;
  const animationCompositorKind = animationRecordMode ? activeAnimationKind : null;

  const mapRadar = useMemo(() => {
    if (!isFocused || animationCompositorKind === 'radar') {
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
  }, [animationCompositorKind, isFocused, radarCtl.radar, radarTileMaxZ]);

  const overlays = useMemo<WmsOverlayConfig[]>(() => {
    const list: WmsOverlayConfig[] = [];
    const satelliteFromFrame = satellitePlaybackFrames[clampIndex(satelliteBlend.from, satellitePlaybackFrames.length)] ?? null;
    const satelliteToFrame = satellitePlaybackFrames[clampIndex(satelliteBlend.to, satellitePlaybackFrames.length)] ?? null;
    const satelliteCurrentFrame = satellitePlaybackFrames[clampIndex(satelliteFrameIndex, satellitePlaybackFrames.length)] ?? null;
    const satelliteWarmFrame =
      satellitePlaybackFrames.length > 1
        ? satellitePlaybackFrames[(clampIndex(satelliteFrameIndex, satellitePlaybackFrames.length) + 1) % satellitePlaybackFrames.length]
        : null;
    const satelliteFade = Math.max(0, Math.min(1, satelliteBlend.t));
    const satelliteQuality = satelliteQualityForZoom(mapZoom);
    const gibsDailyDate = gibsDailyTime(satelliteCurrentFrame);
    const gibsPrecipTime = gibsHalfHourTime(satelliteCurrentFrame);

    const shared = {
      enabled: true,
      version: '1.1.1' as const,
      crs: 'EPSG:3857' as const,
      format: 'image/png',
      transparent: true,
      tileSize: satelliteQuality.tileSize,
      maxZoomLevel: satelliteQuality.maxZoomLevel,
      fadeDurationMs: 90,
      resampling: 'linear' as const,
    };

    const addAnimatedSatelliteWms = (args: {
      id: string;
      url: string;
      layers: string;
      opacity: number;
      zIndex: number;
      crossfade?: boolean;
      fadeDurationMs?: number;
      warmNextFrame?: boolean;
    }) => {
      const opacity = Math.max(0, Math.min(1, Number(args.opacity)));
      const fromIso = satelliteFromFrame?.iso ?? null;
      const toIso = satelliteToFrame?.iso ?? fromIso;
      const fadeDurationMs = args.fadeDurationMs ?? 0;

      if (args.crossfade !== true) {
        if (
          args.warmNextFrame !== false &&
          satelliteWarmFrame?.iso &&
          satelliteWarmFrame.iso !== (satelliteCurrentFrame?.iso ?? toIso)
        ) {
          list.push({
            id: `${args.id}-warm`,
            url: args.url,
            layers: args.layers,
            time: satelliteWarmFrame.iso,
            opacity: Math.min(opacity, SATELLITE_WARM_OPACITY),
            zIndex: args.zIndex - 0.01,
            ...shared,
            fadeDurationMs: 0,
          });
        }

        list.push({
          id: args.id,
          url: args.url,
          layers: args.layers,
          time: satelliteCurrentFrame?.iso ?? toIso,
          opacity,
          zIndex: args.zIndex,
          ...shared,
          fadeDurationMs,
        });
        return;
      }

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
          fadeDurationMs,
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
        fadeDurationMs,
      });
    };

    const addAnimatedArcGisImageServer = (args: {
      id: string;
      url: string;
      opacity: number;
      zIndex: number;
    }) => {
      const opacity = Math.max(0, Math.min(1, Number(args.opacity)));
      const currentIso = satelliteCurrentFrame?.iso ?? satelliteToFrame?.iso ?? null;
      const currentRasterId = satelliteCurrentFrame?.rasterId ?? null;

      list.push({
        id: args.id,
        tileUrlTemplates: [arcGisImageServerTileTemplate(args.url, currentIso, satelliteQuality.tileSize, currentRasterId)],
        opacity,
        zIndex: args.zIndex,
        enabled: true,
        tileSize: satelliteQuality.tileSize,
        maxZoomLevel: satelliteQuality.maxZoomLevel,
        fadeDurationMs: 0,
        resampling: 'linear',
      });
    };

    if (globalTrueColorEnabled) {
      list.push({
        id: 'gibs-global-truecolor',
        tileUrlTemplates: [
          gibsWmtsTileTemplate({
            layer: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
            time: gibsDailyDate,
            matrixSet: 'GoogleMapsCompatible_Level9',
            extension: 'jpeg',
          }),
        ],
        opacity: Math.max(0, Math.min(1, Number(globalTrueColorOpacity))),
        zIndex: 58,
        enabled: true,
        tileSize: 256,
        maxZoomLevel: 9,
        fadeDurationMs: 120,
        resampling: 'linear',
      });
    }

    if (globalCloudTopsEnabled) {
      list.push({
        id: 'gibs-global-cloudtops',
        tileUrlTemplates: [
          gibsWmtsTileTemplate({
            layer: 'MODIS_Aqua_Cloud_Top_Temp_Day',
            time: gibsDailyDate,
            matrixSet: 'GoogleMapsCompatible_Level6',
            extension: 'png',
          }),
        ],
        opacity: Math.max(0, Math.min(1, Number(globalCloudTopsOpacity))),
        zIndex: 66,
        enabled: true,
        tileSize: 256,
        maxZoomLevel: 6,
        fadeDurationMs: 120,
        resampling: 'linear',
      });
    }

    if (globalInfraredEnabled) {
      list.push({
        id: 'gibs-global-infrared',
        tileUrlTemplates: [
          gibsWmtsTileTemplate({
            layer: 'MODIS_Aqua_Brightness_Temp_Band31_Night',
            time: gibsDailyDate,
            matrixSet: 'GoogleMapsCompatible_Level7',
            extension: 'png',
          }),
        ],
        opacity: Math.max(0, Math.min(1, Number(globalInfraredOpacity))),
        zIndex: 67,
        enabled: true,
        tileSize: 256,
        maxZoomLevel: 7,
        fadeDurationMs: 120,
        resampling: 'linear',
      });
    }

    if (globalPrecipEnabled) {
      list.push({
        id: 'gibs-global-precip',
        tileUrlTemplates: [
          gibsWmtsTileTemplate({
            layer: 'IMERG_Precipitation_Rate_30min',
            time: gibsPrecipTime,
            matrixSet: 'GoogleMapsCompatible_Level6',
            extension: 'png',
          }),
        ],
        opacity: Math.max(0, Math.min(1, Number(globalPrecipOpacity))),
        zIndex: 102,
        enabled: true,
        tileSize: 256,
        maxZoomLevel: 6,
        fadeDurationMs: 120,
        resampling: 'linear',
      });
    }

    if (goesTrueColorEnabled) {
      addAnimatedArcGisImageServer({
        id: 'goes-truecolor',
        url: NESDIS_GEOCOLOR_ARCHIVE_EXPORT_URL,
        opacity: Math.max(0, Math.min(1, Number(goesTrueColorOpacity))),
        zIndex: 62,
      });
    }

    if (cloudsEnabled) {
      addAnimatedSatelliteWms({
        id: 'goes-east-visible',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 60,
        crossfade: true,
        fadeDurationMs: 240,
      });
      addAnimatedSatelliteWms({
        id: 'goes-west-visible',
        url: 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi',
        layers: 'conus_ch02',
        opacity: Math.max(0, Math.min(1, Number(cloudsOpacity))),
        zIndex: 61,
        crossfade: true,
        fadeDurationMs: 240,
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
      addAnimatedArcGisImageServer({
        id: 'goes-abi13-ir',
        url: NESDIS_ABI13_ARCHIVE_EXPORT_URL,
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
    globalCloudTopsEnabled,
    globalCloudTopsOpacity,
    globalInfraredEnabled,
    globalInfraredOpacity,
    globalPrecipEnabled,
    globalPrecipOpacity,
    globalTrueColorEnabled,
    globalTrueColorOpacity,
    mapZoom,
    satelliteBlend.from,
    satelliteBlend.t,
    satelliteBlend.to,
    satelliteFrameIndex,
    satellitePlaybackFrames,
  ]);

  const renderedOverlays = useMemo(() => {
    if (!animationCompositorKind || animationCompositorKind === 'radar') return overlays;
    const satellitePrefixes = [
      'goes-truecolor',
      'goes-abi13-ir',
      'goes-east-ir',
      'goes-west-ir',
      'goes-east-wv',
      'goes-west-wv',
      'goes-east-visible',
      'goes-west-visible',
    ];
    return overlays.filter((overlay) => !satellitePrefixes.some((prefix) => overlay.id.startsWith(prefix)));
  }, [animationCompositorKind, overlays]);

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
  const marineBbox = useMemo(
    () => (marineConditionsEnabled && mapZoom >= 4 ? regionToBbox(effectiveRegion) : null),
    [effectiveRegion, mapZoom, marineConditionsEnabled],
  );
  const { zones: marineZones } = useMarineZonesByBbox(marineBbox);
  const { data: buoyData } = useAllBuoyDetails();
  const visibleMarineZones = useMemo(() => marineZones.slice(0, mapZoom < 6 ? 600 : mapZoom < 8 ? 1200 : 2500), [
    marineZones,
    mapZoom,
  ]);
  const marineBuoys = useMemo(() => (buoyData ?? []).filter((buoy) => Number.isFinite(buoy.lat) && Number.isFinite(buoy.lon)), [
    buoyData,
  ]);
  const marineZonesById = useMemo(() => new Map(visibleMarineZones.map((zone) => [zone.id, zone])), [visibleMarineZones]);
  const marineBuoysById = useMemo(() => new Map(marineBuoys.map((buoy) => [buoy.id, buoy])), [marineBuoys]);
  const visibleMarineModelAreas = useMemo(
    () =>
      MARINE_AREAS.filter((area) => {
        if (area.country !== 'INTL') return false;
        return bboxIntersects(marineBbox, {
          west: area.bounds.minLon,
          south: area.bounds.minLat,
          east: area.bounds.maxLon,
          north: area.bounds.maxLat,
        });
      }),
    [marineBbox],
  );
  const marineModelAreasById = useMemo(
    () => new Map(MARINE_AREAS.filter((area) => area.country === 'INTL').map((area) => [area.id, area])),
    [],
  );
  const marineZonesFc = useMemo(() => marineZonesToFeatureCollection(visibleMarineZones), [visibleMarineZones]);
  const marineBuoysFc = useMemo(() => buoysToFeatureCollection(marineBuoys), [marineBuoys]);
  const marineModelAreasFc = useMemo(
    () => marineModelAreasToFeatureCollection(visibleMarineModelAreas),
    [visibleMarineModelAreas],
  );
  const selectedMarineBuoy =
    selectedMarineFeature?.kind === 'buoy' ? marineBuoysById.get(selectedMarineFeature.id) ?? null : null;
  const selectedMarineZone =
    selectedMarineFeature?.kind === 'zone' ? marineZonesById.get(selectedMarineFeature.id) ?? null : null;
  const selectedMarineModelArea =
    selectedMarineFeature?.kind === 'model-area' ? marineModelAreasById.get(selectedMarineFeature.id) ?? null : null;
  const resolveMarineFeatureAtPoint = useCallback(
    (lat: number, lon: number): SelectedMarineFeature => {
      if (!marineConditionsEnabled) return null;

      const nearestBuoy = marineBuoys
        .map((buoy) => ({
          buoy,
          distanceMi: haversineMiles(lat, lon, buoy.lat, buoy.lon),
        }))
        .filter((item) => item.distanceMi <= marineBuoyHitRadiusMiles(mapZoom))
        .sort((a, b) => a.distanceMi - b.distanceMi)[0]?.buoy;

      if (nearestBuoy) return { kind: 'buoy', id: nearestBuoy.id };

      const zone = visibleMarineZones.find((item) => geometryContainsPoint(item.geometry, lat, lon));
      if (zone) return { kind: 'zone', id: zone.id };

      const modelArea = visibleMarineModelAreas.find(
        (area) =>
          lat >= area.bounds.minLat &&
          lat <= area.bounds.maxLat &&
          lon >= area.bounds.minLon &&
          lon <= area.bounds.maxLon,
      );
      return modelArea ? { kind: 'model-area', id: modelArea.id } : null;
    },
    [mapZoom, marineBuoys, marineConditionsEnabled, visibleMarineModelAreas, visibleMarineZones],
  );
  const resolveMarineZoneAtPoint = useCallback(
    (lat: number, lon: number) => {
      if (!marineConditionsEnabled) return null;
      return visibleMarineZones.find((item) => geometryContainsPoint(item.geometry, lat, lon)) ?? null;
    },
    [marineConditionsEnabled, visibleMarineZones],
  );

  useEffect(() => {
    if (!marineConditionsEnabled) setSelectedMarineFeature(null);
  }, [marineConditionsEnabled]);

  useEffect(() => {
    const targetBuoyId = params?.buoyId ? String(params.buoyId).toUpperCase() : '';
    if (!targetBuoyId || !marineBuoys.length) return;

    const match = marineBuoys.find((buoy) => buoy.id.toUpperCase() === targetBuoyId);
    if (!match) return;

    setSelectedMarineFeature({ kind: 'buoy', id: match.id });
  }, [marineBuoys, params?.buoyId]);

  useEffect(() => {
    if (params?.targetType !== 'marine-model-extreme') return;
    const lat = Number(params?.lat);
    const lon = Number(params?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const modelArea = MARINE_AREAS.find(
      (area) =>
        area.country === 'INTL' &&
        lat >= area.bounds.minLat &&
        lat <= area.bounds.maxLat &&
        lon >= area.bounds.minLon &&
        lon <= area.bounds.maxLon,
    );
    if (modelArea) setSelectedMarineFeature({ kind: 'model-area', id: modelArea.id });
  }, [params?.lat, params?.lon, params?.targetType]);

  const skyOverlayAnchor = useMemo(() => {
    if (activePlace && Number.isFinite(activePlace.lat) && Number.isFinite(activePlace.lon)) {
      return { lat: Number(activePlace.lat), lon: Number(activePlace.lon) };
    }
    return { lat: effectiveRegion.latitude, lon: effectiveRegion.longitude };
  }, [activePlace, effectiveRegion.latitude, effectiveRegion.longitude]);
  const skyScoreFc = useMemo(
    () => buildSkyScoreOverlay(skyOverlayAnchor.lat, skyOverlayAnchor.lon),
    [skyOverlayAnchor.lat, skyOverlayAnchor.lon],
  );
  const auroraFc = useMemo(() => buildAuroraOverlay(), []);
  const astroEstimatedScore = useMemo(() => {
    const hourPenalty = Math.abs(astroHourOffset - 10) <= 5 ? 0 : 8;
    const latitudeBonus = Math.abs(skyOverlayAnchor.lat) > 38 ? 4 : 0;
    return clampNumber(Math.round(78 + latitudeBonus - hourPenalty), 0, 100);
  }, [astroHourOffset, skyOverlayAnchor.lat]);
  const astroAuroraVisibility = useMemo(
    () => clampNumber(Math.round((Math.abs(skyOverlayAnchor.lat) - 40) * 3.2), 0, 100),
    [skyOverlayAnchor.lat],
  );
  const astronomyModeActive = state.viewId === 'astronomer';
  const activeFavoriteId = loc.active.kind === 'favorite' ? loc.active.id : null;
  const favoriteTemperatureGeoJson = useMemo(
    () =>
      buildFavoriteTemperatureGeoJson({
        favorites: mapFavoriteLocations,
        temperatures: favoriteTemperatures,
        activePlace,
        activeFavoriteId,
        unit: tempUnit,
      }),
    [activeFavoriteId, activePlace, favoriteTemperatures, mapFavoriteLocations, tempUnit],
  );
  const handleFavoriteTemperaturePress = useCallback(
    (e: any) => {
      const id = String(e?.features?.[0]?.properties?.id ?? e?.feature?.properties?.id ?? '');
      const favorite = mapFavoriteLocations.find((item) => item.id === id);
      if (!favorite) return;

      loc.addOrActivateFavorite(favorite.name, favorite.lat, favorite.lon);
      setPlaceActive({
        id: favorite.id,
        name: favorite.name,
        lat: favorite.lat,
        lon: favorite.lon,
        source: 'favorite',
      });
      router.push('/(tabs)' as any);
    },
    [loc, mapFavoriteLocations, router, setPlaceActive],
  );

  useEffect(() => {
    if (!manualStationRadarMode || !selectedRadarSite || !selectedRadarId3) return;
    if (lastCenteredRadarSiteRef.current === selectedRadarId3) return;

    const nextRegion: Region = {
      latitude: selectedRadarSite.lat,
      longitude: selectedRadarSite.lon,
      latitudeDelta: 2.2,
      longitudeDelta: 2.2,
      zoom: approxZoomFromLongitudeDelta(2.2),
    };

    lastCenteredRadarSiteRef.current = selectedRadarId3;
    radarStationSeedRegionRef.current = nextRegion;
    setCameraDebugLabel(`radar-station:${getStationDisplayId(selectedRadarSite)}`);
    setRegion(nextRegion);
    setMapZoom(nextRegion.zoom ?? approxZoomFromLongitudeDelta(nextRegion.longitudeDelta));
    setMapResetKey((value) => value + 1);

    requestAnimationFrame(() => {
      radarStationSeedRegionRef.current = null;
    });
  }, [manualStationRadarMode, selectedRadarId3, selectedRadarSite]);

  useEffect(() => {
    if (!manualStationRadarMode) lastCenteredRadarSiteRef.current = null;
  }, [manualStationRadarMode]);

  const warningsOverlayEnabled = alertsEnabled;
  const alertsData = useAlertMapData(warningsOverlayEnabled, effectiveRegion);
  useEffect(() => {
    if (!warningsOverlayEnabled) {
      setSelectedWeatherAlert(null);
      setSelectedWeatherAlertForecastTarget(null);
    }
  }, [warningsOverlayEnabled]);
  const handleWeatherAlertPress = useCallback(
    (e: any) => {
      const feature = e?.features?.[0] ?? e?.feature ?? null;
      const detail = alertFeatureToDetail(feature);
      const pressCoords = getMapPressLonLat(e) ?? getGeometryCenter(feature?.geometry);

      if (!detail) return;

      const marineZone = pressCoords ? resolveMarineZoneAtPoint(pressCoords.lat, pressCoords.lon) : null;
      setSelectedWeatherAlertForecastTarget(
        marineZone
          ? {
              kind: 'marine',
              zoneId: marineZone.id,
              name: marineZone.name,
              wfo: marineZone.wfo ?? '',
            }
          : pressCoords
            ? { kind: 'land', lat: pressCoords.lat, lon: pressCoords.lon }
            : null,
      );
      setSelectedMarineFeature(null);
      setSelectedWeatherAlert(detail);
    },
    [resolveMarineZoneAtPoint],
  );
  const openSelectedAlertForecast = useCallback(() => {
    const target = selectedWeatherAlertForecastTarget;
    if (!target) return;

    if (target.kind === 'marine') {
      router.push({
        pathname: '/nautical/zone/[zoneId]',
        params: {
          zoneId: target.zoneId,
          name: target.name ?? target.zoneId,
          wfo: target.wfo ?? '',
        },
      } as any);
      return;
    }

    const url = `https://forecast.weather.gov/MapClick.php?lat=${encodeURIComponent(
      target.lat.toFixed(4),
    )}&lon=${encodeURIComponent(target.lon.toFixed(4))}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Forecast unavailable', 'Unable to open the official NWS point forecast.');
    });
  }, [router, selectedWeatherAlertForecastTarget]);
  const wildfireVectorEnabled =
    state.viewId === 'wildfire' || wildfireSmokeEnabled || wildfireEnabled || wildfireHotspotsEnabled;
  const fireRestrictionsData = useFireRestrictionsMapData(fireRestrictionsEnabled, effectiveRegion);
  const wildfireData = useWildfireMapData(wildfireVectorEnabled, effectiveRegion);
  const visibleWildfirePerimeters = useMemo(
    () => filterVisibleWildfirePerimeters(wildfireData.perimeters),
    [wildfireData.perimeters]
  );
  const visibleWildfireIncidents = useMemo(
    () => filterVisibleWildfirePerimeters(wildfireData.incidents),
    [wildfireData.incidents]
  );
  const wildfireSymbolData = useMemo(
    () => buildWildfireSymbolFeatureCollection(visibleWildfirePerimeters, visibleWildfireIncidents),
    [visibleWildfirePerimeters, visibleWildfireIncidents]
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

  const seedStationAnchorFromMap = useCallback(() => {
    const anchorRegion = region ?? effectiveRegion;
    const lat = Number(anchorRegion.latitude);
    const lon = Number(anchorRegion.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    setStationAnchor({ lat, lon });
    setManualRadarSiteId3(null);
    lastCenteredRadarSiteRef.current = null;
  }, [effectiveRegion, region]);

  const recenterToGps = () => {
    locateRequestIdRef.current += 1;
    const cachedCoords = loc.state.currentCoords;
    if (cachedCoords && Number.isFinite(cachedCoords.lat) && Number.isFinite(cachedCoords.lon)) {
      if (manualStationRadarMode) {
        setStationAnchor({ lat: cachedCoords.lat, lon: cachedCoords.lon });
        setManualRadarSiteId3(null);
        lastCenteredRadarSiteRef.current = null;
      }
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
    globalTrueColorEnabled,
    globalCloudTopsEnabled,
    globalInfraredEnabled,
    globalPrecipEnabled,
    playing: state.radarTime.playing,
    frameCount,
  });

  const satelliteFrameCount = satellitePlaybackFrames.length;
  const satelliteTimelineActive = !radarEnabled && animatedSatelliteEnabled && satelliteFrameCount > 1;
  const timelineFrames = radarEnabled ? uiFrames : satellitePlaybackFrames;
  const timelineFrameIndex = radarEnabled ? state.radarTime.frameIndex : satelliteFrameIndex;
  const timelinePlaying = radarEnabled ? state.radarTime.playing : satellitePlaying;
  const showTimeline = isFocused && !animationRecordMode && ((radarEnabled && frameCount > 1) || satelliteTimelineActive);
  const satelliteLoadStatus = useMemo(() => {
    if (!satelliteTimelineActive) return null;

    const product = goesTrueColorEnabled
      ? 'GeoColor'
      : goesEastIrEnabled
        ? 'Infrared'
        : goesEastWvEnabled || goesWestWvEnabled
          ? 'Water vapor'
          : globalPrecipEnabled
            ? 'IMERG precip'
            : globalCloudTopsEnabled
              ? 'Global cloud tops'
              : globalInfraredEnabled
                ? 'Global infrared'
                : globalTrueColorEnabled
                  ? 'Global true color'
                  : 'Visible satellite';
    const source =
      goesTrueColorEnabled || goesEastIrEnabled
        ? 'NESDIS catalog'
        : globalPrecipEnabled
          ? 'NASA GIBS 30-minute tiles'
          : globalTrueColorEnabled || globalCloudTopsEnabled || globalInfraredEnabled
            ? 'NASA GIBS daily tiles'
            : 'satellite timeline';
    const status = goesTrueColorEnabled ? trueColorFrameStatus : goesEastIrEnabled ? infraredFrameStatus : 'ready';
    const expectedFrames = goesTrueColorEnabled
      ? Math.max(2, Math.floor(satelliteLoopMinutes / 30))
      : goesEastIrEnabled
        ? Math.max(2, Math.floor(satelliteLoopMinutes / 10))
        : globalPrecipEnabled
          ? Math.max(2, Math.floor(satelliteLoopMinutes / GIBS_IMERG_FRAME_STEP_MINUTES))
          : globalTrueColorEnabled || globalCloudTopsEnabled || globalInfraredEnabled
            ? GIBS_DAILY_FRAME_COUNT
            : Math.max(2, Math.floor(satelliteLoopMinutes / SATELLITE_FRAME_STEP_MINUTES));
    const coverage = Math.max(0, Math.min(1, satelliteFrameCount / expectedFrames));
    const percent = status === 'loading' ? 0.18 : coverage;
    const sparse = status === 'ready' && coverage < 0.7;

    return {
      loading: status === 'loading',
      percent,
      title:
        status === 'loading'
          ? `Loading ${product} source imagery`
          : status === 'fallback'
            ? `${product} source is slow`
            : sparse
              ? `${product} source coverage is limited`
              : `${product} source ready`,
      detail:
        status === 'loading'
          ? `Building a ${satelliteLoopHours}h loop from ${source}. High-quality frames can take a moment.`
          : status === 'fallback'
            ? `Using a fallback timeline while ${source} catches up.`
            : sparse
              ? `${satelliteFrameCount} frames are available for this ${satelliteLoopHours}h window right now.`
              : `${satelliteFrameCount} frames loaded for this ${satelliteLoopHours}h window.`,
    };
  }, [
    goesEastIrEnabled,
    goesEastWvEnabled,
    globalCloudTopsEnabled,
    globalInfraredEnabled,
    globalPrecipEnabled,
    globalTrueColorEnabled,
    goesTrueColorEnabled,
    goesWestWvEnabled,
    infraredFrameStatus,
    satelliteFrameCount,
    satelliteLoopHours,
    satelliteLoopMinutes,
    satelliteTimelineActive,
    trueColorFrameStatus,
  ]);
  const dockBottom = 12 + insets.bottom;
  const DOCK_ESTIMATED_HEIGHT = satelliteLoadStatus ? 154 : 102;
  const legendBottom = showTimeline ? dockBottom + DOCK_ESTIMATED_HEIGHT + 10 : dockBottom + 6;

  const accentBg = getViewAccent(String(state.viewId));
  const activeOverlayCount = activeLayerSummary.count ?? 0;
  const boundaryReliefTone =
    goesEastIrEnabled || globalInfraredEnabled || globalCloudTopsEnabled
      ? 'orange'
      : cloudsEnabled || goesTrueColorEnabled || globalTrueColorEnabled
        ? 'teal'
        : null;

  const overlaySummaryText = activeLayerSummary.hasActiveLayers
    ? activeLayerSummary.subtitle ?? simpleStatus
    : simpleStatus;

  const providerLabel = stormMode ? 'Storm Scope' : effectiveRadarProvider === 'rainviewer' ? 'RainViewer' : 'IEM radar';
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
  const alertStatusLabel = warningsOverlayEnabled
    ? alertsData.loading
      ? alertsData.sourceMode === 'official' ? 'Loading official alerts' : 'Loading global alert outlook'
      : alertsData.error
        ? alertsData.sourceMode === 'official' ? 'Official alerts unavailable' : 'Global alert outlook unavailable'
        : alertsData.geojson.features.length > 0
          ? alertsData.sourceMode === 'official'
            ? `${alertsData.geojson.features.length} official alerts nearby`
            : `${alertsData.geojson.features.length} model-derived outlooks nearby`
          : alertsData.sourceMode === 'official'
            ? 'No nearby official alerts'
            : 'No model-derived outlooks nearby'
    : null;
  const overlayStatusText = aviationStatusLabel
    ? [overlaySummaryText, aviationStatusLabel].filter(Boolean).join(' / ')
    : [overlaySummaryText, alertStatusLabel ?? fireRestrictionsStatusLabel].filter(Boolean).join(' / ');
  const fireInteractionEnabled = wildfireEnabled || selectedWildfire != null || selectedRestrictionPoint != null;
  const showRestrictionDetail =
    fireInteractionEnabled &&
    selectedWildfire == null &&
    selectedRestrictionPoint != null &&
    (wildfireFireContext.loading || wildfireFireContext.data != null || wildfireFireContext.error != null);
  const showFireDetailPanel = fireInteractionEnabled && (wildfireDetailLoading || selectedWildfire != null || showRestrictionDetail);
  const showAviationPanel = state.viewId === 'aviation' && aviationOverlayEnabled;
  const animationViewportRegion = animationRecordRegion ?? effectiveRegion;
  const animationFrameSource = activeAnimationKind === 'radar' ? uiFrames : satellitePlaybackFrames;
  const animationCompositorFrames = useMemo(
    () =>
      animationFrameSource
        .filter((frame: any) => typeof frame?.iso === 'string')
        .map((frame: any, index: number) => ({
          id: `${index}-${frame.iso}`,
          iso: frame.iso,
          rasterId: typeof frame.rasterId === 'number' ? frame.rasterId : undefined,
        })),
    [animationFrameSource],
  );
  const animationCompositorCoordinates = useMemo(
    () => animationCoordinates(animationViewportRegion),
    [animationViewportRegion],
  );
  const animationCompositorOpacity =
    activeAnimationKind === 'radar'
      ? radarCtl.radarOpacity
      : activeAnimationKind === 'truecolor'
        ? goesTrueColorOpacity
        : activeAnimationKind === 'ir'
          ? goesEastIrOpacity
          : activeAnimationKind === 'wv-east'
            ? goesEastWvOpacity
            : activeAnimationKind === 'wv-west'
              ? goesWestWvOpacity
              : cloudsOpacity;
  const animationCompositorInterval =
    activeAnimationKind === 'truecolor'
      ? 1050
      : 900;
  const animationCompositorBlend =
    activeAnimationKind === 'truecolor'
      ? 680
      : 420;
  const animationExportSize = useMemo(
    () =>
      animationExportDimensions(animationViewportRegion, activeAnimationKind, mapZoom, {
        width: viewportWidth,
        height: viewportHeight,
      }),
    [activeAnimationKind, animationViewportRegion, mapZoom, viewportHeight, viewportWidth],
  );
  const animationExportRegion = useMemo(
    () =>
      regionForViewportAspect(animationViewportRegion, {
        width: viewportWidth,
        height: viewportHeight,
      }),
    [animationViewportRegion, viewportHeight, viewportWidth],
  );
  const buildAnimationUrl = useCallback(
    (
      source: 'radar' | 'geocolor' | 'goes-east-ir' | 'goes-west-ir' | 'goes-east-wv' | 'goes-west-wv' | 'goes-east-visible' | 'goes-west-visible',
      frame: { iso: string; rasterId?: number },
      width: number,
      height: number,
    ) => {
      if (source === 'radar') {
        return buildRadarCompositorUrl({
          product,
          region: animationExportRegion,
          iso: frame.iso,
          width,
          height,
          stormMode,
        });
      }
      if (source === 'geocolor') {
        return buildArcGisImageExportUrl({
          baseUrl: NESDIS_GEOCOLOR_ARCHIVE_EXPORT_URL,
          region: animationExportRegion,
          iso: frame.iso,
          rasterId: frame.rasterId,
          width,
          height,
        });
      }
      if (source === 'goes-east-ir') {
        return buildArcGisImageExportUrl({
          baseUrl: NESDIS_ABI13_ARCHIVE_EXPORT_URL,
          region: animationExportRegion,
          iso: frame.iso,
          rasterId: frame.rasterId,
          width,
          height,
        });
      }
      const endpoint = source.includes('west')
        ? 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_west.cgi'
        : 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes_east.cgi';
      const layer = source.includes('ir')
        ? 'conus_ch13'
        : source.includes('wv')
          ? 'conus_ch08'
          : 'conus_ch02';
      return buildGoesWmsImageUrl({
        endpoint,
        layer,
        region: animationExportRegion,
        iso: frame.iso,
        width,
        height,
      });
    },
    [animationExportRegion, product, stormMode],
  );

  const animationProductLabel = useMemo(() => {
    if (activeAnimationKind === 'radar') {
      const radarLabel = radarProductMeta?.summaryLabel ?? radarProductMeta?.chipLabel ?? 'Radar';
      if (goesTrueColorEnabled) return `${radarLabel} + true color`;
      if (goesEastIrEnabled) return `${radarLabel} + infrared`;
      return radarLabel;
    }
    if (activeAnimationKind === 'truecolor') return 'True color';
    if (activeAnimationKind === 'ir') return 'Infrared';
    if (activeAnimationKind === 'wv-east' || activeAnimationKind === 'wv-west') return 'Water vapor';
    if (activeAnimationKind === 'clouds') return 'Visible cloud loop';
    return 'Weather loop';
  }, [activeAnimationKind, goesEastIrEnabled, goesTrueColorEnabled, radarProductMeta?.chipLabel, radarProductMeta?.summaryLabel]);

  const animationExportFrames = useMemo<AnimationVideoFrame[]>(() => {
    if (!activeAnimationKind || animationCompositorFrames.length < 2) return [];
    const { width, height } = animationExportSize;
    return animationCompositorFrames.map((frame) => {
      const label = new Date(frame.iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (activeAnimationKind === 'radar') {
        const idx = animationCompositorFrames.findIndex((candidate) => candidate.id === frame.id);
        const tileTemplate = idx >= 0 ? uiTemplates[idx] : null;
        const satelliteIndex = nearestFrameIndexByIso(satellitePlaybackFrames, frame.iso);
        const satelliteFrame = satelliteIndex >= 0 ? satellitePlaybackFrames[satelliteIndex] : null;
        const underlayUrls =
          satelliteFrame && goesTrueColorEnabled
            ? [buildAnimationUrl('geocolor', satelliteFrame, width, height)]
            : satelliteFrame && goesEastIrEnabled
              ? [buildAnimationUrl('goes-east-ir', satelliteFrame, width, height)]
              : [];
        return {
          label,
          urls: tileTemplate ? [] : [buildAnimationUrl('radar', frame, width, height)],
          underlayUrls,
          tileTemplate,
          basemapTemplate: EXPORT_BASEMAP_TEMPLATE_DARK,
          region: animationExportRegion,
          zoom: mapZoom,
          opacity: radarCtl.radarOpacity,
        };
      }
      if (activeAnimationKind === 'truecolor') {
        return {
          label,
          urls: [buildAnimationUrl('geocolor', frame, width, height)],
          basemapBoundaryTemplate: EXPORT_BASEMAP_BOUNDARIES_TEMPLATE,
          basemapOverlayTemplate: EXPORT_BASEMAP_LABELS_TEMPLATE_DARK,
          region: animationExportRegion,
          zoom: mapZoom,
        };
      }
      if (activeAnimationKind === 'ir') {
        return {
          label,
          urls: [buildAnimationUrl('goes-east-ir', frame, width, height)],
          basemapBoundaryTemplate: EXPORT_BASEMAP_BOUNDARIES_TEMPLATE,
          basemapOverlayTemplate: EXPORT_BASEMAP_LABELS_TEMPLATE_DARK,
          region: animationExportRegion,
          zoom: mapZoom,
        };
      }
      if (activeAnimationKind === 'wv-west') {
        return {
          label,
          urls: [buildAnimationUrl('goes-west-wv', frame, width, height)],
          basemapBoundaryTemplate: EXPORT_BASEMAP_BOUNDARIES_TEMPLATE,
          basemapOverlayTemplate: EXPORT_BASEMAP_LABELS_TEMPLATE_DARK,
          region: animationExportRegion,
          zoom: mapZoom,
        };
      }
      if (activeAnimationKind === 'wv-east') {
        return {
          label,
          urls: [buildAnimationUrl('goes-east-wv', frame, width, height)],
          basemapBoundaryTemplate: EXPORT_BASEMAP_BOUNDARIES_TEMPLATE,
          basemapOverlayTemplate: EXPORT_BASEMAP_LABELS_TEMPLATE_DARK,
          region: animationExportRegion,
          zoom: mapZoom,
        };
      }
      return {
        label,
        urls: [
          buildAnimationUrl('goes-east-visible', frame, width, height),
          buildAnimationUrl('goes-west-visible', frame, width, height),
        ],
        basemapBoundaryTemplate: EXPORT_BASEMAP_BOUNDARIES_TEMPLATE,
        basemapOverlayTemplate: EXPORT_BASEMAP_LABELS_TEMPLATE_DARK,
        region: animationExportRegion,
        zoom: mapZoom,
      };
    });
  }, [
    activeAnimationKind,
    animationCompositorFrames,
    animationExportRegion,
    animationExportSize,
    buildAnimationUrl,
    mapZoom,
    radarCtl.radarOpacity,
    goesEastIrEnabled,
    goesTrueColorEnabled,
    satellitePlaybackFrames,
    uiTemplates,
  ]);

  const handleAnimationRecordPress = useCallback(async () => {
    const exportFrames = animationExportFrames;
    if (!activeAnimationKind || exportFrames.length < 2) {
      Alert.alert('Animation not ready', 'Turn on an animated radar or satellite layer first.');
      return;
    }
    if (!canExportAnimationVideo()) {
      Alert.alert('Video export unavailable', 'Install an Android build with the OMNIwx video exporter to save MP4 loops.');
      return;
    }

    setAnimationRecordRegion(effectiveRegion);
    setAnimationBufferStatus(null);
    setAnimationRecordMode(true);
    setAnimationExporting(true);
    setAnimationExportStatus(`Preparing ${exportFrames.length} frames`);
    if (activeAnimationKind === 'radar') {
      dispatch({ type: 'SET_RADAR_PLAYING', playing: true });
    } else {
      setSatellitePlaying(true);
    }

    try {
      const placeLabel = activePlace?.name ?? 'Current map';
      const { width, height } = animationExportSize;
      const result = await exportAnimationVideo({
        frames: exportFrames,
        title: 'OMNIwx',
        subtitle: placeLabel,
        productLabel: animationProductLabel,
        width,
        height,
        fps: 30,
        secondsPerSourceFrame:
          activeAnimationKind === 'truecolor' ? 0.62 : 0.46,
        transitionSeconds:
          activeAnimationKind === 'truecolor' ? 0.44 : 0.24,
      });
      setAnimationExportStatus(`Saved ${result.width}x${result.height} MP4`);
      Alert.alert('Video saved', 'Your OMNIwx animation was saved to Movies/OMNIwx.');
    } catch (error: any) {
      const message = error?.message ?? 'The video export failed before it could be saved.';
      setAnimationExportStatus('Export failed');
      Alert.alert('Could not save video', message);
    } finally {
      setAnimationExporting(false);
    }
  }, [
    activePlace?.name,
    activeAnimationKind,
    animationExportFrames,
    animationExportSize,
    animationProductLabel,
    effectiveRegion,
  ]);

  return (
    <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          <MapRenderer
            key={`map-${mapResetKey}`}
            engine="maplibre"
            initialRegion={
              routeFocusSeedRegionRef.current ??
              locateSeedRegionRef.current ??
              radarStationSeedRegionRef.current ??
              stableInitialRegion
            }
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
          overlays={renderedOverlays}
        >
          {animationCompositorKind && animationCompositorFrames.length > 1 ? (
            <>
              {animationCompositorKind === 'radar' ? (
                <AnimationCompositor
                  id="record-radar"
                  frames={animationCompositorFrames}
                  coordinates={animationCompositorCoordinates}
                  opacity={animationCompositorOpacity}
                  playing={animationRecordMode}
                  intervalMs={animationCompositorInterval}
                  blendMs={animationCompositorBlend}
                  buildUrl={(frame, width, height) => buildAnimationUrl('radar', frame, width, height)}
                  onBufferStatus={setAnimationBufferStatus}
                />
              ) : null}
              {animationCompositorKind === 'truecolor' ? (
                <AnimationCompositor
                  id="record-geocolor"
                  frames={animationCompositorFrames}
                  coordinates={animationCompositorCoordinates}
                  opacity={animationCompositorOpacity}
                  playing={animationRecordMode}
                  intervalMs={animationCompositorInterval}
                  blendMs={animationCompositorBlend}
                  buildUrl={(frame, width, height) => buildAnimationUrl('geocolor', frame, width, height)}
                  onBufferStatus={setAnimationBufferStatus}
                />
              ) : null}
              {animationCompositorKind === 'ir' ? (
                <AnimationCompositor
                  id="record-goes-abi13-ir"
                  frames={animationCompositorFrames}
                  coordinates={animationCompositorCoordinates}
                  opacity={animationCompositorOpacity}
                  playing={animationRecordMode}
                  intervalMs={animationCompositorInterval}
                  blendMs={animationCompositorBlend}
                  buildUrl={(frame, width, height) => buildAnimationUrl('goes-east-ir', frame, width, height)}
                  onBufferStatus={setAnimationBufferStatus}
                />
              ) : null}
              {animationCompositorKind === 'wv-east' || animationCompositorKind === 'wv-west' ? (
                <AnimationCompositor
                  id={`record-${animationCompositorKind}`}
                  frames={animationCompositorFrames}
                  coordinates={animationCompositorCoordinates}
                  opacity={animationCompositorOpacity}
                  playing={animationRecordMode}
                  intervalMs={animationCompositorInterval}
                  blendMs={animationCompositorBlend}
                  buildUrl={(frame, width, height) =>
                    buildAnimationUrl(animationCompositorKind === 'wv-west' ? 'goes-west-wv' : 'goes-east-wv', frame, width, height)
                  }
                  onBufferStatus={setAnimationBufferStatus}
                />
              ) : null}
              {animationCompositorKind === 'clouds' ? (
                <>
                  <AnimationCompositor
                    id="record-goes-east-visible"
                    frames={animationCompositorFrames}
                    coordinates={animationCompositorCoordinates}
                    opacity={animationCompositorOpacity}
                    playing={animationRecordMode}
                    intervalMs={animationCompositorInterval}
                    blendMs={animationCompositorBlend}
                    buildUrl={(frame, width, height) => buildAnimationUrl('goes-east-visible', frame, width, height)}
                    onBufferStatus={setAnimationBufferStatus}
                  />
                  <AnimationCompositor
                    id="record-goes-west-visible"
                    frames={animationCompositorFrames}
                    coordinates={animationCompositorCoordinates}
                    opacity={animationCompositorOpacity}
                    playing={animationRecordMode}
                    intervalMs={animationCompositorInterval}
                    blendMs={animationCompositorBlend}
                    buildUrl={(frame, width, height) => buildAnimationUrl('goes-west-visible', frame, width, height)}
                  />
                </>
              ) : null}
            </>
          ) : null}

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

          {warningsOverlayEnabled ? (
            <MapLibreGL.ShapeSource
              id="weather-alerts-source"
              shape={alertsData.geojson as any}
              onPress={handleWeatherAlertPress}
              hitbox={{ width: 44, height: 44 }}
            >
              <MapLibreGL.FillLayer
                id="weather-alerts-fill"
                style={{
                  fillColor: ['coalesce', ['get', 'fillColor'], '#a78bfa'] as any,
                  fillOpacity: Math.max(0.08, Math.min(0.42, alertsOpacity * 0.28)),
                }}
              />
              <MapLibreGL.LineLayer
                id="weather-alerts-line"
                style={{
                  lineColor: ['coalesce', ['get', 'lineColor'], '#ddd6fe'] as any,
                  lineOpacity: Math.max(0.38, Math.min(0.96, alertsOpacity)),
                  lineWidth: ['match', ['get', 'rank'], 8, 3.3, 7, 2.9, 6, 2.6, 5, 2.4, 2] as any,
                }}
              />
              <MapLibreGL.CircleLayer
                id="weather-alerts-point"
                filter={['==', ['geometry-type'], 'Point'] as any}
                style={{
                  circleColor: ['coalesce', ['get', 'fillColor'], '#a78bfa'] as any,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 7, 6, 10, 10, 14] as any,
                  circleOpacity: Math.max(0.55, Math.min(0.95, alertsOpacity)),
                  circleStrokeColor: ['coalesce', ['get', 'lineColor'], '#ddd6fe'] as any,
                  circleStrokeOpacity: Math.max(0.72, Math.min(1, alertsOpacity)),
                  circleStrokeWidth: ['match', ['get', 'rank'], 8, 3, 7, 2.6, 6, 2.4, 5, 2.2, 2] as any,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="weather-alerts-label"
                minZoomLevel={5}
                style={{
                  textField: ['get', 'label'],
                  textSize: ['interpolate', ['linear'], ['zoom'], 5, 9, 8, 11, 11, 13] as any,
                  textFont: ['Open Sans Bold'],
                  textColor: '#fff7ed',
                  textHaloColor: 'rgba(2,6,23,0.96)',
                  textHaloWidth: 1.35,
                  textMaxWidth: 12,
                  textAllowOverlap: false,
                  textOptional: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {stationRadarMode && selectedRadarSite ? (
            <MapLibreGL.ShapeSource id="radar-station-range-source" shape={stationRangeRings as any}>
              <MapLibreGL.LineLayer
                id="radar-station-rings"
                filter={['==', ['get', 'kind'], 'ring'] as any}
                style={{
                  lineColor: 'rgba(226,232,240,0.72)',
                  lineOpacity: ['interpolate', ['linear'], ['zoom'], 4, 0.28, 8, 0.62, 11, 0.78] as any,
                  lineWidth: ['interpolate', ['linear'], ['zoom'], 4, 0.8, 8, 1.25, 11, 1.8] as any,
                  lineDasharray: [2, 2],
                }}
              />
              <MapLibreGL.CircleLayer
                id="radar-station-dot"
                filter={['==', ['get', 'kind'], 'station'] as any}
                style={{
                  circleColor: '#f8fafc',
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 4, 4.5, 9, 6.5, 12, 8] as any,
                  circleStrokeColor: '#38bdf8',
                  circleStrokeWidth: 2,
                  circleOpacity: 0.96,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="radar-station-labels"
                minZoomLevel={5}
                style={{
                  textField: ['get', 'label'],
                  textSize: ['match', ['get', 'kind'], 'station', 12, 10] as any,
                  textFont: ['Open Sans Bold'],
                  textColor: '#f8fafc',
                  textHaloColor: 'rgba(2,6,23,0.96)',
                  textHaloWidth: 1.4,
                  textOffset: ['match', ['get', 'kind'], 'station', [0, 1.35], [0, 0]] as any,
                  textAllowOverlap: false,
                  textOptional: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {skyScoreEnabled ? (
            <MapLibreGL.ShapeSource id="astro-sky-score-source" shape={skyScoreFc as any}>
              <MapLibreGL.FillLayer
                id="astro-sky-score-fill"
                style={{
                  fillColor: [
                    'match',
                    ['get', 'band'],
                    'good',
                    'rgba(52,211,153,1)',
                    'context',
                    'rgba(45,212,191,1)',
                    'rgba(148,163,184,1)',
                  ] as any,
                  fillOpacity: ['match', ['get', 'band'], 'good', 0.28 * skyScoreOpacity, 'context', 0.12 * skyScoreOpacity, 0.12] as any,
                }}
              />
              <MapLibreGL.LineLayer
                id="astro-sky-score-line"
                style={{
                  lineColor: 'rgba(167,243,208,0.92)',
                  lineWidth: 1.4,
                  lineOpacity: 0.72 * skyScoreOpacity,
                  lineDasharray: [2, 2],
                }}
              />
              <MapLibreGL.SymbolLayer
                id="astro-sky-score-label"
                minZoomLevel={4}
                style={{
                  textField: ['get', 'label'] as any,
                  textSize: 11,
                  textColor: '#d1fae5',
                  textHaloColor: 'rgba(2,6,23,0.95)',
                  textHaloWidth: 1.4,
                  textOffset: [0, 1.2],
                  textAllowOverlap: false,
                  textOptional: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {auroraProbEnabled || auroraOvalEnabled ? (
            <MapLibreGL.ShapeSource id="astro-aurora-source" shape={auroraFc as any}>
              {auroraProbEnabled ? (
                <MapLibreGL.FillLayer
                  id="astro-aurora-prob-fill"
                  filter={['!=', ['get', 'label'], 'Aurora oval'] as any}
                  style={{
                    fillColor: ['get', 'color'] as any,
                    fillOpacity: 0.13 * auroraProbOpacity,
                  }}
                />
              ) : null}
              {auroraOvalEnabled || auroraProbEnabled ? (
                <MapLibreGL.LineLayer
                  id="astro-aurora-line"
                  style={{
                    lineColor: ['get', 'color'] as any,
                    lineWidth: ['match', ['get', 'label'], 'Aurora oval', 2.6, 1.6] as any,
                    lineOpacity: (auroraOvalEnabled ? 0.82 * auroraOvalOpacity : 0.55 * auroraProbOpacity),
                    lineDasharray: [3, 2],
                  }}
                />
              ) : null}
              <MapLibreGL.SymbolLayer
                id="astro-aurora-label"
                minZoomLevel={3}
                style={{
                  textField: ['get', 'label'] as any,
                  textSize: 10,
                  textColor: '#e9d5ff',
                  textHaloColor: 'rgba(2,6,23,0.96)',
                  textHaloWidth: 1.4,
                  textAllowOverlap: false,
                  textOptional: true,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          {marineConditionsEnabled ? (
            <>
              <MapLibreGL.ShapeSource
                id="marine-model-areas-source"
                shape={marineModelAreasFc as any}
                onPress={(e: any) => {
                  const feature = e?.features?.[0];
                  const id = String(feature?.properties?.id ?? feature?.id ?? '');
                  if (id) setSelectedMarineFeature({ kind: 'model-area', id });
                }}
              >
                <MapLibreGL.FillLayer
                  id="marine-model-areas-fill"
                  style={{
                    fillColor: 'rgba(20,184,166,1)',
                    fillOpacity: 0.08 * marineConditionsOpacity,
                  }}
                />
                <MapLibreGL.LineLayer
                  id="marine-model-areas-line"
                  style={{
                    lineColor: 'rgba(45,212,191,0.9)',
                    lineWidth: 1.4,
                    lineOpacity: 0.72 * marineConditionsOpacity,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="marine-model-areas-label"
                  minZoomLevel={3.2}
                  style={{
                    textField: ['get', 'name'] as any,
                    textSize: 10,
                    textColor: '#99f6e4',
                    textHaloColor: 'rgba(2,6,23,0.95)',
                    textHaloWidth: 1.2,
                    textAllowOverlap: false,
                    textOptional: true,
                  }}
                />
              </MapLibreGL.ShapeSource>

              <MapLibreGL.ShapeSource
                id="marine-zones-source"
                shape={marineZonesFc as any}
                onPress={(e: any) => {
                  const feature = e?.features?.[0];
                  const id = String(feature?.properties?.id ?? feature?.id ?? '');
                  if (id) setSelectedMarineFeature({ kind: 'zone', id });
                }}
              >
                <MapLibreGL.FillLayer
                  id="marine-zones-fill"
                  style={{
                    fillColor: 'rgba(14,165,233,1)',
                    fillOpacity: 0.14 * marineConditionsOpacity,
                  }}
                />
                <MapLibreGL.LineLayer
                  id="marine-zones-line"
                  style={{
                    lineColor: 'rgba(125,211,252,0.92)',
                    lineWidth: 1.8,
                    lineOpacity: 0.82 * marineConditionsOpacity,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="marine-zones-label"
                  minZoomLevel={5}
                  style={{
                    textField: ['coalesce', ['get', 'id'], ['get', 'name']] as any,
                    textSize: 10,
                    textColor: '#e0f2fe',
                    textHaloColor: 'rgba(2,6,23,0.95)',
                    textHaloWidth: 1.2,
                    textAllowOverlap: false,
                    textOptional: true,
                  }}
                />
              </MapLibreGL.ShapeSource>

              <MapLibreGL.ShapeSource
                id="marine-buoys-source"
                shape={marineBuoysFc as any}
                cluster
                clusterRadius={44}
                clusterMaxZoomLevel={8}
                onPress={(e: any) => {
                  const feature = e?.features?.[0];
                  const props = feature?.properties ?? {};
                  const id = String(props.id ?? feature?.id ?? '');

                  if (props?.cluster) {
                    const coords = feature?.geometry?.coordinates;
                    if (Array.isArray(coords) && coords.length >= 2) {
                      mapCameraRef.current?.setCamera?.({
                        centerCoordinate: [Number(coords[0]), Number(coords[1])],
                        zoomLevel: clampNumber((mapZoom ?? 5) + 2, 1, 20),
                        animationDuration: 450,
                      });
                    }
                    return;
                  }

                  if (id) setSelectedMarineFeature({ kind: 'buoy', id });
                }}
              >
                <MapLibreGL.CircleLayer
                  id="marine-buoy-clusters"
                  filter={['has', 'point_count'] as any}
                  style={{
                    circleColor: 'rgba(14,165,233,0.38)',
                    circleStrokeColor: 'rgba(186,230,253,0.92)',
                    circleStrokeWidth: 1.2,
                    circleRadius: ['step', ['get', 'point_count'], 14, 25, 18, 75, 22, 200, 26] as any,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="marine-buoy-cluster-count"
                  filter={['has', 'point_count'] as any}
                  style={{
                    textField: ['to-string', ['get', 'point_count']] as any,
                    textSize: 12,
                    textColor: '#e0f2fe',
                    textHaloColor: 'rgba(2,6,23,0.95)',
                    textHaloWidth: 1,
                  }}
                />
                <MapLibreGL.CircleLayer
                  id="marine-buoy-points"
                  filter={['!', ['has', 'point_count']] as any}
                  style={{
                    circleColor: [
                      'match',
                      ['get', 'severity'],
                      'calm',
                      '#22c55e',
                      'moderate',
                      '#eab308',
                      'rough',
                      '#f97316',
                      'extreme',
                      '#ef4444',
                      '#38bdf8',
                    ] as any,
                    circleOpacity: 0.94 * marineConditionsOpacity,
                    circleRadius: ['interpolate', ['linear'], ['zoom'], 3, 3.5, 7, 5.5, 10, 7.5] as any,
                    circleStrokeColor: 'rgba(2,6,23,0.96)',
                    circleStrokeWidth: 1.3,
                  }}
                />
                <MapLibreGL.SymbolLayer
                  id="marine-buoy-labels"
                  filter={['all', ['!', ['has', 'point_count']], ['>=', ['zoom'], 6]] as any}
                  style={{
                    textField: ['get', 'id'] as any,
                    textSize: 10,
                    textOffset: [0, 1.2],
                    textAnchor: 'top',
                    textColor: '#e0f2fe',
                    textHaloColor: 'rgba(2,6,23,0.95)',
                    textHaloWidth: 1,
                    textOptional: true,
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

          {wildfireEnabled || wildfireHotspotsEnabled ? (
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

          {mapFavoriteLocations.length ? (
            <MapLibreGL.ShapeSource
              id="favorite-temperature-source"
              shape={favoriteTemperatureGeoJson as any}
              onPress={handleFavoriteTemperaturePress}
              hitbox={{ width: 56, height: 56 }}
            >
              <MapLibreGL.CircleLayer
                id="favorite-temperature-hit"
                style={{
                  circleColor: '#ffffff',
                  circleOpacity: 0.01,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 3, 22, 7, 28, 11, 34] as any,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="favorite-temperature-halo"
                style={{
                  circleColor: ['get', 'circleColor'] as any,
                  circleOpacity: 0.22,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 3, 17, 7, 22, 11, 27] as any,
                  circleBlur: 0.45,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.CircleLayer
                id="favorite-temperature-circle"
                style={{
                  circleColor: ['get', 'circleColor'] as any,
                  circleOpacity: 0.96,
                  circleRadius: ['interpolate', ['linear'], ['zoom'], 3, 13, 7, 17, 11, 21] as any,
                  circleStrokeColor: ['get', 'strokeColor'] as any,
                  circleStrokeWidth: ['get', 'strokeWidth'] as any,
                  circlePitchAlignment: 'map',
                }}
              />
              <MapLibreGL.SymbolLayer
                id="favorite-temperature-label"
                style={{
                  textField: ['get', 'tempText'],
                  textSize: ['interpolate', ['linear'], ['zoom'], 3, 10, 7, 12, 11, 14] as any,
                  textFont: ['Open Sans Bold'],
                  textColor: ['get', 'textColor'] as any,
                  textHaloColor: 'rgba(2,6,23,0.26)',
                  textHaloWidth: 0.6,
                  textAllowOverlap: true,
                  textIgnorePlacement: true,
                }}
              />
              <MapLibreGL.SymbolLayer
                id="favorite-temperature-name"
                minZoomLevel={5.5}
                style={{
                  textField: ['get', 'name'],
                  textSize: ['interpolate', ['linear'], ['zoom'], 5.5, 9, 8, 10, 11, 11] as any,
                  textFont: ['Open Sans Bold'],
                  textColor: '#f8fafc',
                  textHaloColor: 'rgba(2,6,23,0.95)',
                  textHaloWidth: 1.35,
                  textOffset: [0, 1.85],
                  textMaxWidth: 10,
                  textOptional: true,
                  textAllowOverlap: false,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}
        </MapRenderer>

        {animationRecordMode ? (
          <View pointerEvents="box-none" style={[styles.recordExitWrap, { top: 12 + insets.top }]}>
            <Pressable onPress={() => setAnimationRecordMode(false)} style={styles.recordExitButton}>
              <Text style={styles.recordExitText}>
                {animationExportStatus ??
                  (animationBufferStatus && animationBufferStatus.total > 0
                    ? `Buffered ${animationBufferStatus.ready}/${animationBufferStatus.total} / Exit`
                    : 'Exit record mode')}
              </Text>
            </Pressable>
            {animationExporting ? <Text style={styles.recordExportHint}>Building smooth MP4 in the background</Text> : null}
          </View>
        ) : (
          <View pointerEvents="box-none" style={styles.topChrome}>
            <View style={styles.topChromeSpacer} />
            <View style={styles.quickActions}>
              <LayersButton count={activeOverlayCount} active={layersSheetOpen} onPress={() => setLayersSheetOpen(true)} />
              <LocationButton onPress={recenterToGps} />
            </View>
          </View>
        )}

        {!animationRecordMode && stationRadarMode ? (
          <View pointerEvents="none" style={styles.stationProductBadgeWrap}>
            <View
              style={[
                styles.stationProductBadge,
                product === 'EET' || product === 'NET'
                  ? styles.stationProductBadgeEcho
                  : radarProductMeta.legendStyle === 'velocity'
                    ? styles.stationProductBadgeVelocity
                    : styles.stationProductBadgeReflectivity,
              ]}
            >
              <Text style={styles.stationProductBadgeKicker}>
                {product === 'EET' || product === 'NET' ? 'HEIGHT PRODUCT' : radarProductMeta.legendStyle === 'velocity' ? 'WIND PRODUCT' : 'PRECIP PRODUCT'}
              </Text>
              <Text style={styles.stationProductBadgeTitle}>{radarProductMeta.legendTitle}</Text>
            </View>
          </View>
        ) : null}

        {!animationRecordMode && showRadarLegend ? (
          <View style={[styles.legendWrap, styles.topLegendWrap]}>
            <Glass
              style={[
                styles.legendCard,
                showAdvancedRadarControls ? styles.stationLegendCard : null,
                showAdvancedRadarControls && stationPanelCollapsed ? styles.stationLegendCardCollapsed : null,
              ]}
            >
              {showAdvancedRadarControls && stationPanelCollapsed ? (
                <View style={styles.stationCollapsedPanel}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.stationCollapsedEyebrow}>STORM SCOPE</Text>
                    <Text style={styles.stationCollapsedTitle} numberOfLines={1}>
                      {selectedRadarSite
                        ? `${getStationDisplayId(selectedRadarSite)} - ${radarProductMeta.legendTitle}`
                        : radarProductMeta.legendTitle}
                    </Text>
                    <Text style={styles.stationCollapsedMeta} numberOfLines={1}>
                      {stationProductLoading
                        ? `Loading ${radarProductMeta.summaryLabel.toLowerCase()}`
                        : activeFrameIso
                          ? `${radarProductMeta.summaryLabel} ${formatFrameAge(activeFrameIso)}`
                          : stationProductUnavailable
                            ? `${radarProductMeta.summaryLabel} unavailable`
                          : selectedRadarDistanceMi != null
                            ? `${Math.round(selectedRadarDistanceMi)} mi from map center`
                            : 'Latest scan'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => setStationPanelCollapsed(false)}
                    style={styles.panelIconButton}
                    accessibilityLabel="Expand station radar panel"
                  >
                    <Text style={styles.panelIconButtonText}>+</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {state.viewId === 'radar' ? (
                    <View style={styles.radarModeHeader}>
                      <View style={styles.radarModeRow}>
                        <MiniToggle
                          label="Storm Scope"
                          active={stormMode}
                          onPress={() => {
                            const nextStormMode = !stormMode;
                            if (nextStormMode) setRadarMode('mosaic');
                            dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'radar.reflectivity', enabled: true });
                            dispatch({ type: 'SET_RADAR_STORM_MODE', stormMode: nextStormMode });
                            dispatch({ type: 'SET_RADAR_FRAME', frameIndex: 0 });
                            dispatch({ type: 'SET_RADAR_PLAYING', playing: true });
                          }}
                        />
                      </View>
                      {showAdvancedRadarControls ? (
                        <Pressable
                          onPress={() => setStationPanelCollapsed(true)}
                          style={styles.panelIconButton}
                          accessibilityLabel="Minimize station radar panel"
                        >
                          <Text style={styles.panelIconButtonText}>-</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  <RadarLegend
                    style={effectiveRadarProvider === 'iem' ? radarProductMeta.legendStyle : 'rainviewer'}
                    title={radarProductMeta.legendTitle}
                    leftLabel={radarProductMeta.legendLeft}
                    midLabel={radarProductMeta.legendMid}
                    rightLabel={radarProductMeta.legendRight}
                    compact
                  />
                  <Text style={styles.legendCardMeta}>
                    {autoNearestRadarMode && selectedRadarSite
                      ? `Nearest radar site ${getStationDisplayId(selectedRadarSite)} selected automatically at this zoom.`
                      : effectiveRadarProvider === 'iem'
                      ? `${radarProductMeta.legendTitle} - ${radarProductMeta.legendNote}`
                      : 'RainViewer colors vary slightly by provider frame.'}
                  </Text>
                  {showAdvancedRadarControls ? (
                    <View style={styles.stationPanel}>
                      <View style={styles.stationHeader}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.stationEyebrow}>STORM SCOPE</Text>
                          <Text style={styles.stationTitle} numberOfLines={1}>
                            {selectedRadarSite
                              ? `${getStationDisplayId(selectedRadarSite)} ${selectedRadarSite.name}`
                              : 'Selecting nearest radar'}
                          </Text>
                        </View>
                        <View style={styles.agePill}>
                          <Text style={styles.agePillText}>
                            {stationProductLoading
                              ? `Loading ${radarProductMeta.summaryLabel}`
                              : activeFrameIso
                                ? `${radarProductMeta.summaryLabel} ${formatFrameAge(activeFrameIso)}`
                                : stationProductUnavailable
                                  ? 'No recent scans'
                                : 'Latest'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.stationMeta}>
                        {selectedRadarDistanceMi != null
                          ? `${Math.round(selectedRadarDistanceMi)} mi from map center`
                          : 'Distance pending'}
                        {' / '}
                        {stationProductLoading
                          ? `loading ${radarProductMeta.summaryLabel.toLowerCase()} scans`
                          : stationProductSourceLabel}
                      </Text>

                      <View style={styles.stationProductGrid}>
                        {STATION_RADAR_PRODUCTS.map((item) => {
                          const active = product === item.id;
                          const loading = active && stationProductLoading;
                          return (
                            <Pressable
                              key={item.id}
                              onPress={() => {
                                if (!item.enabled) {
                                  setLearnTopicId(item.learnTopicId);
                                  setLearnOpen(true);
                                  return;
                                }
                                setStationProduct(item.id as RadarProductId);
                                dispatch({ type: 'SET_RADAR_FRAME', frameIndex: 0 });
                              }}
                              style={[
                                styles.stationProductButton,
                                active ? styles.stationProductButtonActive : null,
                                active && (item.id === 'EET' || item.id === 'NET') ? styles.stationProductButtonEchoActive : null,
                                active && (item.id === 'N0U' || item.id === 'N0Z' || item.id === 'N0S') ? styles.stationProductButtonVelocityActive : null,
                                loading ? styles.stationProductButtonLoading : null,
                                !item.enabled ? styles.stationProductButtonDisabled : null,
                              ]}
                            >
                              <Text style={styles.stationProductLabel} numberOfLines={1}>
                                {item.label}
                              </Text>
                              <Text style={styles.stationProductSub} numberOfLines={1}>
                                {loading ? 'Loading scans...' : active && stationProductUnavailable ? 'No recent scans' : item.subtitle}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>

                      <Pressable
                        onPress={() => {
                          const topic = STATION_RADAR_PRODUCTS.find((item) => item.id === product)?.learnTopicId;
                          setLearnTopicId(topic ?? 'radar-base-reflectivity');
                          setLearnOpen(true);
                        }}
                        style={styles.wxLearnButton}
                      >
                        <Text style={styles.wxLearnButtonText}>wxLearn: {radarProductMeta.summaryLabel}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </Glass>
          </View>
        ) : null}

        {!animationRecordMode && showWildfireLegend ? (
          <View
            style={[
              styles.legendWrap,
              showRadarLegend ? styles.restrictionsLegendWrapWithRadar : styles.restrictionsLegendWrap,
            ]}
          >
            <Glass style={[styles.legendCard, styles.wildfireLegendCard]}>
              <View style={styles.wildfireLegendHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.legendCardTitle}>Wildfire legend</Text>
                  <Text style={styles.restrictionLegendTitle}>Polygons stay on map; dots show incident size</Text>
                </View>
                <Pressable
                  onPress={() => setWildfireLegendExpanded((current) => !current)}
                  style={styles.legendCollapseButton}
                  hitSlop={8}
                >
                  <Text style={styles.legendCollapseText}>{wildfireLegendExpanded ? '-' : '+'}</Text>
                </Pressable>
              </View>
              <View style={styles.wildfireLegendInline}>
                <View style={styles.restrictionLegendRow}>
                  <View style={[styles.restrictionLegendSwatch, { backgroundColor: '#fb923c', borderColor: '#fed7aa' }]} />
                  <Text style={styles.restrictionLegendLabel}>Perimeter</Text>
                </View>
                <View style={styles.restrictionLegendRow}>
                  <View style={[styles.wildfireLegendDot, { backgroundColor: '#fb923c', borderColor: '#fff7ed' }]} />
                  <Text style={styles.restrictionLegendLabel}>Incident dots</Text>
                </View>
                <View style={styles.restrictionLegendRow}>
                  <View style={[styles.restrictionLegendSwatch, { backgroundColor: '#fbbf24', borderColor: '#fef3c7' }]} />
                  <Text style={styles.restrictionLegendLabel}>Smoke</Text>
                </View>
              </View>
              {wildfireLegendExpanded ? (
                <View style={styles.wildfireLegendExpandedBody}>
                  <View style={styles.wildfireSizeScale}>
                    <View style={styles.wildfireSizeItem}>
                      <View style={[styles.wildfireLegendDot, styles.wildfireDotUnknown, { backgroundColor: '#fda4af', borderColor: '#fff1f2' }]} />
                      <Text style={styles.restrictionLegendLabel}>Unknown acres</Text>
                    </View>
                    <View style={styles.wildfireSizeItem}>
                      <View style={[styles.wildfireLegendDot, styles.wildfireDotSmall, { backgroundColor: '#fdba74', borderColor: '#fffbeb' }]} />
                      <Text style={styles.restrictionLegendLabel}>Under 1k</Text>
                    </View>
                    <View style={styles.wildfireSizeItem}>
                      <View style={[styles.wildfireLegendDot, styles.wildfireDotMedium, { backgroundColor: '#fb923c', borderColor: '#fff7ed' }]} />
                      <Text style={styles.restrictionLegendLabel}>1k+</Text>
                    </View>
                    <View style={styles.wildfireSizeItem}>
                      <View style={[styles.wildfireLegendDot, styles.wildfireDotLarge, { backgroundColor: '#ea580c', borderColor: '#fff7ed' }]} />
                      <Text style={styles.restrictionLegendLabel}>10k+</Text>
                    </View>
                    <View style={styles.wildfireSizeItem}>
                      <View style={[styles.wildfireLegendDot, styles.wildfireDotHuge, { backgroundColor: '#dc2626', borderColor: '#fff1f2' }]} />
                      <Text style={styles.restrictionLegendLabel}>50k+</Text>
                    </View>
                  </View>
                  <Text style={styles.wildfireLegendNote}>
                    Dots without polygons usually mean the incident feed has a location before a current perimeter is published, or the perimeter is outside the current map window.
                  </Text>
                </View>
              ) : null}
            </Glass>
          </View>
        ) : !animationRecordMode && fireRestrictionsEnabled ? (
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

        {!animationRecordMode && astronomyModeActive ? (
          <>
            <View pointerEvents="none" style={[styles.astroLegendWrap, { top: 12 + insets.top }]}>
              <Glass style={styles.astroLegendCard}>
                <View style={styles.astroLegendRow}>
                  <Text style={styles.astroLegendEdge}>WORST</Text>
                  <View style={styles.astroLegendSwatches}>
                    {SKY_LEGEND_SWATCHES.map((color, index) => (
                      <View key={`maps-sky-legend-${index}`} style={[styles.astroLegendSwatch, { backgroundColor: color }]} />
                    ))}
                  </View>
                  <Text style={styles.astroLegendBest}>BEST</Text>
                </View>
              </Glass>
            </View>

            <View style={[styles.astroDrawerWrap, { bottom: 12 + insets.bottom }]}>
              <Glass style={styles.astroDrawerCard}>
                <Pressable
                  onPress={() => setAstroDrawerExpanded((value) => !value)}
                  style={styles.astroDrawerHandle}
                  hitSlop={12}
                >
                  <View style={styles.astroDrawerHandleBar} />
                  <Text style={styles.astroDrawerHandleText}>{astroDrawerExpanded ? 'HIDE DETAILS' : 'SKY DETAILS'}</Text>
                </Pressable>

                <View style={styles.astroDrawerHeader}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.astroDrawerTitle}>Sky {astroEstimatedScore}</Text>
                    <Text style={styles.astroDrawerSubtitle} numberOfLines={2}>
                      {skyScoreLabel(astroEstimatedScore)} / {formatAstroHourLabel(astroHourOffset)}
                    </Text>
                  </View>
                  <View style={styles.astroScorePill}>
                    <Text style={styles.astroScorePillText}>{astroAuroraVisibility}% aurora</Text>
                  </View>
                </View>

                <Text style={styles.astroDrawerSummary} numberOfLines={astroDrawerExpanded ? 3 : 2}>
                  {skyScoreSentence(astroEstimatedScore, astroAuroraVisibility)}
                </Text>

                <View style={styles.astroControlRow}>
                  <MiniToggle
                    label="Sky"
                    active={skyScoreEnabled}
                    onPress={() => dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'astro.skyScore', enabled: !skyScoreEnabled })}
                  />
                  <MiniToggle
                    label="Aurora"
                    active={auroraProbEnabled}
                    onPress={() => dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'space.aurora.prob', enabled: !auroraProbEnabled })}
                  />
                  <MiniToggle
                    label="Aurora oval"
                    active={auroraOvalEnabled}
                    onPress={() => dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'space.aurora.oval', enabled: !auroraOvalEnabled })}
                  />
                </View>

                {astroDrawerExpanded ? (
                  <View style={styles.astroDrawerBody}>
                    <View style={styles.astroForecastHeader}>
                      <Text style={styles.astroForecastLabel}>Forecast: {formatAstroHourLabel(astroHourOffset)}</Text>
                      <Text style={styles.astroForecastRange}>0-24h</Text>
                    </View>
                    <View style={styles.astroStepperRow}>
                      <Pressable
                        onPress={() => setAstroHourOffset((value) => clampNumber(value - 1, 0, 24))}
                        style={styles.astroStepButton}
                      >
                        <Text style={styles.astroStepText}>-</Text>
                      </Pressable>
                      <View style={styles.astroStepTrack}>
                        <View style={[styles.astroStepFill, { width: `${(astroHourOffset / 24) * 100}%` }]} />
                      </View>
                      <Pressable
                        onPress={() => setAstroHourOffset((value) => clampNumber(value + 1, 0, 24))}
                        style={styles.astroStepButton}
                      >
                        <Text style={styles.astroStepText}>+</Text>
                      </Pressable>
                    </View>

                    <View style={styles.astroMetricGrid}>
                      <AstroMetric label="Quality" value={skyScoreLabel(astroEstimatedScore)} />
                      <AstroMetric label="SkyScore" value={`${astroEstimatedScore}`} />
                      <AstroMetric label="Aurora vis" value={`${astroAuroraVisibility}%`} />
                      <AstroMetric label="Center" value={`${skyOverlayAnchor.lat.toFixed(2)}, ${skyOverlayAnchor.lon.toFixed(2)}`} />
                    </View>
                  </View>
                ) : null}
              </Glass>
            </View>
          </>
        ) : null}

        {!animationRecordMode && aviationModeActive ? (
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
                  <View style={styles.animationControlStrip}>
                    <View style={styles.animationControlSpacer} />
                    <Pressable
                      onPress={handleAnimationRecordPress}
                      disabled={animationExporting}
                      style={[styles.recordModeButton, animationExporting ? styles.recordModeButtonDisabled : null]}
                    >
                      <Text style={styles.recordModeButtonText}>{animationExporting ? 'Saving' : 'Record'}</Text>
                    </Pressable>
                  </View>
                  {satelliteTimelineActive ? (
                    <View style={styles.satelliteLoopControls}>
                      <Text style={styles.satelliteLoopLabel}>Loop</Text>
                      <View style={styles.satelliteLoopChips}>
                        {SATELLITE_LOOP_HOUR_OPTIONS.map((hours) => {
                          const active = satelliteLoopHours === hours;
                          return (
                            <Pressable
                              key={hours}
                              onPress={() => setSatelliteLoopHours(hours)}
                              style={[styles.satelliteLoopChip, active ? styles.satelliteLoopChipActive : null]}
                            >
                              <Text
                                style={[
                                  styles.satelliteLoopChipText,
                                  active ? styles.satelliteLoopChipTextActive : null,
                                ]}
                              >
                                {hours}h
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={styles.satelliteLoopMeta}>
                        {satelliteFrameCount} frames
                        {goesTrueColorEnabled
                          ? trueColorUsingCatalog
                            ? ' / catalog'
                            : trueColorFrameStatus === 'loading'
                              ? ' / loading'
                              : ' / fallback'
                          : goesEastIrEnabled
                            ? infraredUsingCatalog
                              ? ' / catalog'
                              : infraredFrameStatus === 'loading'
                                ? ' / loading'
                                : ' / fallback'
                          : ''}
                      </Text>
                    </View>
                  ) : null}
                  {satelliteLoadStatus ? (
                    <View style={styles.satelliteLoadPanel}>
                      <View style={styles.satelliteLoadHeader}>
                        {satelliteLoadStatus.loading ? (
                          <ActivityIndicator size="small" color="#7dd3fc" />
                        ) : null}
                        <Text style={styles.satelliteLoadTitle} numberOfLines={1}>
                          {satelliteLoadStatus.title}
                        </Text>
                        <Text style={styles.satelliteLoadPct}>
                          {Math.round(satelliteLoadStatus.percent * 100)}%
                        </Text>
                      </View>
                      <View style={styles.satelliteLoadTrack}>
                        <View
                          style={[
                            styles.satelliteLoadFill,
                            { width: `${Math.round(satelliteLoadStatus.percent * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.satelliteLoadDetail} numberOfLines={2}>
                        {satelliteLoadStatus.detail}
                      </Text>
                    </View>
                  ) : null}
                  <TimelineScrubber
                    frameIndex={timelineFrameIndex}
                    playing={timelinePlaying}
                    frames={timelineFrames as any}
                    modeLabel={radarEnabled ? 'Radar loop' : 'Satellite loop'}
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

        {!animationRecordMode && showFireDetailPanel ? (
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
                    <HudBadge label={selectedWildfire.isHotspot ? 'Thermal detection' : 'Active'} strong />
                    {selectedWildfireSmokeBands.map((band) => (
                      <HudBadge key={band} label={band} />
                    ))}
                    {!selectedWildfire.isHotspot && wildfireRestrictionInEffect ? <HudBadge label="Restrictions in effect" /> : null}
                    {selectedWildfire.isHotspot && selectedWildfire.confidence != null ? (
                      <HudBadge label={`${Math.round(selectedWildfire.confidence)}% confidence`} />
                    ) : null}
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
                      <Text style={styles.fireDetailLabel}>{selectedWildfire.isHotspot ? 'Confidence' : 'Containment'}</Text>
                      <Text style={styles.fireDetailValue}>
                        {selectedWildfire.isHotspot
                          ? selectedWildfire.confidence != null
                            ? `${Math.round(selectedWildfire.confidence)}%`
                            : 'Pending'
                          : selectedWildfire.percentContained != null
                            ? `${Math.round(selectedWildfire.percentContained)}%`
                            : 'Pending'}
                      </Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>{selectedWildfire.isHotspot ? 'Fire radiative power' : 'Estimated size'}</Text>
                      <Text style={styles.fireDetailValue}>
                        {selectedWildfire.isHotspot
                          ? selectedWildfire.frp != null
                            ? `${selectedWildfire.frp.toFixed(1)} MW`
                            : 'Pending'
                          : selectedWildfire.acres != null
                            ? `${Math.round(selectedWildfire.acres).toLocaleString()} acres`
                            : 'Pending'}
                      </Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Reported by</Text>
                      <Text style={styles.fireDetailValue}>{selectedWildfire.source ?? (selectedWildfire.isHotspot ? 'NASA FIRMS' : 'NIFC / WFIGS')}</Text>
                    </View>
                    {!selectedWildfire.isHotspot ? (
                      <View style={styles.fireDetailRow}>
                        <Text style={styles.fireDetailLabel}>Fire restrictions</Text>
                        <Text style={styles.fireDetailValue}>
                          {wildfireRestrictionSummary ??
                            (wildfireRestrictionSupported ? 'No active restrictions listed' : 'Restrictions unavailable')}
                        </Text>
                      </View>
                    ) : null}
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
                    {wildfireRestrictionSupported ? <HudBadge label="Agency source" /> : <HudBadge label="Status uncertain" />}
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

        {!animationRecordMode && marineConditionsEnabled && (selectedMarineBuoy || selectedMarineZone || selectedMarineModelArea) ? (
          <View pointerEvents="box-none" style={[styles.alertDetailWrap, { bottom: 24 + insets.bottom }]}>
            <Glass style={styles.alertDetailCard}>
              <View style={styles.fireDetailHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.marineDetailEyebrow}>
                    {selectedMarineBuoy ? 'MARINE BUOY' : selectedMarineZone ? 'MARINE ZONE' : 'MODEL AREA'}
                  </Text>
                  <Text style={styles.fireDetailTitle} numberOfLines={2}>
                    {selectedMarineBuoy?.name ?? selectedMarineZone?.name ?? selectedMarineModelArea?.name ?? selectedMarineFeature?.id}
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedMarineFeature(null)} style={styles.fireDetailClose}>
                  <Text style={styles.fireDetailCloseText}>Close</Text>
                </Pressable>
              </View>

              {selectedMarineBuoy ? (
                <>
                  <View style={styles.fireDetailPills}>
                    <HudBadge label={selectedMarineBuoy.id} strong />
                    <HudBadge label="Observed buoy" />
                    {selectedMarineBuoy.waveHeightM != null ? (
                      <HudBadge label={`${Math.round(selectedMarineBuoy.waveHeightM * 3.28084)} ft waves`} />
                    ) : null}
                    {selectedMarineBuoy.windSpeedKts != null ? (
                      <HudBadge label={`${Math.round(selectedMarineBuoy.windSpeedKts)} kt wind`} />
                    ) : null}
                  </View>

                  <Text style={styles.fireDetailMeta}>{formatMarineUpdated(selectedMarineBuoy.updatedAt)}</Text>

                  <View style={styles.fireDetailRows}>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Wind / gust</Text>
                      <Text style={styles.fireDetailValue}>
                        {selectedMarineBuoy.windSpeedKts != null
                          ? `${Math.round(selectedMarineBuoy.windSpeedKts)} kt${
                              selectedMarineBuoy.windGustKts != null ? ` / ${Math.round(selectedMarineBuoy.windGustKts)} kt` : ''
                            }`
                          : 'Unavailable'}
                      </Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Water temp</Text>
                      <Text style={styles.fireDetailValue}>
                        {formatMarineWaterTemp(selectedMarineBuoy.waterTempC, tempUnit)}
                      </Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Position</Text>
                      <Text style={styles.fireDetailValue}>
                        {selectedMarineBuoy.lat.toFixed(2)}, {selectedMarineBuoy.lon.toFixed(2)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.marineDetailActionRow}>
                    <Pressable
                      style={[styles.fireDetailClose, styles.marineDetailPrimary]}
                      onPress={() =>
                        router.push({
                          pathname: '/buoy/[buoyId]',
                          params: {
                            buoyId: selectedMarineBuoy.id,
                            name: selectedMarineBuoy.name ?? selectedMarineBuoy.id,
                          },
                        } as any)
                      }
                    >
                      <Text style={styles.fireDetailCloseText}>Open buoy</Text>
                    </Pressable>
                  </View>
                </>
              ) : selectedMarineModelArea ? (
                <>
                  <View style={styles.fireDetailPills}>
                    <HudBadge label={selectedMarineModelArea.id} strong />
                    <HudBadge label="Model coverage" />
                    <HudBadge label={selectedMarineModelArea.ocean} />
                  </View>

                  <Text style={styles.fireDetailMeta}>
                    Open-Meteo Marine model area for waves, SST, currents, sea-level signal, and global wind fallback.
                  </Text>

                  <View style={styles.fireDetailRows}>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Region</Text>
                      <Text style={styles.fireDetailValue}>{selectedMarineModelArea.region}</Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Coverage</Text>
                      <Text style={styles.fireDetailValue}>{selectedMarineModelArea.kind}</Text>
                    </View>
                  </View>

                  <View style={styles.marineDetailActionRow}>
                    <Pressable
                      style={[styles.fireDetailClose, styles.marineDetailPrimary]}
                      onPress={() =>
                        router.push({
                          pathname: '/(tabs)/nautical',
                          params: {
                            areaId: selectedMarineModelArea.id,
                          },
                        } as any)
                      }
                    >
                      <Text style={styles.fireDetailCloseText}>Open Nautical</Text>
                    </Pressable>
                  </View>
                </>
              ) : selectedMarineZone ? (
                <>
                  <View style={styles.fireDetailPills}>
                    <HudBadge label={selectedMarineZone.id} strong />
                    {selectedMarineZone.wfo ? <HudBadge label={`WFO ${selectedMarineZone.wfo}`} /> : null}
                    <HudBadge label="Official zone" />
                  </View>

                  <Text style={styles.fireDetailMeta}>
                    Official NOAA marine zone polygon. Tap Forecast for the official bulletin where available.
                  </Text>

                  <View style={styles.fireDetailRows}>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Zone</Text>
                      <Text style={styles.fireDetailValue}>{selectedMarineZone.id}</Text>
                    </View>
                    <View style={styles.fireDetailRow}>
                      <Text style={styles.fireDetailLabel}>Office</Text>
                      <Text style={styles.fireDetailValue}>{selectedMarineZone.wfo ?? 'Marine office'}</Text>
                    </View>
                  </View>

                  <View style={styles.marineDetailActionRow}>
                    <Pressable
                      style={[styles.fireDetailClose, styles.marineDetailPrimary]}
                      onPress={() =>
                        router.push({
                          pathname: '/nautical/zone/[zoneId]',
                          params: {
                            zoneId: selectedMarineZone.id,
                            name: selectedMarineZone.name,
                            wfo: selectedMarineZone.wfo ?? '',
                          },
                        } as any)
                      }
                    >
                      <Text style={styles.fireDetailCloseText}>Forecast</Text>
                    </Pressable>
                  </View>
                </>
              ) : null}
            </Glass>
          </View>
        ) : null}

        {!animationRecordMode && selectedWeatherAlert ? (
          <View pointerEvents="box-none" style={[styles.alertDetailWrap, { bottom: 24 + insets.bottom }]}>
            <Glass style={styles.alertDetailCard}>
              <View style={styles.fireDetailHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.alertDetailEyebrow}>
                    {selectedWeatherAlert.derived ? 'MODEL-DERIVED OUTLOOK' : 'WEATHER ALERT'}
                  </Text>
                  <Text style={styles.fireDetailTitle} numberOfLines={2}>
                    {selectedWeatherAlert.event}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setSelectedWeatherAlert(null);
                    setSelectedWeatherAlertForecastTarget(null);
                  }}
                  style={styles.fireDetailClose}
                >
                  <Text style={styles.fireDetailCloseText}>Close</Text>
                </Pressable>
              </View>

              <View style={styles.fireDetailPills}>
                {selectedWeatherAlert.severity ? <HudBadge label={selectedWeatherAlert.severity} strong /> : null}
                {selectedWeatherAlert.urgency ? <HudBadge label={selectedWeatherAlert.urgency} /> : null}
                {selectedWeatherAlert.certainty ? <HudBadge label={selectedWeatherAlert.certainty} /> : null}
                {selectedWeatherAlert.derived ? <HudBadge label="Model-derived" /> : <HudBadge label="Official" />}
              </View>

              {selectedWeatherAlert.headline ? (
                <Text style={styles.fireDetailMeta}>{selectedWeatherAlert.headline}</Text>
              ) : null}

              <View style={styles.fireDetailRows}>
                <View style={styles.fireDetailRow}>
                  <Text style={styles.fireDetailLabel}>Area</Text>
                  <Text style={styles.fireDetailValue} numberOfLines={2}>
                    {selectedWeatherAlert.areaDesc ?? 'Area pending'}
                  </Text>
                </View>
                <View style={styles.fireDetailRow}>
                  <Text style={styles.fireDetailLabel}>Effective</Text>
                  <Text style={styles.fireDetailValue}>{formatAlertDate(selectedWeatherAlert.effective)}</Text>
                </View>
                <View style={styles.fireDetailRow}>
                  <Text style={styles.fireDetailLabel}>Ends</Text>
                  <Text style={styles.fireDetailValue}>
                    {formatAlertDate(selectedWeatherAlert.ends ?? selectedWeatherAlert.expires)}
                  </Text>
                </View>
                <View style={styles.fireDetailRow}>
                  <Text style={styles.fireDetailLabel}>Source</Text>
                  <Text style={styles.fireDetailValue} numberOfLines={1}>
                    {selectedWeatherAlert.sourceLabel}
                  </Text>
                </View>
              </View>

              {selectedWeatherAlert.instruction ? (
                <Text style={styles.alertInstruction} numberOfLines={4}>
                  {selectedWeatherAlert.instruction}
                </Text>
              ) : selectedWeatherAlert.description ? (
                <Text style={styles.alertInstruction} numberOfLines={4}>
                  {selectedWeatherAlert.description}
                </Text>
              ) : null}

              {selectedWeatherAlertForecastTarget ? (
                <View style={styles.marineDetailActionRow}>
                  <Pressable
                    style={[styles.fireDetailClose, styles.marineDetailPrimary]}
                    onPress={openSelectedAlertForecast}
                  >
                    <Text style={styles.fireDetailCloseText}>
                      {selectedWeatherAlertForecastTarget.kind === 'marine' ? 'Marine forecast' : 'Forecast'}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </Glass>
          </View>
        ) : null}

        {!animationRecordMode ? (
          <LayerSheetModal
          visible={layersSheetOpen}
          onClose={() => setLayersSheetOpen(false)}
          state={state}
          nerdy={state.nerdy}
          allowedGroups={['weather', 'fireAir', 'marine']}
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
            router.push({
              pathname: '/astro-map',
              params: {
                from: 'maps-layer-sheet',
                nav: String(Date.now()),
              },
            } as any);
          }}
          onOpenNauticalMap={() => {
            setLayersSheetOpen(false);
            dispatch({ type: 'SET_VIEW', viewId: 'mariner' });
          }}
          onOpenAviationMap={() => {
            setLayersSheetOpen(false);
            dispatch({ type: 'SET_VIEW', viewId: 'aviation' });
          }}
          />
        ) : null}

        {!animationRecordMode ? (
          <LearnMoreModal visible={learnOpen} onClose={() => setLearnOpen(false)} initialTopicId={learnTopicId} />
        ) : null}
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

function getGeometryCenter(geometry: any): { lat: number; lon: number } | null {
  const bbox = geometryBbox(geometry);
  if (!bbox) return null;
  return {
    lat: (bbox.minLat + bbox.maxLat) / 2,
    lon: (bbox.minLon + bbox.maxLon) / 2,
  };
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

function marineBuoyHitRadiusMiles(zoom: number) {
  if (zoom >= 10) return 1.5;
  if (zoom >= 8) return 3;
  if (zoom >= 6) return 7;
  return 14;
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
  const isHotspot = props.isHotspot === true;

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
        props.FireDiscoveryDateTime ??
        props.updatedAt
    ),
    source: firstString(props.attr_Source, props.Source, props.poly_Source, props.source) ?? (isHotspot ? 'NASA FIRMS' : 'NIFC / WFIGS'),
    county: firstString(props.attr_POOCounty, props.POOCounty, props.County),
    state: firstString(props.attr_POOState, props.POOState, props.State),
    city: firstString(props.attr_POOCity, props.POOCity, props.City),
    geometrySource: firstString(props.poly_Source, props.GeometrySource, props.Source, props.geometrySource) ?? (isHotspot ? 'Thermal detection feed' : 'Current incident feed'),
    latitude: attrLat ?? pointLat ?? fallbackLat ?? (bbox ? (bbox.minLat + bbox.maxLat) / 2 : null),
    longitude: attrLon ?? pointLon ?? fallbackLon ?? (bbox ? (bbox.minLon + bbox.maxLon) / 2 : null),
    isHotspot,
    confidence: firstNumber(props.confidence),
    frp: firstNumber(props.frp),
  };
}

function normalizedFireNameKey(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(co rd|county rd|cr)\b/g, 'county road')
    .replace(/\b(rd|rd\.)\b/g, 'road')
    .replace(/\b(hwy|hwy\.)\b/g, 'highway')
    .replace(/\b(mt|mt\.)\b/g, 'mount')
    .replace(/\b(st|st\.)\b/g, 'street')
    .replace(/\b(fire|wildfire|incident)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

function buildWildfireSymbolFeatureCollection(perimeters: any, incidents?: any) {
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
  (Array.isArray(incidents?.features) ? incidents.features : []).forEach((feature: any, idx: number) =>
    addPoint(feature, `incident-${idx}`)
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

function formatAlertDate(value?: string | null) {
  if (!value) return 'Pending';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Pending';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatFrameAge(value?: string | null) {
  if (!value) return 'latest';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'latest';
  const diffMin = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (diffMin <= 1) return 'now';
  if (diffMin < 60) return `${diffMin}m old`;
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return mins ? `${hours}h ${mins}m old` : `${hours}h old`;
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

function AstroMetric(props: { label: string; value: string }) {
  return (
    <View style={styles.astroMetric}>
      <Text style={styles.astroMetricLabel}>{props.label}</Text>
      <Text style={styles.astroMetricValue} numberOfLines={1}>
        {props.value}
      </Text>
    </View>
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
  stationProductBadgeWrap: {
    position: 'absolute',
    right: 74,
    top: 86,
    alignItems: 'flex-end',
  },
  stationProductBadge: {
    minWidth: 118,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  stationProductBadgeReflectivity: {
    borderColor: 'rgba(34,197,94,0.42)',
    backgroundColor: 'rgba(20,83,45,0.52)',
  },
  stationProductBadgeVelocity: {
    borderColor: 'rgba(96,165,250,0.46)',
    backgroundColor: 'rgba(30,58,138,0.54)',
  },
  stationProductBadgeEcho: {
    borderColor: 'rgba(250,204,21,0.54)',
    backgroundColor: 'rgba(113,63,18,0.58)',
  },
  stationProductBadgeKicker: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  stationProductBadgeTitle: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 1,
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
      zIndex: 20,
      elevation: 20,
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
  astroLegendWrap: {
    position: 'absolute',
    left: 12,
    right: 84,
    zIndex: 24,
    elevation: 24,
    alignItems: 'flex-start',
  },
  astroLegendCard: {
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  astroLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  astroLegendEdge: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 9,
    fontWeight: '900',
  },
  astroLegendBest: {
    color: 'rgba(187,247,208,0.92)',
    fontSize: 9,
    fontWeight: '900',
  },
  astroLegendSwatches: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  astroLegendSwatch: {
    width: 24,
    height: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  astroDrawerWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 26,
    elevation: 26,
  },
  astroDrawerCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 24,
  },
  astroDrawerHandle: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  astroDrawerHandleBar: {
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  astroDrawerHandleText: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  astroDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  astroDrawerTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 22,
  },
  astroDrawerSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '800',
    marginTop: 3,
    lineHeight: 18,
  },
  astroScorePill: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(167,243,208,0.20)',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  astroScorePillText: {
    color: '#d1fae5',
    fontWeight: '900',
    fontSize: 12,
  },
  astroDrawerSummary: {
    color: 'rgba(255,255,255,0.74)',
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 10,
  },
  astroControlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  astroDrawerBody: {
    marginTop: 12,
    gap: 10,
  },
  astroForecastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  astroForecastLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '900',
  },
  astroForecastRange: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '800',
  },
  astroStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  astroStepButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  astroStepText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
  },
  astroStepTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  astroStepFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(52,211,153,0.72)',
  },
  astroMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  astroMetric: {
    flexGrow: 1,
    minWidth: 118,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  astroMetricLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '800',
  },
  astroMetricValue: {
    marginTop: 3,
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
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
  wildfireLegendCard: {
    width: 304,
  },
  wildfireLegendHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  wildfireLegendInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 5,
  },
  wildfireLegendDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  wildfireLegendNote: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  wildfireLegendExpandedBody: {
    gap: 7,
  },
  wildfireSizeScale: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 6,
  },
  wildfireSizeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  wildfireDotUnknown: {
    width: 9,
    height: 9,
  },
  wildfireDotSmall: {
    width: 10,
    height: 10,
  },
  wildfireDotMedium: {
    width: 11,
    height: 11,
  },
  wildfireDotLarge: {
    width: 12,
    height: 12,
  },
  wildfireDotHuge: {
    width: 13,
    height: 13,
  },
  legendCollapseButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  legendCollapseText: {
    color: 'white',
    fontSize: 15,
    lineHeight: 17,
    fontWeight: '900',
  },
  stationLegendCard: {
    width: 318,
  },
  stationLegendCardCollapsed: {
    width: 230,
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
  radarModeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  radarModeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  panelIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  panelIconButtonText: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
  },
  stationCollapsedPanel: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stationCollapsedEyebrow: {
    color: 'rgba(125,211,252,0.86)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  stationCollapsedTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  stationCollapsedMeta: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 9,
    fontWeight: '800',
    marginTop: 2,
  },
  stationPanel: {
    gap: 8,
    marginTop: 4,
  },
  stationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  stationEyebrow: {
    color: 'rgba(125,211,252,0.86)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  stationTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  stationMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 13,
  },
  agePill: {
    maxWidth: 104,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.22)',
    backgroundColor: 'rgba(8,47,73,0.55)',
  },
  agePillText: {
    color: 'rgba(224,242,254,0.95)',
    fontSize: 8,
    fontWeight: '900',
    textAlign: 'center',
  },
  stationPickerContent: {
    gap: 6,
    paddingRight: 4,
  },
  stationChip: {
    width: 58,
    paddingVertical: 6,
    paddingHorizontal: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  stationChipActive: {
    borderColor: 'rgba(125,211,252,0.34)',
    backgroundColor: 'rgba(14,165,233,0.18)',
  },
  autoStationChip: {
    width: 66,
  },
  stationChipId: {
    color: 'rgba(255,255,255,0.96)',
    fontSize: 10,
    fontWeight: '900',
  },
  stationChipDistance: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 1,
  },
  stationProductGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  stationProductButton: {
    width: '48%',
    minHeight: 42,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  stationProductButtonActive: {
    borderColor: 'rgba(125,211,252,0.34)',
    backgroundColor: 'rgba(96,165,250,0.16)',
  },
  stationProductButtonVelocityActive: {
    borderColor: 'rgba(96,165,250,0.50)',
    backgroundColor: 'rgba(37,99,235,0.20)',
  },
  stationProductButtonEchoActive: {
    borderColor: 'rgba(250,204,21,0.54)',
    backgroundColor: 'rgba(180,83,9,0.22)',
  },
  stationProductButtonLoading: {
    borderColor: 'rgba(45,212,191,0.48)',
    backgroundColor: 'rgba(20,184,166,0.18)',
  },
  stationProductButtonDisabled: {
    opacity: 0.45,
  },
  stationProductLabel: {
    color: 'rgba(255,255,255,0.94)',
    fontSize: 9,
    fontWeight: '900',
  },
  stationProductSub: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 8,
    fontWeight: '800',
    marginTop: 2,
  },
  wxLearnButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,181,253,0.24)',
    backgroundColor: 'rgba(88,28,135,0.22)',
  },
  wxLearnButtonText: {
    color: 'rgba(237,233,254,0.95)',
    fontSize: 9,
    fontWeight: '900',
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
  animationControlStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 7,
  },
  animationControlSpacer: {
    flex: 1,
  },
  recordModeButton: {
    minHeight: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.54)',
    backgroundColor: 'rgba(127,29,29,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  recordModeButtonDisabled: {
    opacity: 0.62,
  },
  recordModeButtonText: {
    color: '#fee2e2',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  recordExitWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  recordExitButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,250,252,0.24)',
    backgroundColor: 'rgba(2,6,23,0.72)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  recordExitText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  recordExportHint: {
    marginTop: 6,
    color: 'rgba(226,232,240,0.78)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  satelliteLoopControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  satelliteLoopLabel: {
    color: 'rgba(226,232,240,0.74)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  satelliteLoopChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  satelliteLoopChip: {
    minWidth: 34,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    backgroundColor: 'rgba(15,23,42,0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  satelliteLoopChipActive: {
    borderColor: 'rgba(125,211,252,0.64)',
    backgroundColor: 'rgba(14,116,144,0.46)',
  },
  satelliteLoopChipText: {
    color: 'rgba(226,232,240,0.76)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  satelliteLoopChipTextActive: {
    color: '#ffffff',
  },
  satelliteLoopMeta: {
    marginLeft: 'auto',
    color: 'rgba(191,219,254,0.68)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  satelliteLoadPanel: {
    marginHorizontal: 4,
    marginBottom: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.18)',
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  satelliteLoadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  satelliteLoadTitle: {
    flex: 1,
    color: 'rgba(241,245,249,0.92)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  satelliteLoadPct: {
    color: 'rgba(125,211,252,0.88)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  satelliteLoadTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(148,163,184,0.18)',
    marginTop: 7,
  },
  satelliteLoadFill: {
    height: '100%',
    minWidth: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(34,211,238,0.78)',
  },
  satelliteLoadDetail: {
    marginTop: 6,
    color: 'rgba(203,213,225,0.74)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 12,
  },
  fireDetailWrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  alertDetailWrap: {
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
  alertDetailCard: {
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: 'rgba(2,6,23,0.96)',
    borderColor: 'rgba(248,250,252,0.20)',
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
  alertDetailEyebrow: {
    color: 'rgba(251,191,36,0.92)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  marineDetailEyebrow: {
    color: 'rgba(125,211,252,0.92)',
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
  marineDetailActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  marineDetailPrimary: {
    backgroundColor: 'rgba(14,165,233,0.22)',
    borderColor: 'rgba(125,211,252,0.36)',
  },
  alertInstruction: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
    marginTop: 12,
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
