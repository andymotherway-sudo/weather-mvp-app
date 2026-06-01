// app/lib/maps/layerCatalog.ts
import type { LayerId, NerdyVisibility, TimestampMode } from './types';

export type LayerGroupId =
  | 'weather'
  | 'fireAir'
  | 'aviation'
  | 'marine'
  | 'astronomy'
  | 'reference';

export type LayerCatalogItem = {
  id: LayerId;
  group: LayerGroupId;
  title: string;
  subtitle?: string;
  visibility: NerdyVisibility;
  timestampMode: TimestampMode;
  defaultOpacity: number;
  zIndex: number;

  legendKey?:
    | 'reflectivity'
    | 'smoke'
    | 'perimeters'
    | 'hotspots'
    | 'wildfireHazard'
    | 'fireWeather'
    | 'lightning'
    | 'satelliteInfrared'
    | 'satelliteWaterVapor';
  source?: {
    name: string;
    details?: string;
    url?: string;
  };

  supportsOpacity?: boolean;
  supportsLegend?: boolean;
  supportsSourceInfo?: boolean;
};

export const LAYER_GROUPS: readonly { id: LayerGroupId; title: string }[] = [
  { id: 'weather', title: 'Weather' },
  { id: 'fireAir', title: 'Fire & Air' },
  { id: 'aviation', title: 'Aviation' },
  { id: 'marine', title: 'Marine' },
  { id: 'astronomy', title: 'Astronomy' },
  { id: 'reference', title: 'Reference' },
] as const;

/**
 * Single source of truth.
 * If you add a new LayerId in types.ts, add it here ONCE.
 */
export const LAYER_CATALOG = [
  {
    id: 'radar.reflectivity',
    group: 'weather',
    title: 'Radar',
    subtitle: 'Reflectivity',
    visibility: 'both',
    timestampMode: 'radar_timeline',
    defaultOpacity: 0.9,
    zIndex: 100,
    legendKey: 'reflectivity',
    source: {
      name: 'RainViewer / IEM',
      details: 'Radar mosaic with local enhancement when available',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wx.fronts.day1',
    group: 'weather',
    title: 'Fronts',
    subtitle: 'WPC Day 1',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.96,
    zIndex: 108,
    source: {
      name: 'NOAA WPC',
      details: 'National Forecast Chart WPC Day 1 fronts from the Weather Prediction Center.',
      url: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wx.fronts.day2',
    group: 'weather',
    title: 'Fronts',
    subtitle: 'WPC Day 2',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.92,
    zIndex: 107,
    source: {
      name: 'NOAA WPC',
      details: 'National Forecast Chart WPC Day 2 fronts from the Weather Prediction Center.',
      url: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wx.fronts.day3',
    group: 'weather',
    title: 'Fronts',
    subtitle: 'WPC Day 3',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.88,
    zIndex: 106,
    source: {
      name: 'NOAA WPC',
      details: 'National Forecast Chart WPC Day 3 fronts from the Weather Prediction Center.',
      url: 'https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/natl_fcst_wx_chart/MapServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.clouds',
    group: 'weather',
    title: 'Clouds',
    subtitle: 'GOES East + West visible',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 60,
    source: {
      name: 'IEM GOES-East / GOES-West',
      details: 'Combined visible imagery using GOES ABI Band 2 from both East and West sectors.',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goes.truecolor',
    group: 'weather',
    title: 'GOES True Color',
    subtitle: 'Merged GeoColor',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.96,
    zIndex: 62,
    source: {
      name: 'NOAA NESDIS',
      details: 'Merged GOES East and West GeoColor image service with the latest imagery.',
      url: 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/MERGED_GeoColor/ImageServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesEast.ir',
    group: 'weather',
    title: 'Infrared',
    subtitle: 'GOES East + West',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 63,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'GOES-East / GOES-West',
      details: 'Combined infrared imagery using ABI Band 13 from both East and West sectors for day and night cloud-top structure.',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesEast.wv',
    group: 'weather',
    title: 'GOES East',
    subtitle: 'Water Vapor',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 64,
    legendKey: 'satelliteWaterVapor',
    source: {
      name: 'GOES-East',
      details: 'CONUS water vapor imagery using ABI Band 8 (conus_ch08) to show upper-level moisture and dry air.',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesWest.wv',
    group: 'weather',
    title: 'GOES West',
    subtitle: 'Water Vapor',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 64,
    legendKey: 'satelliteWaterVapor',
    source: {
      name: 'GOES-West',
      details: 'CONUS water vapor imagery using ABI Band 8 (conus_ch08) for Pacific moisture transport, jet features, and western U.S. setup.',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'alerts.polygons',
    group: 'weather',
    title: 'Alerts',
    subtitle: 'Warnings and watches',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.95,
    zIndex: 130,
    source: {
      name: 'NOAA / NWS WWA',
      details: 'Active watch, warning, advisory, and statement polygons from the NOAA WWA map service.',
      url: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/WWA/watch_warn_adv/FeatureServer',
    },
    supportsOpacity: true,
    supportsLegend: false,
    supportsSourceInfo: true,
  },

  {
    id: 'lightning.strikes',
    group: 'weather',
    title: 'Lightning',
    subtitle: 'Recent strikes',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.95,
    zIndex: 120,
    legendKey: 'lightning',
    source: {
      name: 'Provider TBD',
      details: 'Recent lightning detections',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'fire.restrictions',
    group: 'fireAir',
    title: 'Restrictions',
    subtitle: 'Current administrative status',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.48,
    zIndex: 88,
    source: {
      name: 'US Forest Service',
      details:
        'Current fire restriction status by nearby administrative unit, resolved from active Forest Service restriction orders.',
    },
    supportsOpacity: true,
    supportsLegend: false,
    supportsSourceInfo: true,
  },

  {
    id: 'wildfire.smoke',
    group: 'fireAir',
    title: 'Smoke',
    subtitle: 'Smoke extent',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.55,
    zIndex: 80,
    legendKey: 'smoke',
    source: {
      name: 'NOAA HMS',
      details: 'NOAA Hazard Mapping System analyst-drawn smoke polygons with light, medium, and heavy density classes.',
      url: 'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/ArcGIS/rest/services/NOAA_Satellite_Smoke_Detection_%28v1%29/FeatureServer',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wildfire.perimeters',
    group: 'fireAir',
    title: 'Fire Perimeters',
    subtitle: 'Incident boundaries',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 85,
    legendKey: 'perimeters',
    source: {
      name: 'NIFC / WFIGS',
      details: 'Current interagency wildfire perimeters with active incident point markers sourced from WFIGS and USA Wildfires current incidents.',
      url: 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wildfire.hotspots',
    group: 'fireAir',
    title: 'Hotspots',
    subtitle: 'Thermal detections',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 90,
    legendKey: 'hotspots',
    source: {
      name: 'Provider TBD',
      details: 'Thermal hotspot detections',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wildfire.firewx',
    group: 'fireAir',
    title: 'Fire Weather',
    subtitle: 'SPC Outlook',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.76,
    zIndex: 87,
    legendKey: 'fireWeather',
    source: {
      name: 'NOAA SPC',
      details:
        'Storm Prediction Center fire weather outlook highlighting elevated, critical, and extreme fire weather risk areas.',
      url: 'https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'aviation.gairmet.turb',
    group: 'aviation',
    title: 'Turbulence',
    subtitle: 'Experimental aviation hazards',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 118,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'Experimental G-AIRMET polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.gairmet.ice',
    group: 'aviation',
    title: 'Icing',
    subtitle: 'Experimental aviation hazards',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 117,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'Experimental G-AIRMET polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.sigmet',
    group: 'aviation',
    title: 'SIGMETs',
    subtitle: 'Experimental aviation hazards',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.82,
    zIndex: 122,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'Experimental SIGMET and Convective SIGMET polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.cwa',
    group: 'aviation',
    title: 'CWAs',
    subtitle: 'Experimental aviation hazards',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.78,
    zIndex: 121,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'Experimental Center Weather Advisory polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.pirep',
    group: 'aviation',
    title: 'PIREPs',
    subtitle: 'Pilot reports',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 124,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'Current pilot reports for in-flight conditions such as turbulence and icing.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'marine.conditions',
    group: 'marine',
    title: 'Marine Conditions',
    subtitle: 'Zones and buoys',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 118,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'NOAA / NDBC',
      details: 'Marine forecast zones and buoy observations.',
    },
  },

] as const satisfies readonly LayerCatalogItem[];

export const LAYER_CATALOG_BY_ID: Record<LayerId, LayerCatalogItem> = Object.fromEntries(
  LAYER_CATALOG.map((x) => [x.id, x]),
) as Record<LayerId, LayerCatalogItem>;
