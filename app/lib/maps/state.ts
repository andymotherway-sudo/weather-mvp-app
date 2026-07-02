// app/lib/maps/state.ts
import { LAYER_CATALOG } from './layerCatalog';
import type { LayerId, LayerRuntimeState, MapRuntimeState, MapViewport } from './types';
import { MAP_VIEWS } from './views';

const AVIATION_LAYER_IDS: LayerId[] = [
  'aviation.gairmet.turb',
  'aviation.gairmet.ice',
  'aviation.sigmet',
  'aviation.cwa',
  'aviation.pirep',
];

const ASTRONOMY_LAYER_IDS: LayerId[] = [
  'astro.skyScore',
  'space.aurora.prob',
  'space.aurora.oval',
];

const FIRE_LAYER_IDS: LayerId[] = [
  'fire.restrictions',
  'wildfire.smoke',
  'wildfire.perimeters',
  'wildfire.hotspots',
  'wildfire.hazard',
  'wildfire.firewx',
];

const MARINE_LAYER_IDS: LayerId[] = ['marine.conditions'];

const WEATHER_RASTER_LAYER_IDS: LayerId[] = [
  'radar.reflectivity',
  'sat.clouds',
  'sat.goesEast.geocolor',
  'sat.goesWest.geocolor',
  'sat.goes.truecolor',
  'sat.goesEast.ir',
  'sat.goesWest.ir',
  'sat.goesEast.wv',
  'sat.goesWest.wv',
  'sat.global.truecolor',
  'sat.global.precip',
];

const EXCLUSIVE_DOMAIN_GROUPS: LayerId[][] = [
  FIRE_LAYER_IDS,
  AVIATION_LAYER_IDS,
  ASTRONOMY_LAYER_IDS,
  MARINE_LAYER_IDS,
];

export type MapAction =
  | { type: 'SET_VIEW'; viewId: MapRuntimeState['viewId'] }
  | { type: 'SET_NERDY'; nerdy: boolean }
  | { type: 'SET_LAYER_ENABLED'; layerId: LayerId; enabled: boolean }
  | { type: 'SET_LAYER_OPACITY'; layerId: LayerId; opacity: number }
  | { type: 'SET_VIEWPORT'; viewport: MapViewport }
  | { type: 'SET_RADAR_FRAME'; frameIndex: number }
  | { type: 'SET_RADAR_PLAYING'; playing: boolean }
  | { type: 'SET_RADAR_STORM_MODE'; stormMode: boolean };

function buildDefaultLayers(): Record<LayerId, LayerRuntimeState> {
  return Object.fromEntries(
    LAYER_CATALOG.map((l) => [
      l.id,
      { enabled: false, opacity: l.defaultOpacity } satisfies LayerRuntimeState,
    ]),
  ) as Record<LayerId, LayerRuntimeState>;
}

export function createInitialMapState(opts?: {
  viewId?: MapRuntimeState['viewId'];
  nerdy?: boolean;
  viewport?: MapViewport;
}): MapRuntimeState {
  // Keep Radar as the default initial view unless you explicitly change it.
  const viewId = opts?.viewId ?? 'radar';
  const nerdy = opts?.nerdy ?? false;

  const viewport: MapViewport =
    opts?.viewport ??
    ({
      center: { lat: 33.4152, lon: -111.8315 }, // Mesa-ish default
      zoom: 9,
    } satisfies MapViewport);

  // Start from catalog defaults (single source of truth)
  const layers = buildDefaultLayers();

  // Apply view preset enables/opacities
  const view = MAP_VIEWS.find((v) => v.id === viewId);
  if (view) {
    for (const id of view.presetEnabledLayers) {
      // Only apply if it exists in catalog (prevents runtime crashes if views lag behind catalog)
      if (layers[id]) layers[id].enabled = true;
    }

    if (view.presetLayerOpacity) {
      for (const [id, op] of Object.entries(view.presetLayerOpacity)) {
        const layerId = id as LayerId;
        if (layers[layerId] && typeof op === 'number') layers[layerId].opacity = clamp01(op);
      }
    }
  }

  return {
    viewId,
    nerdy,
    viewport,
    layers,
    radarTime: { frameIndex: 0, playing: false, stormMode: false },
  };
}

export function mapReducer(state: MapRuntimeState, action: MapAction): MapRuntimeState {
  switch (action.type) {
    case 'SET_VIEW': {
      const next = createInitialMapState({
        viewId: action.viewId,
        nerdy: state.nerdy,
        viewport: state.viewport,
      });

      // Preserve user opacity overrides across views
      for (const [layerId, layerState] of Object.entries(state.layers) as Array<
        [LayerId, LayerRuntimeState]
      >) {
        if (next.layers[layerId]) {
          next.layers[layerId].opacity = layerState.opacity;

          // OPTIONAL: if you want “Google Maps-like” behavior where user-enabled layers
          // stay enabled when switching views, uncomment the next line:
          // next.layers[layerId].enabled = layerState.enabled;
        }
      }

      // Preserve radar playback state by default, but do not carry Storm Scope
      // into normal map modes. Storm Scope is a radar sub-mode, and preserving
      // this bit across a standard view switch can make the toggle appear stuck.
      next.radarTime =
        action.viewId === 'storm'
          ? { ...state.radarTime, stormMode: true }
          : { ...state.radarTime, stormMode: false };

      // ...but if the next view doesn't have radar enabled, pause playing to avoid wasted work.
      const radarEnabled = !!next.layers?.['radar.reflectivity' as LayerId]?.enabled;
      if (!radarEnabled && next.radarTime.playing) {
        next.radarTime = { ...next.radarTime, playing: false };
      }

      return enforceExclusiveControlSurfaces(next);
    }

    case 'SET_NERDY':
      return { ...state, nerdy: action.nerdy };

    case 'SET_LAYER_ENABLED': {
      const next = {
        ...state,
        layers: {
          ...state.layers,
          [action.layerId]: { ...state.layers[action.layerId], enabled: action.enabled },
        },
      };

      return enforceExclusiveControlSurfaces(next, action.layerId);
    }

    case 'SET_LAYER_OPACITY':
      return {
        ...state,
        layers: {
          ...state.layers,
          [action.layerId]: {
            ...state.layers[action.layerId],
            opacity: clamp01(action.opacity),
          },
        },
      };

    case 'SET_VIEWPORT':
      return { ...state, viewport: action.viewport };

    case 'SET_RADAR_FRAME':
      return { ...state, radarTime: { ...state.radarTime, frameIndex: action.frameIndex } };

    case 'SET_RADAR_PLAYING':
      return { ...state, radarTime: { ...state.radarTime, playing: action.playing } };

    case 'SET_RADAR_STORM_MODE':
      return {
        ...state,
        radarTime: {
          ...state.radarTime,
          stormMode: action.stormMode,
          playing: action.stormMode ? false : state.radarTime.playing,
        },
      };

    default:
      return state;
  }
}

function enforceExclusiveControlSurfaces(
  state: MapRuntimeState,
  changedLayerId?: LayerId,
): MapRuntimeState {
  const nextLayers = { ...state.layers };
  const changedLayerIsOn =
    changedLayerId != null && nextLayers[changedLayerId] && nextLayers[changedLayerId].enabled;

  if (changedLayerIsOn && WEATHER_RASTER_LAYER_IDS.includes(changedLayerId)) {
    disableLayers(nextLayers, WEATHER_RASTER_LAYER_IDS.filter((id) => id !== changedLayerId));
  }

  const activeDomainGroup = pickActiveDomainGroup(state.viewId, changedLayerId, changedLayerIsOn);
  if (activeDomainGroup) {
    for (const group of EXCLUSIVE_DOMAIN_GROUPS) {
      if (group === activeDomainGroup) continue;
      disableLayers(nextLayers, group);
    }
  }

  const radarEnabled = !!nextLayers?.['radar.reflectivity']?.enabled;
  const radarTime =
    !radarEnabled && state.radarTime.playing
      ? { ...state.radarTime, playing: false }
      : state.radarTime;

  return { ...state, layers: nextLayers, radarTime };
}

function pickActiveDomainGroup(
  viewId: MapRuntimeState['viewId'],
  changedLayerId?: LayerId,
  changedLayerIsOn?: boolean,
) {
  if (changedLayerId && changedLayerIsOn) {
    const changedGroup = EXCLUSIVE_DOMAIN_GROUPS.find((group) => group.includes(changedLayerId));
    if (changedGroup) return changedGroup;
  }

  switch (viewId) {
    case 'wildfire':
      return FIRE_LAYER_IDS;
    case 'aviation':
      return AVIATION_LAYER_IDS;
    case 'astronomer':
      return ASTRONOMY_LAYER_IDS;
    case 'mariner':
      return MARINE_LAYER_IDS;
    default:
      return null;
  }
}

function disableLayers(
  layers: Record<LayerId, LayerRuntimeState>,
  ids: LayerId[],
) {
  for (const id of ids) {
    if (layers[id]?.enabled) layers[id] = { ...layers[id], enabled: false };
  }
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
