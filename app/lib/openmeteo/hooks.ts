// lib/openmeteo/hooks.ts
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LOCATION } from '../weather/locations';

type ForecastDay = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipProb: number | null;
};

type ForecastState = {
  data: { daily: ForecastDay[] } | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * 3-day (or N-day) Open-Meteo forecast hook.
 * Returns { daily: [{ date, tempMax, tempMin, precipProb }, ...] }
 * to match what app/(tabs)/index.tsx expects.
 */
export function useOpenMeteoForecast(
  days: number = 3
): ForecastState {
  const lat = DEFAULT_LOCATION.lat;
  const lon = DEFAULT_LOCATION.lon;

  const [data, setData] = useState<{ daily: ForecastDay[] } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=${days}&temperature_unit=fahrenheit&timezone=auto`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();

        const d = json.daily ?? {};
        const dates: string[] = d.time ?? [];
        const maxes: (number | null)[] = d.temperature_2m_max ?? [];
        const mins: (number | null)[] = d.temperature_2m_min ?? [];
        const pops: (number | null)[] =
          d.precipitation_probability_max ?? [];

        const daily: ForecastDay[] = dates.map((date, idx) => ({
          date,
          tempMax: maxes[idx] ?? null,
          tempMin: mins[idx] ?? null,
          precipProb: pops[idx] ?? null,
        }));

        setData({ daily });
      } catch (err: any) {
        console.error('useOpenMeteoForecast error', err);
        setError(err?.message ?? 'Failed to load forecast');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lat, lon, days]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { data, loading, error, refreshing, refresh };
}
