import { useMemo } from 'react';

import { LAYER_CATALOG_BY_ID } from './layerCatalog';
import type { LayerId, MapRuntimeState } from './types';

type ActiveLayerSummary = {
  title: string;
  subtitle?: string;
  hasActiveLayers: boolean;
  count: number;
};

function layerEnabled(state: MapRuntimeState, id: LayerId, isFocused: boolean) {
  return isFocused && !!state.layers?.[id]?.enabled;
}

function layerOpacity(state: MapRuntimeState, id: LayerId, fallback: number) {
  const value = state.layers?.[id]?.opacity;
  return Number.isFinite(value) ? value : fallback;
}

function getActiveLayerSummary(state: MapRuntimeState): ActiveLayerSummary {
  const enabledIds = Object.entries(state.layers ?? {})
    .filter(([, runtime]) => runtime?.enabled)
    .map(([id]) => id as LayerId);

  if (!enabledIds.length) {
    return {
      title: 'Layers',
      subtitle: 'No overlays enabled',
      hasActiveLayers: false,
      count: 0,
    };
  }

  const ordered = enabledIds
    .map((id) => LAYER_CATALOG_BY_ID[id])
    .filter(Boolean)
    .sort((a, b) => b.zIndex - a.zIndex);

  const primary = ordered[0];
  const extraCount = Math.max(0, ordered.length - 1);

  return {
    title: primary.title,
    subtitle: extraCount > 0 ? `${primary.subtitle ?? 'Overlay'} / +${extraCount} more` : primary.subtitle,
    hasActiveLayers: true,
    count: enabledIds.length,
  };
}

export function useMapLayerState(state: MapRuntimeState, isFocused: boolean) {
  return useMemo(() => {
    const radarEnabled = layerEnabled(state, 'radar.reflectivity', isFocused);
    const fireRestrictionsEnabled = layerEnabled(state, 'fire.restrictions', isFocused);
    const wildfireSmokeEnabled = layerEnabled(state, 'wildfire.smoke', isFocused);
    const wildfireEnabled = layerEnabled(state, 'wildfire.perimeters', isFocused);
    const wildfireHotspotsEnabled = layerEnabled(state, 'wildfire.hotspots', isFocused);
    const wildfireFireWxEnabled = layerEnabled(state, 'wildfire.firewx', isFocused);
    const alertsEnabled = layerEnabled(state, 'alerts.polygons', isFocused);
    const cloudsEnabled = layerEnabled(state, 'sat.clouds', isFocused);
    const frontsDay1Enabled = layerEnabled(state, 'wx.fronts.day1', isFocused);
    const frontsDay2Enabled = layerEnabled(state, 'wx.fronts.day2', isFocused);
    const frontsDay3Enabled = layerEnabled(state, 'wx.fronts.day3', isFocused);
    const aviationModeActive = isFocused && state.viewId === 'aviation';
    const aviationTurbEnabled = !aviationModeActive && layerEnabled(state, 'aviation.gairmet.turb', isFocused);
    const aviationIceEnabled = !aviationModeActive && layerEnabled(state, 'aviation.gairmet.ice', isFocused);
    const aviationSigmetEnabled = !aviationModeActive && layerEnabled(state, 'aviation.sigmet', isFocused);
    const aviationCwaEnabled = !aviationModeActive && layerEnabled(state, 'aviation.cwa', isFocused);
    const aviationPirepEnabled = !aviationModeActive && layerEnabled(state, 'aviation.pirep', isFocused);
    const marineConditionsEnabled =
      isFocused && (state.viewId === 'mariner' || !!state.layers?.['marine.conditions']?.enabled);
    const skyScoreEnabled = layerEnabled(state, 'astro.skyScore', isFocused);
    const auroraProbEnabled = layerEnabled(state, 'space.aurora.prob', isFocused);
    const auroraOvalEnabled = layerEnabled(state, 'space.aurora.oval', isFocused);

    const goesTrueColorEnabled = layerEnabled(state, 'sat.goes.truecolor', isFocused);
    const goesEastIrEnabled = layerEnabled(state, 'sat.goesEast.ir', isFocused);
    const goesEastWvEnabled = layerEnabled(state, 'sat.goesEast.wv', isFocused);
    const goesWestWvEnabled = layerEnabled(state, 'sat.goesWest.wv', isFocused);
    const globalTrueColorEnabled = layerEnabled(state, 'sat.global.truecolor', isFocused);
    const globalCloudTopsEnabled = layerEnabled(state, 'sat.global.cloudtops', isFocused);
    const globalInfraredEnabled = layerEnabled(state, 'sat.global.infrared', isFocused);
    const globalPrecipEnabled = layerEnabled(state, 'sat.global.precip', isFocused);

    const animatedSatelliteEnabled =
      cloudsEnabled ||
      goesTrueColorEnabled ||
      goesEastIrEnabled ||
      goesEastWvEnabled ||
      goesWestWvEnabled ||
      globalTrueColorEnabled ||
      globalCloudTopsEnabled ||
      globalInfraredEnabled ||
      globalPrecipEnabled;

    const anySatelliteEnabled =
      animatedSatelliteEnabled ||
      goesTrueColorEnabled ||
      globalTrueColorEnabled ||
      globalCloudTopsEnabled ||
      globalInfraredEnabled ||
      globalPrecipEnabled;

    const aviationOverlayEnabled =
      aviationTurbEnabled || aviationIceEnabled || aviationSigmetEnabled || aviationCwaEnabled || aviationPirepEnabled;

    return {
      activeLayerSummary: getActiveLayerSummary(state),
      radarEnabled,
      fireRestrictionsEnabled,
      wildfireSmokeEnabled,
      wildfireEnabled,
      wildfireHotspotsEnabled,
      wildfireFireWxEnabled,
      showWildfireLegend:
        wildfireEnabled || wildfireHotspotsEnabled || (state.viewId === 'wildfire' && wildfireSmokeEnabled),
      alertsEnabled,
      cloudsEnabled,
      frontsDay1Enabled,
      frontsDay2Enabled,
      frontsDay3Enabled,
      aviationModeActive,
      aviationTurbEnabled,
      aviationIceEnabled,
      aviationSigmetEnabled,
      aviationCwaEnabled,
      aviationPirepEnabled,
      aviationOverlayEnabled,
      marineConditionsEnabled,
      skyScoreEnabled,
      auroraProbEnabled,
      auroraOvalEnabled,
      goesTrueColorEnabled,
      goesEastIrEnabled,
      goesEastWvEnabled,
      goesWestWvEnabled,
      globalTrueColorEnabled,
      globalCloudTopsEnabled,
      globalInfraredEnabled,
      globalPrecipEnabled,
      animatedSatelliteEnabled,
      anySatelliteEnabled,
      cloudsOpacity: layerOpacity(state, 'sat.clouds', 0.85),
      frontsDay1Opacity: layerOpacity(state, 'wx.fronts.day1', 0.96),
      frontsDay2Opacity: layerOpacity(state, 'wx.fronts.day2', 0.92),
      frontsDay3Opacity: layerOpacity(state, 'wx.fronts.day3', 0.88),
      fireRestrictionsOpacity: layerOpacity(state, 'fire.restrictions', 0.48),
      wildfireSmokeOpacity: layerOpacity(state, 'wildfire.smoke', 0.55),
      wildfireFireWxOpacity: layerOpacity(state, 'wildfire.firewx', 0.76),
      alertsOpacity: layerOpacity(state, 'alerts.polygons', 0.95),
      goesTrueColorOpacity: layerOpacity(state, 'sat.goes.truecolor', 0.96),
      goesEastIrOpacity: layerOpacity(state, 'sat.goesEast.ir', 0.94),
      goesEastWvOpacity: layerOpacity(state, 'sat.goesEast.wv', 0.94),
      goesWestWvOpacity: layerOpacity(state, 'sat.goesWest.wv', 0.94),
      globalTrueColorOpacity: layerOpacity(state, 'sat.global.truecolor', 0.82),
      globalCloudTopsOpacity: layerOpacity(state, 'sat.global.cloudtops', 0.72),
      globalInfraredOpacity: layerOpacity(state, 'sat.global.infrared', 0.72),
      globalPrecipOpacity: layerOpacity(state, 'sat.global.precip', 0.78),
      aviationTurbOpacity: layerOpacity(state, 'aviation.gairmet.turb', 0.72),
      aviationIceOpacity: layerOpacity(state, 'aviation.gairmet.ice', 0.72),
      aviationSigmetOpacity: layerOpacity(state, 'aviation.sigmet', 0.82),
      aviationCwaOpacity: layerOpacity(state, 'aviation.cwa', 0.76),
      aviationPirepOpacity: layerOpacity(state, 'aviation.pirep', 0.9),
      marineConditionsOpacity: layerOpacity(state, 'marine.conditions', 0.9),
      skyScoreOpacity: layerOpacity(state, 'astro.skyScore', 0.85),
      auroraProbOpacity: layerOpacity(state, 'space.aurora.prob', 0.75),
      auroraOvalOpacity: layerOpacity(state, 'space.aurora.oval', 0.9),
    };
  }, [isFocused, state]);
}
