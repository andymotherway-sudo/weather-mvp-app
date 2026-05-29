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

      // Preserve radar playback state by default...
      next.radarTime = state.radarTime;

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
  const changedAviationOn =
    changedLayerId != null &&
    AVIATION_LAYER_IDS.includes(changedLayerId) &&
    state.layers?.[changedLayerId]?.enabled;
  const changedAstronomyOn =
    changedLayerId != null &&
    ASTRONOMY_LAYER_IDS.includes(changedLayerId) &&
    state.layers?.[changedLayerId]?.enabled;

  const viewWantsAviation = state.viewId === 'aviation';
  const viewWantsAstronomy = state.viewId === 'astronomer';

  if (!changedAviationOn && !changedAstronomyOn && !viewWantsAviation && !viewWantsAstronomy) {
    return state;
  }

  const nextLayers = { ...state.layers };

  if (changedAviationOn || viewWantsAviation) {
    for (const id of ASTRONOMY_LAYER_IDS) {
      if (nextLayers[id]) nextLayers[id] = { ...nextLayers[id], enabled: false };
    }
  }

  if (changedAstronomyOn || viewWantsAstronomy) {
    for (const id of AVIATION_LAYER_IDS) {
      if (nextLayers[id]) nextLayers[id] = { ...nextLayers[id], enabled: false };
    }
  }

  return { ...state, layers: nextLayers };
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
