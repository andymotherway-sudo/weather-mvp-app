// app/lib/nautical/useMarineZonesByBbox.ts
import { useEffect, useRef, useState } from 'react';
import type { NauticalZone } from './zones';
import { fetchMarineZonesByBbox } from './zonesArcgis';

export function useMarineZonesByBbox(bbox: {
  west: number;
  south: number;
  east: number;
  north: number;
} | null) {
  const [zones, setZones] = useState<NauticalZone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a stable key so tiny float jitter doesn't refetch constantly.
  // (At zoom ~4, 0.05° is still fine; tweak if needed.)
  const key =
    bbox
      ? `${bbox.west.toFixed(2)},${bbox.south.toFixed(2)},${bbox.east.toFixed(2)},${bbox.north.toFixed(2)}`
      : null;

  useEffect(() => {
    if (!bbox) {
      setZones([]);
      setLoading(false);
      setError(null);
      return;
    }

    // debounce
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      // cancel previous in-flight
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      (async () => {
        try {
          setLoading(true);
          setError(null);

          // If your fetchMarineZonesByBbox supports passing signal, do it.
          // If it doesn't, this still works to avoid updating state after abort.
          const data = await fetchMarineZonesByBbox(bbox /*, { signal: ac.signal } */);

          if (ac.signal.aborted) return;
          setZones(data);
        } catch (e: any) {
          if (ac.signal.aborted) return;
          setError(e?.message ?? 'Failed to load zones');
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      // don’t abort here—let next run abort; but safe to abort on unmount:
      // (if this effect is tearing down due to bbox change, next run aborts anyway)
    };
    // key changes are what matter
  }, [key]);

  return { zones, loading, error };
}
