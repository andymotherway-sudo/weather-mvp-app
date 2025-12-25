// app/lib/maps/layerCatalog.ts
import type { LayerId, NerdyVisibility, TimestampMode } from './types';

export type LayerGroupId = 'weather' | 'fire' | 'storm' | 'aviation';

export type LayerCatalogItem = {
  id: LayerId;
  group: LayerGroupId;
  title: string;
  subtitle?: string; // short “what is this”
  visibility: NerdyVisibility;
  timestampMode: TimestampMode;
  defaultOpacity: number; // 0..1
  zIndex: number;

  // “Settings” / info (optional)
  legendKey?: 'reflectivity' | 'smoke' | 'perimeters' | 'hotspots' | 'lightning';
  source?: {
    name: string;
    details?: string; // “NWS/IEM/RainViewer…” etc
    url?: string; // optional deep link later
  };

  // allow toggling these UI affordances
  supportsOpacity?: boolean; // default true
  supportsLegend?: boolean;  // default true if legendKey exists
  supportsSourceInfo?: boolean; // default true if source exists
};

export const LAYER_GROUPS: ReadonlyArray<{ id: LayerGroupId; title: string }> = [
  { id: 'weather', title: 'Weather' },
  { id: 'fire', title: 'Fire' },
  { id: 'storm', title: 'Storm' },
  { id: 'aviation', title: 'Aviation' },
] as const;

/**
 * Single source of truth.
 * If you add a new LayerId in types.ts, add it here ONCE.
 * TS will enforce correct LayerId strings.
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
    source: { name: 'RainViewer / IEM (adapter)', details: 'Radar mosaic + local when available' },
  },

  {
    id: 'wildfire.smoke',
    group: 'fire',
    title: 'Smoke',
    subtitle: 'Smoke extent',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.55,
    zIndex: 80,
    legendKey: 'smoke',
    source: { name: 'Provider TBD', details: 'Hook up to your chosen smoke feed' },
  },
  {
    id: 'wildfire.perimeters',
    group: 'fire',
    title: 'Fire perimeters',
    subtitle: 'Incident boundaries',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.85,
    zIndex: 85,
    legendKey: 'perimeters',
    source: { name: 'Provider TBD', details: 'Hook up to perimeter feed later' },
    supportsOpacity: true,
  },
  {
    id: 'wildfire.hotspots',
    group: 'fire',
    title: 'Hotspots',
    subtitle: 'Thermal detections',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.9,
    zIndex: 90,
    legendKey: 'hotspots',
    source: { name: 'Provider TBD', details: 'Hook up to hotspot feed later' },
  },

  {
    id: 'lightning.strikes',
    group: 'storm',
    title: 'Lightning',
    subtitle: 'Recent strikes',
    visibility: 'nerdy',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.95,
    zIndex: 120,
    legendKey: 'lightning',
    source: { name: 'Provider TBD', details: 'Hook up lightning later' },
    supportsOpacity: true,
  },

  {
    id: 'alerts.polygons',
    group: 'storm',
    title: 'Alerts',
    subtitle: 'Warnings / watches',
    visibility: 'both',
    timestampMode: 'latest_snapshot',
    defaultOpacity: 0.95,
    zIndex: 130,
    source: { name: 'NWS', details: 'Active alerts polygons' },
    supportsOpacity: true,
    supportsLegend: false,
  },
] as const satisfies ReadonlyArray<LayerCatalogItem>;

export const LAYER_CATALOG_BY_ID: Record<LayerId, LayerCatalogItem> = Object.fromEntries(
  LAYER_CATALOG.map((x) => [x.id, x]),
) as Record<LayerId, LayerCatalogItem>;
