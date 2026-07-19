// app/lib/nautical/api.ts


import type { NauticalStation } from './stations';
import type {
  MarineConditions,
  NauticalSummary,
  TidePrediction,
} from './types';
import { apiUrl } from '../net/apiBase';

const MS_TO_KTS = 1.94384;

// --- 1. TIDES --------------------------------------------------------------

const NOAA_TIDES_BASE =
  'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

async function fetchTidePredictions(
  station: NauticalStation,
): Promise<{
  stationName: string;
  predictions: TidePrediction[];
  latitude?: number;
  longitude?: number;
}> {
  // Real station id (NOAA tide station) – we keep station.id as that
  const stationId = station.id;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${yyyy}${mm}${dd}`;

  try {
    const params = new URLSearchParams({
      station: stationId,
      product: 'predictions',
      datum: 'MLLW',
      interval: 'hilo',
      time_zone: 'lst_ldt',
      units: 'english',
      format: 'json',
      begin_date: today,
      end_date: today,
    });

    const res = await fetch(`${NOAA_TIDES_BASE}?${params.toString()}`);

    if (!res.ok) throw new Error('NOAA tides not ok');

    const json = await res.json();
    const rawPreds = Array.isArray(json.predictions)
      ? json.predictions
      : [];

    const predictions: TidePrediction[] = rawPreds.map((p: any) => ({
      time: new Date(p.t).toISOString(),
      type: p.type === 'H' ? 'H' : 'L',
      height: parseFloat(p.v),
    }));

    return {
      stationName: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      predictions,
    };
  } catch {
    // Keep the tide card usable for stations without NOAA predictions or during provider outages.
    const baseDate = new Date(yyyy, now.getMonth(), now.getDate());
    const makeTime = (hours: number) =>
      new Date(baseDate.getTime() + hours * 60 * 60 * 1000).toISOString();

    return {
      stationName: station.name + ' (mock tides)',
      latitude: station.latitude,
      longitude: station.longitude,
      predictions: [
        { time: makeTime(2), type: 'H', height: 4.3 },
        { time: makeTime(8), type: 'L', height: 0.7 },
        { time: makeTime(14), type: 'H', height: 4.1 },
        { time: makeTime(20), type: 'L', height: 0.5 },
      ],
    };
  }
}


// --- 2. MARINE CONDITIONS (waves + SST, maybe wind) ------------------------

async function fetchMarineConditions(
  latitude: number,
  longitude: number,
): Promise<MarineConditions | null> {
  try {
    const res = await fetch(apiUrl(`/api/marine/conditions?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`));
    if (res.ok) {
      const json = await res.json();
      if (json?.conditions) return json.conditions as MarineConditions;
    }
  } catch {
    // Keep nautical summaries on the worker-controlled path; wind-only fallback
    // is handled later through the worker-backed current endpoint.
    return null;
  }

  return null;
}

// --- 2b. FALLBACK WIND FROM GLOBAL MODEL -----------------------------------

type WindFallback = {
  windSpeedKts: number | null;
  windGustKts: number | null;
  windDirectionDeg: number | null;
  observedAt: string | null;
  source: string;
};

async function fetchFallbackWindConditions(
  latitude: number,
  longitude: number,
): Promise<WindFallback | null> {
  try {
    const url = apiUrl(
      `/api/current?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&units=metric`,
    );
    const res = await fetch(url);

    if (!res.ok) return null;

    const json = await res.json();
    const toKts = (valueKph: unknown): number | null => {
      const value = typeof valueKph === 'number' ? valueKph : null;
      return value != null ? value / 1.852 : null;
    };

    return {
      windSpeedKts: toKts(json?.wind),
      windGustKts: toKts(json?.windGust),
      windDirectionDeg:
        typeof json?.windDir === 'number' ? json.windDir : null,
      observedAt: typeof json?.time === 'string' ? json.time : null,
      source: 'Worker current proxy',
    };
  } catch {
    return null;
  }
}

// --- 3. COMBINED SUMMARY ---------------------------------------------------

export async function fetchNauticalSummary(
  station: NauticalStation,
): Promise<NauticalSummary> {

  const stationId = station.id;
  // Do not invent marine conditions when the selected station has no coordinates.
  const hasCoords =
    typeof station.latitude === 'number' &&
    Number.isFinite(station.latitude) &&
    typeof station.longitude === 'number' &&
    Number.isFinite(station.longitude);

  const lat = hasCoords ? (station.latitude as number) : null;
  const lon = hasCoords ? (station.longitude as number) : null;

  const tidePromise = fetchTidePredictions(station);
  const marinePromise = hasCoords && lat != null && lon != null
    ? fetchMarineConditions(lat, lon)
    : Promise.resolve(null);

  const [tides, marineConditionsRaw] = await Promise.all([
    tidePromise,
    marinePromise,
  ]);

  let conditions = marineConditionsRaw ?? null;

  // If we don't have wind from marine endpoint, try global forecast as fallback (only if coords exist)
  if (hasCoords && ( !conditions || conditions.windSpeedKts == null)) {
    const fallbackWind = await fetchFallbackWindConditions(
      (tides.latitude ?? lat)!,
      (tides.longitude ?? lon)!,
    );

    if (fallbackWind) {
      if (!conditions) {
        conditions = {
          significantWaveHeightM: null,
          primarySwellHeightM: null,
          primarySwellPeriodS: null,
          primarySwellDirectionDeg: null,

          windSpeedKts: fallbackWind.windSpeedKts,
          windGustKts: fallbackWind.windGustKts,
          windDirectionDeg: fallbackWind.windDirectionDeg,

          seaSurfaceTempC: null,
          visibilityNm: null,
          pressureHpa: null,

          observedAt: fallbackWind.observedAt,
          modelSource: fallbackWind.source,
        };
      } else {
        if (conditions.windSpeedKts == null) conditions.windSpeedKts = fallbackWind.windSpeedKts;
        if (conditions.windGustKts == null) conditions.windGustKts = fallbackWind.windGustKts;
        if (conditions.windDirectionDeg == null) conditions.windDirectionDeg = fallbackWind.windDirectionDeg;
        if (!conditions.observedAt) conditions.observedAt = fallbackWind.observedAt;

        conditions.modelSource =
          conditions.modelSource && conditions.modelSource !== fallbackWind.source
            ? `${conditions.modelSource} + ${fallbackWind.source}`
            : fallbackWind.source;
      }
    }
  }

  return {
    stationId,
    stationName: tides.stationName,
    latitude: tides.latitude ?? (lat ?? undefined),
    longitude: tides.longitude ?? (lon ?? undefined),
    predictions: tides.predictions ?? [],
    conditions,
    generatedAt: new Date().toISOString(),
  };
}
