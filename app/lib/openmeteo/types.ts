// app/lib/openmeteo/types.ts

// Response shape from Open-Meteo daily forecast
// We're only using a few daily fields for now.
export type OpenMeteoForecastResponse = {
  latitude: number;
  longitude: number;
  timezone: string;
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
};

export type OpenMeteoDaily = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipProb: number | null;
};

export type OpenMeteoForecast = {
  provider: 'open-meteo';
  timezone: string;
  daily: OpenMeteoDaily[];
};
