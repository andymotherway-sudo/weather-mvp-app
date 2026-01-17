// app/lib/locations/useLocations.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useReducer } from 'react';

export type FavoriteLocation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type ActiveLocation =
  | { kind: 'current' }
  | { kind: 'favorite'; id: string };

type State = {
  favorites: FavoriteLocation[];
  active: ActiveLocation;
  currentCoords: { lat: number; lon: number } | null;
  hydrated: boolean;
};

type Action =
  | { type: 'HYDRATE'; favorites: FavoriteLocation[] }
  | { type: 'SET_ACTIVE'; active: ActiveLocation }
  | { type: 'SET_CURRENT'; coords: { lat: number; lon: number } }
  | { type: 'UPSERT_FAVORITE'; favorite: FavoriteLocation; makeActive?: boolean }
  | { type: 'REMOVE_FAVORITE'; id: string };

const STORAGE_KEY = 'omniwx:favorites:v1';

const initialState: State = {
  favorites: [],
  active: { kind: 'current' },
  currentCoords: null,
  hydrated: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return { ...state, favorites: action.favorites ?? [], hydrated: true };

    case 'SET_ACTIVE':
      return { ...state, active: action.active };

    case 'SET_CURRENT':
      return { ...state, currentCoords: action.coords };

    case 'UPSERT_FAVORITE': {
      const next = upsertFavorite(state.favorites, action.favorite);
      const nextActive: ActiveLocation =
        action.makeActive ? { kind: 'favorite', id: action.favorite.id } : state.active;
      return { ...state, favorites: next, active: nextActive };
    }

    case 'REMOVE_FAVORITE': {
      const next = state.favorites.filter((f) => f.id !== action.id);
      const wasActiveFav = state.active.kind === 'favorite' && state.active.id === action.id;
      return { ...state, favorites: next, active: wasActiveFav ? { kind: 'current' } : state.active };
    }

    default:
      return state;
  }
}

function near(a: number, b: number, eps = 0.0005) {
  return Math.abs(a - b) < eps;
}

function makeId(lat: number, lon: number) {
  return `fav:${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function upsertFavorite(list: FavoriteLocation[], item: FavoriteLocation) {
  const idx = list.findIndex((f) => f.id === item.id);
  if (idx >= 0) {
    const copy = list.slice();
    copy[idx] = { ...copy[idx], ...item };
    return copy;
  }
  return [item, ...list];
}

async function loadFavorites(): Promise<FavoriteLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => ({
        id: String(x.id ?? ''),
        name: String(x.name ?? ''),
        lat: Number(x.lat),
        lon: Number(x.lon),
      }))
      .filter((x) => x.id && Number.isFinite(x.lat) && Number.isFinite(x.lon));
  } catch {
    return [];
  }
}

async function saveFavorites(favs: FavoriteLocation[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(favs ?? []));
  } catch {
    // ignore
  }
}

export function useLocations() {
  const [state, dispatch] = useReducer(reducer, initialState);

  // hydrate once
  useEffect(() => {
    let mounted = true;
    (async () => {
      const favs = await loadFavorites();
      if (!mounted) return;
      dispatch({ type: 'HYDRATE', favorites: favs });
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // persist after hydration
  useEffect(() => {
    if (!state.hydrated) return;
    saveFavorites(state.favorites);
  }, [state.favorites, state.hydrated]);

  const setActiveCurrent = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE', active: { kind: 'current' } });
  }, []);

  const setActiveFavorite = useCallback((id: string) => {
    dispatch({ type: 'SET_ACTIVE', active: { kind: 'favorite', id } });
  }, []);

  const refreshCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({});
      dispatch({
        type: 'SET_CURRENT',
        coords: { lat: pos.coords.latitude, lon: pos.coords.longitude },
      });
    } catch {
      // ignore
    }
  }, []);

  const addOrActivateFavorite = useCallback(
    (name: string, lat: number, lon: number) => {
      const existing = (state.favorites ?? []).find((f) => near(f.lat, lat) && near(f.lon, lon));
      const favorite: FavoriteLocation = existing ?? {
        id: makeId(lat, lon),
        name,
        lat,
        lon,
      };

      // if it exists, keep same id but update name if needed
      const updated: FavoriteLocation = existing ? { ...existing, name } : favorite;

      dispatch({ type: 'UPSERT_FAVORITE', favorite: updated, makeActive: true });
    },
    [state.favorites]
  );

  const removeFavoriteById = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FAVORITE', id });
  }, []);

  const activeFavorite = useMemo(() => {
    // ✅ NO active.id unless kind === 'favorite'
    if (state.active.kind !== 'favorite') return null;
    return state.favorites.find((f) => f.id === state.active.id) ?? null;
  }, [state.active, state.favorites]);

  const activeCoords = useMemo(() => {
    if (state.active.kind === 'favorite') {
      return activeFavorite ? { lat: activeFavorite.lat, lon: activeFavorite.lon } : null;
    }
    return state.currentCoords;
  }, [state.active, state.currentCoords, activeFavorite]);

  const activeLabel = useMemo(() => {
    if (state.active.kind === 'favorite') return activeFavorite?.name ?? 'Saved location';
    return 'Current location';
  }, [state.active, activeFavorite]);

  return {
    state,
    favorites: state.favorites,

    active: state.active,
    activeCoords,
    activeLabel,

    refreshCurrentLocation,
    setActiveCurrent,
    setActiveFavorite,

    addOrActivateFavorite,
    removeFavoriteById,
  };
}
