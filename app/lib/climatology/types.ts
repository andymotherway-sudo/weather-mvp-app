// app/lib/climatology/types.ts

export type UnitSystem = 'us' | 'metric';

export type StationCandidate = {
  id: string; // CDO station id (e.g., "GHCND:USC00022782")
  name?: string;
  latitude?: number;
  longitude?: number;
  elevation?: number;
};

export type MonthlyNormalsF = {
  month: number; // 1-12
  tavgF: number | null;
  tminF: number | null;
  tmaxF: number | null;
};

export type LastYearSeries = {
  /**
   * Daily arrays (length 365 ideally). If missing or wrong length, UI will ignore.
   * Values are °F.
   */
  tminF?: number[];
  tmaxF?: number[];
  precipDailyIn?: Array<number | null>;
  precipMonthlyIn?: Array<number | null>;
};

export type ClimatologyResult = {
  station: StationCandidate;
  normals: MonthlyNormalsF[];
  source: 'noaa_cdo_normal_mly' | 'open_meteo_archive_normals';

  // metadata
  fetchedAtIso: string;
  diagnostics?: {
    baselineStartYear?: number;
    baselineEndYear?: number;
    fallbackFrom?: string;
    fallbackReason?: string | null;
  };

  /**
   * Optional monthly precip normals (inches), 12 entries month=1..12.
   * Used for the “precip mountain”.
   */
  precipMonthlyIn?: Array<number | null>;

  /**
   * Optional last-year daily series overlay.
   * Used for comparing “last year range” vs normals.
   */
  lastYear?: LastYearSeries;
};

export type ClimoErrorCode =
  | 'NO_TOKEN'
  | 'STATION_NOT_FOUND'
  | 'NO_DATA'
  | 'NO_NORMALS'
  | 'NETWORK'
  | 'UNKNOWN';

export class ClimoError extends Error {
  code: ClimoErrorCode;
  details?: any;

  constructor(code: ClimoErrorCode, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
