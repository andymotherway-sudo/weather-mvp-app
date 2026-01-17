import { useMemo } from 'react';
import type { MarineConditions } from './typesMarine';

// You’ll plug real model fetch + official fetch in here.
export function useMarineConditions(args: {
  kind: 'zone' | 'point' | 'metarea';
  id?: string;
  lat: number;
  lon: number;
}) {
  const { kind, id, lat, lon } = args;

  // TODO: replace with real sources:
  // - model: global grid (WW3/Open-Meteo marine/etc)
  // - official: NOAA zone text OR METAREA bulletin text

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
