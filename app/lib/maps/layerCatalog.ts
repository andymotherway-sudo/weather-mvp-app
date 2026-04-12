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
    id: 'sat.clouds',
    group: 'weather',
    title: 'Clouds',
    subtitle: 'Visible',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 60,
    source: {
      name: 'IEM GOES-East',
      details: 'Legacy CONUS visible satellite layer using GOES ABI Band 2 (conus_ch02)',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesEast.geocolor',
    group: 'weather',
    title: 'GOES East',
    subtitle: 'Visible',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.92,
    zIndex: 62,
    source: {
      name: 'GOES-East',
      details: 'CONUS visible imagery using ABI Band 2 (conus_ch02). This is visible imagery, not true GeoColor.',
    },
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesWest.geocolor',
    group: 'weather',
    title: 'GOES West',
    subtitle: 'Visible',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.92,
    zIndex: 62,
    source: {
      name: 'GOES-West',
      details: 'CONUS visible imagery using ABI Band 2 (conus_ch02). This is visible imagery, not true GeoColor.',
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
    title: 'GOES East',
    subtitle: 'Infrared',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 63,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'GOES-East',
      details: 'CONUS infrared imagery using ABI Band 13 (conus_ch13) for day/night cloud-top structure.',
    },
    supportsLegend: true,
    supportsOpacity: true,
    supportsSourceInfo: true,
  },

  {
    id: 'sat.goesWest.ir',
    group: 'weather',
    title: 'GOES West',
    subtitle: 'Infrared',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.94,
    zIndex: 63,
    legendKey: 'satelliteInfrared',
    source: {
      name: 'GOES-West',
      details: 'CONUS infrared imagery using ABI Band 13 (conus_ch13) for Pacific systems and western U.S. cloud-top structure.',
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
      name: 'NWS',
      details: 'Active alert polygons',
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
      name: 'Provider TBD',
      details: 'Smoke overlay feed',
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
      name: 'Provider TBD',
      details: 'Wildfire perimeter feed',
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
    id: 'astro.skyScore',
    group: 'astronomy',
    title: 'Sky Score',
    subtitle: 'Observing conditions',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 70,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'Omni Wx',
      details: 'Computed from clouds, moonlight, and sky conditions',
    },
  },

  {
    id: 'space.aurora.prob',
    group: 'astronomy',
    title: 'Aurora',
    subtitle: 'Visibility probability',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.75,
    zIndex: 95,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'NOAA SWPC',
      details: 'OVATION probability grid',
    },
  },

  {
    id: 'space.aurora.oval',
    group: 'astronomy',
    title: 'Aurora Oval',
    subtitle: 'Boundary contour',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 110,
    supportsLegend: false,
    supportsOpacity: true,
    supportsSourceInfo: true,
    source: {
      name: 'NOAA SWPC',
      details: 'Derived contour from OVATION probabilities',
    },
  },
] as const satisfies readonly LayerCatalogItem[];

export const LAYER_CATALOG_BY_ID: Record<LayerId, LayerCatalogItem> = Object.fromEntries(
  LAYER_CATALOG.map((x) => [x.id, x]),
) as Record<LayerId, LayerCatalogItem>;
