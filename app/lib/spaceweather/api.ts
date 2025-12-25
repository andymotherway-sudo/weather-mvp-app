// app/lib/spaceweather/api.ts

import type { SolarWindSample, SpaceWeatherSummary } from './types';

// --- NOAA endpoints ---

// Primary: very fresh data
const PLASMA_PRIMARY =
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json';

// Fallbacks: coarser time resolution but more robust
const PLASMA_FALLBACKS: string[] = [
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-2-hour.json',
  'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',
];

const KP_PRIMARY =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

const KP_FALLBACK_FORECAST =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json';

// ---------- Shared helpers ----------

async function fetchJsonArray(url: string, label: string): Promise<any[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${label} request failed: ${res.status}`);
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error(`${label} response was empty or malformed`);
  }

  return json;
}

// ---------- Plasma with fallbacks + history ----------

type PlasmaData = {
  speed: number;
  density: number;
  temperature: number;
  time: string;
  history: SolarWindSample[];
};

async function loadPlasmaWithFallbacks(): Promise<PlasmaData> {
  const urls = [PLASMA_PRIMARY, ...PLASMA_FALLBACKS];
  let lastError: unknown;

  for (const url of urls) {
    try {
      const table = await fetchJsonArray(url, 'Plasma');
      // NOAA format: [ ["time_tag","density","speed","temperature"], ...rows ]
      const rows = table.slice(1); // skip header
      if (!rows.length) throw new Error('Plasma response had no data rows');

      const lastRow = rows[rows.length - 1] as [string, string, string, string];
      const [timeRaw, densityStr, speedStr, tempStr] = lastRow;

      const density = parseFloat(densityStr);
      const speed = parseFloat(speedStr);
      const temperature = parseFloat(tempStr);

      if (
        [density, speed, temperature].some((v) => Number.isNaN(v)) ||
        !timeRaw
      ) {
        throw new Error('Plasma row contained invalid numbers');
      }

      // Build a tiny history from the last ~12 samples
      const sliceCount = Math.min(rows.length, 12);
      const historyRows = rows.slice(rows.length - sliceCount);
      const history: SolarWindSample[] = historyRows
        .map((r: any) => {
          const t = String(r[0]); // time_tag
          const s = parseFloat(String(r[2])); // speed
          if (Number.isNaN(s)) return null;
          const iso = new Date(t.replace(' ', 'T') + 'Z').toISOString();
          return { time: iso, speed: s };
        })
        .filter(Boolean) as SolarWindSample[];

      // Fallback if something went wrong
      if (!history.length) {
        history.push({
          time: new Date().toISOString(),
          speed,
        });
      }

      return {
        speed,
        density,
        temperature,
        time: timeRaw,
        history,
      };
    } catch (err) {
      // Try the next URL
      lastError = err;
      console.warn('[spaceweather] plasma source failed', url, err);
    }
  }

  throw lastError ?? new Error('All plasma sources failed');
}

// ---------- Kp with fallbacks ----------

type KpSample = {
  kp: number;
  time: string;
};

async function loadKpWithFallbacks(): Promise<KpSample> {
  // 1) Observed Kp
  try {
    const table = await fetchJsonArray(KP_PRIMARY, 'Kp (observed)');
    const rows = table.slice(1);
    if (!rows.length) throw new Error('No Kp rows in observed feed');

    const lastRow = rows[rows.length - 1] as [string, string, string, string];
    const [time, kpStr] = lastRow;
    const kp = parseFloat(kpStr);

    if (Number.isNaN(kp) || !time) {
      throw new Error('Kp row contained invalid numbers');
    }

    return { kp, time };
  } catch (err) {
    console.warn('[spaceweather] primary Kp source failed', err);
  }

  // 2) Forecast Kp (observed/estimated if possible)
  try {
    const table = await fetchJsonArray(KP_FALLBACK_FORECAST, 'Kp (forecast)');
    const rows = table.slice(1) as [string, string, string, unknown][];

    const preferred = rows.filter(
      (row) => row[2] === 'observed' || row[2] === 'estimated'
    );
    const effectiveRows = preferred.length ? preferred : rows;
    if (!effectiveRows.length) throw new Error('No Kp rows in forecast feed');

    const lastRow = effectiveRows[effectiveRows.length - 1];
    const [time, kpStr] = lastRow;
    const kp = parseFloat(kpStr);

    if (Number.isNaN(kp) || !time) {
      throw new Error('Kp forecast row contained invalid numbers');
    }

    return { kp, time };
  } catch (err) {
    console.warn('[spaceweather] forecast Kp source failed', err);
  }

  throw new Error('All Kp sources failed');
}

// ---------- Public API ----------

export async function fetchSpaceWeatherSummary(): Promise<SpaceWeatherSummary> {
  const [plasma, kp] = await Promise.all([
    loadPlasmaWithFallbacks(),
    loadKpWithFallbacks(),
  ]);

  const plasmaTime = new Date(plasma.time);
  const kpTime = new Date(kp.time);
  const newest =
    !Number.isNaN(plasmaTime.getTime()) && plasmaTime > kpTime
      ? plasma.time
      : kp.time;

  return {
    solarWindSpeed: plasma.speed,
    solarWindDensity: plasma.density,
    solarWindTemp: plasma.temperature,
    kp: kp.kp,
    updatedAt: newest,
    windHistory: plasma.history,
  };
}
