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
    subtitle: 'Regional U.S. WPC Day 1',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.96,
    zIndex: 108,
    source: {
      name: 'NOAA WPC',
      details: 'Regional U.S./nearby waters frontal analysis from the Weather Prediction Center. This layer is not global.',
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
    subtitle: 'Regional U.S. WPC Day 2',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.92,
    zIndex: 107,
    source: {
      name: 'NOAA WPC',
      details: 'Regional U.S./nearby waters frontal analysis from the Weather Prediction Center. This layer is not global.',
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
    subtitle: 'Regional U.S. WPC Day 3',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.88,
    zIndex: 106,
    source: {
      name: 'NOAA WPC',
      details: 'Regional U.S./nearby waters frontal analysis from the Weather Prediction Center. This layer is not global.',
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
    subtitle: 'Americas GOES East + West visible',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 60,
    source: {
      name: 'IEM GOES-East / GOES-West',
      details: 'GOES East and West visible imagery covering the Americas and adjacent oceans, not the full globe.',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goes.truecolor',
    group: 'weather',
    title: 'GOES True Color',
    subtitle: 'Americas animated GeoColor archive',
    visibility: 'both',
    timestampMode: 'radar_timeline',
    defaultOpacity: 0.96,
    zIndex: 62,
    source: {
      name: 'NOAA NESDIS',
      details:
        'Merged GOES East and West GeoColor 24-hour rolling archive for the Americas and adjacent oceans. This is not a full-globe satellite layer.',
      url: 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/MERGEDGC_Last_24hr/ImageServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesEast.ir',
    group: 'weather',
    title: 'Infrared',
    subtitle: 'Americas GOES East + West',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 63,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'NOAA NESDIS',
      details:
        'Time-enabled GOES ABI Band 13 infrared archive for the Americas and adjacent oceans. Frames are selected from the 24-hour rolling raster catalog for smoother loops and exports.',
      url: 'https://satellitemaps.nesdis.noaa.gov/arcgis/rest/services/ABI13_Last_24hr/ImageServer',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesEast.wv',
    group: 'weather',
    title: 'GOES East',
    subtitle: 'Regional water vapor',
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
    subtitle: 'Regional water vapor',
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
    id: 'sat.global.truecolor',
    group: 'weather',
    title: 'Global True Color',
    subtitle: 'Daily VIIRS world mosaic',
    visibility: 'both',
    timestampMode: 'daily_snapshot',
    defaultOpacity: 0.82,
    zIndex: 58,
    source: {
      name: 'NASA GIBS',
      details:
        'Global daily VIIRS Suomi NPP corrected reflectance true-color imagery. Useful outside GOES coverage, but not a minute-by-minute live loop.',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.global.cloudtops',
    group: 'weather',
    title: 'Global Cloud Tops',
    subtitle: 'Daily MODIS cloud temperature',
    visibility: 'both',
    timestampMode: 'daily_snapshot',
    defaultOpacity: 0.72,
    zIndex: 66,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'NASA GIBS',
      details:
        'Global MODIS Aqua cloud-top temperature tiles. This helps show colder, higher clouds worldwide where regional GOES products are not available.',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.global.infrared',
    group: 'weather',
    title: 'Global Infrared',
    subtitle: 'Nighttime MODIS brightness temp',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 67,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'NASA GIBS',
      details:
        'Global MODIS Aqua Band 31 nighttime brightness temperature. It is a broad daily global infrared reference, not a geostationary live loop.',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.global.precip',
    group: 'weather',
    title: 'Global Precip',
    subtitle: 'IMERG satellite rain estimate',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.78,
    zIndex: 102,
    source: {
      name: 'NASA GIBS / GPM IMERG',
      details:
        'Global satellite precipitation-rate estimate. Use this as world coverage where ground radar networks are sparse or unavailable.',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'alerts.polygons',
    group: 'weather',
    title: 'Alerts',
    subtitle: 'Official where available + model outlooks',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.95,
    zIndex: 130,
    source: {
      name: 'OMNIwx Alerts',
      details: 'Official NWS polygons in weather.gov coverage areas. Outside those areas, OMNIwx shows point-based model-derived outlooks from the global worker when risk criteria are met.',
      url: 'https://omniwx-api.omniwx.workers.dev/api/alerts/global',
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
    subtitle: 'Regional U.S. administrative status',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.48,
    zIndex: 88,
    source: {
      name: 'US Forest Service',
      details:
        'Regional U.S. fire restriction status by nearby administrative unit. Outside supported U.S. agency areas this layer may be empty.',
    },
    supportsOpacity: true,
    supportsLegend: false,
    supportsSourceInfo: true,
  },

  {
    id: 'wildfire.smoke',
    group: 'fireAir',
    title: 'Smoke',
    subtitle: 'NOAA HMS regional smoke extent',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.55,
    zIndex: 80,
    legendKey: 'smoke',
    source: {
      name: 'NOAA HMS',
      details: 'NOAA Hazard Mapping System analyst-drawn smoke polygons, primarily for North America and adjacent regions.',
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
    subtitle: 'Regional U.S. incident boundaries',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 85,
    legendKey: 'perimeters',
    source: {
      name: 'NIFC / WFIGS',
      details: 'Regional U.S. interagency wildfire perimeters with active incident point markers sourced from WFIGS and USA Wildfires current incidents.',
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
      name: 'NASA FIRMS',
      details: 'Global VIIRS near-real-time thermal hotspot detections served through the OMNIwx worker when a FIRMS map key is configured.',
      url: 'https://firms.modaps.eosdis.nasa.gov/api/area/',
    },
    supportsOpacity: true,
    supportsLegend: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wildfire.firewx',
    group: 'fireAir',
    title: 'Fire Weather',
    subtitle: 'Regional U.S. SPC Outlook',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.76,
    zIndex: 87,
    legendKey: 'fireWeather',
    source: {
      name: 'NOAA SPC',
      details:
        'Regional U.S. Storm Prediction Center fire weather outlook highlighting elevated, critical, and extreme fire weather risk areas.',
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
    subtitle: 'U.S.-focused aviation hazards',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 118,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'U.S.-focused experimental G-AIRMET polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.gairmet.ice',
    group: 'aviation',
    title: 'Icing',
    subtitle: 'U.S.-focused aviation hazards',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 117,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'U.S.-focused experimental G-AIRMET polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.sigmet',
    group: 'aviation',
    title: 'SIGMETs',
    subtitle: 'Source-dependent aviation hazards',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.82,
    zIndex: 122,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'Aviation Weather Center SIGMET and Convective SIGMET polygons. Coverage is source-dependent and may be strongest for U.S.-issued products.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'aviation.cwa',
    group: 'aviation',
    title: 'CWAs',
    subtitle: 'U.S.-focused aviation advisories',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.78,
    zIndex: 121,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Aviation Weather Center',
      details: 'U.S.-focused Center Weather Advisory polygons filtered by selected valid time, hazard, altitude band, and severity where provided.',
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
      details: 'Pilot reports for in-flight conditions such as turbulence and icing. Coverage depends on reported aircraft observations and source availability.',
      url: 'https://aviationweather.gov/data/api',
    },
  },

  {
    id: 'marine.conditions',
    group: 'marine',
    title: 'Marine Conditions',
    subtitle: 'Official zones/buoys + global model context',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 118,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'NOAA / NDBC + Open-Meteo Marine',
      details: 'NOAA/NDBC zones and buoy observations where available, with Open-Meteo Marine model conditions used for broader global ocean context.',
    },
  },

] as const satisfies readonly LayerCatalogItem[];

export const LAYER_CATALOG_BY_ID: Record<LayerId, LayerCatalogItem> = Object.fromEntries(
  LAYER_CATALOG.map((x) => [x.id, x]),
) as Record<LayerId, LayerCatalogItem>;
