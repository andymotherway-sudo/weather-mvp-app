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
    id: 'wildfire.firewx',
    title: 'Fire Weather',
    kind: 'tile',
    visibility: 'both',
    defaultOpacity: 0.76,
    timestampMode: 'latest_snapshot',
    zIndex: 36,
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
    id: 'wpc.excessiveRain.day1',
    title: 'WPC Excessive Rain Day 1',
    kind: 'tile',
    visibility: 'both',
    defaultOpacity: 0.62,
    timestampMode: 'latest_snapshot',
    zIndex: 55,
  },
  {
    id: 'wpc.excessiveRain.day2',
    title: 'WPC Excessive Rain Day 2',
    kind: 'tile',
    visibility: 'nerdy',
    defaultOpacity: 0.58,
    timestampMode: 'latest_snapshot',
    zIndex: 54,
  },
  {
    id: 'flood.riverStages',
    title: 'NWPS River Stages',
    kind: 'tile',
    visibility: 'nerdy',
    defaultOpacity: 0.9,
    timestampMode: 'latest_snapshot',
    zIndex: 58,
  },
  {
    id: 'flood.qpe.last24h',
    title: 'RFC QPE Last 24h',
    kind: 'tile',
    visibility: 'nerdy',
    defaultOpacity: 0.5,
    timestampMode: 'latest_snapshot',
    zIndex: 53,
  },
  {
    id: 'heat.nwsHeatRisk',
    title: 'NWS HeatRisk',
    kind: 'tile',
    visibility: 'both',
    defaultOpacity: 0.56,
    timestampMode: 'latest_snapshot',
    zIndex: 54,
  },
  {
    id: 'tropics.nhcOutlook',
    title: 'NHC Development Outlook',
    kind: 'tile',
    visibility: 'both',
    defaultOpacity: 0.72,
    timestampMode: 'latest_snapshot',
    zIndex: 56,
  },
  {
    id: 'tropics.nhcTracks',
    title: 'Tropical Cyclone Cones',
    kind: 'tile',
    visibility: 'nerdy',
    defaultOpacity: 0.82,
    timestampMode: 'latest_snapshot',
    zIndex: 57,
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
