// app/lib/buoys/hooks.ts

import { useEffect, useState } from 'react';
import type { BuoyIndexEntry, BuoyIndexResponse } from './types';

/**
 * For now this is just a scaffold:
 * - Returns a small static list of “buoys”
 * - Pretends to load asynchronously
 * Later we’ll replace this with real NDBC / global buoy data.
 */
const MOCK_BUOYS: BuoyIndexEntry[] = [
  {
    id: 'YAQUINA',
    name: 'Buoy – Newport, OR',
    lat: 44.625,
    lon: -124.043,
    provider: 'Demo',
    region: 'Pacific NW',
    hasWaves: true,
    hasMeteo: true,
  },
  {
    id: 'GOLDEN_GATE',
    name: 'Buoy – Golden Gate, CA',
    lat: 37.806,
    lon: -122.465,
    provider: 'Demo',
    region: 'Northern California',
    hasWaves: true,
    hasMeteo: true,
  },
  {
    id: 'CAPE_HATTERAS',
    name: 'Buoy – Cape Hatteras, NC',
    lat: 35.251,
    lon: -75.528,
    provider: 'Demo',
    region: 'Atlantic',
    hasWaves: true,
    hasMeteo: true,
  },
];

type UseBuoyIndexResult = {
  data: BuoyIndexResponse | null;
  loading: boolean;
  error: string | null;
};

export function useBuoyIndex(): UseBuoyIndexResult {
  const [data, setData] = useState<BuoyIndexResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Simulate async fetch
        await new Promise((resolve) => setTimeout(resolve, 300));

        if (!cancelled) {
          setData({ buoys: MOCK_BUOYS });
        }
      } catch (err) {
        console.error('Error loading buoy index', err);
        if (!cancelled) {
          setError('Error loading buoy index');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
