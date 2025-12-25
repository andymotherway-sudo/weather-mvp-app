// app/lib/weather/locations.ts

export type LocationConfig = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
};

export const BROOKINGS_OR: LocationConfig = {
  id: 'brookings-or',
  name: 'Brookings, OR',
  region: 'OR',
  lat: 42.0526,
  lon: -124.2836,
};

// Single source of truth for the app's default land location
export const DEFAULT_LOCATION: LocationConfig = BROOKINGS_OR;
