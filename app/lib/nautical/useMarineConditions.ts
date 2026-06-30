import { useMemo } from 'react';
import type { MarineConditions } from './typesMarine';

// Placeholder hook shape for screens that expect model and official marine condition payloads.
export function useMarineConditions(args: {
  kind: 'zone' | 'point' | 'metarea';
  id?: string;
  lat: number;
  lon: number;
}) {
  const { kind, id, lat, lon } = args;

  const loading = false;
  const error: string | null = null;

  const data: MarineConditions = useMemo(() => {
    return {
      meta: { lat, lon, kind, id },
      model: {
        source: 'MODEL',
        windKts: null,
        gustKts: null,
        waveHeightM: null,
        wavePeriodS: null,
        confidence: null,
      },
      official: null,
    };
  }, [kind, id, lat, lon]);

  return { data, loading, error };
}
