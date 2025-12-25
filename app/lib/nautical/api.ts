// app/lib/nautical/api.ts

import { DEFAULT_LOCATION } from '../../lib/weather/locations';
import type { NauticalStation } from './stations';
import type {
    MarineConditions,
    NauticalSummary,
    TidePrediction,
} from './types';

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
      interval: 'hilo',        // high/low tides
      time_zone: 'lst_ldt',    // local standard / daylight
      units: 'english',
      format: 'json',
      begin_date: today,
      end_date: today,
    });

    const res = await fetch(`${NOAA_TIDES_BASE}?${params.toString()}`);

    if (!res.ok) {
      console.warn('NOAA tides response not ok', res.status);
      throw new Error('NOAA tides not ok');
    }

    const json = await res.json();
    const rawPreds = Array.isArray(json.predictions)
      ? json.predictions
      : [];

    const predictions: TidePrediction[] = rawPreds.map((p: any) => ({
      time: new Date(p.t).toISOString(),        // p.t is local time string
      type: p.type === 'H' ? 'H' : 'L',         // H / L
      height: parseFloat(p.v),                  // height in feet (already english)
    }));

    return {
      stationName: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
      predictions,
    };
  } catch (err) {
    console.error('Error fetching real tide predictions, using fallback', err);

    // 🔁 Fallback to your old mock so the UI never breaks
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
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: [
        'wave_height',
        'wave_direction',
        'wave_period',
        'sea_surface_temperature',
        'wind_speed_10m',
        'wind_gusts_10m',
        'wind_direction_10m',
      ].join(','),
      length: '1',
      timezone: 'auto',
    });

    const url = `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn('Marine API response not ok', res.status);
      return null;
    }

    const json = await res.json();
    const hourly = json.hourly;
    if (!hourly || !hourly.time || hourly.time.length === 0) {
      return null;
    }

    const idx = hourly.time.length - 1;

    const get = (arr: any[] | undefined): number | null => {
      if (!arr || arr.length === 0) return null;
      const value = arr[idx];
      return typeof value === 'number' ? value : null;
    };

    const waveHeightM = get(hourly.wave_height);
    const swellPeriodS = get(hourly.wave_period);
    const swellDirDeg = get(hourly.wave_direction);

    const windSpeedMs = get(hourly.wind_speed_10m);
    const windGustMs = get(hourly.wind_gusts_10m);
    const windDirDeg = get(hourly.wind_direction_10m);

    const seaTempC = get(hourly.sea_surface_temperature);

    const observedAt =
      typeof hourly.time[idx] === 'string' ? hourly.time[idx] : null;

    const conditions: MarineConditions = {
      significantWaveHeightM: waveHeightM,
      primarySwellHeightM: waveHeightM,
      primarySwellPeriodS: swellPeriodS,
      primarySwellDirectionDeg: swellDirDeg,

      windSpeedKts:
        windSpeedMs != null ? windSpeedMs * MS_TO_KTS : null,
      windGustKts:
        windGustMs != null ? windGustMs * MS_TO_KTS : null,
      windDirectionDeg: windDirDeg,

      seaSurfaceTempC: seaTempC,
      visibilityNm: null,
      pressureHpa: null,

      observedAt,
      modelSource: 'Open-Meteo Marine',
    };

    return conditions;
  } catch (err) {
    console.error('Error fetching marine conditions', err);
    return null;
  }
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
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      hourly: [
        'wind_speed_10m',
        'wind_gusts_10m',
        'wind_direction_10m',
      ].join(','),
      length: '1',
      timezone: 'auto',
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.warn('Fallback wind API response not ok', res.status);
      return null;
    }

    const json = await res.json();
    const hourly = json.hourly;
    if (!hourly || !hourly.time || hourly.time.length === 0) {
      return null;
    }

    const idx = hourly.time.length - 1;

    const get = (arr: any[] | undefined): number | null => {
      if (!arr || arr.length === 0) return null;
      const value = arr[idx];
      return typeof value === 'number' ? value : null;
    };

    const windSpeedMs = get(hourly.wind_speed_10m);
    const windGustMs = get(hourly.wind_gusts_10m);
    const windDirDeg = get(hourly.wind_direction_10m);

    const observedAt =
      typeof hourly.time[idx] === 'string' ? hourly.time[idx] : null;

    return {
      windSpeedKts:
        windSpeedMs != null ? windSpeedMs * MS_TO_KTS : null,
      windGustKts:
        windGustMs != null ? windGustMs * MS_TO_KTS : null,
      windDirectionDeg: windDirDeg,
      observedAt,
      source: 'Open-Meteo Forecast',
    };
  } catch (err) {
    console.error('Error fetching fallback wind conditions', err);
    return null;
  }
}

// --- 3. COMBINED SUMMARY ---------------------------------------------------

export async function fetchNauticalSummary(
  station: NauticalStation,
): Promise<NauticalSummary> {

  const stationId = station.id;
  const fallbackLat = station.latitude ?? DEFAULT_LOCATION.lat;
  const fallbackLon = station.longitude ?? DEFAULT_LOCATION.lon;

  const tidePromise = fetchTidePredictions(station);
  const marinePromise = fetchMarineConditions(fallbackLat, fallbackLon);

  const [tides, marineConditionsRaw] = await Promise.all([
    tidePromise,
    marinePromise,
  ]);

  let conditions = marineConditionsRaw ?? null;

  // If we don't have wind from marine endpoint, try global forecast as fallback
  if (!conditions || conditions.windSpeedKts == null) {
    const fallbackWind = await fetchFallbackWindConditions(
      tides.latitude ?? fallbackLat,
      tides.longitude ?? fallbackLon,
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
        if (conditions.windSpeedKts == null) {
          conditions.windSpeedKts = fallbackWind.windSpeedKts;
        }
        if (conditions.windGustKts == null) {
          conditions.windGustKts = fallbackWind.windGustKts;
        }
        if (conditions.windDirectionDeg == null) {
          conditions.windDirectionDeg = fallbackWind.windDirectionDeg;
        }
        if (!conditions.observedAt) {
          conditions.observedAt = fallbackWind.observedAt;
        }
        conditions.modelSource =
          conditions.modelSource &&
          conditions.modelSource !== fallbackWind.source
            ? `${conditions.modelSource} + ${fallbackWind.source}`
            : fallbackWind.source;
      }
    }
  }

  return {
    stationId,
    stationName: tides.stationName,
    latitude: tides.latitude ?? fallbackLat,
    longitude: tides.longitude ?? fallbackLon,
    predictions: tides.predictions ?? [],
    conditions,
    generatedAt: new Date().toISOString(),
  };
}
