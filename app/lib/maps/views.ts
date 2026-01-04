// app/lib/maps/views.ts
import type { MapViewDefinition } from './types';

export const MAP_VIEWS: MapViewDefinition[] = [
  // ✅ NEW: Clouds as a first-class view
  {
    id: 'clouds',
    title: 'Clouds',
    presetEnabledLayers: ['sat.clouds'],
    timelineDriverLayer: 'sat.clouds', // fine even if it doesn’t drive the radar scrubber
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
      // hotspots intentionally OFF by default
    ],
    presetLayerOpacity: {
      'radar.reflectivity': 0.85, // slight dim for contrast
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
      // alerts could be enabled here later
    ],
    timelineDriverLayer: 'radar.reflectivity',
  },
  {
    id: 'aviation',
    title: 'Aviation',
    presetEnabledLayers: [
      'radar.reflectivity',
      // add fronts/metars later
    ],
    timelineDriverLayer: 'radar.reflectivity',
  },
];
