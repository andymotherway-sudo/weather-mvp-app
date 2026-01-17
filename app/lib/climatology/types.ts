// app/lib/climatology/types.ts

export type UnitSystem = 'us' | 'metric';

export type StationCandidate = {
  id: string; // CDO station id (e.g., "GHCND:USW00023183")
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

export type ClimatologyResult = {
  station: StationCandidate;
  normals: MonthlyNormalsF[];
  source: 'noaa_cdo_normal_mly';
  // optional metadata
  fetchedAtIso: string;
};

export type ClimoErrorCode =
  | 'NO_TOKEN'
  | 'STATION_NOT_FOUND'
  | 'NO_DATA'
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
