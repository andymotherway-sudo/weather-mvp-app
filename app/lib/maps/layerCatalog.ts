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
    subtitle: 'Animated GeoColor archive',
    visibility: 'both',
    timestampMode: 'radar_timeline',
    defaultOpacity: 0.96,
    zIndex: 62,
    source: {
      name: 'NOAA NESDIS',
      details:
        'Merged GOES East and West GeoColor 24-hour rolling archive. The service is time-enabled and adds new imagery every 10 or 15 minutes depending on scan mode.',
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
    subtitle: 'GOES East + West',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 63,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'NOAA NESDIS',
      details:
        'Time-enabled ABI Band 13 infrared archive for day and night cloud-top structure. Frames are selected from the 24-hour rolling raster catalog for smoother loops and exports.',
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
    id: 'wpc.excessiveRain.day1',
    group: 'weather',
    title: 'Excessive Rain',
    subtitle: 'WPC Day 1',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.62,
    zIndex: 111,
    source: {
      name: 'NOAA WPC',
      details:
        'Weather Prediction Center excessive-rainfall outlook polygons for flash-flood guidance exceedance risk over the Day 1 period.',
      url: 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'wpc.excessiveRain.day2',
    group: 'weather',
    title: 'Excessive Rain',
    subtitle: 'WPC Day 2',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.58,
    zIndex: 110,
    source: {
      name: 'NOAA WPC',
      details:
        'Weather Prediction Center excessive-rainfall outlook polygons for the Day 2 planning period.',
      url: 'https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer',
    },
    supportsLegend: false,
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
        'Global daily VIIRS Suomi NPP corrected-reflectance true-color imagery. Useful outside GOES coverage, but not a minute-by-minute live loop.',
      url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.global.precip',
    group: 'weather',
    title: 'Global Precip',
    subtitle: 'IMERG satellite estimate',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 102,
    source: {
      name: 'NASA GIBS / GPM IMERG',
      details:
        'Global satellite precipitation-rate estimate. Use this for broad world coverage where ground radar networks are sparse or unavailable.',
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
    subtitle: 'Warnings and watches',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.95,
    zIndex: 130,
    source: {
      name: 'OMNIwx Alerts',
      details: 'Official alert polygons where available, with global forecast-derived hazard outlooks through the OMNIwx worker elsewhere.',
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
    subtitle: '15-min density',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.78,
    zIndex: 120,
    legendKey: 'lightning',
    source: {
      name: 'NOAA/NWS Ocean Prediction Center',
      details:
        'Official OPC lightning density is decoded by the OMNIwx worker from 15-minute GRIB2 grids into compact georeferenced cells. Use it as storm electrification context, not exact ground-strike safety guidance.',
      url: 'https://omniwx-api.omniwx.workers.dev/api/lightning/opc/geojson?window=15',
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
      name: 'USA Wildfires / WFIGS',
      details:
        'Current wildfire perimeters from USA Wildfires and WFIGS, with filtered active incident markers where a current boundary is not available.',
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

  {
    id: 'flood.riverStages',
    group: 'weather',
    title: 'River Stages',
    subtitle: 'NWPS observed + forecast',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 126,
    source: {
      name: 'NOAA NWPS',
      details:
        'National Water Prediction Service observed river stage points and full-period forecast stage context where available.',
      url: 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'flood.qpe.last24h',
    group: 'weather',
    title: 'Rainfall Estimate',
    subtitle: 'RFC QPE last 24h',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.5,
    zIndex: 103,
    source: {
      name: 'NOAA RFC / NWS',
      details:
        'River Forecast Center quantitative precipitation estimate mosaic for hydrologic context over the last 24 hours.',
      url: 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/rfc_qpe/MapServer',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'heat.nwsHeatRisk',
    group: 'weather',
    title: 'NWS HeatRisk',
    subtitle: 'Heat impact risk',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.56,
    zIndex: 104,
    source: {
      name: 'NOAA NWS / CDC',
      details:
        'Experimental NWS HeatRisk index showing potential heat-related impact risk. It supplements official watches, warnings, and advisories.',
      url: 'https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'tropics.nhcOutlook',
    group: 'weather',
    title: 'Tropical Development Outlook',
    subtitle: 'Potential formation areas',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.72,
    zIndex: 116,
    source: {
      name: 'NOAA NHC / CPHC',
      details:
        'National Hurricane Center and Central Pacific Hurricane Center graphical tropical weather outlook areas. These hatched areas mark possible development, not active-storm forecast cones.',
      url: 'https://mapservices.weather.noaa.gov/tropical/rest/services/tropical/NHC_tropical_weather/MapServer',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'tropics.nhcTracks',
    group: 'weather',
    title: 'Active Tropical Cyclones',
    subtitle: 'Cones, tracks, wind fields',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.82,
    zIndex: 117,
    source: {
      name: 'NOAA / Esri Active Hurricanes',
      details:
        'Active cyclone tracks, forecast points, wind fields, watch/warning coastlines, and forecast cones or basin-specific danger areas where available. NHC/CPHC basins use traditional forecast cones; western Pacific systems may provide tracks and danger areas instead.',
      url: 'https://www.arcgis.com/home/item.html?id=248e7b5827a34b248647afb012c58787',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'water.stations',
    group: 'marine',
    title: 'Water Temps',
    subtitle: 'USGS stations',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 119,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'USGS Water Data',
      details: 'Latest continuous USGS water temperature observations where available.',
      url: 'https://api.waterdata.usgs.gov/',
    },
  },

] as const satisfies readonly LayerCatalogItem[];

export const LAYER_CATALOG_BY_ID: Record<LayerId, LayerCatalogItem> = Object.fromEntries(
  LAYER_CATALOG.map((x) => [x.id, x]),
) as Record<LayerId, LayerCatalogItem>;
