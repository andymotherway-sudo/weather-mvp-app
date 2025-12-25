// app/lib/maps/registry.ts
import type { LayerDefinition, LayerId } from './types';

export const LAYERS: LayerDefinition[] = [
  {
    id: 'radar.reflectivity',
    title: 'Radar (Reflectivity)',
    kind: 'tile',
    visibility: 'both',
    defaultOpacity: 0.9,
    timestampMode: 'radar_timeline',
    zIndex: 10,
  },
  {
    id: 'wildfire.smoke',
    title: 'Smoke',
    kind: 'geojson',
    visibility: 'both',
    defaultOpacity: 0.55,
    timestampMode: 'daily_snapshot',
    zIndex: 20,
  },
  {
    id: 'wildfire.perimeters',
    title: 'Fire Perimeters',
    kind: 'geojson',
    visibility: 'both',
    defaultOpacity: 0.9,
    timestampMode: 'latest_snapshot',
    zIndex: 30,
  },
  {
    id: 'wildfire.hotspots',
    title: 'Hotspots',
    kind: 'geojson',
    visibility: 'nerdy', // keep it nerdy by default
    defaultOpacity: 0.85,
    timestampMode: 'latest_snapshot',
    zIndex: 40,
  },
  {
    id: 'lightning.strikes',
    title: 'Lightning',
    kind: 'geojson',
    visibility: 'nerdy', // can be both if you want
    defaultOpacity: 0.85,
    timestampMode: 'radar_timeline',
    zIndex: 50,
  },
  {
    id: 'alerts.polygons',
    title: 'Alerts',
    kind: 'geojson',
    visibility: 'nerdy',
    defaultOpacity: 0.6,
    timestampMode: 'latest_snapshot',
    zIndex: 60,
  },
];

export const LAYER_BY_ID: Record<LayerId, LayerDefinition> = Object.fromEntries(
  LAYERS.map((l) => [l.id, l]),
) as any;

export function layerIds(): LayerId[] {
  return LAYERS.map((l) => l.id);
}
