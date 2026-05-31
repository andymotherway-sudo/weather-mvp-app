// app/lib/maps/views.ts
import type { MapViewDefinition } from './types';

export const MAP_VIEWS: MapViewDefinition[] = [
  {
    id: 'radar',
    title: 'Weather',
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
    presetEnabledLayers: [
      'fire.restrictions',
      'radar.reflectivity',
      'wildfire.smoke',
      'wildfire.perimeters',
      'wildfire.firewx',
    ],
    presetLayerOpacity: {
      'fire.restrictions': 0.48,
      'radar.reflectivity': 0.85,
      'wildfire.smoke': 0.55,
      'wildfire.perimeters': 0.9,
      'wildfire.firewx': 0.76,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'storm',
    title: 'Storm Scope',
    presetEnabledLayers: ['radar.reflectivity', 'wx.fronts.day1', 'lightning.strikes', 'alerts.polygons'],
    presetLayerOpacity: {
      'radar.reflectivity': 0.9,
      'wx.fronts.day1': 0.96,
      'lightning.strikes': 0.95,
      'alerts.polygons': 0.95,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'aviation',
    title: 'Aviation',
    presetEnabledLayers: ['aviation.gairmet.turb', 'aviation.gairmet.ice', 'aviation.sigmet', 'aviation.pirep'],
    presetLayerOpacity: {
      'radar.reflectivity': 0.88,
      'aviation.gairmet.turb': 0.72,
      'aviation.gairmet.ice': 0.72,
      'aviation.sigmet': 0.82,
    },
    timelineDriverLayer: 'radar.reflectivity',
  },

  {
    id: 'mariner',
    title: 'Nautical',
    presetEnabledLayers: ['marine.conditions'],
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
