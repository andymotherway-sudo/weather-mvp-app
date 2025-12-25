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

  const inflight = useRef(false);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (!bbox) return;

    // reduce spam while panning; only refetch if bbox changed meaningfully
    const key = `${bbox.west.toFixed(2)},${bbox.south.toFixed(2)},${bbox.east.toFixed(
      2,
    )},${bbox.north.toFixed(2)}`;

    if (lastKey.current === key) return;
    lastKey.current = key;

    let alive = true;

    (async () => {
      if (inflight.current) return;
      inflight.current = true;

      try {
        setLoading(true);
        setError(null);
        const data = await fetchMarineZonesByBbox(bbox);
        if (alive) setZones(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Failed to load zones');
      } finally {
        inflight.current = false;
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [bbox?.west, bbox?.south, bbox?.east, bbox?.north]);

  return { zones, loading, error };
}
