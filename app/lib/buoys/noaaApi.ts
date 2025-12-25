import type { BuoyDetailData } from './noaaTypes';

const NOAA_LATEST_URL =
  'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';

// helper: parse NDBC numeric fields like "MM", "99.0" → undefined
function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'MM') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

// NDBC latest_obs units: WSPD, GST are in m/s → convert to knots
function msToKnots(v: number | undefined): number | undefined {
  return v == null ? undefined : v * 1.94384;
}

/**
 * Parse a single line from latest_obs.txt into BuoyDetailData.
 * Format (columns, space separated):
 *
 * STN LAT LON YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES PTDY ATMP WTMP DEWP VIS TIDE
 */
function parseLatestObsLine(line: string): BuoyDetailData | null {
  const parts = line.trim().split(/\s+/);
  if (!parts[0] || parts[0].startsWith('#')) return null;
  if (parts.length < 21) return null;

  const [
    id,
    latStr,
    lonStr,
    yyyyStr,
    mmStr,
    ddStr,
    hhStr,
    minStr,
    wdirStr,
    wspdStr,
    gstStr,
    wvhtStr,
    dpdStr,
    _apdStr,
    _mwdStr,
    presStr,
    _ptdyStr,
    atmpStr,
    wtmpStr,
    _dewpStr,
    visStr,
    _tideStr,
  ] = parts;

  const year = Number(yyyyStr);
  const month = Number(mmStr);
  const day = Number(ddStr);
  const hour = Number(hhStr);
  const minute = Number(minStr);

  const observedAt =
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day)
      ? new Date(Date.UTC(year, month - 1, day, hour, minute)).toISOString()
      : undefined;

  const windSpeedMs = parseNumber(wspdStr);
  const windGustMs = parseNumber(gstStr);

  const waveHeightM = parseNumber(wvhtStr);
  const dominantPeriodSec = parseNumber(dpdStr);
  const pressureHpa = parseNumber(presStr);
  const airTempC = parseNumber(atmpStr);
  const waterTempC = parseNumber(wtmpStr);
  const visibilityNm = parseNumber(visStr);

  const lat = Number(latStr);
  const lon = Number(lonStr);

  return {
    id,
    name: id,
    lat,
    lon,
    updatedAt: observedAt,

    windDirectionDeg: parseNumber(wdirStr),
    windSpeedKts: msToKnots(windSpeedMs),
    windGustKts: msToKnots(windGustMs),

    waveHeightM,
    dominantPeriodSec,
    swellHeightM: undefined,
    swellPeriodSec: undefined,

    airTempC,
    waterTempC,
    visibilityNm,
    pressureHpa,
  };
}

/**
 * Fetch the full latest_obs.txt feed and parse it.
 */
export async function fetchAllLatestBuoys(): Promise<BuoyDetailData[]> {
  const res = await fetch(NOAA_LATEST_URL);
  if (!res.ok) {
    throw new Error(`NOAA request failed with status ${res.status}`);
  }

  const text = await res.text();
  const lines = text.split('\n');

  const out: BuoyDetailData[] = [];
  for (const line of lines) {
    const parsed = parseLatestObsLine(line);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Fetch latest observation for a single buoy by station ID (e.g. "46050").
 */
export async function fetchBuoyDetail(
  stationId: string,
): Promise<BuoyDetailData | null> {
  const all = await fetchAllLatestBuoys();

  const match = all.find(
    (b) => b.id.toUpperCase() === stationId.toUpperCase(),
  );

  return match ?? null;
}
