// app/context/PlaceContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { NativeModules, Platform } from 'react-native';

import { formatCompactLocation } from '../lib/locations/formats';
import { warmFavoriteLocationCaches } from '../lib/locations/favoriteWarmup';
import { useLocations } from '../lib/locations/useLocations';

export type Place = {
  id: string; // stable key: `${lat.toFixed(4)},${lon.toFixed(4)}`
  name: string; // display name
  lat: number;
  lon: number;
  source: 'gps' | 'favorite' | 'search';
};

type PlaceState = {
  active: Place | null;
  favorites: Place[];
  setActive: (p: Place) => void;
  addFavorite: (p: Place) => void;
  removeFavorite: (id: string) => void;
  useGPS: () => void;
};

const KEY = 'omniwx.place.v2';
const DEFAULT_CITY_KEY = 'omniwx:profile:defaultCity';

const Ctx = createContext<PlaceState | null>(null);

type NativeWidgetStateModule = {
  updatePlace?: (place: { name: string; lat: number; lon: number; source?: string }) => Promise<boolean>;
};

const nativeWidgetState = NativeModules.OmniwxWidgetState as NativeWidgetStateModule | undefined;

function makeId(lat: number, lon: number) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}
function nearlySame(a: number, b: number, eps = 0.0002) {
  return Math.abs(a - b) <= eps;
}

// Detect the old “Brookings default” (and related OR/CA coast defaults) so we don’t honor it on boot.
function looksLikeOldDefault(p: any) {
  if (!p) return false;
  const name = String(p.name ?? '').toLowerCase();
  const lat = Number(p.lat);
  const lon = Number(p.lon);

  const nearBrookings =
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat - 42.0526) < 0.08 &&
    Math.abs(lon - -124.2836) < 0.08;

  const nameHint =
    name.includes('brookings') ||
    name.includes('selma') ||
    (name.includes(', or') && name.includes('us'));

  return nearBrookings || nameHint;
}

type DefaultCity = {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
};

function formatCity(c: DefaultCity) {
  return formatCompactLocation({
    name: c.name,
    admin1: c.admin1,
    country: c.country,
  });
}

function placeFromDefaultCity(c: DefaultCity): Place {
  return {
    id: makeId(c.lat, c.lon),
    name: formatCity(c),
    lat: c.lat,
    lon: c.lon,
    source: 'search',
  };
}

function syncNativeWidgetPlace(place: Place | null) {
  if (Platform.OS !== 'android') return;
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return;
  nativeWidgetState?.updatePlace?.({
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    source: place.source,
  }).catch(() => {});
}

// Best-effort permission probe (no prompting)
async function getPermissionStatus(): Promise<'unknown' | 'granted' | 'denied'> {
  try {
    const res = await (await import('expo-location')).getForegroundPermissionsAsync();
    if (res.status === 'granted') return 'granted';
    if (res.status === 'denied') return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function PlaceProvider({ children }: { children: React.ReactNode }) {
  const { active: locActive, activeCoords, refreshCurrentLocation, state: locState } = useLocations();

  // We expose a similar “permission/loading” semantics that PlaceContext used before
  const locationLoading = !locState.hydrated;

  const [active, setActiveState] = useState<Place | null>(null);
  const [favorites, setFavorites] = useState<Place[]>([]);

  // ✅ Default City presence + value (hydrated on boot)
  const [defaultCity, setDefaultCity] = useState<DefaultCity | null>(null);
  const [defaultCityChecked, setDefaultCityChecked] = useState(false);

  // Track hydration so we don’t overwrite saved state at boot
  const hydratedRef = useRef(false);

  // load persisted + default city
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [rawPlace, rawDefault] = await Promise.all([
          AsyncStorage.getItem(KEY),
          AsyncStorage.getItem(DEFAULT_CITY_KEY),
        ]);

        if (!mounted) return;

        // Default city
        try {
          setDefaultCity(rawDefault ? (JSON.parse(rawDefault) as DefaultCity) : null);
        } catch {
          setDefaultCity(null);
        } finally {
          setDefaultCityChecked(true);
        }

        // Place state
        if (!rawPlace) return;

        const parsed = JSON.parse(rawPlace);
        const persistedFavs = Array.isArray(parsed?.favorites) ? parsed.favorites : [];
        const persistedActive = parsed?.active ?? null;

        setFavorites(persistedFavs);

        if (persistedActive && looksLikeOldDefault(persistedActive)) {
          setActiveState(null);
          await AsyncStorage.setItem(KEY, JSON.stringify({ active: null, favorites: persistedFavs }));
        } else {
          setActiveState(persistedActive);
        }
      } catch {
        // ignore
      } finally {
        hydratedRef.current = true;
        setDefaultCityChecked(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // persist place state
  useEffect(() => {
    if (!hydratedRef.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify({ active, favorites })).catch(() => {});
    syncNativeWidgetPlace(active);
  }, [active, favorites]);

  // ✅ If no active place after hydration, prefer Default City (if set).
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!defaultCityChecked) return;
    if (active) return;

    if (defaultCity) setActiveState(placeFromDefaultCity(defaultCity));
  }, [active, defaultCity, defaultCityChecked]);

  // ✅ Default-to-GPS behavior (ONLY after default city exists):
  // - Only after hydration
  // - Only when active location mode is "current"
  // - Only when we actually have coords (last-known or fresh)
  // - Only when user has not already chosen an active place
  // - Only when onboarding requirement is satisfied (default city exists)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!defaultCityChecked) return;
    if (!defaultCity) return;
    if (active) return;
    if (locationLoading) return;
    if (locActive.kind !== 'current') return;
    if (!activeCoords) return;

    setActiveState({
      id: makeId(activeCoords.lat, activeCoords.lon),
      name: 'Current Location',
      lat: activeCoords.lat,
      lon: activeCoords.lon,
      source: 'gps',
    });
  }, [active, activeCoords, locActive.kind, locationLoading, defaultCity, defaultCityChecked]);

  // ✅ Keep "Current Location" truly current (but only if user is in GPS mode)
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!active || active.source !== 'gps') return;
    if (locActive.kind !== 'current') return;
    if (!activeCoords) return;

    if (nearlySame(active.lat, activeCoords.lat) && nearlySame(active.lon, activeCoords.lon)) return;

    setActiveState({
      id: makeId(activeCoords.lat, activeCoords.lon),
      name: 'Current Location',
      lat: activeCoords.lat,
      lon: activeCoords.lon,
      source: 'gps',
    });
  }, [active, activeCoords, locActive.kind]);

  const setActive = (p: Place) => setActiveState(p);

  const addFavorite = (p: Place) => {
    const fav: Place = { ...p, source: 'favorite' };
    setFavorites((prev) => {
      const exists = prev.some((x) => x.id === fav.id);
      const next = exists ? prev : [fav, ...prev];
      return next.slice(0, 30);
    });
    setActiveState(fav);
    warmFavoriteLocationCaches(fav.lat, fav.lon).catch(() => {});
  };

  const removeFavorite = (id: string) => {
    setFavorites((prev) => prev.filter((x) => x.id !== id));
    setActiveState((cur) => (cur?.id === id ? null : cur));
  };

  const useGPS = useCallback(() => {
    void (async () => {
      const livePermission = await getPermissionStatus();

      // Request a refresh (best effort). We still set from activeCoords if available immediately.
      // If permission is denied, do nothing (matches prior behavior).
      if (livePermission !== 'granted') return;

      // Make sure the locations store is in "current" mode (PlaceContext doesn't control it directly)
      // If it's currently a favorite, we still avoid forcing; user can switch back to Current in UI.
      if (locActive.kind !== 'current') return;

      if (activeCoords) {
        setActiveState({
          id: makeId(activeCoords.lat, activeCoords.lon),
          name: 'Current Location',
          lat: activeCoords.lat,
          lon: activeCoords.lon,
          source: 'gps',
        });
      }

      // Also kick a refresh so it's truly current.
      await refreshCurrentLocation();
    })();
  }, [activeCoords, locActive.kind, refreshCurrentLocation]);

  const value = useMemo<PlaceState>(
    () => ({ active, favorites, setActive, addFavorite, removeFavorite, useGPS }),
    [active, favorites, useGPS],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlace() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlace must be used inside PlaceProvider');
  return v;
}
