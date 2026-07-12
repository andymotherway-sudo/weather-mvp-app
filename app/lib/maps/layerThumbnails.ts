import type { ImageSourcePropType } from 'react-native';

import type { LayerId } from './types';

export const LAYER_THUMBNAIL_SIZE = {
  width: 58,
  height: 46,
  radius: 14,
  assetWidth: 174,
  assetHeight: 138,
} as const;

// Static map from layer IDs to drop-in thumbnail PNGs. Replacement assets should
// stay at 174x138 px so the layer sheet can render them crisply at 58x46 dp.
export const LAYER_THUMBNAILS: Partial<Record<LayerId, ImageSourcePropType>> = {
  'alerts.polygons': require('../../../assets/map-layer-thumbnails/alerts-polygons.png'),
  'fire.restrictions': require('../../../assets/map-layer-thumbnails/fire-restrictions.png'),
  'marine.conditions': require('../../../assets/map-layer-thumbnails/marine-conditions.png'),
  'radar.reflectivity': require('../../../assets/map-layer-thumbnails/radar-reflectivity.png'),
  'sat.clouds': require('../../../assets/map-layer-thumbnails/sat-goes-visible.png'),
  'sat.global.precip': require('../../../assets/map-layer-thumbnails/sat-goes-visible.png'),
  'sat.global.truecolor': require('../../../assets/map-layer-thumbnails/sat-global-truecolor.png'),
  'sat.goes.truecolor': require('../../../assets/map-layer-thumbnails/sat-goes-truecolor.png'),
  'sat.goesEast.geocolor': require('../../../assets/map-layer-thumbnails/sat-goes-truecolor.png'),
  'sat.goesEast.ir': require('../../../assets/map-layer-thumbnails/sat-goes-infrared.png'),
  'sat.goesEast.wv': require('../../../assets/map-layer-thumbnails/sat-goes-infrared.png'),
  'sat.goesWest.geocolor': require('../../../assets/map-layer-thumbnails/sat-goes-truecolor.png'),
  'sat.goesWest.ir': require('../../../assets/map-layer-thumbnails/sat-goes-infrared.png'),
  'sat.goesWest.wv': require('../../../assets/map-layer-thumbnails/sat-goes-infrared.png'),
  'water.stations': require('../../../assets/map-layer-thumbnails/water-stations.png'),
  'wildfire.hotspots': require('../../../assets/map-layer-thumbnails/wildfire-perimeters.png'),
  'wildfire.perimeters': require('../../../assets/map-layer-thumbnails/wildfire-perimeters.png'),
  'wildfire.smoke': require('../../../assets/map-layer-thumbnails/wildfire-perimeters.png'),
  'wx.fronts.day1': require('../../../assets/map-layer-thumbnails/fronts-day1.png'),
  'wx.fronts.day2': require('../../../assets/map-layer-thumbnails/fronts-day1.png'),
  'wx.fronts.day3': require('../../../assets/map-layer-thumbnails/fronts-day1.png'),
  'wx.wind.particles': require('../../../assets/map-layer-thumbnails/wind-particles.png'),
};
