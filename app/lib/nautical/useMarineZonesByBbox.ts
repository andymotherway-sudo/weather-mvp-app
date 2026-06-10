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

  const key = bbox
    ? `${bbox.west.toFixed(2)},${bbox.south.toFixed(2)},${bbox.east.toFixed(2)},${bbox.north.toFixed(2)}`
    : null;

  useEffect(() => {
    if (!bbox) {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setZones([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      (async () => {
        try {
          setLoading(true);
          setError(null);

          const data = await fetchMarineZonesByBbox(bbox, { signal: ac.signal });

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
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [key]);

  return { zones, loading, error };
}
