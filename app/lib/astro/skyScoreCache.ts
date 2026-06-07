import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiUrl } from '../net/apiBase';
import { fetchWithTimeout } from '../net/fetchWithTimeout';
import type { LocationAstroForecast } from './locationAstro';
import { toLocalLabel } from './locationAstro';

const KEY_PREFIX = 'omniwx:skyScore:v1';

function keyFor(lat: number, lon: number) {
  return `${KEY_PREFIX}:${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatWindow(start?: string | null, end?: string | null, timeZone?: string | null) {
  if (!start) return 'Best window --';
  const startLabel = toLocalLabel(start, timeZone);
  if (!end) return `Best window ${startLabel}`;
  const endLabel = toLocalLabel(end, timeZone);
  return `Best window ${startLabel}-${endLabel}`;
}

function formatBortle(forecast: LocationAstroForecast) {
  const cls = forecast.site?.bortleClass;
  const label = forecast.site?.bortleLabel;
  if (cls == null && !label) return 'Bortle unavailable';
  if (cls != null && label) return `Bortle ${cls} - ${label}`;
  if (cls != null) return `Bortle ${cls}`;
  return label ?? 'Bortle unavailable';
}

function pct(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '--';
}

function bestCloudHour(forecast: LocationAstroForecast) {
  const targetScore = forecast.peakScore;
  return (
    forecast.tonightHours.find((hour) => hour.score === targetScore) ??
    forecast.tonightHours[0] ??
    forecast.hours[0] ??
    null
  );
}

export async function primeSkyScoreCache(lat: number, lon: number) {
  if (!isFiniteCoord(lat) || !isFiniteCoord(lon)) return null;

  try {
    const res = await fetchWithTimeout(
      apiUrl(`/api/astro/inspect?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}&hour=0`),
      16000
    );
    if (!res.ok) return null;
    const data = await res.json();
    await AsyncStorage.setItem(keyFor(lat, lon), JSON.stringify({ savedAt: Date.now(), data }));
    return data;
  } catch {
    return null;
  }
}

export async function writeSkyScoreWidgetCache(forecast: LocationAstroForecast) {
  if (!isFiniteCoord(forecast.lat) || !isFiniteCoord(forecast.lon)) return;

  const hour = bestCloudHour(forecast);
  const widget = {
    score: forecast.peakScore,
    label: forecast.peakLabel,
    bestWindow: formatWindow(forecast.bestStartTime, forecast.bestEndTime, forecast.timezone),
    bortle: formatBortle(forecast),
    cloudLow: pct(hour?.cloudLow),
    cloudMid: pct(hour?.cloudMid),
    cloudHigh: pct(hour?.cloudHigh),
    clouds: `Low ${pct(hour?.cloudLow)} / Mid ${pct(hour?.cloudMid)} / High ${pct(hour?.cloudHigh)}`,
    footer: `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
  };

  await AsyncStorage.setItem(
    keyFor(forecast.lat, forecast.lon),
    JSON.stringify({ savedAt: Date.now(), widget })
  );
}
