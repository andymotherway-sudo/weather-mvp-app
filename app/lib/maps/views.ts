// app/lib/maps/views.ts
import type { MapViewDefinition } from './types';

export const MAP_VIEWS: MapViewDefinition[] = [
  {
    id: 'clouds',
    title: 'Clouds',
    presetEnabledLayers: ['sat.clouds'],
    timelineDriverLayer: 'sat.clouds',
  },

  {
    id: 'radar',
    title: 'Radar',
    presetEnabledLayers: ['radar.reflectivity'],
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'wildfire',
    title: 'Wildfire',
    presetEnabledLayers: [
      'radar.reflectivity',
      'wildfire.smoke',
      'wildfire.perimeters',
    ],
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
    presetEnabledLayers: [
      'radar.reflectivity',
      'lightning.strikes',
    ],
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'aviation',
    title: 'Aviation',
    presetEnabledLayers: ['radar.reflectivity'],
    timelineDriverLayer: 'radar.reflectivity',
  },

  // ✅ NEW: “Mariner view” (safe today; later we’ll add offshore/high-seas polygons + buoy flashes)
  {
    id: 'mariner',
    title: 'Mariner',
    presetEnabledLayers: [
      'radar.reflectivity',
      'alerts.polygons',
      // Optional: if you want clouds on by default in Mariner
      // 'sat.clouds',
    ],
    presetLayerOpacity: {
      'radar.reflectivity': 0.9,
      'alerts.polygons': 0.95,
      // 'sat.clouds': 0.7,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  // ✅ NEW: “Astronomer view” (clouds first, because it’s the #1 astro signal)
  {
    id: 'astronomer',
    title: 'Astronomer',
    presetEnabledLayers: ['sat.clouds'],
    presetLayerOpacity: {
      'sat.clouds': 0.85,
    },
    timelineDriverLayer: 'sat.clouds',
  },
];
