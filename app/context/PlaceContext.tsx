import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from './LocationContext';

export type Place = {
  id: string; // stable key: `${lat.toFixed(4)},${lon.toFixed(4)}`
  name: string; // display name: "Brookings, OR"
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

const KEY = 'omniwx.place.v1';
const Ctx = createContext<PlaceState | null>(null);

function makeId(lat: number, lon: number) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function PlaceProvider({ children }: { children: React.ReactNode }) {
  const { location, permission } = useLocation();

  const [active, setActiveState] = useState<Place | null>(null);
  const [favorites, setFavorites] = useState<Place[]>([]);

  // load persisted
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        setActiveState(parsed.active ?? null);
        setFavorites(parsed.favorites ?? []);
      } catch {
        // ignore
      }
    })();
  }, []);

  // persist
  useEffect(() => {
    AsyncStorage.setItem(KEY, JSON.stringify({ active, favorites })).catch(() => {});
  }, [active, favorites]);

  // If no active place is set, and GPS exists, default to GPS
  useEffect(() => {
    if (active) return;
    if (permission !== 'granted') return;
    if (!location) return;

    setActiveState({
      id: makeId(location.lat, location.lon),
      name: 'Current Location',
      lat: location.lat,
      lon: location.lon,
      source: 'gps',
    });
  }, [active, location, permission]);

  const setActive = (p: Place) => setActiveState(p);

  const addFavorite = (p: Place) => {
    const fav: Place = { ...p, source: 'favorite' };
    setFavorites((prev) => {
      const exists = prev.some((x) => x.id === fav.id);
      const next = exists ? prev : [fav, ...prev];
      return next.slice(0, 30);
    });
    setActiveState(fav);
  };

  const removeFavorite = (id: string) => {
    setFavorites((prev) => prev.filter((x) => x.id !== id));
    setActiveState((cur) => (cur?.id === id ? null : cur));
  };

  const useGPS = () => {
    if (permission !== 'granted' || !location) return;
    setActiveState({
      id: makeId(location.lat, location.lon),
      name: 'Current Location',
      lat: location.lat,
      lon: location.lon,
      source: 'gps',
    });
  };

  const value = useMemo<PlaceState>(
    () => ({ active, favorites, setActive, addFavorite, removeFavorite, useGPS }),
    [active, favorites]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlace() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlace must be used inside PlaceProvider');
  return v;
}
