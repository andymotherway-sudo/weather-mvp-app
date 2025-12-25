// lib/weather/hooks.ts
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_LOCATION } from './locations';

type CurrentWeatherOptions = {
  lat?: number;
  lon?: number;
  units?: 'imperial' | 'metric' | 'standard';
};

type CurrentWeatherState = {
  data: any | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  refresh: () => void;
};

/**
 * Current land weather hook
 * Uses Open-Meteo "current" endpoint and maps to the loose field names
 * used in app/(tabs)/index.tsx (temperatureF, dewpointF, etc.).
 */
export function useCurrentWeather(
  options: CurrentWeatherOptions = {}
): CurrentWeatherState {
  const lat = options.lat ?? DEFAULT_LOCATION.lat;
  const lon = options.lon ?? DEFAULT_LOCATION.lon;

  const [data, setData] = useState<any | null>(null);
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

        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,dew_point_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();

        const c = json.current ?? {};

        // Very small weather-code → description map
        const code = c.weather_code;
        const wxMap: Record<number, string> = {
          0: 'Clear',
          1: 'Mostly clear',
          2: 'Partly cloudy',
          3: 'Overcast',
          45: 'Fog',
          48: 'Freezing fog',
          51: 'Drizzle',
          61: 'Rain',
          71: 'Snow',
          80: 'Showers',
          95: 'Thunderstorms',
        };

        const mapped = {
          // Names your screen is already looking for
          temperatureF: c.temperature_2m,
          apparentTemperatureF: c.apparent_temperature,
          dewpointF: c.dew_point_2m,
          humidity: c.relative_humidity_2m,
          windSpeedMph: c.wind_speed_10m,
          wind_dir: c.wind_direction_10m,
          shortForecast: code in wxMap ? wxMap[code] : '—',
          observedAt: c.time,
        };

        setData(mapped);
      } catch (err: any) {
        console.error('useCurrentWeather error', err);
        setError(err?.message ?? 'Failed to load current weather');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [lat, lon]
  );

  // Initial load
  useEffect(() => {
    load(false);
  }, [load]);

  const refresh = useCallback(() => {
    load(true);
  }, [load]);

  return { data, loading, error, refreshing, refresh };
}
