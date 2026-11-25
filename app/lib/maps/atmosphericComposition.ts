import { LAYER_CATALOG_BY_ID } from './layerCatalog';

type AtmosphericCompositionInput = {
  radarEnabled: boolean;
  cloudsEnabled: boolean;
  trueColorEnabled: boolean;
  infraredEnabled: boolean;
  radarOpacity: number;
  cloudsOpacity: number;
  trueColorOpacity: number;
  infraredOpacity: number;
};

export type AtmosphericComposition = {
  radarOpacity: number;
  cloudsOpacity: number;
  trueColorOpacity: number;
  infraredOpacity: number;
};

const DEFAULT_TOLERANCE = 0.001;

function isCatalogDefault(layerId: keyof typeof LAYER_CATALOG_BY_ID, opacity: number) {
  const defaultOpacity = LAYER_CATALOG_BY_ID[layerId]?.defaultOpacity;
  return typeof defaultOpacity === 'number' && Math.abs(opacity - defaultOpacity) <= DEFAULT_TOLERANCE;
}

/**
 * Applies first-use atmospheric blend presets without replacing a person's
 * manual opacity tuning. These values are shared by map playback and export.
 */
export function resolveAtmosphericComposition(input: AtmosphericCompositionInput): AtmosphericComposition {
  const composition: AtmosphericComposition = {
    radarOpacity: input.radarOpacity,
    cloudsOpacity: input.cloudsOpacity,
    trueColorOpacity: input.trueColorOpacity,
    infraredOpacity: input.infraredOpacity,
  };

  const trueColorWithInfrared = input.trueColorEnabled && input.infraredEnabled;
  const radarWithTrueColor = input.radarEnabled && input.trueColorEnabled;
  const radarWithClouds = input.radarEnabled && input.cloudsEnabled;

  if (input.radarEnabled && isCatalogDefault('radar.reflectivity', input.radarOpacity)) {
    // Keep radar readable when satellite context is also present.
    composition.radarOpacity = radarWithTrueColor ? 0.82 : radarWithClouds ? 0.86 : input.radarOpacity;
  }

  if (input.trueColorEnabled && isCatalogDefault('sat.goes.truecolor', input.trueColorOpacity)) {
    // GeoColor remains the geographic base; infrared adds cloud-top detail.
    composition.trueColorOpacity = radarWithTrueColor ? 0.62 : trueColorWithInfrared ? 0.72 : input.trueColorOpacity;
  }

  if (input.infraredEnabled && isCatalogDefault('sat.goesEast.ir', input.infraredOpacity)) {
    composition.infraredOpacity = trueColorWithInfrared ? (radarWithTrueColor ? 0.32 : 0.38) : input.infraredOpacity;
  }

  if (input.cloudsEnabled && isCatalogDefault('sat.clouds', input.cloudsOpacity)) {
    // East and West visible images overlap across the central US. Use a
    // lighter per-source default with radar so the overlap stays legible.
    composition.cloudsOpacity = radarWithClouds ? 0.43 : input.cloudsOpacity;
  }

  return composition;
}
