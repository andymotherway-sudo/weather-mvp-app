import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { formatCompactLocation } from './formats';

export type FavoriteLocation = {
  id: string;
  name: string;
  lat: number;
  lon: number;
};

export type ActiveLocation = { kind: 'current' } | { kind: 'favorite'; id: string };

type Coords = { lat: number; lon: number };

type State = {
  favorites: FavoriteLocation[];
  active: ActiveLocation;
  currentCoords: Coords | null;
  currentLabel: string | null;
  hydrated: boolean;
};

type Action =
  | { type: 'HYDRATE'; favorites: FavoriteLocation[]; lastCoords: Coords | null; lastLabel: string | null }
  | { type: 'SET_ACTIVE'; active: ActiveLocation }
  | { type: 'SET_CURRENT'; coords: Coords; label?: string | null }
  | { type: 'UPSERT_FAVORITE'; favorite: FavoriteLocation; makeActive?: boolean }
  | { type: 'REMOVE_FAVORITE'; id: string };

const FAVORITES_KEY = 'omniwx:favorites:v1';
const LAST_COORDS_KEY = 'omniwx:lastCoords:v1';

const initialState: State = {
  favorites: [],
  active: { kind: 'current' },
  currentCoords: null,
  currentLabel: null,
  hydrated: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return {
        ...state,
        favorites: action.favorites ?? [],
        currentCoords: action.lastCoords ?? state.currentCoords,
        currentLabel: action.lastLabel ?? state.currentLabel,
        hydrated: true,
      };

    case 'SET_ACTIVE':
      return { ...state, active: action.active };

    case 'SET_CURRENT':
      return {
        ...state,
        currentCoords: action.coords,
        currentLabel: action.label === undefined ? state.currentLabel : action.label,
      };

    case 'UPSERT_FAVORITE': {
      const next = upsertFavorite(state.favorites, action.favorite);
      const nextActive: ActiveLocation = action.makeActive
        ? { kind: 'favorite', id: action.favorite.id }
        : state.active;
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

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

async function loadFavorites(): Promise<FavoriteLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_KEY);
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
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs ?? []));
  } catch {
    // ignore
  }
}

async function loadLastCoords(): Promise<Coords | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_COORDS_KEY);
    const parsed = safeJsonParse<any>(raw);
    if (!parsed) return null;
    const lat = Number(parsed.lat);
    const lon = Number(parsed.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

async function loadLastLabel(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_COORDS_KEY);
    const parsed = safeJsonParse<any>(raw);
    const label = typeof parsed?.label === 'string' ? parsed.label.trim() : '';
    return label || null;
  } catch {
    return null;
  }
}

async function saveLastCoords(coords: Coords, label?: string | null) {
  try {
    await AsyncStorage.setItem(
      LAST_COORDS_KEY,
      JSON.stringify({
        ...coords,
        label: typeof label === 'string' && label.trim() ? label.trim() : undefined,
      })
    );
  } catch {
    // ignore
  }
}

function formatCurrentLocationLabel(addresses: Location.LocationGeocodedAddress[] | null | undefined) {
  const first = addresses?.[0];
  if (!first) return null;

  const name =
    first.city?.trim() ||
    first.district?.trim() ||
    first.subregion?.trim() ||
    first.region?.trim() ||
    first.name?.trim();

  if (!name) return null;

  return formatCompactLocation({
    name,
    admin1: first.region?.trim() || undefined,
    country: first.country?.trim() || undefined,
  });
}

type LocationsApi = ReturnType<typeof useLocationsImpl>;

const LocationsContext = createContext<LocationsApi | null>(null);

function useLocationsImpl() {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const [favs, lastCoords, lastLabel] = await Promise.all([
        loadFavorites(),
        loadLastCoords(),
        loadLastLabel(),
      ]);
      if (!mounted) return;
      dispatch({ type: 'HYDRATE', favorites: favs, lastCoords, lastLabel });
    })();
    return () => {
      mounted = false;
    };
  }, []);

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
      if (status !== 'granted') return null;

      const pos = await Location.getCurrentPositionAsync({});
      const coords: Coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      let label: string | null = null;

      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: coords.lat,
          longitude: coords.lon,
        });
        label = formatCurrentLocationLabel(addresses);
      } catch {
        label = null;
      }

      dispatch({ type: 'SET_CURRENT', coords, label });
      saveLastCoords(coords, label);
      return coords;
    } catch {
      // ignore
      return null;
    }
  }, []);

  const addOrActivateFavorite = useCallback(
    (name: string, lat: number, lon: number) => {
      const existing = (state.favorites ?? []).find((f) => near(f.lat, lat) && near(f.lon, lon));
      const favorite: FavoriteLocation =
        existing ??
        ({
          id: makeId(lat, lon),
          name,
          lat,
          lon,
        } as FavoriteLocation);

      const updated: FavoriteLocation = existing ? { ...existing, name } : favorite;
      dispatch({ type: 'UPSERT_FAVORITE', favorite: updated, makeActive: true });
    },
    [state.favorites]
  );

  const removeFavoriteById = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_FAVORITE', id });
  }, []);

  const activeFavorite = useMemo(() => {
    const active = state.active;
    if (active.kind !== 'favorite') return null;
    return state.favorites.find((f) => f.id === active.id) ?? null;
  }, [state.active, state.favorites]);

  const activeCoords = useMemo(() => {
    if (state.active.kind === 'favorite') {
      return activeFavorite ? { lat: activeFavorite.lat, lon: activeFavorite.lon } : null;
    }
    return state.currentCoords;
  }, [state.active, state.currentCoords, activeFavorite]);

  const activeLabel = useMemo(() => {
    if (state.active.kind === 'favorite') return activeFavorite?.name ?? 'Saved location';
    return state.currentLabel?.trim() || '';
  }, [state.active, activeFavorite, state.currentLabel]);

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

export function LocationsProvider({ children }: { children: React.ReactNode }) {
  const api = useLocationsImpl();

  const warmedRef = useRef(false);

  useEffect(() => {
    if (warmedRef.current) return;
    if (!api.state.hydrated) return;

    warmedRef.current = true;
    api.refreshCurrentLocation();
  }, [api]);

  return <LocationsContext.Provider value={api}>{children}</LocationsContext.Provider>;
}

export function useLocations() {
  const ctx = useContext(LocationsContext);
  if (!ctx) {
    throw new Error('useLocations() must be used inside <LocationsProvider>. Wrap app/_layout.tsx.');
  }
  return ctx;
}
