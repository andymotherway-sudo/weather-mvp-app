export type MarineLayerBudget = {
  globalAreaMinZoom: number;
  globalAreaMaxZoom: number;
  marineZoneMinZoom: number;
  maxMarineZones: number;
  waterStationMinZoom: number;
  waterStationMaxBboxArea: number;
  waterStationFetchLimit: number;
  buoyClusterMaxZoom: number;
  waterStationClusterMaxZoom: number;
};

export type AlertLayerBudget = {
  maxWwaPolygons: number;
  wwaResultRecordCount: number;
};

export function getMarineLayerBudget(zoom: number): MarineLayerBudget {
  const z = Number.isFinite(zoom) ? zoom : 4;
  return {
    globalAreaMinZoom: 2,
    globalAreaMaxZoom: 7.6,
    marineZoneMinZoom: 3.6,
    maxMarineZones: z < 6 ? 600 : z < 8 ? 1200 : 2500,
    waterStationMinZoom: 5.2,
    waterStationMaxBboxArea: 2500,
    waterStationFetchLimit: z < 7 ? 80 : 160,
    buoyClusterMaxZoom: 8,
    waterStationClusterMaxZoom: 8,
  };
}

export function getAlertLayerBudget(zoom: number): AlertLayerBudget {
  const z = Number.isFinite(zoom) ? zoom : 4;
  return {
    maxWwaPolygons: z < 5 ? 600 : z < 7 ? 1400 : 2600,
    wwaResultRecordCount: z < 5 ? 1200 : z < 7 ? 2400 : 4000,
  };
}
