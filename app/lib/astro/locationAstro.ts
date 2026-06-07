import { useEffect, useMemo, useRef, useState } from 'react';

import type { AstroInputs } from './openMeteoAstro';
import { computeSkyScorePoint, skyScoreLabel, skyScoreSummary } from './skyScore';

const OMNIWX_API_BASE =
  (process.env.EXPO_PUBLIC_OMNIWX_API_BASE ?? '').replace(/\/$/, '') ||
  'https://omniwx-api.omniwx.workers.dev';

function parseLocalDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseWallClockParts(value?: string | null) {
  if (!value || typeof value !== 'string') return null;

  const s = value.trim();
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] ?? '0'),
  };
}

function wallClockToSortableMs(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
}) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
    0
  );
}

function hasExplicitTimezone(value?: string | null) {
  return typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim());
}

function formatWallTime(hour: number, minute: number, options?: { shortHour?: boolean }) {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  if (options?.shortHour) return `${h12} ${suffix}`;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function toLocalLabel(iso?: string | null, timeZone?: string | null) {
  const wall = parseWallClockParts(iso);
  if (wall && !hasExplicitTimezone(iso)) {
    return formatWallTime(wall.hour, wall.minute);
  }

  const d = parseLocalDate(iso);
  if (!d) return '—';
  try {
    return d.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || undefined,
    });
  } catch {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

function toShortHourLabel(iso?: string | null, timeZone?: string | null) {
  const wall = parseWallClockParts(iso);
  if (wall && !hasExplicitTimezone(iso)) {
    return formatWallTime(wall.hour, wall.minute, { shortHour: true });
  }

  const d = parseLocalDate(iso);
  if (!d) return '—';
  try {
    return d.toLocaleTimeString([], { hour: 'numeric', timeZone: timeZone || undefined });
  } catch {
    return d.toLocaleTimeString([], { hour: 'numeric' });
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function moonIsUpAt(
  hourIso: string,
  moonriseIso?: string | null,
  moonsetIso?: string | null
) {
  const t = parseLocalDate(hourIso);
  if (!t) return false;

  const rise = parseLocalDate(moonriseIso);
  const set = parseLocalDate(moonsetIso);

  if (!rise && !set) return false;
  if (rise && !set) return t >= rise;
  if (!rise && set) return t <= set;
  if (!rise || !set) return false;

  if (rise <= set) {
    return t >= rise && t <= set;
  }

  return t >= rise || t <= set;
}

function errorToMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || String(error);
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as any).message === 'string'
  ) {
    return (error as any).message;
  }
  try {
    const s = JSON.stringify(error);
    return s === '{}' ? 'Unknown astro error object' : s;
  } catch {
    return 'Unknown astro error';
  }
}

function isBetween(
  timeIso: string,
  startIso?: string | null,
  endIso?: string | null
) {
  const tWall = parseWallClockParts(timeIso);
  const sWall = parseWallClockParts(startIso);
  const eWall = parseWallClockParts(endIso);

  if (tWall && sWall && eWall) {
    const t = wallClockToSortableMs(tWall);
    const s = wallClockToSortableMs(sWall);
    const e = wallClockToSortableMs(eWall);
    return t >= s && t <= e;
  }

  const t = parseLocalDate(timeIso);
  const s = parseLocalDate(startIso);
  const e = parseLocalDate(endIso);

  if (!t || !s || !e) return false;
  return t >= s && t <= e;
}

function darknessScoreForHour(args: {
  isTrueDark: boolean;
  isAstronomicalTwilight: boolean;
  isNauticalTwilight: boolean;
  isCivilTwilight: boolean;
  isNight: boolean;
}) {
  if (args.isTrueDark) return 1.0;
  if (args.isAstronomicalTwilight) return 0.78;
  if (args.isNauticalTwilight) return 0.52;
  if (args.isCivilTwilight) return 0.28;
  if (args.isNight) return 0.85;
  return 0.18;
}

function addHoursLocalIso(iso?: string | null, hours = 1) {
  const d = parseLocalDate(iso);
  if (!d) return undefined;

  const next = new Date(d);
  next.setHours(next.getHours() + hours);

  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  const hh = String(next.getHours()).padStart(2, '0');
  const mi = String(next.getMinutes()).padStart(2, '0');
  const ss = String(next.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}`;
}

function isoDayKey(iso?: string | null) {
  if (!iso) return undefined;
  return iso.slice(0, 10);
}

function pickRelevantMoonDay(args: {
  moonDays?: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  nightStartIso?: string;
  nightEndIso?: string;
}) {
  const { moonDays = [], nightStartIso, nightEndIso } = args;
  if (!moonDays.length) return undefined;

  const startKey = isoDayKey(nightStartIso);
  const endKey = isoDayKey(nightEndIso);

  const exact =
    moonDays.find((m) => m.date === startKey) ??
    moonDays.find((m) => m.date === endKey);

  if (exact) return exact;

  const withUsefulMoonData =
    moonDays.find((m) => m.moonrise || m.moonset) ??
    moonDays.find(
      (m) =>
        m.moonIlluminationPct != null ||
        m.moonPhaseDegrees != null ||
        !!m.moonPhaseLabel
    );

  return withUsefulMoonData ?? moonDays[0];
}

function pickMoonEventInWindow(args: {
  moonDays?: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
  }>;
  field: 'moonrise' | 'moonset';
  startIso?: string;
  endIso?: string;
}) {
  const start = parseLocalDate(args.startIso);
  const end = parseLocalDate(args.endIso);
  if (!start || !end || end <= start) return undefined;

  return args.moonDays
    ?.map((day) => day[args.field])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .find((value) => {
      const eventDate = parseLocalDate(value);
      return !!eventDate && eventDate >= start && eventDate <= end;
    });
}

function fallbackMoonPhaseLabel(
  phaseDegrees?: number | null,
  providedLabel?: string | null
) {
  if (providedLabel && providedLabel.trim()) return providedLabel;

  if (phaseDegrees == null || !Number.isFinite(phaseDegrees)) {
    return 'Moon data pending';
  }

  const d = ((phaseDegrees % 360) + 360) % 360;

  if (d < 22.5) return 'New Moon';
  if (d < 67.5) return 'Waxing Crescent';
  if (d < 112.5) return 'First Quarter';
  if (d < 157.5) return 'Waxing Gibbous';
  if (d < 202.5) return 'Full Moon';
  if (d < 247.5) return 'Waning Gibbous';
  if (d < 292.5) return 'Last Quarter';
  if (d < 337.5) return 'Waning Crescent';
  return 'New Moon';
}

function getTonightWindow(args: {
  now: Date;
  sunset?: string | null;
  sunrise?: string | null;
  nextSunrise?: string | null;
}) {
  const now = args.now;
  const sunset = parseLocalDate(args.sunset);
  const sunrise = parseLocalDate(args.sunrise);
  const nextSunrise = parseLocalDate(args.nextSunrise);

  if (sunrise && now < sunrise) {
    const start = new Date(sunrise);
    start.setDate(start.getDate() - 1);
    start.setHours(18, 0, 0, 0);
    return { start, end: sunrise };
  }

  if (sunset && nextSunrise && now >= sunset) {
    return { start: sunset, end: nextSunrise };
  }

  if (sunset && nextSunrise) {
    return { start: sunset, end: nextSunrise };
  }

  return { start: null as Date | null, end: null as Date | null };
}

function pickBestWindow(hours: AstroHourRow[]) {
  if (!hours.length) {
    return {
      bestHour: null as AstroHourRow | null,
      bestStartTime: undefined as string | undefined,
      bestEndTime: undefined as string | undefined,
      bestSummary: undefined as string | undefined,
    };
  }

  const bestHour = [...hours].sort((a, b) => b.score - a.score)[0];
  const threshold = Math.max(55, bestHour.score - 12);

  const idx = hours.findIndex((h) => h.time === bestHour.time);
  let start = idx;
  let end = idx;

  while (start - 1 >= 0 && hours[start - 1].score >= threshold) start--;
  while (end + 1 < hours.length && hours[end + 1].score >= threshold) end++;

  return {
    bestHour,
    bestStartTime: hours[start]?.time,
    bestEndTime: addHoursLocalIso(hours[end]?.time, 1),
    bestSummary: bestHour.summary,
  };
}

function pickDarkestWindowPrecise(args: {
  trueDarkStartTime?: string;
  trueDarkEndTime?: string;
  moonrise?: string;
  moonset?: string;
}) {
  const { trueDarkStartTime, trueDarkEndTime, moonrise, moonset } = args;

  const tdStart = parseLocalDate(trueDarkStartTime);
  const tdEnd = parseLocalDate(trueDarkEndTime);
  const rise = parseLocalDate(moonrise);
  const set = parseLocalDate(moonset);

  if (!tdStart || !tdEnd || tdEnd <= tdStart) {
    return {
      darkestStartTime: undefined as string | undefined,
      darkestEndTime: undefined as string | undefined,
    };
  }

  const riseInWindow = rise && rise > tdStart && rise < tdEnd ? moonrise : undefined;
  const setInWindow = set && set > tdStart && set < tdEnd ? moonset : undefined;

  const moonUpAtStart = trueDarkStartTime
    ? moonIsUpAt(trueDarkStartTime, moonrise, moonset)
    : false;

  if (!moonUpAtStart) {
    if (riseInWindow) {
      return {
        darkestStartTime: trueDarkStartTime,
        darkestEndTime: riseInWindow,
      };
    }

    return {
      darkestStartTime: trueDarkStartTime,
      darkestEndTime: trueDarkEndTime,
    };
  }

  if (setInWindow) {
    return {
      darkestStartTime: setInWindow,
      darkestEndTime: trueDarkEndTime,
    };
  }

  return {
    darkestStartTime: undefined as string | undefined,
    darkestEndTime: undefined as string | undefined,
  };
}

export type AstroHourRow = {
  time: string;
  timeLabel: string;
  score: number;
  label: string;
  summary: string;
  isNight: boolean;

  isCivilTwilight: boolean;
  isNauticalTwilight: boolean;
  isAstronomicalTwilight: boolean;
  isTrueDark: boolean;

  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;
  temperatureC: number | null;
  humidityPct: number | null;

  moonIsUp: boolean;
  moonIlluminationPct: number | null;
};

export type LocationAstroForecast = {
  placeName?: string;
  lat: number;
  lon: number;
  timezone: string;
  generatedAt: string;

  sunset?: string;
  sunrise?: string;
  moonrise?: string;
  moonset?: string;

  civilDusk?: string;
  nauticalDusk?: string;
  astronomicalDusk?: string;
  civilDawn?: string;
  nauticalDawn?: string;
  astronomicalDawn?: string;

  moonPhase?: number | null;
  moonPhaseLabel?: string;
  moonIlluminationPct?: number | null;

  nightStartTime?: string;
  nightEndTime?: string;

  trueDarkStartTime?: string;
  trueDarkEndTime?: string;

  bestStartTime?: string;
  bestEndTime?: string;
  bestSummary?: string;

  darkestStartTime?: string;
  darkestEndTime?: string;

  peakScore: number;
  peakLabel: string;

  site?: {
    elevationM?: number | null;
    bortleClass?: number | null;
    bortleLabel?: string | null;
    skyBrightness?: number | null;
  };

  aerosols?: {
    index?: number | null;
    label?: string | null;
    source?: string | null;
    airQualityIndex?: number | null;
    airQualityLabel?: string | null;
  };

  diagnostics?: {
    moonSource?: string | null;
    siteSource?: string | null;
    aerosolSource?: string | null;
  };

  sunDays?: Array<{
    date: string;
    sunrise?: string | null;
    sunset?: string | null;
    civilDawn?: string | null;
    civilDusk?: string | null;
    nauticalDawn?: string | null;
    nauticalDusk?: string | null;
    astronomicalDawn?: string | null;
    astronomicalDusk?: string | null;
  }>;
  moonDays?: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;

  hours: AstroHourRow[];
  tonightHours: AstroHourRow[];
};

type HookState = {
  data: LocationAstroForecast | null;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
};

type WorkerAstroPayload = {
  ok: boolean;
  lat: number;
  lon: number;
  placeName?: string;
  timezone: string;
  fetchedAt: string;
  sun: {
    todaySunrise?: string | null;
    todaySunset?: string | null;
    tomorrowSunrise?: string | null;
    tomorrowSunset?: string | null;
  };
  twilight: {
    todayCivilDusk?: string | null;
    todayNauticalDusk?: string | null;
    todayAstronomicalDusk?: string | null;
    tomorrowCivilDawn?: string | null;
    tomorrowNauticalDawn?: string | null;
    tomorrowAstronomicalDawn?: string | null;
  };
  moonDays: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  sunDays?: Array<{
    date: string;
    sunrise?: string | null;
    sunset?: string | null;
    civilDawn?: string | null;
    civilDusk?: string | null;
    nauticalDawn?: string | null;
    nauticalDusk?: string | null;
    astronomicalDawn?: string | null;
    astronomicalDusk?: string | null;
  }>;
  hourly: {
    time: string[];
    temperatureC?: Array<number | null>;
    humidityPct?: Array<number | null>;
    cloudTotal?: Array<number | null>;
    cloudLow?: Array<number | null>;
    cloudMid?: Array<number | null>;
    cloudHigh?: Array<number | null>;
    visibilityM?: Array<number | null>;
    windMps?: Array<number | null>;
    gustMps?: Array<number | null>;
  };
  site?: {
    elevationM?: number | null;
    bortleClass?: number | null;
    bortleLabel?: string | null;
    skyBrightness?: number | null;
  };
  aerosols?: {
    index?: number | null;
    label?: string | null;
    source?: string | null;
    airQualityIndex?: number | null;
    airQualityLabel?: string | null;
  };
  diagnostics?: {
    moonSource?: string | null;
    siteSource?: string | null;
    aerosolSource?: string | null;
  };
};

async function fetchLocationAstroForecast(args: {
  lat: number;
  lon: number;
  placeName?: string;
}): Promise<LocationAstroForecast> {
  const { lat, lon, placeName } = args;

  const url =
    `${OMNIWX_API_BASE}/api/astro/location` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&placeName=${encodeURIComponent(placeName ?? '')}`;

  console.log('[astro] request start', { lat, lon, placeName, url });

  let res: Response;
  try {
    res = await fetch(url);
  } catch (error) {
    throw new Error(`Astro fetch network failure: ${errorToMessage(error)}`);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Astro worker failed: ${res.status}${text ? ` ${text}` : ''}`);
  }

  let payload: WorkerAstroPayload;
  try {
    payload = (await res.json()) as WorkerAstroPayload;
  } catch (error) {
    throw new Error(`Astro JSON parse failure: ${errorToMessage(error)}`);
  }

  if (!payload?.ok) {
    throw new Error('Astro worker returned invalid payload');
  }

  const now = new Date();
  const nightWindow = getTonightWindow({
    now,
    sunset: payload.sun?.todaySunset,
    sunrise: payload.sun?.todaySunrise,
    nextSunrise: payload.sun?.tomorrowSunrise,
  });

  const nightStartIso = payload.sun?.todaySunset ?? undefined;
  const nightEndIso =
    payload.sun?.tomorrowSunrise ?? payload.sun?.todaySunrise ?? undefined;

  const relevantMoonDay = pickRelevantMoonDay({
    moonDays: payload.moonDays,
    nightStartIso,
    nightEndIso,
  });
  const nightMoonrise =
    pickMoonEventInWindow({
      moonDays: payload.moonDays,
      field: 'moonrise',
      startIso: nightStartIso,
      endIso: nightEndIso,
    }) ?? relevantMoonDay?.moonrise ?? undefined;
  const nightMoonset =
    pickMoonEventInWindow({
      moonDays: payload.moonDays,
      field: 'moonset',
      startIso: nightStartIso,
      endIso: nightEndIso,
    }) ?? relevantMoonDay?.moonset ?? undefined;

  const moonByDate = new Map(
    (payload.moonDays ?? []).map((m) => [m.date, m] as const)
  );
  const sunByDate = new Map(
    (payload.sunDays ?? []).map((s) => [s.date, s] as const)
  );
  const sunDays = payload.sunDays ?? [];

  const hourTimes = Array.isArray(payload.hourly?.time) ? payload.hourly.time : [];
  if (!hourTimes.length) {
    throw new Error('Astro worker payload missing hourly.time');
  }

  const rows: AstroHourRow[] = hourTimes.map((time, idx) => {
    const dayKey = typeof time === 'string' ? time.slice(0, 10) : '';
    const moonForDay =
      moonByDate.get(dayKey) ?? relevantMoonDay ?? payload.moonDays?.[0];
    const sunForDay =
      sunByDate.get(dayKey) ??
      payload.sunDays?.[0] ?? {
        sunrise: undefined,
        sunset: undefined,
        civilDawn: undefined,
        civilDusk: undefined,
        nauticalDawn: undefined,
        nauticalDusk: undefined,
        astronomicalDawn: undefined,
        astronomicalDusk: undefined,
      };
    const sunIndex = sunDays.findIndex((s) => s.date === dayKey);
    const prevSunForDay =
      (sunIndex > 0 ? sunDays[sunIndex - 1] : undefined) ?? sunForDay;
    const nextSunForDay =
      (sunIndex >= 0 && sunIndex + 1 < sunDays.length ? sunDays[sunIndex + 1] : undefined) ?? sunForDay;

    const moonrise = moonForDay?.moonrise ?? undefined;
    const moonset = moonForDay?.moonset ?? undefined;
    const moonIlluminationPct = moonForDay?.moonIlluminationPct ?? null;

    const hourDate = parseLocalDate(time);
    const isNight =
      !!(
        time &&
        (
          isBetween(time, prevSunForDay?.sunset, sunForDay?.sunrise) ||
          isBetween(time, sunForDay?.sunset, nextSunForDay?.sunrise) ||
          (
            nightWindow.start != null &&
            nightWindow.end != null &&
            hourDate != null &&
            hourDate >= nightWindow.start &&
            hourDate <= nightWindow.end
          )
        )
      );

    const isCivilTwilight =
      isBetween(time, sunForDay?.sunset, sunForDay?.civilDusk) ||
      isBetween(time, sunForDay?.civilDawn, sunForDay?.sunrise);

    const isNauticalTwilight =
      isBetween(time, sunForDay?.civilDusk, sunForDay?.nauticalDusk) ||
      isBetween(time, sunForDay?.nauticalDawn, sunForDay?.civilDawn);

    const isAstronomicalTwilight =
      isBetween(time, sunForDay?.nauticalDusk, sunForDay?.astronomicalDusk) ||
      isBetween(time, sunForDay?.astronomicalDawn, sunForDay?.nauticalDawn);

    const isTrueDark =
      isNight &&
      !isCivilTwilight &&
      !isNauticalTwilight &&
      !isAstronomicalTwilight &&
      (
        isBetween(time, prevSunForDay?.astronomicalDusk, sunForDay?.astronomicalDawn) ||
        isBetween(time, sunForDay?.astronomicalDusk, nextSunForDay?.astronomicalDawn)
      );

    const darknessScore = darknessScoreForHour({
      isTrueDark,
      isAstronomicalTwilight,
      isNauticalTwilight,
      isCivilTwilight,
      isNight,
    });

    const input: AstroInputs = {
      lat: payload.lat,
      lon: payload.lon,
      cloudLow: isFiniteNumber(payload.hourly.cloudLow?.[idx])
        ? payload.hourly.cloudLow![idx]!
        : null,
      cloudMid: isFiniteNumber(payload.hourly.cloudMid?.[idx])
        ? payload.hourly.cloudMid![idx]!
        : null,
      cloudHigh: isFiniteNumber(payload.hourly.cloudHigh?.[idx])
        ? payload.hourly.cloudHigh![idx]!
        : null,
      cloudTotal: isFiniteNumber(payload.hourly.cloudTotal?.[idx])
        ? payload.hourly.cloudTotal![idx]!
        : null,
      visibilityM: isFiniteNumber(payload.hourly.visibilityM?.[idx])
        ? payload.hourly.visibilityM![idx]!
        : null,
      windMps: isFiniteNumber(payload.hourly.windMps?.[idx])
        ? payload.hourly.windMps![idx]!
        : null,
      gustMps: isFiniteNumber(payload.hourly.gustMps?.[idx])
        ? payload.hourly.gustMps![idx]!
        : null,
      humidityPct: isFiniteNumber(payload.hourly.humidityPct?.[idx])
        ? payload.hourly.humidityPct![idx]!
        : null,
      elevationM: payload.site?.elevationM ?? null,
      aerosolIndex: payload.aerosols?.index ?? null,
      bortleClass: payload.site?.bortleClass ?? null,
    };

    const moonIsUp = moonIsUpAt(time, moonrise, moonset);

    const finalScore = computeSkyScorePoint({
      input,
      darknessScore,
      moonIsUp,
      moonIlluminationPct,
    }).score;

    const label = skyScoreLabel(finalScore);
    const summary = skyScoreSummary({
      score: finalScore,
      cloudTotal: input.cloudTotal,
      cloudHigh: input.cloudHigh,
      visibilityM: input.visibilityM,
      gustMps: input.gustMps,
      humidityPct: input.humidityPct,
      elevationM: input.elevationM,
      moonIsUp,
      moonIlluminationPct,
      aerosolIndex: input.aerosolIndex,
      bortleClass: input.bortleClass,
    });

    return {
      time,
      timeLabel: toShortHourLabel(time, payload.timezone),
      score: finalScore,
      label,
      summary,
      isNight,
      isCivilTwilight,
      isNauticalTwilight,
      isAstronomicalTwilight,
      isTrueDark,

      cloudTotal: input.cloudTotal,
      cloudLow: input.cloudLow,
      cloudMid: input.cloudMid,
      cloudHigh: input.cloudHigh,
      visibilityM: input.visibilityM,
      windMps: input.windMps,
      gustMps: input.gustMps,
      temperatureC: isFiniteNumber(payload.hourly.temperatureC?.[idx])
        ? payload.hourly.temperatureC![idx]!
        : null,
      humidityPct: isFiniteNumber(payload.hourly.humidityPct?.[idx])
        ? payload.hourly.humidityPct![idx]!
        : null,

      moonIsUp,
      moonIlluminationPct,
    };
  });

  const tonightHours = rows.filter((h) => h.isNight);
  const best = pickBestWindow(tonightHours);

  const trueDarkStartTime = payload.twilight?.todayAstronomicalDusk ?? undefined;
  const trueDarkEndTime = payload.twilight?.tomorrowAstronomicalDawn ?? undefined;

  const darkest = pickDarkestWindowPrecise({
    trueDarkStartTime,
    trueDarkEndTime,
    moonrise: nightMoonrise,
    moonset: nightMoonset,
  });

  const peakScore = best.bestHour?.score ?? 0;
  const peakLabel = skyScoreLabel(peakScore);

  return {
    placeName: payload.placeName ?? placeName,
    lat: payload.lat,
    lon: payload.lon,
    timezone: payload.timezone,
    generatedAt: payload.fetchedAt,

    sunset: payload.sun?.todaySunset ?? undefined,
    sunrise: payload.sun?.tomorrowSunrise ?? payload.sun?.todaySunrise ?? undefined,
    moonrise: nightMoonrise,
    moonset: nightMoonset,

    civilDusk: payload.twilight?.todayCivilDusk ?? undefined,
    nauticalDusk: payload.twilight?.todayNauticalDusk ?? undefined,
    astronomicalDusk: payload.twilight?.todayAstronomicalDusk ?? undefined,
    civilDawn: payload.twilight?.tomorrowCivilDawn ?? undefined,
    nauticalDawn: payload.twilight?.tomorrowNauticalDawn ?? undefined,
    astronomicalDawn: payload.twilight?.tomorrowAstronomicalDawn ?? undefined,

    moonPhase: relevantMoonDay?.moonPhaseDegrees ?? null,
    moonPhaseLabel: fallbackMoonPhaseLabel(
      relevantMoonDay?.moonPhaseDegrees ?? null,
      relevantMoonDay?.moonPhaseLabel ?? null
    ),
    moonIlluminationPct: relevantMoonDay?.moonIlluminationPct ?? null,

    nightStartTime: nightStartIso,
    nightEndTime: nightEndIso,

    trueDarkStartTime,
    trueDarkEndTime,

    bestStartTime: best.bestStartTime,
    bestEndTime: best.bestEndTime,
    bestSummary: best.bestSummary,

    darkestStartTime: darkest.darkestStartTime,
    darkestEndTime: darkest.darkestEndTime,

    peakScore,
    peakLabel,

    site: payload.site
      ? {
          elevationM: payload.site.elevationM ?? null,
          bortleClass: payload.site.bortleClass ?? null,
          bortleLabel: payload.site.bortleLabel ?? null,
          skyBrightness: payload.site.skyBrightness ?? null,
        }
      : undefined,

    aerosols: payload.aerosols
      ? {
          index: payload.aerosols.index ?? null,
          label: payload.aerosols.label ?? null,
          source: payload.aerosols.source ?? null,
          airQualityIndex: payload.aerosols.airQualityIndex ?? null,
          airQualityLabel: payload.aerosols.airQualityLabel ?? null,
        }
      : undefined,

    diagnostics: payload.diagnostics
      ? {
          moonSource: payload.diagnostics.moonSource ?? null,
          siteSource: payload.diagnostics.siteSource ?? null,
          aerosolSource: payload.diagnostics.aerosolSource ?? null,
        }
      : undefined,

    sunDays: Array.isArray(payload.sunDays)
      ? payload.sunDays.map((day) => ({
          date: day.date,
          sunrise: day.sunrise ?? null,
          sunset: day.sunset ?? null,
          civilDawn: day.civilDawn ?? null,
          civilDusk: day.civilDusk ?? null,
          nauticalDawn: day.nauticalDawn ?? null,
          nauticalDusk: day.nauticalDusk ?? null,
          astronomicalDawn: day.astronomicalDawn ?? null,
          astronomicalDusk: day.astronomicalDusk ?? null,
        }))
      : undefined,
    moonDays: Array.isArray(payload.moonDays)
      ? payload.moonDays.map((day) => ({
          date: day.date,
          moonrise: day.moonrise ?? null,
          moonset: day.moonset ?? null,
          moonPhaseDegrees: day.moonPhaseDegrees ?? null,
          moonIlluminationPct: day.moonIlluminationPct ?? null,
          moonPhaseLabel: day.moonPhaseLabel ?? null,
        }))
      : undefined,

    hours: rows,
    tonightHours,
  };
}

export function useLocationAstroForecast(args: {
  lat?: number | null;
  lon?: number | null;
  placeName?: string;
  enabled?: boolean;
}) {
  const { lat, lon, placeName, enabled = true } = args;
  const requestIdRef = useRef(0);

  const [state, setState] = useState<HookState>({
    data: null,
    loading: false,
    refreshing: false,
    error: null,
  });

  const canLoad = enabled && isFiniteNumber(lat) && isFiniteNumber(lon);

  const load = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!canLoad || lat == null || lon == null) {
      console.log('[astro] skipped load', { enabled, lat, lon, placeName });
      return;
    }

    const requestId = ++requestIdRef.current;

    setState((prev) => ({
      ...prev,
      data: mode === 'initial' ? null : prev.data,
      loading: mode === 'initial',
      refreshing: mode === 'refresh',
      error: null,
    }));

    try {
      const data = await fetchLocationAstroForecast({
        lat,
        lon,
        placeName,
      });

      if (requestId !== requestIdRef.current) return;

      setState({
        data,
        loading: false,
        refreshing: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      const message = errorToMessage(error);
      console.log('[astro] load failed', { message, raw: error });

      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: message,
      }));
    }
  };

  useEffect(() => {
    load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon, placeName, enabled]);

  return useMemo(
    () => ({
      data: state.data,
      loading: state.loading,
      refreshing: state.refreshing,
      error: state.error,
      refresh: () => load('refresh'),
    }),
    [state.data, state.loading, state.refreshing, state.error]
  );
}

export { toLocalLabel };

