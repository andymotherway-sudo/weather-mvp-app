export type TemperatureUnit = 'F' | 'C';

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function fahrenheitToCelsius(value: number | null | undefined): number | null {
  return finite(value) ? (value - 32) * (5 / 9) : null;
}

export function mphToKph(value: number | null | undefined): number | null {
  return finite(value) ? value * 1.609344 : null;
}

export function displayTemperature(valueF: number | null | undefined, unit: TemperatureUnit): string {
  const value = unit === 'C' ? fahrenheitToCelsius(valueF) : valueF;
  return finite(value) ? `${Math.round(value)}°` : '—';
}

export function displayWind(valueMph: number | null | undefined, unit: TemperatureUnit): string {
  const value = unit === 'C' ? mphToKph(valueMph) : valueMph;
  return finite(value) ? `${Math.round(value)} ${unit === 'C' ? 'km/h' : 'mph'}` : '—';
}
