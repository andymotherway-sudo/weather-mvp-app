// app/lib/nautical/types.ts

export type TideType = 'H' | 'L';

export interface TidePrediction {
  /** ISO timestamp of the tide event */
  time: string;
  /** H = high, L = low */
  type: TideType;
  /** Height in feet (relative to MLLW) */
  height: number;
}

/**
 * Detailed marine conditions a mariner cares about.
 * All fields are nullable so we can safely populate them gradually.
 */
export interface MarineConditions {
  /** Significant wave height in meters */
  significantWaveHeightM: number | null;
  /** Primary swell height in meters */
  primarySwellHeightM: number | null;
  /** Primary swell period in seconds */
  primarySwellPeriodS: number | null;
  /** Primary swell direction in degrees (0–360, meteorological) */
  primarySwellDirectionDeg: number | null;

  /** Surface wind speed in knots */
  windSpeedKts: number | null;
  /** Surface wind gust in knots */
  windGustKts: number | null;
  /** Surface wind direction in degrees (0–360) */
  windDirectionDeg: number | null;

  /** Sea surface temperature in °C */
  seaSurfaceTempC: number | null;
  /** Horizontal visibility in nautical miles (if available) */
  visibilityNm: number | null;
  /** Sea-level pressure in hPa / mb */
  pressureHpa: number | null;

  /** When these conditions were observed/valid (ISO timestamp) */
  observedAt: string | null;
  /** Short label for where this came from, e.g. "NDBC", "WW3", "GFS marine" */
  modelSource: string | null;
}

export interface NauticalSummary {
  /** NOAA / WMO / local station identifier, e.g. "9414290" */
  stationId: string;
  /** Human-readable station name, e.g. "Newport, Yaquina Bay" */
  stationName: string;

  /** Optional station coordinates for mapping / model lookups */
  latitude?: number;
  longitude?: number;

  /** High / Low tides for today (can be empty if none available) */
  predictions: TidePrediction[];

  /**
   * Optional detailed marine conditions (waves, wind, SST, etc.).
   * May be null if we couldn't load model data for this station.
   */
  conditions: MarineConditions | null;

  /** When we generated this summary (ISO timestamp) */
  generatedAt: string;
}
