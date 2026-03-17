// app/lib/locations/favorites.ts

import AsyncStorage from '@react-native-async-storage/async-storage';

export type FavoriteLocation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type CurrentLocation = {
  lat: number;
  lon: number;
  name?: string;
  updatedAt: number;
};

export type ActiveLocation =
  | { kind: 'current' }
  | { kind: 'favorite'; id: string };

export type LocationState = {
  favorites: FavoriteLocation[];
  active: ActiveLocation;
  current?: CurrentLocation;
};

type Action =
  | { type: 'hydrate'; state: Partial<LocationState> }
  | { type: 'setCurrent'; current: CurrentLocation }
  | { type: 'setActive'; active: ActiveLocation }
  | { type: 'addFavorite'; fav: FavoriteLocation }
  | { type: 'removeFavorite'; id: string };

export const LOCATION_STORAGE_KEY = 'omniwx.locationState.v1';

export const initialLocationState: LocationState = {
  favorites: [],
  active: { kind: 'current' },
  current: undefined,
};

export function locationReducer(state: LocationState, action: Action): LocationState {
  switch (action.type) {
    case 'hydrate': {
  const merged: LocationState = {
    ...state,
    ...action.state,
    favorites: action.state.favorites ?? state.favorites,
    active: action.state.active ?? state.active,
    current: action.state.current ?? state.current,
  };

  const active = merged.active;
  if (active.kind === 'favorite') {
    const ok = merged.favorites.some((f) => f.id === active.id);
    if (!ok) {
      merged.active = { kind: 'current' };
    }
  }

  return merged;
}
    case 'setCurrent':
      return { ...state, current: action.current };
    case 'setActive':
      return { ...state, active: action.active };
    case 'addFavorite':
      return {
        ...state,
        favorites: [action.fav, ...state.favorites],
        active: { kind: 'favorite', id: action.fav.id },
      };
    case 'removeFavorite': {
      const favorites = state.favorites.filter(f => f.id !== action.id);
      const active =
        state.active.kind === 'favorite' && state.active.id === action.id
          ? { kind: 'current' as const }
          : state.active;
      return { ...state, favorites, active };
    }
    default:
      return state;
  }
}

export async function loadLocationState(): Promise<Partial<LocationState> | null> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<LocationState>;
  } catch {
    return null;
  }
}

export async function saveLocationState(state: LocationState): Promise<void> {
  try {
    const toPersist: Partial<LocationState> = {
      favorites: state.favorites,
      active: state.active,
      current: state.current,
    };
    await AsyncStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(toPersist));
  } catch {
    // ignore
  }
}
