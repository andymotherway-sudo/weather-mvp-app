// app/context/LocationContext.tsx
import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type UserLocation = {
  lat: number;
  lon: number;
  accuracyM?: number | null;
  updatedAt: string; // ISO
};

type LocationState = {
  location: UserLocation | null;
  permission: 'unknown' | 'granted' | 'denied';
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const Ctx = createContext<LocationState | null>(null);

export function LocationProvider(props: { children: React.ReactNode }) {
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [permission, setPermission] = useState<LocationState['permission']>('unknown');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prevent overlapping refresh calls from thrashing state
  const refreshingRef = useRef(false);

  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;

    try {
      setError(null);

      // If we don't have permission, don't even try
      if (permission !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLocation({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
        updatedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      setError(e?.message ?? 'Location refresh failed');
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;

        if (status !== 'granted') {
          setPermission('denied');
          setLoading(false);
          return;
        }

        setPermission('granted');        // Location warmup should not overwrite the user-selected default place.
        // We only set a location when we actually have one (last known or current).

        // Best effort: last known first (fast), then current (accurate)
        const last = await Location.getLastKnownPositionAsync();
        if (mounted && last?.coords) {
          setLocation({
            lat: last.coords.latitude,
            lon: last.coords.longitude,
            accuracyM: last.coords.accuracy ?? null,
            updatedAt: new Date().toISOString(),
          });
        }

        // Now update to current position. This is what you want as "startup location".
        await refresh();
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? 'Location init failed');
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<LocationState>(
    () => ({ location, permission, loading, error, refresh }),
    [location, permission, loading, error],
  );

  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useLocation() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocation must be used inside LocationProvider');
  return v;
}