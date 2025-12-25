// app/context/LocationContext.tsx
import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

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

  const refresh = async () => {
    try {
      setError(null);
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

        setPermission('granted');

        // Best effort: last known first, then current
        const last = await Location.getLastKnownPositionAsync();
        if (mounted && last?.coords) {
          setLocation({
            lat: last.coords.latitude,
            lon: last.coords.longitude,
            accuracyM: last.coords.accuracy ?? null,
            updatedAt: new Date().toISOString(),
          });
        }

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
