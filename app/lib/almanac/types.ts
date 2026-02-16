// app/lib/almanac/types.ts

/**
 * Almanac daily record bucket keyed by MM-DD (e.g., "02-09").
 * Values are derived from NOAA GHCND (record station) and converted to:
 * - Temperatures: °F
 * - Precip/Snow: inches
 */
export type AlmanacDailyRecord = {
  mmdd: string; // "MM-DD"

  // Daily record highs/lows
  recordHighF: number | null;
  recordHighYears: number[];

  recordLowF: number | null;
  recordLowYears: number[];

  // Daily precip record
  recordPrecipIn: number | null;
  recordPrecipYears: number[];

  // Optional “secondary” records your UI/cards may show:
  // - Highest daily minimum temp (warmest night)
  recordHighMinF: number | null;
  recordHighMinYears: number[];

  // - Lowest daily maximum temp (coldest day)
  recordLowMaxF: number | null;
  recordLowMaxYears: number[];

  // Snowfall (only if/when you implement it; kept for schema stability)
  recordSnowIn: number | null;
  recordSnowYears: number[];
};

/** Convenience map type (MM-DD -> record) */
export type AlmanacRecordsMap = Record<string, AlmanacDailyRecord>;