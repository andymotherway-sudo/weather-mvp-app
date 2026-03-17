// app/lib/maps/views.ts
import type { MapViewDefinition } from './types';

export const MAP_VIEWS: MapViewDefinition[] = [
  {
    id: 'radar',
    title: 'Radar',
    presetEnabledLayers: ['radar.reflectivity'],
    presetLayerOpacity: {
      'radar.reflectivity': 0.9,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'clouds',
    title: 'Clouds',
    presetEnabledLayers: ['sat.clouds'],
    presetLayerOpacity: {
      'sat.clouds': 0.85,
    },
    timelineDriverLayer: 'sat.clouds',
  },

  {
    id: 'wildfire',
    title: 'Wildfire',
    presetEnabledLayers: ['radar.reflectivity', 'wildfire.smoke', 'wildfire.perimeters'],
    presetLayerOpacity: {
      'radar.reflectivity': 0.85,
      'wildfire.smoke': 0.55,
      'wildfire.perimeters': 0.9,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'storm',
    title: 'Storm',
    presetEnabledLayers: ['radar.reflectivity', 'lightning.strikes', 'alerts.polygons'],
    presetLayerOpacity: {
      'radar.reflectivity': 0.9,
      'lightning.strikes': 0.95,
      'alerts.polygons': 0.95,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'aviation',
    title: 'Aviation',
    presetEnabledLayers: ['radar.reflectivity'],
    presetLayerOpacity: {
      'radar.reflectivity': 0.88,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'mariner',
    title: 'Marine',
    presetEnabledLayers: [],
  },

  {
    id: 'astronomer',
    title: 'Astronomy',
    presetEnabledLayers: ['astro.skyScore'],
    presetLayerOpacity: {
      'astro.skyScore': 0.85,
    },
  },
];