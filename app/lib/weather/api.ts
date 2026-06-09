import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';
import type { CurrentWeather, Units } from './types';

export interface WeatherRequest {
  lat: number;
  lon: number;
  units?: Units;
}

function weatherCodeLabel(code: unknown) {
  if (typeof code !== 'number' || !Number.isFinite(code)) return 'Current weather';
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Clouds';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Current weather';
}

export async function fetchCurrentWeather(
  req: WeatherRequest
): Promise<CurrentWeather> {
  const { lat, lon, units = 'imperial' } = req;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error('fetchCurrentWeather requires valid lat/lon');
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    units,
  });

  const res = await fetchWithTimeout(apiUrl(`/api/current?${params.toString()}`), 12000, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Current weather failed: HTTP ${res.status}`);

  const json = await res.json();
  if (json?.ok === false) throw new Error(json?.error ?? 'Current weather unavailable');

  return {
    locationName: `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
    temperature: typeof json?.temp === 'number' ? json.temp : NaN,
    dewPoint: typeof json?.dewPoint === 'number' ? json.dewPoint : undefined,
    humidity: typeof json?.humidityPct === 'number' ? json.humidityPct : undefined,
    condition: weatherCodeLabel(json?.weatherCode),
    observationTime: typeof json?.time === 'string' ? json.time : new Date().toISOString(),
  };
}
