export type ForecastNuanceIcon = 'git-branch-outline' | 'thunderstorm-outline';

export type ForecastNuance = {
  title: string;
  body: string;
  meta: string;
  icon: ForecastNuanceIcon;
};

type ForecastHour = Record<string, unknown>;

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;
}

function hourValue(hour: ForecastHour, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = numberValue(hour[key]);
    if (value != null) return value;
  }
  return null;
}

function windShiftDegrees(first: number | null, later: number | null): number | null {
  if (first == null || later == null) return null;
  const difference = Math.abs((((later - first) % 360) + 540) % 360 - 180);
  return Number.isFinite(difference) ? difference : null;
}

function startHourLabel(value: unknown, timeZone?: string | null): string {
  if (typeof value !== 'string') return 'Next few hours';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Next few hours';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    timeZone: timeZone || undefined,
  }).format(date);
}

// Interpret short-range changes without overstating a point precipitation forecast.
export function buildForecastNuance(hours: ForecastHour[], timeZone?: string | null): ForecastNuance | null {
  const window = hours.slice(0, 8);
  if (window.length < 3) return null;

  const values = (...fields: string[]) => window
    .map((hour) => hourValue(hour, ...fields))
    .filter((value): value is number => value != null);
  const temps = values('temperatureF', 'tempF', 'temperature_2m');
  const precip = values('precipChancePct', 'precipProbPct', 'precipitation_probability');
  const winds = values('windMph', 'windSpeedMph', 'wind_speed_10m');
  const gusts = values('windGustMph', 'gustMph', 'windGustsMph', 'wind_gusts_10m');
  const codes = values('weatherCode');
  const first = window[0];
  const later = window[Math.min(window.length - 1, 5)];
  const firstTemp = hourValue(first, 'temperatureF', 'tempF', 'temperature_2m');
  const laterTemp = hourValue(later, 'temperatureF', 'tempF', 'temperature_2m');
  const tempDrop = firstTemp != null && laterTemp != null ? firstTemp - laterTemp : null;
  const firstWind = hourValue(first, 'windMph', 'windSpeedMph', 'wind_speed_10m');
  const maxWind = winds.length ? Math.max(...winds) : null;
  const maxGust = gusts.length ? Math.max(...gusts) : null;
  const windIncrease = firstWind != null && maxWind != null ? maxWind - firstWind : null;
  const directionShift = windShiftDegrees(
    hourValue(first, 'windDirDeg', 'windDirectionDeg', 'wind_direction_10m'),
    hourValue(later, 'windDirDeg', 'windDirectionDeg', 'wind_direction_10m'),
  );
  const maxPrecip = precip.length ? Math.max(...precip) : null;
  const minTemp = temps.length ? Math.min(...temps) : null;
  const hasConvectiveCode = codes.some((code) => [80, 81, 82, 95, 96, 99].includes(code));
  const start = startHourLabel(first.time, timeZone);
  const outflowSignal =
    (tempDrop != null && tempDrop >= 8) ||
    (windIncrease != null && windIncrease >= 8) ||
    (maxGust != null && maxGust >= 20) ||
    (directionShift != null && directionShift >= 70);

  if (!outflowSignal && !hasConvectiveCode) return null;

  if ((maxPrecip ?? 0) <= 25 && outflowSignal) {
    const signals = [
      tempDrop != null && tempDrop >= 8 ? `temps may fall about ${Math.round(tempDrop)} degrees` : null,
      maxGust != null && maxGust >= 20 ? `gusts may reach ${Math.round(maxGust)} mph` : null,
      directionShift != null && directionShift >= 70 ? `winds may shift ${Math.round(directionShift)} degrees` : null,
    ].filter((value): value is string => value != null);
    const signalText = signals.length
      ? `${signals.join(', ').replace(/^./, (character) => character.toUpperCase())}.`
      : 'The short-range pattern is changing quickly.';

    return {
      title: 'Low rain chance, active nearby pattern',
      body: `${signalText} Direct rain odds stay near ${Math.round(maxPrecip ?? 0)}%, so this looks more like outflow or nearby-storm influence than a guaranteed hit.`,
      meta: `${start} forward - ${minTemp != null ? `low near ${Math.round(minTemp)} degrees` : 'watch local changes'}`,
      icon: 'git-branch-outline',
    };
  }

  if (hasConvectiveCode) {
    return {
      title: 'Storms are possible, but timing is conditional',
      body: `The hourly model flags convective weather nearby while point rain odds peak near ${Math.round(maxPrecip ?? 0)}%. Watch radar and wind shifts for whether storms reach your spot.`,
      meta: `${start} forward - isolated storm setup`,
      icon: 'thunderstorm-outline',
    };
  }

  return null;
}
