export type SeriesKey =
  | 'temp'
  | 'feels'
  | 'pop'
  | 'humidity'
  | 'dew'
  | 'wind'
  | 'gust'
  | 'dir'
  | 'clouds'
  | 'shortwave'
  | 'uv'
  | 'pressure'
  | 'tendency';

export const SERIES_COLOR: Record<SeriesKey, string> = {
  temp: '#F59E0B',       // amber
  feels: '#F97316',      // orange
  pop: '#38BDF8',        // water blue
  humidity: '#60A5FA',   // blue
  dew: '#A78BFA',        // violet
  wind: '#7DD3FC',       // cool blue
  gust: '#FB7185',       // rose
  dir: '#94A3B8',        // slate
  clouds: '#CBD5E1',     // light slate
  shortwave: '#FCD34D',  // sun
  uv: '#FDE047',         // bright sun
  pressure: '#E5E7EB',   // neutral
  tendency: '#93C5FD',   // pale blue
};
