import React, { useMemo } from 'react';

import type { Region } from '../../../components/maps/MapRenderer';
import type { Place } from '../../context/PlaceContext';
import { NEXRAD_SITES } from './nexradSites';
import { normalizeRadarSiteId, type RadarProductId } from './radarIem';
import { buildRadarStationGeoJson, getRadarAnchor, haversineMiles, isNexradSite, nearestRadarSites } from './radarLayer';
import { resolveNearestRadar } from './resolveNearestRadar';
import { useRadarController, type AnimationQuality } from './useRadarController';
import type { MapRuntimeState } from './types';

const AUTO_NEXRAD_MIN_ZOOM = 8.6;

type UseRadarLayerArgs = {
  enabled: boolean;
  state: MapRuntimeState;
  dispatch: React.Dispatch<any>;
  radarMode: 'mosaic' | 'station';
  stationAnchor: { lat: number; lon: number } | null;
  region: Region | null;
  activePlace: Place | null;
  currentCoords: { lat: number; lon: number } | null | undefined;
  mapZoom: number;
  manualRadarSiteId3: string | null;
  stationProduct: RadarProductId;
  rawMode: boolean;
  animationQuality: AnimationQuality;
};

export function useRadarLayer(args: UseRadarLayerArgs) {
  const {
    enabled,
    state,
    dispatch,
    radarMode,
    stationAnchor,
    region,
    activePlace,
    currentCoords,
    mapZoom,
    manualRadarSiteId3,
    stationProduct,
    rawMode,
    animationQuality,
  } = args;

  const radarEnabled = enabled && !!state.layers?.['radar.reflectivity']?.enabled;
  const stormMode = (state.viewId === 'radar' && state.radarTime.stormMode === true) || state.viewId === 'storm';
  const manualStationRadarMode = state.viewId === 'radar' && radarMode === 'station';
  const radarAnchor = useMemo(
    () => {
      if (manualStationRadarMode && stationAnchor) return stationAnchor;
      if (region) return { lat: region.latitude, lon: region.longitude };
      return getRadarAnchor(activePlace, currentCoords);
    },
    [activePlace, currentCoords, manualStationRadarMode, region, stationAnchor],
  );
  const radarAnchorKey = `${radarAnchor.lat.toFixed(4)},${radarAnchor.lon.toFixed(4)}`;
  const autoNearestRadar = useMemo(
    () =>
      resolveNearestRadar(radarAnchor.lat, radarAnchor.lon, {
        filter: isNexradSite,
        maxDistanceKm: 480,
      }),
    [radarAnchor.lat, radarAnchor.lon],
  );
  const localRadarAvailable = !!autoNearestRadar?.site;
  const autoNearestRadarMode =
    radarEnabled &&
    state.viewId === 'radar' &&
    !stormMode &&
    !manualStationRadarMode &&
    localRadarAvailable &&
    mapZoom >= AUTO_NEXRAD_MIN_ZOOM;
  const stationRadarMode = (stormMode || manualStationRadarMode || autoNearestRadarMode) && localRadarAvailable;
  const showAdvancedRadarControls = (stormMode || manualStationRadarMode) && localRadarAvailable;
  const nearbyRadarSites = useMemo(
    () => nearestRadarSites(radarAnchor.lat, radarAnchor.lon, 8),
    [radarAnchor.lat, radarAnchor.lon],
  );
  const selectedRadarSite = useMemo(() => {
    const id3 = manualRadarSiteId3 ?? (autoNearestRadar?.site ? normalizeRadarSiteId(autoNearestRadar.site.id) : null);
    if (!id3) return autoNearestRadar?.site ?? null;
    return NEXRAD_SITES.find((site) => isNexradSite(site) && normalizeRadarSiteId(site.id) === id3) ?? autoNearestRadar?.site ?? null;
  }, [autoNearestRadar, manualRadarSiteId3]);
  const selectedRadarDistanceMi = useMemo(() => {
    if (!selectedRadarSite) return null;
    return haversineMiles(radarAnchor.lat, radarAnchor.lon, selectedRadarSite.lat, selectedRadarSite.lon);
  }, [radarAnchor.lat, radarAnchor.lon, selectedRadarSite]);
  const selectedRadarId3 = selectedRadarSite ? normalizeRadarSiteId(selectedRadarSite.id) : null;
  const stationRangeRings = useMemo(() => buildRadarStationGeoJson(stationRadarMode ? selectedRadarSite : null), [
    stationRadarMode,
    selectedRadarSite,
  ]);
  const product: RadarProductId = showAdvancedRadarControls
    ? stationProduct
    : stationRadarMode
      ? 'N0B'
      : 'N0Q';
  const effectiveRadarProvider = stationRadarMode || stormMode ? 'iem' : 'rainviewer';
  const centerForRadar = useMemo(() => {
    if (stationRadarMode && selectedRadarSite) return { lat: selectedRadarSite.lat, lon: selectedRadarSite.lon };
    if (region) return { lat: region.latitude, lon: region.longitude };
    return { lat: 39.5, lon: -98.35 };
  }, [region, selectedRadarSite, stationRadarMode]);

  const controller = useRadarController({
    enabled,
    state,
    dispatch,
    sheetValue: { radarProvider: effectiveRadarProvider },
    centerForRadar,
    mapZoom,
    product,
    rawMode,
    region,
    stationMode: stationRadarMode,
    radarSiteId3: selectedRadarId3,
    localMinZoom: stormMode ? 10.5 : 12,
    ridgeMinZoom: stationRadarMode ? 2 : stormMode ? 7.4 : 8.6,
    animationQuality,
  });

  return {
    radarEnabled,
    stormMode,
    manualStationRadarMode,
    radarAnchor,
    radarAnchorKey,
    autoNearestRadar,
    localRadarAvailable,
    autoNearestRadarMode,
    stationRadarMode,
    showAdvancedRadarControls,
    nearbyRadarSites,
    selectedRadarSite,
    selectedRadarDistanceMi,
    selectedRadarId3,
    stationRangeRings,
    product,
    effectiveRadarProvider,
    centerForRadar,
    controller,
  };
}
