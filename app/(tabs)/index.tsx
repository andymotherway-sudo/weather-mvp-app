// app/(tabs)/index.tsx
// Land Wx - Rich + Nerdy (Branded + Alpha polish)
// Drop-in replacement
// Compresses header so current conditions sit higher
// Simple mode shows vertical 15-day forecast list
// wxLab shows daily chart + insights + hourly chart
// Keeps location picker, alerts, video bg, favorites, explain + learn modals
// Nerdy education taps now go straight to LearnMoreModal

import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlace } from '../context/PlaceContext';
import { useLocationAstroForecast } from '../lib/astro/locationAstro';
import { useFireContext } from '../lib/fire/useFireContext';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useCurrentWeather } from '../lib/weather/hooks';

import type { FavoriteLocation } from '../lib/locations/favorites';
import { formatCompactLocation } from '../lib/locations/formats';
import { geocodePlaces } from '../lib/locations/geocode';
import { useLocations } from '../lib/locations/useLocations';

import { Ionicons } from '@expo/vector-icons';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { NerdyExplainModal, type ExplainPayload } from '../../components/common/NerdyExplainModal';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

import { dewPointBandF, gustFactor, heatIndexF, windChillF } from '../lib/land/nerdyMath';

import { AlertBanner } from '../../components/alerts/AlertBanner';
import { useNwsAlerts } from '../lib/alerts/useNwsAlerts';

import { DailyRangeChart } from '../../components/land/DailyRangeChart';
import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';

import WeatherVideoBackground from '../../components/background/WeatherVideoBackground';
import { useWxLab } from '../context/WxLabContext';

type UnitSystem = 'us' | 'metric';

type SavedLocation = {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lon: number;
  tz?: string;
};

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function fmt(v: number | null, digits = 0) {
  if (v == null) return '—';
  return digits > 0 ? v.toFixed(digits) : `${Math.round(v)}`;
}

function near(a: number, b: number, eps = 0.0005) {
  return Math.abs(a - b) < eps;
}

function dirToCompass(deg: number | null) {
  if (deg == null) return null;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return dirs[idx];
}

function formatLocLabel(loc: { name: string; admin1?: string; country?: string }) {
  const compact = formatCompactLocation({
    name: loc.name,
    admin1: loc.admin1,
    country: loc.country,
  });
  if (compact) return compact;

  const parts = String(loc.name || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return (
      formatCompactLocation({
        name: parts[0] || loc.name,
        admin1: parts[1],
        country: parts[2],
      }) || loc.name
    );
  }

  return loc.name;
}

function normalizeConfidence(v: any): 'low' | 'medium' | 'high' | undefined {
  if (!v) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  if (s.includes('high')) return 'high';
  if (s.includes('medium')) return 'medium';
  if (s.includes('low')) return 'low';
  return undefined;
}

function formatUpdatedTime(observationTime: string | null) {
  if (!observationTime) return '—';
  const d = new Date(observationTime);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function hpaToInHg(hpa: number) {
  return hpa * 0.029529983071445;
}

function findClosestHour(hours: any[], targetMs: number) {
  let best: any = null;
  let bestDt = Infinity;

  for (const h of hours ?? []) {
    const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
    if (!Number.isFinite(t)) continue;

    const dt = Math.abs(t - targetMs);
    if (dt < bestDt) {
      bestDt = dt;
      best = h;
    }
  }

  return best;
}

function pressureTrendFromHourly(hours: any[]) {
  const nowMs = Date.now();
  const now = findClosestHour(hours, nowMs);
  const past = findClosestHour(hours, nowMs - 3 * 60 * 60 * 1000);

  const pNow =
    safeNum(now?.pressureHpa ?? now?.pressure_msl ?? now?.pressureMslHpa ?? now?.pressure_hpa ?? now?.pressure) ?? null;
  const pPast =
    safeNum(
      past?.pressureHpa ?? past?.pressure_msl ?? past?.pressureMslHpa ?? past?.pressure_hpa ?? past?.pressure
    ) ?? null;

  if (pNow == null || pPast == null) {
    return { arrow: '→' as const, deltaHpa: null as number | null, label: 'Steady' as const };
  }

  const delta = pNow - pPast;

  if (delta >= 1.5) return { arrow: '↑' as const, deltaHpa: delta, label: 'Rising' as const };
  if (delta <= -1.5) return { arrow: '↓' as const, deltaHpa: delta, label: 'Falling' as const };
  return { arrow: '→' as const, deltaHpa: delta, label: 'Steady' as const };
}

type FavoriteWeatherPreview = {
  emoji: string;
  condition: string;
  hi: number | null;
  lo: number | null;
};

const FAVORITE_PREVIEW_TTL_MS = 10 * 60 * 1000;

const favoritePreviewCache = new Map<
  string,
  {
    expiresAt: number;
    data: FavoriteWeatherPreview;
  }
>();

function favoritePreviewKey(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function weatherCodeToEmoji(code: number | null): string {
  if (code == null) return '🌤️';
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([80, 81, 82].includes(code)) return '🌦️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '☁️';
}

function weatherCodeToLabel(code: number | null): string {
  if (code == null) return 'Weather';
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Cloudy';
}

function formatDailyLabel(dateValue: any) {
  const raw = typeof dateValue === 'string' ? dateValue : '';
  if (!raw) return 'Day';

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  });
}

function formatClock(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtInt(v: number | null, suffix = '') {
  return v == null ? '—' : `${Math.round(v)}${suffix}`;
}

function formatDayLength(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  if (!minutes) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start) return '—';
  if (!end) return formatClock(start);
  return `${formatClock(start)}–${formatClock(end)}`;
}

function astroLearnTopicId(kind: string) {
  switch (kind) {
    case 'sunrise':
    case 'sunset':
      return 'astro-sunrise-sunset';
    case 'moonrise':
    case 'moonset':
      return 'astro-moonrise-moonset';
    case 'civil':
      return 'astro-civil-twilight';
    case 'nautical':
      return 'astro-nautical-twilight';
    case 'astronomical':
      return 'astro-astronomical-twilight';
    case 'night':
      return 'astro-night-window';
    case 'true-dark':
      return 'astro-true-dark';
    case 'best':
      return 'astro-best-window';
    case 'darkest':
      return 'astro-darkest-window';
    default:
      return 'astro-astronomical-twilight';
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatShortDay(dateValue?: string | null) {
  if (!dateValue) return 'Today';
  const d = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'Today';
  return d.toLocaleDateString([], { weekday: 'short' });
}

function formatTimeRangeShort(start?: string | null, end?: string | null) {
  if (!start && !end) return null;
  if (start && end) return `${formatClock(start)}-${formatClock(end)}`;
  return formatClock(start ?? end ?? null);
}

type ActivityTier = 'great' | 'good' | 'mixed' | 'rough';

type ActivityCardModel = {
  id: string;
  title: string;
  icon: string;
  tier: ActivityTier;
  score: number;
  headline: string;
  detail: string;
  kicker?: string | null;
  reason?: string | null;
  scaleNote?: string | null;
  week: Array<{
    date: string | null;
    shortDay: string;
    score: number;
    tier: ActivityTier;
  }>;
  hourly?: Array<{
    timeLabel: string;
    score: number;
    tier: ActivityTier;
    summary: string;
  }>;
};

function tierForScore(score: number): ActivityTier {
  if (score >= 82) return 'great';
  if (score >= 64) return 'good';
  if (score >= 44) return 'mixed';
  return 'rough';
}

function labelForTier(tier: ActivityTier) {
  switch (tier) {
    case 'great':
      return 'Great';
    case 'good':
      return 'Good';
    case 'mixed':
      return 'Mixed';
    default:
      return 'Rough';
  }
}

function tierColors(tier: ActivityTier) {
  switch (tier) {
    case 'great':
      return { bg: 'rgba(72,201,176,0.18)', border: 'rgba(72,201,176,0.42)', text: '#8EF3DB' };
    case 'good':
      return { bg: 'rgba(118,196,255,0.16)', border: 'rgba(118,196,255,0.36)', text: '#C1E6FF' };
    case 'mixed':
      return { bg: 'rgba(255,196,92,0.16)', border: 'rgba(255,196,92,0.34)', text: '#FFD48A' };
    default:
      return { bg: 'rgba(255,113,113,0.16)', border: 'rgba(255,113,113,0.34)', text: '#FFB2B2' };
  }
}

function activityScaleNote(title: string) {
  switch (title) {
    case 'Running':
      return '7-day fit score, where higher is better, based on comfort, air quality, wind, UV, and rain.';
    case 'Camping':
      return '7-day fit score, where higher is better, based on overnight comfort, wind, rain, and fire context.';
    case 'Fishing':
      return '7-day fit score, where higher is better, based on wind, clouds, rain, and light timing.';
    case 'Hiking':
      return '7-day fit score, where higher is better, based on comfort, air quality, UV, wind, and rain.';
    case 'Flying':
      return '7-day fit score, where higher is better, based on visibility, wind, gusts, and precip risk.';
    case 'Stargazing':
      return '7-day fit score, where higher is better, based on Sky Score, clouds, aerosols, and moonlight.';
    case 'Boating':
      return '7-day fit score, where higher is better, based on wind, gusts, and precip risk.';
    default:
      return '7-day fit score: 0 difficult, 100 ideal.';
  }
}

function formatHourMiniLabel(raw: any) {
  const d = new Date(raw ?? '');
  if (Number.isNaN(d.getTime())) return 'Now';
  return d.toLocaleTimeString([], { hour: 'numeric' });
}

function normalizePreviewScore(value: any) {
  const n = safeNum(value);
  if (n == null) return 0;
  return clamp(Math.round(n <= 1 ? n * 100 : n), 0, 100);
}

function cleanUiText(value?: string | null) {
  if (!value) return value ?? '';
  return value
    .replace(/Ã‚Â°/g, ' deg')
    .replace(/Â°/g, '°')
    .replace(/â€¢/g, '•')
    .replace(/â€”/g, '—')
    .replace(/â€“/g, '-')
    .replace(/â†’/g, '->')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function describeBestDay(bestDate?: string | null, fallback = 'Watch conditions') {
  if (!bestDate) return fallback;
  const short = formatShortDay(bestDate);
  return short === 'Today' ? 'Today is best' : `${short} is best`;
}

function buildActivityForecast(args: {
  daily: any[];
  hourly: any[];
  visibilityMi: number | null;
  astroData: any;
  feelsLikeF: number | null;
  fireContext: any;
}) {
  const days = (args.daily ?? []).slice(0, 7);
  const hourly = (args.hourly ?? []).slice();
  const today = days[0] ?? null;
  const aerosolLabel = typeof args.astroData?.aerosols?.label === 'string' ? args.astroData.aerosols.label : null;
  const airQualityLabel =
    typeof args.astroData?.aerosols?.airQualityLabel === 'string'
      ? args.astroData.aerosols.airQualityLabel
      : null;
  const airQualityIndex = safeNum(args.astroData?.aerosols?.airQualityIndex);
  const fireDangerLabel =
    typeof args.fireContext?.fireDanger?.classLabel === 'string' ? args.fireContext.fireDanger.classLabel : null;
  const fireDangerValue = safeNum(args.fireContext?.fireDanger?.classValue);
  const redFlagWarning = !!args.fireContext?.fireWeather?.redFlagWarning;
  const fireWeatherWatch = !!args.fireContext?.fireWeather?.fireWeatherWatch;
  const fireRestrictionsInEffect = typeof args.fireContext?.restrictions?.inEffect === 'boolean' ? args.fireContext.restrictions.inEffect : null;
  const fireRestrictionsSummary =
    typeof args.fireContext?.restrictions?.summary === 'string' ? args.fireContext.restrictions.summary : null;

  const describeComfortDelta = (temp: number | null, idealMin: number, idealMax: number) => {
    if (temp == null) return 'temperature is uncertain';
    if (temp < idealMin) return `${Math.round(temp)}° runs cool`;
    if (temp > idealMax) return `${Math.round(temp)}° runs warm`;
    return `${Math.round(temp)}° sits in a comfortable range`;
  };

  const explainBestShift = (
    bestDate: string | null | undefined,
    bestDay: any,
    parts: Array<string | null | undefined>,
    fallback = 'conditions stay fairly similar'
  ) => {
    const prefix = describeBestDay(bestDate);
    if (!bestDay || !bestDate) return fallback;
    if (bestDate === today?.date) return `Today leads because ${parts.filter(Boolean).join(', ')}`;
    const reason = parts.filter(Boolean).slice(0, 3).join(', ');
    return `${prefix} because ${reason || fallback}`;
  };

  const formatAirQuality = () => {
    if (!airQualityLabel) return null;
    return airQualityIndex != null
      ? `Air quality: ${airQualityLabel} (AQI ${Math.round(airQualityIndex)})`
      : `Air quality: ${airQualityLabel}`;
  };

  const scoreTempBand = (temp: number | null, idealMin: number, idealMax: number, hardMin: number, hardMax: number) => {
    if (temp == null) return 8;
    if (temp < hardMin || temp > hardMax) return 42;
    if (temp < idealMin) return Math.round((idealMin - temp) * 1.8);
    if (temp > idealMax) return Math.round((temp - idealMax) * 1.8);
    return 0;
  };

  const scoreGenericDay = (
    day: any,
    config: {
      tempField?: 'tempMaxF' | 'tempMinF';
      idealMin: number;
      idealMax: number;
      hardMin: number;
      hardMax: number;
      popWeight: number;
      windWeight: number;
      gustWeight: number;
      cloudTarget?: [number, number];
      uvWeight?: number;
      dryWindPenalty?: boolean;
      visibilityPenalty?: boolean;
      airQualityWeight?: number;
    }
  ) => {
    const hi = safeNum(day?.tempMaxF);
    const lo = safeNum(day?.tempMinF);
    const temp = config.tempField === 'tempMinF' ? lo : hi;
    const pop = safeNum(day?.precipProbMaxPct);
    const wind = safeNum(day?.windMaxMph);
    const gust = safeNum(day?.windGustMaxMph);
    const cloud = safeNum(day?.cloudCoverAvgPct);
    const uv = safeNum(day?.uvIndexMax);
    const dew = safeNum(day?.dewPointMaxF);
    const humidity = safeNum(day?.humidityMaxPct);

    let penalty = scoreTempBand(temp, config.idealMin, config.idealMax, config.hardMin, config.hardMax);
    penalty += ((pop ?? 0) / 100) * config.popWeight;
    penalty += (Math.max((wind ?? 0) - 8, 0) / 22) * config.windWeight;
    penalty += (Math.max((gust ?? 0) - 16, 0) / 24) * config.gustWeight;

    if (config.cloudTarget && cloud != null) {
      const [minCloud, maxCloud] = config.cloudTarget;
      if (cloud < minCloud) penalty += (minCloud - cloud) * 0.18;
      if (cloud > maxCloud) penalty += (cloud - maxCloud) * 0.18;
    }

    if (config.uvWeight && uv != null) {
      penalty += Math.max(uv - 6, 0) * config.uvWeight;
    }

    if (config.dryWindPenalty) {
      const dry = dew != null ? dew < 35 : (humidity != null ? humidity < 28 : false);
      if (dry && (wind ?? 0) >= 15) penalty += 14;
    }

    if (config.visibilityPenalty && args.visibilityMi != null) {
      penalty += Math.max(4 - args.visibilityMi, 0) * 10;
    }

    if (config.airQualityWeight && airQualityIndex != null) {
      penalty += (Math.max(airQualityIndex - 50, 0) / 10) * config.airQualityWeight;
    }

    return clamp(Math.round(100 - penalty), 0, 100);
  };

  const campingFirePenalty = () => {
    let penalty = 0;
    if (fireDangerValue != null) penalty += fireDangerValue >= 4 ? 18 : fireDangerValue === 3 ? 12 : fireDangerValue === 2 ? 6 : 0;
    if (redFlagWarning) penalty += 24;
    else if (fireWeatherWatch) penalty += 12;
    return penalty;
  };

  const scoreCampingDay = (day: any) =>
    clamp(
      scoreGenericDay(day, {
        tempField: 'tempMinF',
        idealMin: 45,
        idealMax: 65,
        hardMin: 25,
        hardMax: 80,
        popWeight: 28,
        windWeight: 22,
        gustWeight: 14,
        dryWindPenalty: true,
      }) - campingFirePenalty(),
      0,
      100
    );

  const buildWeek = (scorer: (day: any) => number) =>
    days.map((day) => {
      const score = scorer(day);
      return {
        date: typeof day?.date === 'string' ? day.date : null,
        shortDay: formatShortDay(day?.date),
        score,
        tier: tierForScore(score),
      };
    });

  const pickBest = (scorer: (day: any) => number) => {
    let bestDay: any = null;
    let bestScore = -1;
    for (const day of days) {
      const score = scorer(day);
      if (score > bestScore) {
        bestScore = score;
        bestDay = day;
      }
    }
    return { bestDay, bestScore };
  };

  const futureHours = hourly
    .filter((h) => {
      const t = new Date(h?.time ?? h?.datetime ?? h?.date ?? '').getTime();
      return Number.isFinite(t) && t >= Date.now() - 30 * 60 * 1000;
    })
    .filter((_, idx) => idx === 0 || idx % 2 === 0)
    .slice(0, 6);

  const weatherHourScore = (
    hour: any,
    config: {
      idealMin: number;
      idealMax: number;
      hardMin: number;
      hardMax: number;
      popWeight: number;
      windWeight: number;
      gustWeight: number;
      uvWeight?: number;
      cloudTarget?: [number, number];
      visibilityPenalty?: boolean;
      airQualityWeight?: number;
      dryWindPenalty?: boolean;
    }
  ) => {
    const temp =
      safeNum(hour?.tempF ?? hour?.temperatureF ?? hour?.temperature_2m ?? hour?.temperature) ??
      safeNum(hour?.apparentTemperatureF ?? hour?.apparent_temperature ?? hour?.feelsLikeF);
    const pop = safeNum(hour?.precipProbPct ?? hour?.precipitation_probability ?? hour?.precipChancePct);
    const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m);
    const gust = safeNum(hour?.gustMph ?? hour?.windGustMph ?? hour?.wind_gusts_10m);
    const uv = safeNum(hour?.uvIndex ?? hour?.uv_index);
    const cloud = safeNum(hour?.cloudCoverPct ?? hour?.cloud_cover ?? hour?.cloudCover);
    const dew = safeNum(hour?.dewpointF ?? hour?.dewPointF ?? hour?.dew_point);
    const humidity = safeNum(hour?.humidityPct ?? hour?.relative_humidity);
    const visibilityMi =
      safeNum(hour?.visibilityMi) ??
      (safeNum(hour?.visibility ?? hour?.visibility_m) != null
        ? (safeNum(hour?.visibility ?? hour?.visibility_m) ?? 0) / 1609.344
        : null);

    let penalty = scoreTempBand(temp, config.idealMin, config.idealMax, config.hardMin, config.hardMax);
    penalty += ((pop ?? 0) / 100) * config.popWeight;
    penalty += (Math.max((wind ?? 0) - 8, 0) / 22) * config.windWeight;
    penalty += (Math.max((gust ?? 0) - 16, 0) / 24) * config.gustWeight;

    if (config.uvWeight && uv != null) penalty += Math.max(uv - 6, 0) * config.uvWeight;
    if (config.cloudTarget && cloud != null) {
      const [minCloud, maxCloud] = config.cloudTarget;
      if (cloud < minCloud) penalty += (minCloud - cloud) * 0.18;
      if (cloud > maxCloud) penalty += (cloud - maxCloud) * 0.18;
    }
    if (config.visibilityPenalty && visibilityMi != null) penalty += Math.max(4 - visibilityMi, 0) * 10;
    if (config.airQualityWeight && airQualityIndex != null) {
      penalty += (Math.max(airQualityIndex - 50, 0) / 10) * config.airQualityWeight;
    }
    if (config.dryWindPenalty) {
      const dry = dew != null ? dew < 35 : humidity != null ? humidity < 28 : false;
      if (dry && (wind ?? 0) >= 15) penalty += 14;
    }

    return clamp(Math.round(100 - penalty), 0, 100);
  };

  const buildWeatherHourPreview = (
    scorer: (hour: any) => number,
    summary: (hour: any) => string
  ) =>
    futureHours.map((hour) => {
      const score = scorer(hour);
      return {
        timeLabel: formatHourMiniLabel(hour?.time ?? hour?.datetime ?? hour?.date),
        score,
        tier: tierForScore(score),
        summary: summary(hour),
      };
    });

  const todayRunning = scoreGenericDay(today, {
    idealMin: 45,
    idealMax: 68,
    hardMin: 24,
    hardMax: 92,
    popWeight: 22,
    windWeight: 14,
    gustWeight: 8,
    uvWeight: 2.5,
    airQualityWeight: 3.2,
  });
  const runningBest = pickBest((day) =>
    scoreGenericDay(day, {
      idealMin: 45,
      idealMax: 68,
      hardMin: 24,
      hardMax: 92,
      popWeight: 22,
      windWeight: 14,
      gustWeight: 8,
      uvWeight: 2.5,
      airQualityWeight: 3.2,
    })
  );
  const runningWeek = buildWeek((day) =>
    scoreGenericDay(day, {
      idealMin: 45,
      idealMax: 68,
      hardMin: 24,
      hardMax: 92,
      popWeight: 22,
      windWeight: 14,
      gustWeight: 8,
      uvWeight: 2.5,
      airQualityWeight: 3.2,
    })
  );

  const todayCamping = scoreCampingDay(today);
  const campingBest = pickBest((day) => scoreCampingDay(day));
  const campingWeek = buildWeek((day) => scoreCampingDay(day));

  const todayFishing = scoreGenericDay(today, {
    idealMin: 52,
    idealMax: 82,
    hardMin: 30,
    hardMax: 96,
    popWeight: 20,
    windWeight: 28,
    gustWeight: 12,
    cloudTarget: [20, 75],
  });
  const fishingBest = pickBest((day) =>
    scoreGenericDay(day, {
      idealMin: 52,
      idealMax: 82,
      hardMin: 30,
      hardMax: 96,
      popWeight: 20,
      windWeight: 28,
      gustWeight: 12,
      cloudTarget: [20, 75],
    })
  );
  const fishingWeek = buildWeek((day) =>
    scoreGenericDay(day, {
      idealMin: 52,
      idealMax: 82,
      hardMin: 30,
      hardMax: 96,
      popWeight: 20,
      windWeight: 28,
      gustWeight: 12,
      cloudTarget: [20, 75],
    })
  );

  const todayHiking = scoreGenericDay(today, {
    idealMin: 50,
    idealMax: 76,
    hardMin: 28,
    hardMax: 96,
    popWeight: 24,
    windWeight: 12,
    gustWeight: 8,
    uvWeight: 2.8,
    airQualityWeight: 2.6,
  });
  const hikingBest = pickBest((day) =>
    scoreGenericDay(day, {
      idealMin: 50,
      idealMax: 76,
      hardMin: 28,
      hardMax: 96,
      popWeight: 24,
      windWeight: 12,
      gustWeight: 8,
      uvWeight: 2.8,
      airQualityWeight: 2.6,
    })
  );
  const hikingWeek = buildWeek((day) =>
    scoreGenericDay(day, {
      idealMin: 50,
      idealMax: 76,
      hardMin: 28,
      hardMax: 96,
      popWeight: 24,
      windWeight: 12,
      gustWeight: 8,
      uvWeight: 2.8,
      airQualityWeight: 2.6,
    })
  );

  const todayFlying = scoreGenericDay(today, {
    idealMin: 38,
    idealMax: 88,
    hardMin: 18,
    hardMax: 105,
    popWeight: 26,
    windWeight: 32,
    gustWeight: 20,
    visibilityPenalty: true,
  });
  const flyingBest = pickBest((day) =>
    scoreGenericDay(day, {
      idealMin: 38,
      idealMax: 88,
      hardMin: 18,
      hardMax: 105,
      popWeight: 26,
      windWeight: 32,
      gustWeight: 20,
      visibilityPenalty: true,
    })
  );
  const flyingWeek = buildWeek((day) =>
    scoreGenericDay(day, {
      idealMin: 38,
      idealMax: 88,
      hardMin: 18,
      hardMax: 105,
      popWeight: 26,
      windWeight: 32,
      gustWeight: 20,
      visibilityPenalty: true,
    })
  );

  const todayBoating = scoreGenericDay(today, {
    idealMin: 58,
    idealMax: 88,
    hardMin: 38,
    hardMax: 102,
    popWeight: 26,
    windWeight: 30,
    gustWeight: 24,
  });
  const boatingBest = pickBest((day) =>
    scoreGenericDay(day, {
      idealMin: 58,
      idealMax: 88,
      hardMin: 38,
      hardMax: 102,
      popWeight: 26,
      windWeight: 30,
      gustWeight: 24,
    })
  );
  const boatingWeek = buildWeek((day) =>
    scoreGenericDay(day, {
      idealMin: 58,
      idealMax: 88,
      hardMin: 38,
      hardMax: 102,
      popWeight: 26,
      windWeight: 30,
      gustWeight: 24,
    })
  );

  const astroScore = normalizePreviewScore(args.astroData?.peakScore);
  const astroTier = tierForScore(astroScore);
  const astroWindow =
    formatTimeRangeShort(
      args.astroData?.bestStartTime ?? args.astroData?.darkestStartTime,
      args.astroData?.bestEndTime ?? args.astroData?.darkestEndTime
    ) ?? 'Tonight';
  const astroHours: any[] = Array.isArray(args.astroData?.hours) ? args.astroData.hours : [];
  const astroWeek = days.map((day) => {
    const date = typeof day?.date === 'string' ? day.date : null;
    const score = astroHours.reduce((best: number, hour: any) => {
      const hourTime = typeof hour?.time === 'string' ? hour.time : '';
      if (!date || !hourTime.startsWith(date)) return best;
      const hourScore = normalizePreviewScore(hour?.skyScore ?? hour?.score);
      return Math.max(best, hourScore);
    }, 0);
    return {
      date,
      shortDay: formatShortDay(date),
      score,
      tier: tierForScore(score),
    };
  });

  const runningHourly = buildWeatherHourPreview(
    (hour) =>
      weatherHourScore(hour, {
        idealMin: 45,
        idealMax: 68,
        hardMin: 24,
        hardMax: 92,
        popWeight: 22,
        windWeight: 14,
        gustWeight: 8,
        uvWeight: 2.5,
        airQualityWeight: 3.2,
      }),
    (hour) => {
      const temp =
        safeNum(hour?.apparentTemperatureF ?? hour?.apparent_temperature ?? hour?.feelsLikeF) ??
        safeNum(hour?.tempF ?? hour?.temperatureF ?? hour?.temperature_2m ?? hour?.temperature);
      const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m);
      const pop = safeNum(hour?.precipProbPct ?? hour?.precipitation_probability ?? hour?.precipChancePct);
      return `${fmtInt(temp, '°')} feel • ${fmtInt(wind, ' mph')} wind • ${fmtInt(pop, '%')} rain`;
    }
  );

  const campingHourly = buildWeatherHourPreview(
    (hour) =>
      clamp(
        weatherHourScore(hour, {
          idealMin: 45,
          idealMax: 65,
          hardMin: 25,
          hardMax: 80,
          popWeight: 28,
          windWeight: 22,
          gustWeight: 14,
          dryWindPenalty: true,
        }) - campingFirePenalty(),
        0,
        100
      ),
    (hour) => {
      const temp = safeNum(hour?.tempF ?? hour?.temperatureF ?? hour?.temperature_2m ?? hour?.temperature);
      const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m);
      const pop = safeNum(hour?.precipProbPct ?? hour?.precipitation_probability ?? hour?.precipChancePct);
      return `${fmtInt(temp, '°')} • ${fmtInt(wind, ' mph')} wind • ${fmtInt(pop, '%')} rain`;
    }
  );

  const fishingHourly = buildWeatherHourPreview(
    (hour) =>
      weatherHourScore(hour, {
        idealMin: 52,
        idealMax: 82,
        hardMin: 30,
        hardMax: 96,
        popWeight: 20,
        windWeight: 28,
        gustWeight: 12,
        cloudTarget: [20, 75],
      }),
    (hour) => {
      const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m);
      const uv = safeNum(hour?.uvIndex ?? hour?.uv_index);
      const cloud = safeNum(hour?.cloudCoverPct ?? hour?.cloud_cover ?? hour?.cloudCover);
      return `${fmtInt(wind, ' mph')} wind • UV ${fmt(uv, 0)} • ${fmtInt(cloud, '%')} clouds`;
    }
  );

  const hikingHourly = buildWeatherHourPreview(
    (hour) =>
      weatherHourScore(hour, {
        idealMin: 50,
        idealMax: 76,
        hardMin: 28,
        hardMax: 96,
        popWeight: 24,
        windWeight: 12,
        gustWeight: 8,
        uvWeight: 2.8,
        airQualityWeight: 2.6,
      }),
    (hour) => {
      const temp =
        safeNum(hour?.apparentTemperatureF ?? hour?.apparent_temperature ?? hour?.feelsLikeF) ??
        safeNum(hour?.tempF ?? hour?.temperatureF ?? hour?.temperature_2m ?? hour?.temperature);
      const uv = safeNum(hour?.uvIndex ?? hour?.uv_index);
      const pop = safeNum(hour?.precipProbPct ?? hour?.precipitation_probability ?? hour?.precipChancePct);
      return `${fmtInt(temp, '°')} feel • UV ${fmt(uv, 0)} • ${fmtInt(pop, '%')} rain`;
    }
  );

  const flyingHourly = buildWeatherHourPreview(
    (hour) =>
      weatherHourScore(hour, {
        idealMin: 38,
        idealMax: 88,
        hardMin: 18,
        hardMax: 105,
        popWeight: 26,
        windWeight: 32,
        gustWeight: 20,
        visibilityPenalty: true,
      }),
    (hour) => {
      const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m);
      const gust = safeNum(hour?.gustMph ?? hour?.windGustMph ?? hour?.wind_gusts_10m);
      const vis =
        safeNum(hour?.visibilityMi) ??
        (safeNum(hour?.visibility ?? hour?.visibility_m) != null
          ? (safeNum(hour?.visibility ?? hour?.visibility_m) ?? 0) / 1609.344
          : null);
      return `${fmtInt(wind, ' mph')} wind • ${fmtInt(gust, ' mph')} gusts • ${fmt(vis, 1)} mi vis`;
    }
  );

  const astroHourly = astroHours
    .filter((hour: any) => {
      const t = new Date(hour?.time ?? '').getTime();
      return Number.isFinite(t) && t >= Date.now() - 30 * 60 * 1000;
    })
    .slice(0, 6)
    .map((hour: any) => {
      const score = normalizePreviewScore(hour?.skyScore ?? hour?.score);
      return {
        timeLabel: formatHourMiniLabel(hour?.time),
        score,
        tier: tierForScore(score),
        summary: cleanUiText(
          `${hour?.label ?? 'Sky'} • ${hour?.summary ?? ''}`.replace(/\s+•\s*$/, '')
        ),
      };
    });

  const boatingHourly = buildWeatherHourPreview(
    (hour) =>
      weatherHourScore(hour, {
        idealMin: 58,
        idealMax: 88,
        hardMin: 38,
        hardMax: 102,
        popWeight: 26,
        windWeight: 30,
        gustWeight: 24,
      }),
    (hour) => {
      const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m);
      const gust = safeNum(hour?.gustMph ?? hour?.windGustMph ?? hour?.wind_gusts_10m);
      const pop = safeNum(hour?.precipProbPct ?? hour?.precipitation_probability ?? hour?.precipChancePct);
      return `${fmtInt(wind, ' mph')} wind • ${fmtInt(gust, ' mph')} gusts • ${fmtInt(pop, '%')} rain`;
    }
  );

  const campingDetail = fireRestrictionsInEffect
    ? 'Fire restrictions are in effect nearby, so campfire and stove plans may be limited.'
    : redFlagWarning
    ? 'Red Flag Warning is active nearby, so campfire plans should be reconsidered.'
    : fireWeatherWatch
      ? 'Fire Weather Watch is active nearby, so dry and windy conditions deserve extra caution.'
      : safeNum(today?.windMaxMph) != null && safeNum(today?.dewPointMaxF) != null && (safeNum(today?.windMaxMph) ?? 0) >= 15 && (safeNum(today?.dewPointMaxF) ?? 99) < 35
        ? `Dry and breezy today${fireDangerLabel ? ` with ${fireDangerLabel.toLowerCase()} fire danger nearby` : ''}.`
        : `${fmtInt(safeNum(today?.tempMinF), 'Â°')} overnight with ${fmtInt(safeNum(today?.windMaxMph), ' mph')} wind and ${fmtInt(safeNum(today?.precipProbMaxPct), '%')} rain risk${fireDangerLabel ? `; ${fireDangerLabel.toLowerCase()} fire danger nearby` : ''}.`;

  const campingReason = explainBestShift(
    campingBest.bestDay?.date,
    campingBest.bestDay,
    [
      safeNum(campingBest.bestDay?.tempMinF) != null ? `${Math.round(safeNum(campingBest.bestDay?.tempMinF) ?? 0)}Â° overnight low` : null,
      safeNum(campingBest.bestDay?.windMaxMph) != null ? `${Math.round(safeNum(campingBest.bestDay?.windMaxMph) ?? 0)} mph wind` : null,
      safeNum(campingBest.bestDay?.precipProbMaxPct) != null ? `${Math.round(safeNum(campingBest.bestDay?.precipProbMaxPct) ?? 0)}% rain risk` : null,
      fireRestrictionsInEffect ? 'fire restrictions stay in effect nearby' : null,
      redFlagWarning ? 'Red Flag Warning remains active nearby' : null,
      fireWeatherWatch ? 'fire-weather risk stays elevated nearby' : null,
    ],
    'the overnight setup looks cleaner'
  );

  const campingKicker = [
    safeNum(today?.tempMinF) != null ? `${Math.round(safeNum(today?.tempMinF) ?? 0)} deg overnight` : null,
    fireRestrictionsInEffect ? 'Fire restrictions in effect' : null,
    fireDangerLabel ? `Fire danger: ${fireDangerLabel}` : null,
    !fireRestrictionsInEffect && fireRestrictionsSummary ? fireRestrictionsSummary.replace(/^No active fire restrictions listed for .*?\.\s*/i, 'No nearby fire restrictions listed. ') : null,
  ]
    .filter(Boolean)
    .join(' • ');

  return [
    {
      id: 'running',
      title: 'Running',
      icon: 'fitness-outline',
      score: todayRunning,
      tier: tierForScore(todayRunning),
      week: runningWeek,
      headline:
        todayRunning >= 78
          ? 'Excellent running conditions'
          : todayRunning >= 58
            ? 'Good running conditions'
            : todayRunning >= 40
              ? 'Manageable if timed well'
              : 'Poor running conditions',
      _legacyDetail:
        `${describeComfortDelta(args.feelsLikeF ?? safeNum(today?.tempMaxF), 45, 68)}; ` +
        `${safeNum(today?.windMaxMph) != null ? `${Math.round(safeNum(today?.windMaxMph) ?? 0)} mph wind` : 'wind is variable'}${safeNum(today?.precipProbMaxPct) != null ? `; ${Math.round(safeNum(today?.precipProbMaxPct) ?? 0)}% rain chance` : ''}${formatAirQuality() ? `; ${formatAirQuality()?.replace('Air quality: ', '').replace('air quality: ', '')}` : ''}.`,
      _legacyReason: explainBestShift(
        runningBest.bestDay?.date,
        runningBest.bestDay,
        [
          safeNum(runningBest.bestDay?.tempMaxF) != null ? `${Math.round(safeNum(runningBest.bestDay?.tempMaxF) ?? 0)}° for steadier effort` : null,
          safeNum(runningBest.bestDay?.windMaxMph) != null ? `${Math.round(safeNum(runningBest.bestDay?.windMaxMph) ?? 0)} mph wind` : null,
          safeNum(runningBest.bestDay?.precipProbMaxPct) != null ? `${Math.round(safeNum(runningBest.bestDay?.precipProbMaxPct) ?? 0)}% rain risk` : null,
          formatAirQuality(),
        ],
        'cooler and drier conditions line up better'
      ),
      kicker: [args.feelsLikeF != null ? `Feels like ${Math.round(args.feelsLikeF)}°` : null, formatAirQuality()]
        .filter(Boolean)
        .join(' • '),
    },
    {
      id: 'camping',
      title: 'Camping',
      icon: 'bonfire-outline',
      score: todayCamping,
      tier: tierForScore(todayCamping),
      headline:
        todayCamping >= 78
          ? 'Excellent camping conditions'
          : todayCamping >= 58
            ? 'Good camping conditions'
            : todayCamping >= 40
              ? 'Mixed camping conditions'
              : 'Poor camping conditions',
      _legacyDetail:
        safeNum(today?.windMaxMph) != null && safeNum(today?.dewPointMaxF) != null && (safeNum(today?.windMaxMph) ?? 0) >= 15 && (safeNum(today?.dewPointMaxF) ?? 99) < 35
          ? 'Dry and breezy today, so fire danger deserves attention.'
          : `${fmtInt(safeNum(today?.tempMinF), '°')} overnight with ${fmtInt(safeNum(today?.windMaxMph), ' mph')} wind and ${fmtInt(safeNum(today?.precipProbMaxPct), '%')} rain risk.`,
      _legacyReason: explainBestShift(
        campingBest.bestDay?.date,
        campingBest.bestDay,
        [
          safeNum(campingBest.bestDay?.tempMinF) != null ? `${Math.round(safeNum(campingBest.bestDay?.tempMinF) ?? 0)}° overnight low` : null,
          safeNum(campingBest.bestDay?.windMaxMph) != null ? `${Math.round(safeNum(campingBest.bestDay?.windMaxMph) ?? 0)} mph wind` : null,
          safeNum(campingBest.bestDay?.precipProbMaxPct) != null ? `${Math.round(safeNum(campingBest.bestDay?.precipProbMaxPct) ?? 0)}% rain risk` : null,
        ],
        'the overnight setup looks cleaner'
      ),
      _legacyKicker: safeNum(today?.tempMinF) != null ? `${Math.round(safeNum(today?.tempMinF) ?? 0)} deg overnight` : null,
      detail: campingDetail,
      reason: campingReason,
      kicker: campingKicker,
      week: campingWeek,
    },
    {
      id: 'fishing',
      title: 'Fishing',
      icon: 'fish-outline',
      score: todayFishing,
      tier: tierForScore(todayFishing),
      headline:
        todayFishing >= 76
          ? 'Excellent fishing conditions'
          : todayFishing >= 58
            ? 'Good fishing window'
            : todayFishing >= 40
              ? 'Choppy or unsettled'
              : 'Poor fishing conditions',
      detail: `${fmtInt(safeNum(today?.windMaxMph), ' mph')} wind, ${fmtInt(safeNum(today?.cloudCoverAvgPct), '%')} cloud cover, and ${fmtInt(safeNum(today?.precipProbMaxPct), '%')} rain risk today.`,
      reason: explainBestShift(
        fishingBest.bestDay?.date,
        fishingBest.bestDay,
        [
          safeNum(fishingBest.bestDay?.windMaxMph) != null ? `${Math.round(safeNum(fishingBest.bestDay?.windMaxMph) ?? 0)} mph wind` : null,
          safeNum(fishingBest.bestDay?.cloudCoverAvgPct) != null ? `${Math.round(safeNum(fishingBest.bestDay?.cloudCoverAvgPct) ?? 0)}% clouds` : null,
          'dawn and dusk look steadier',
        ],
        'wind and sky cover line up a little better'
      ),
      kicker: safeNum(today?.windMaxMph) != null ? `${Math.round(safeNum(today?.windMaxMph) ?? 0)} mph wind` : null,
      week: fishingWeek,
    },
    {
      id: 'hiking',
      title: 'Hiking',
      icon: 'footsteps-outline',
      score: todayHiking,
      tier: tierForScore(todayHiking),
      week: hikingWeek,
      headline:
        todayHiking >= 80
          ? 'Excellent hiking conditions'
          : todayHiking >= 60
            ? 'Good hiking window'
            : todayHiking >= 42
              ? 'Start early'
              : 'Poor hiking conditions',
      detail:
        `${describeComfortDelta(args.feelsLikeF ?? safeNum(today?.tempMaxF), 50, 76)}; ` +
        `${safeNum(today?.uvIndexMax) != null ? `UV ${safeNum(today?.uvIndexMax)?.toFixed(1)}` : 'UV unknown'} and ` +
        `${safeNum(today?.precipProbMaxPct) != null ? `${Math.round(safeNum(today?.precipProbMaxPct) ?? 0)}% rain chance` : 'uncertain rain odds'}${formatAirQuality() ? `; ${formatAirQuality()?.replace('Air quality: ', '').replace('air quality: ', '')}` : ''} today.`,
      reason: explainBestShift(
        hikingBest.bestDay?.date,
        hikingBest.bestDay,
        [
          safeNum(hikingBest.bestDay?.tempMaxF) != null ? `${Math.round(safeNum(hikingBest.bestDay?.tempMaxF) ?? 0)}° high` : null,
          safeNum(hikingBest.bestDay?.uvIndexMax) != null ? `UV ${safeNum(hikingBest.bestDay?.uvIndexMax)?.toFixed(1)}` : null,
          safeNum(hikingBest.bestDay?.precipProbMaxPct) != null ? `${Math.round(safeNum(hikingBest.bestDay?.precipProbMaxPct) ?? 0)}% rain risk` : null,
          formatAirQuality(),
        ],
        'heat and exposure ease up'
      ),
      kicker: [args.feelsLikeF != null ? `Feels like ${Math.round(args.feelsLikeF)}°` : null, formatAirQuality()]
        .filter(Boolean)
        .join(' • '),
    },
    {
      id: 'flying',
      title: 'Flying',
      icon: 'airplane-outline',
      score: todayFlying,
      tier: tierForScore(todayFlying),
      headline:
        todayFlying >= 80 ? 'Favorable flying conditions' : todayFlying >= 60 ? 'Mostly flyable' : todayFlying >= 42 ? 'Check the briefing' : 'Bumpy or marginal',
      detail: `${fmtInt(safeNum(today?.windMaxMph), ' mph')} wind, ${fmtInt(safeNum(today?.windGustMaxMph), ' mph')} gusts, and ${args.visibilityMi != null ? `${args.visibilityMi.toFixed(1)} mi visibility` : 'uncertain visibility'} today.`,
      reason: explainBestShift(
        flyingBest.bestDay?.date,
        flyingBest.bestDay,
        [
          safeNum(flyingBest.bestDay?.windMaxMph) != null ? `${Math.round(safeNum(flyingBest.bestDay?.windMaxMph) ?? 0)} mph wind` : null,
          safeNum(flyingBest.bestDay?.windGustMaxMph) != null ? `${Math.round(safeNum(flyingBest.bestDay?.windGustMaxMph) ?? 0)} mph gusts` : null,
          args.visibilityMi != null ? `${args.visibilityMi.toFixed(1)} mi visibility` : null,
        ],
        'winds and visibility look cleaner'
      ),
      kicker: args.visibilityMi != null ? `${args.visibilityMi.toFixed(1)} mi vis` : null,
      week: flyingWeek,
    },
    {
      id: 'stargazing',
      title: 'Stargazing',
      icon: 'star-outline',
      score: astroScore,
      tier: astroTier,
      headline:
        astroScore >= 82
          ? 'Excellent observing window'
          : astroScore >= 64
            ? 'Good observing potential'
            : astroScore >= 44
              ? 'Limited observing window'
              : 'Poor observing conditions',
      detail: args.astroData?.bestSummary ? `${astroWindow} - ${String(args.astroData.bestSummary)}` : astroWindow,
      reason: args.astroData?.peakLabel
        ? `${formatShortDay(args.astroData?.peakDate ?? null)} has the best Sky Score because observing conditions are ${String(args.astroData.peakLabel).toLowerCase()}.`
        : null,
      kicker: aerosolLabel ? `Aerosols: ${aerosolLabel}` : args.astroData?.peakLabel ? String(args.astroData.peakLabel) : 'Tonight',
      week: astroWeek,
    },
    {
      id: 'boating',
      title: 'Boating',
      icon: 'boat-outline',
      score: todayBoating,
      tier: tierForScore(todayBoating),
      headline:
        todayBoating >= 80
          ? 'Calm boating window'
          : todayBoating >= 60
            ? 'Mostly manageable'
            : todayBoating >= 42
              ? 'Watch for chop'
              : 'Poor boating conditions',
      detail: `${fmtInt(safeNum(today?.windMaxMph), ' mph')} sustained wind, ${fmtInt(safeNum(today?.windGustMaxMph), ' mph')} gusts, and ${fmtInt(safeNum(today?.precipProbMaxPct), '%')} rain risk today.`,
      reason: explainBestShift(
        boatingBest.bestDay?.date,
        boatingBest.bestDay,
        [
          safeNum(boatingBest.bestDay?.windMaxMph) != null ? `${Math.round(safeNum(boatingBest.bestDay?.windMaxMph) ?? 0)} mph wind` : null,
          safeNum(boatingBest.bestDay?.windGustMaxMph) != null ? `${Math.round(safeNum(boatingBest.bestDay?.windGustMaxMph) ?? 0)} mph gusts` : null,
          safeNum(boatingBest.bestDay?.precipProbMaxPct) != null ? `${Math.round(safeNum(boatingBest.bestDay?.precipProbMaxPct) ?? 0)}% rain risk` : null,
        ],
        'water and weather settle down'
      ),
      kicker: safeNum(today?.windGustMaxMph) != null ? `${Math.round(safeNum(today?.windGustMaxMph) ?? 0)} mph gusts` : null,
      week: boatingWeek,
    },
  ] as ActivityCardModel[];
}

function ActivityForecastSection({
  daily,
  hourly,
  visibilityMi,
  astroData,
  feelsLikeF,
  fireContext,
  onLearnTopic,
}: {
  daily: any[];
  hourly: any[];
  visibilityMi: number | null;
  astroData: any;
  feelsLikeF: number | null;
  fireContext: any;
  onLearnTopic?: (topicId: string) => void;
}) {
  const [flippedId, setFlippedId] = useState<string | null>(null);
  const cards = useMemo(
    () =>
      buildActivityForecast({
        daily,
        hourly,
        visibilityMi,
        astroData,
        feelsLikeF,
        fireContext,
      }),
    [astroData, daily, feelsLikeF, fireContext, hourly, visibilityMi]
  );

  const hourlyPreviewByCard = useMemo(() => {
    const futureWeatherHours = (hourly ?? [])
      .filter((h) => {
        const t = new Date(h?.time ?? h?.datetime ?? h?.date ?? '').getTime();
        return Number.isFinite(t) && t >= Date.now() - 30 * 60 * 1000;
      })
      .filter((_, idx) => idx === 0 || idx % 2 === 0)
      .slice(0, 6);

    const airLabel =
      typeof astroData?.aerosols?.airQualityLabel === 'string' ? astroData.aerosols.airQualityLabel : null;
    const airIndex = safeNum(astroData?.aerosols?.airQualityIndex);
    const fireRestricted = fireContext?.restrictions?.inEffect === true;
    const fireWatch = !!fireContext?.fireWeather?.fireWeatherWatch;
    const redFlag = !!fireContext?.fireWeather?.redFlagWarning;

    const weatherPreview = (id: string) =>
      futureWeatherHours.map((hour) => {
        const timeLabel = formatHourMiniLabel(hour?.time ?? hour?.datetime ?? hour?.date);
        const temp =
          safeNum(hour?.apparentTemperatureF ?? hour?.apparent_temperature ?? hour?.feelsLikeF) ??
          safeNum(hour?.tempF ?? hour?.temperatureF ?? hour?.temperature_2m ?? hour?.temperature);
        const wind = safeNum(hour?.windMph ?? hour?.windSpeedMph ?? hour?.wind_speed_10m ?? hour?.windspeed_10m) ?? 0;
        const gust = safeNum(hour?.gustMph ?? hour?.windGustMph ?? hour?.wind_gusts_10m) ?? 0;
        const pop = safeNum(hour?.precipProbPct ?? hour?.precipitation_probability ?? hour?.precipChancePct) ?? 0;
        const uv = safeNum(hour?.uvIndex ?? hour?.uv_index) ?? 0;
        const cloud = safeNum(hour?.cloudCoverPct ?? hour?.cloud_cover ?? hour?.cloudCover) ?? 0;
        const vis =
          safeNum(hour?.visibilityMi) ??
          (safeNum(hour?.visibility ?? hour?.visibility_m) != null
            ? (safeNum(hour?.visibility ?? hour?.visibility_m) ?? 0) / 1609.344
            : visibilityMi);

        let score = 70;
        let summary = `${fmtInt(temp, '°')} • ${fmtInt(wind, ' mph')} wind`;

        if (id === 'running' || id === 'hiking') {
          score -= Math.max((temp ?? 65) - (id === 'running' ? 68 : 76), 0) * 1.2;
          score -= Math.max(wind - 12, 0) * 1.3;
          score -= (pop / 100) * 24;
          score -= Math.max(uv - 6, 0) * 3;
          if (airIndex != null) score -= Math.max(airIndex - 50, 0) / 2.5;
          summary = `${fmtInt(temp, '°')} feel • UV ${fmt(uv, 0)} • ${airLabel ?? 'AQ pending'}`;
        } else if (id === 'camping') {
          score -= Math.max(wind - 12, 0) * 1.7;
          score -= (pop / 100) * 28;
          if (fireRestricted) score -= 26;
          else if (redFlag) score -= 22;
          else if (fireWatch) score -= 12;
          summary = `${fmtInt(temp, '°')} • ${fmtInt(wind, ' mph')} wind • ${fireRestricted ? 'Restrictions' : fmtInt(pop, '%')} rain`;
        } else if (id === 'fishing') {
          score -= Math.max(wind - 10, 0) * 2.2;
          score -= (pop / 100) * 16;
          summary = `${fmtInt(wind, ' mph')} wind • UV ${fmt(uv, 0)} • ${fmtInt(cloud, '%')} clouds`;
        } else if (id === 'flying') {
          score -= Math.max(wind - 10, 0) * 2.4;
          score -= Math.max(gust - 18, 0) * 1.8;
          score -= (pop / 100) * 18;
          score -= Math.max(5 - (vis ?? 10), 0) * 12;
          summary = `${fmt(vis, 1)} mi vis • ${fmtInt(wind, ' mph')} wind • ${fmtInt(gust, ' mph')} gusts`;
        } else if (id === 'boating') {
          score -= Math.max(wind - 10, 0) * 2.4;
          score -= Math.max(gust - 16, 0) * 1.8;
          score -= (pop / 100) * 18;
          summary = `${fmtInt(wind, ' mph')} wind • ${fmtInt(gust, ' mph')} gusts • ${fmtInt(pop, '%')} rain`;
        }

      return {
          timeLabel,
          score: clamp(Math.round(score), 0, 100),
          tier: tierForScore(clamp(Math.round(score), 0, 100)),
          summary,
        };
      });

    const astroPreview = (Array.isArray(astroData?.hours) ? astroData.hours : [])
      .filter((hour: any) => {
        const t = new Date(hour?.time ?? '').getTime();
        return Number.isFinite(t) && t >= Date.now() - 30 * 60 * 1000;
      })
      .slice(0, 6)
      .map((hour: any) => {
        const score = normalizePreviewScore(hour?.skyScore ?? hour?.score);
        return {
          timeLabel: formatHourMiniLabel(hour?.time),
          score,
          tier: tierForScore(score),
          summary: cleanUiText(`${hour?.label ?? 'Sky'} • ${hour?.summary ?? ''}`),
        };
      });

    return {
      running: weatherPreview('running'),
      camping: weatherPreview('camping'),
      fishing: weatherPreview('fishing'),
      hiking: weatherPreview('hiking'),
      flying: weatherPreview('flying'),
      stargazing: astroPreview,
      boating: weatherPreview('boating'),
    } as Record<string, Array<{ timeLabel: string; score: number; tier: ActivityTier; summary: string }>>;
  }, [astroData, fireContext, hourly, visibilityMi]);

  if (!cards.length) return null;

  return (
    <Card style={styles.activitySectionCard}>
      <View style={styles.activitySectionHeader}>
        <View style={styles.activitySectionHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Activity forecast</Text>
            <Text style={styles.activitySectionSubtext}>7-day reads for the next outing, launch, cast, or sky check.</Text>
          </View>
          <Pressable
            onPress={() => onLearnTopic?.('activity-scores')}
            style={styles.activityLearnButton}
            hitSlop={8}
          >
            <Ionicons name="information-circle-outline" size={14} color="rgba(191,219,254,0.92)" />
            <Text style={styles.activityLearnButtonText}>wxLearn</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.activityGrid}>
        {cards.map((card) => {
          const colors = tierColors(card.tier);
          const isFlipped = flippedId === card.id;
          const hourlyPreview = hourlyPreviewByCard[card.id] ?? [];

          return (
            <Pressable
              key={card.id}
              onPress={() => setFlippedId((current) => (current === card.id ? null : card.id))}
              style={[
                styles.activityWideCard,
                {
                  backgroundColor: 'rgba(9,14,28,0.78)',
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.activityMiniTopRow}>
                <View style={styles.activityWideIdentity}>
                  <View
                    style={[styles.activityMiniIconWrap, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  >
                    <Ionicons name={card.icon as any} size={18} color={colors.text} />
                  </View>
                  <Text style={styles.activityMiniTitle}>{card.title}</Text>
                </View>

                <View style={[styles.activityMiniPill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Text style={[styles.activityMiniPillText, { color: colors.text }]}>
                    {isFlipped ? 'Hourly' : labelForTier(card.tier)}
                  </Text>
                </View>
              </View>

              {isFlipped ? (
                <>
                  <Text style={styles.activityWideHeadline}>Next-hour outlook</Text>
                  <View style={styles.activityWeekRow}>
                    {hourlyPreview.map((entry) => {
                      const entryColors = tierColors(entry.tier);
                      return (
                        <View key={`${card.id}-${entry.timeLabel}`} style={styles.activityHourBlock}>
                          <View style={styles.activityWeekItem}>
                            <Text style={styles.activityWeekLabel}>{entry.timeLabel}</Text>
                            <View style={styles.activityWeekBar}>
                              <View
                                style={[
                                  styles.activityWeekFill,
                                  {
                                    width: `${clamp(entry.score, 0, 100)}%`,
                                    backgroundColor: entryColors.text,
                                  },
                                ]}
                              />
                            </View>
                            <Text style={[styles.activityWeekScore, { color: entryColors.text }]}>{entry.score}</Text>
                          </View>
                          <Text style={styles.activityHourlySummary}>{cleanUiText(entry.summary)}</Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.activityWideHeadline}>{cleanUiText(card.headline)}</Text>
                  <Text style={styles.activityMiniDetail}>{cleanUiText(card.detail)}</Text>

                  <View style={styles.activityWeekRow}>
                    {(card.week ?? []).map((entry) => {
                      const weekColors = tierColors(entry.tier);
                      return (
                        <View key={`${card.id}-${entry.date ?? entry.shortDay}`} style={styles.activityWeekItem}>
                          <Text style={styles.activityWeekLabel}>{entry.shortDay}</Text>
                          <View style={styles.activityWeekBar}>
                            <View
                              style={[
                                styles.activityWeekFill,
                                {
                                  width: `${clamp(entry.score, 0, 100)}%`,
                                  backgroundColor: weekColors.text,
                                },
                              ]}
                            />
                          </View>
                          <Text style={[styles.activityWeekScore, { color: weekColors.text }]}>{entry.score}</Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text style={styles.activityMiniKicker}>
                    {cleanUiText(card.kicker ?? `${card.score}/100 fit score`)}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

async function fetchFavoriteWeatherPreview(lat: number, lon: number): Promise<FavoriteWeatherPreview> {
  const key = favoritePreviewKey(lat, lon);
  const cached = favoritePreviewCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&current=weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&forecast_days=1` +
    `&temperature_unit=fahrenheit` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    return {
      emoji: '🌤️',
      condition: 'Weather',
      hi: null,
      lo: null,
    };
  }

  const data = await res.json();

  const currentCode = safeNum(data?.current?.weather_code);
  const dailyCode = safeNum(data?.daily?.weather_code?.[0]);
  const code = currentCode ?? dailyCode ?? null;

  const hi = safeNum(data?.daily?.temperature_2m_max?.[0]);
  const lo = safeNum(data?.daily?.temperature_2m_min?.[0]);

  const preview: FavoriteWeatherPreview = {
    emoji: weatherCodeToEmoji(code),
    condition: weatherCodeToLabel(code),
    hi,
    lo,
  };

  favoritePreviewCache.set(key, {
    expiresAt: Date.now() + FAVORITE_PREVIEW_TTL_MS,
    data: preview,
  });

  return preview;
}

function LocationPickerModal({
  visible,
  onClose,
  onPick,
  onPickCurrent,
  favorites,
  activeLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (loc: SavedLocation) => void;
  onPickCurrent: () => void;
  favorites: FavoriteLocation[];
  activeLabel: string;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SavedLocation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [favoriteWeather, setFavoriteWeather] = useState<Record<string, FavoriteWeatherPreview>>({});
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setResults([]);
    setErr(null);
    setBusy(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    const loadFavoriteWeather = async () => {
      const favs = favorites ?? [];
      if (!favs.length) {
        setFavoriteWeather({});
        return;
      }

      try {
        const entries = await Promise.all(
          favs.map(async (fav) => {
            try {
              const preview = await fetchFavoriteWeatherPreview(fav.lat, fav.lon);
              return [fav.id, preview] as const;
            } catch {
              return [
                fav.id,
                {
                  emoji: '🌤️',
                  condition: 'Weather',
                  hi: null,
                  lo: null,
                } satisfies FavoriteWeatherPreview,
              ] as const;
            }
          })
        );

        if (!cancelled) {
          setFavoriteWeather(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setFavoriteWeather({});
      }
    };

    loadFavoriteWeather();

    return () => {
      cancelled = true;
    };
  }, [visible, favorites]);

  useEffect(() => {
    if (!visible) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const query = q.trim();
    if (!query) {
      setResults([]);
      setErr(null);
      setBusy(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setBusy(true);
        setErr(null);

        const r = await geocodePlaces(query);

        setResults(
          (r ?? []).map((x: any) => ({
            id: x.id ?? `geo:${x.lat.toFixed(4)},${x.lon.toFixed(4)}`,
            name: x.name,
            admin1: x.admin1,
            country: x.country,
            lat: x.lat,
            lon: x.lon,
            tz: x.tz,
          }))
        );
      } catch {
        setErr('Search failed.');
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, visible]);

  const queryActive = q.trim().length > 0;

  const favRows: Array<any> = (favorites ?? []).map((item) => {
    const preview = favoriteWeather[item.id];

    return {
      key: item.id,
      kind: 'favorite',
      title: formatLocLabel({ name: item.name }),
      sub: preview?.condition ?? `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
      emoji: preview?.emoji ?? '🌤️',
      hi: preview?.hi ?? null,
      lo: preview?.lo ?? null,
      onPress: () =>
        onPick({
          id: item.id,
          name: item.name,
          lat: item.lat,
          lon: item.lon,
        }),
    };
  });

  const resRows: Array<any> = (results ?? []).map((item) => ({
    key: item.id,
    kind: 'result',
    title: formatLocLabel(item),
    sub: `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
    onPress: () => onPick(item),
  }));

  const sections = useMemo(() => {
    const out: Array<{ title: string; data: any[] }> = [];

    if (queryActive) {
      out.push({
        title: 'Search results',
        data: resRows.length
          ? resRows
          : [{ key: 'nomatch', kind: 'empty', title: 'No matches', sub: 'Try a different query.', onPress: () => {} }],
      });

      out.push({
        title: 'Favorites',
        data: favRows.length
          ? favRows
          : [{ key: 'nofavs', kind: 'empty', title: 'No favorites yet', sub: 'Star a place to save it.', onPress: () => {} }],
      });
    } else {
      out.push({
        title: 'Favorites',
        data: favRows.length
          ? favRows
          : [{ key: 'nofavs', kind: 'empty', title: 'No favorites yet', sub: 'Star a place to save it.', onPress: () => {} }],
      });

      out.push({
        title: 'Search',
        data: [{ key: 'type', kind: 'empty', title: 'Start typing to search', sub: 'City, state, country…', onPress: () => {} }],
      });
    }

    return out;
  }, [favRows, resRows, queryActive]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Location</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>Done</Text>
          </Pressable>
        </View>

        <Text style={styles.modalActive} numberOfLines={1}>
          Current view: <Text style={{ fontWeight: '900' }}>{activeLabel}</Text>
        </Text>

        <Pressable onPress={onPickCurrent} style={styles.currentBtn}>
          <Text style={styles.currentBtnText}>Use current location</Text>
        </Pressable>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search city, state, country…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
        />

        {busy ? (
          <View style={{ paddingVertical: 10 }}>
            <ActivityIndicator />
          </View>
        ) : null}

        {err ? <Text style={styles.modalError}>{err}</Text> : null}

        <SectionList
          sections={sections}
          keyExtractor={(it: any) => it.key}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }: any) => <Text style={styles.modalSection}>{section.title}</Text>}
          renderItem={({ item }: any) => {
            const isEmpty = item.kind === 'empty';

            if (item.kind === 'favorite') {
              return (
                <Pressable onPress={item.onPress} style={styles.favoritePickRow}>
                  <View style={styles.favoriteEmojiBadge}>
                    <Text style={styles.favoriteEmoji}>{item.emoji}</Text>
                  </View>

                  <View style={styles.favoriteMain}>
                    <Text style={styles.favoriteTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.favoriteSub} numberOfLines={1}>
                      {item.sub}
                    </Text>
                  </View>

                  <View style={styles.favoriteTempBlock}>
                    <Text style={styles.favoriteHi}>{item.hi != null ? `${Math.round(item.hi)}°` : '—'}</Text>
                    <Text style={styles.favoriteLo}>{item.lo != null ? `${Math.round(item.lo)}°` : '—'}</Text>
                  </View>
                </Pressable>
              );
            }

            return (
              <Pressable
                onPress={item.onPress}
                style={[styles.pickRow, isEmpty && { opacity: 0.75 }]}
                disabled={isEmpty}
              >
                <Text style={styles.pickTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.pickSub} numberOfLines={1}>
                  {item.sub}
                </Text>
              </Pressable>
            );
          }}
          style={{ flex: 1, marginTop: 8 }}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    </Modal>
  );
}

function StatTile({
  label,
  value,
  onPress,
  valueHint,
  style,
}: {
  label: string;
  value: string;
  valueHint?: string;
  onPress?: () => void;
  style?: any;
}) {
  const body = (
    <View style={[styles.statTile, style]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1}>
        {value}
      </Text>
      {valueHint ? <Text style={styles.tileHint}>{valueHint}</Text> : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {body}
    </Pressable>
  );
}

function SimpleSummary({
  dewpointF,
  humidityPct,
  windMph,
  gustMph,
  windDirDeg,
  precipChancePct,
  uvIndex,
  airQualityLabel,
  pressureHpa,
  pressureInHg,
  pressureTrend,
  narrative,
  hideWind,
}: {
  dewpointF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
  precipChancePct: number | null;
  uvIndex: number | null;
  airQualityLabel: string | null;
  pressureHpa: number | null;
  pressureInHg: number | null;
  pressureTrend: { arrow: '↑' | '↓' | '→'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null };
  narrative?: string;
  hideWind?: boolean;
}) {
  const hasMoisture = dewpointF != null || humidityPct != null;
  const hasWind = !hideWind && (windMph != null || gustMph != null || windDirDeg != null);
  const hasExtras =
    precipChancePct != null || uvIndex != null || !!airQualityLabel || pressureHpa != null || pressureInHg != null;

  const dirToCompassLocal = (deg: number | null) => {
    if (deg == null) return null;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((deg % 360) / 22.5)) % 16;
    return dirs[idx];
  };

  const windDirText = windDirDeg != null ? `${dirToCompassLocal(windDirDeg) ?? ''}`.trim() : '—';
  const fmt0 = (v: number | null, suffix = '') => (v == null ? '—' : `${Math.round(v)}${suffix}`);
  const fmt1 = (v: number | null, suffix = '') => (v == null ? '—' : `${v.toFixed(1)}${suffix}`);

  const pressurePrimary =
    pressureInHg != null ? `${pressureInHg.toFixed(2)} inHg` : pressureHpa != null ? `${fmt0(pressureHpa)} hPa` : '—';

  const trendLine =
    pressureHpa != null
      ? `${fmt0(pressureHpa)} hPa ${pressureTrend.arrow} ${pressureTrend.label}`
      : pressureTrend.deltaHpa != null
        ? `${pressureTrend.arrow} ${pressureTrend.label}`
        : undefined;

  return (
    <View style={ss.wrap}>
      {hasMoisture ? (
        <View style={ss.section}>
          <Text style={ss.sectionTitle}>Comfort</Text>

          <View style={ss.grid2}>
            <View style={ss.cell}>
              <Text style={ss.k}>Dew Point</Text>
              <Text style={ss.v}>{dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>RH</Text>
              <Text style={ss.v}>{humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}</Text>
            </View>
          </View>

          {narrative ? (
            <Text style={ss.note} numberOfLines={2}>
              {narrative}
            </Text>
          ) : null}
        </View>
      ) : null}

      {hasWind ? (
        <View style={ss.section}>
          <Text style={ss.sectionTitle}>Wind</Text>

          <View style={ss.grid2}>
            <View style={ss.cell}>
              <Text style={ss.k}>Speed</Text>
              <Text style={ss.v}>
                {windMph != null ? `${Math.round(windMph)} mph` : '—'}{' '}
                <Text style={{ opacity: 0.7 }}>{windDirText}</Text>
              </Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Gusts</Text>
              <Text style={ss.v}>{gustMph != null ? `${Math.round(gustMph)} mph` : '—'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {hasExtras ? (
        <View style={ss.section}>
          <Text style={ss.sectionTitle}>Extras</Text>

          <View style={ss.grid2}>
            <View style={ss.cell}>
              <Text style={ss.k}>Precip</Text>
              <Text style={ss.v}>{precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>UV Index</Text>
              <Text style={ss.v}>{uvIndex != null ? fmt1(uvIndex) : '—'}</Text>
            </View>
          </View>

          <View style={ss.grid2}>
            <View style={ss.cell}>
              <Text style={ss.k}>Air Quality</Text>
              <Text style={ss.v}>{airQualityLabel ?? '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Pressure</Text>
              <Text style={ss.v}>
                {pressurePrimary} <Text style={{ opacity: 0.8 }}>{pressureTrend.arrow}</Text>
              </Text>
              {trendLine ? <Text style={ss.note}>{trendLine}</Text> : null}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DailyForecastList({
  daily,
  hourly,
  moonrise,
  moonset,
  maxDays = 15,
}: {
  daily: any[];
  hourly?: any[];
  moonrise?: string | null;
  moonset?: string | null;
  maxDays?: number;
}) {
  const rows = (daily ?? []).slice(0, maxDays);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);

  if (!rows.length) return null;

  const toggleRow = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const fmtWind = (v: number | null) => (v != null ? `${Math.round(v)} mph` : '—');

  const getIsoDateKey = (raw: any) => {
    const s = typeof raw === 'string' ? raw : '';
    if (!s) return '';
    return s.slice(0, 10);
  };

  const getHour = (raw: any) => {
    const s = typeof raw === 'string' ? raw : '';
    if (!s || s.length < 13) return null;
    const h = Number(s.slice(11, 13));
    return Number.isFinite(h) ? h : null;
  };

  const hourConditionLabel = (h: any) => {
    const code =
      safeNum(h?.weatherCode ?? h?.weather_code ?? h?.weathercode ?? h?.condition_code ?? h?.code) ?? null;
    return weatherCodeToLabel(code);
  };

  const hourPop = (h: any) =>
    safeNum(h?.precipitation_probability ?? h?.precipProbPct ?? h?.precipChancePct ?? h?.pop) ?? null;

  const hourWind = (h: any) =>
    safeNum(h?.windMph ?? h?.windSpeedMph ?? h?.wind_speed_mph ?? h?.windSpeed ?? h?.wind) ?? null;

  const hourGust = (h: any) =>
    safeNum(h?.gustMph ?? h?.windGustMph ?? h?.wind_gust_mph ?? h?.gust ?? h?.windGust) ?? null;

  const hourTemp = (h: any) =>
    safeNum(h?.tempF ?? h?.temperatureF ?? h?.temperature_2m ?? h?.temperature ?? h?.temp) ?? null;

  const summarizeBlock = (block: any[], label: 'Day' | 'Night') => {
    if (!block.length) {
      return {
        label,
        condition: '—',
        pop: null as number | null,
        wind: null as number | null,
        gust: null as number | null,
        tempMin: null as number | null,
        tempMax: null as number | null,
        narrative: `${label} details unavailable.`,
      };
    }

    const pops = block.map(hourPop).filter((v): v is number => v != null);
    const winds = block.map(hourWind).filter((v): v is number => v != null);
    const gusts = block.map(hourGust).filter((v): v is number => v != null);
    const temps = block.map(hourTemp).filter((v): v is number => v != null);

    const conditionCounts = new Map<string, number>();
    for (const h of block) {
      const c = hourConditionLabel(h);
      conditionCounts.set(c, (conditionCounts.get(c) ?? 0) + 1);
    }

    let dominantCondition = '—';
    let dominantCount = -1;
    for (const [cond, count] of conditionCounts.entries()) {
      if (count > dominantCount) {
        dominantCondition = cond;
        dominantCount = count;
      }
    }

    const pop = pops.length ? Math.max(...pops) : null;
    const wind = winds.length ? Math.max(...winds) : null;
    const gust = gusts.length ? Math.max(...gusts) : null;
    const tempMin = temps.length ? Math.min(...temps) : null;
    const tempMax = temps.length ? Math.max(...temps) : null;

    const phrases: string[] = [];

    if (dominantCondition !== '—') {
      if (dominantCondition === 'Clear') phrases.push(label === 'Day' ? 'Bright and clear' : 'Clear skies');
      else if (dominantCondition === 'Mostly clear') phrases.push(label === 'Day' ? 'Mostly sunny' : 'Mostly clear');
      else if (dominantCondition === 'Partly cloudy') phrases.push('Partly cloudy');
      else if (dominantCondition === 'Overcast') phrases.push('Cloudy');
      else if (dominantCondition === 'Rain') phrases.push('Rain likely');
      else if (dominantCondition === 'Showers') phrases.push('Showers around');
      else if (dominantCondition === 'Drizzle') phrases.push('Light drizzle possible');
      else if (dominantCondition === 'Snow') phrases.push('Snow possible');
      else if (dominantCondition === 'Thunderstorm') phrases.push('Storms possible');
      else if (dominantCondition === 'Fog') phrases.push('Fog possible');
      else phrases.push(dominantCondition);
    }

    if (pop != null) {
      if (pop >= 70) phrases.push('high precip chance');
      else if (pop >= 40) phrases.push('some precip possible');
      else if (pop <= 10) phrases.push('mainly dry');
    }

    if (wind != null) {
      if (wind >= 25) phrases.push('windy');
      else if (wind >= 15) phrases.push('breezy');
    }

    const narrative = phrases.length
      ? `${phrases[0].charAt(0).toUpperCase()}${phrases[0].slice(1)}${phrases.length > 1 ? ` • ${phrases.slice(1).join(' • ')}` : ''}.`
      : `${label} conditions vary.`;

    return {
      label,
      condition: dominantCondition,
      pop,
      wind,
      gust,
      tempMin,
      tempMax,
      narrative,
    };
  };

  const buildDayNight = (dateRaw: any) => {
    const dayKey = getIsoDateKey(dateRaw);
    const sameDay = (hourly ?? []).filter((h) => getIsoDateKey(h?.time ?? h?.datetime ?? h?.date) === dayKey);

    const dayHours = sameDay.filter((h) => {
      const hour = getHour(h?.time ?? h?.datetime ?? h?.date);
      return hour != null && hour >= 6 && hour < 18;
    });

    const nightHours = sameDay.filter((h) => {
      const hour = getHour(h?.time ?? h?.datetime ?? h?.date);
      return hour != null && (hour < 6 || hour >= 18);
    });

    return {
      day: summarizeBlock(dayHours, 'Day'),
      night: summarizeBlock(nightHours, 'Night'),
    };
  };

  return (
    <View style={styles.dailyList}>
      {rows.map((day: any, idx: number) => {
        const key = String(day?.date ?? day?.time ?? `day-${idx}`);
        const expanded = expandedKey === key;

        const label = formatDailyLabel(day?.date ?? day?.time);

        const hi =
          safeNum(day?.tempMaxF ?? day?.temperatureMaxF ?? day?.temperature_2m_max ?? day?.maxTempF ?? day?.highF) ?? null;
        const lo =
          safeNum(day?.tempMinF ?? day?.temperatureMinF ?? day?.temperature_2m_min ?? day?.minTempF ?? day?.lowF) ?? null;

        const pop =
          safeNum(day?.precipProbMaxPct ?? day?.precipitationProbabilityMax ?? day?.pop ?? day?.precipChancePct) ?? null;

        const code =
          safeNum(day?.weatherCode ?? day?.weather_code ?? day?.weathercode ?? day?.code) ?? null;

        const wind =
          safeNum(day?.windSpeedMaxMph ?? day?.windMaxMph ?? day?.maxWindMph ?? day?.wind_mph ?? day?.windSpeedMph) ?? null;

        const gust =
          safeNum(day?.windGustMaxMph ?? day?.gustMaxMph ?? day?.maxGustMph ?? day?.windGustMph) ?? null;

        const emoji = weatherCodeToEmoji(code);
        const condition = weatherCodeToLabel(code);

        const split = buildDayNight(day?.date ?? day?.time);
        const sunrise = typeof day?.sunrise === 'string' ? day.sunrise : null;
        const sunset = typeof day?.sunset === 'string' ? day.sunset : null;
        const rowMoonrise = idx === 0 ? moonrise ?? null : (typeof day?.moonrise === 'string' ? day.moonrise : null);
        const rowMoonset = idx === 0 ? moonset ?? null : (typeof day?.moonset === 'string' ? day.moonset : null);
        const dayLength = safeNum(day?.daylightDurationSec ?? day?.daylight_duration ?? day?.daylightDuration) ?? null;

        const narrativeParts: string[] = [];
        if (condition === 'Clear') narrativeParts.push('Bright and clear');
        else if (condition === 'Mostly clear') narrativeParts.push('Mostly clear');
        else if (condition === 'Partly cloudy') narrativeParts.push('Partly cloudy');
        else if (condition === 'Overcast') narrativeParts.push('Cloudy');
        else if (condition === 'Rain') narrativeParts.push('Rain likely');
        else if (condition === 'Showers') narrativeParts.push('Showers around');
        else if (condition === 'Drizzle') narrativeParts.push('Light drizzle possible');
        else if (condition === 'Snow') narrativeParts.push('Snow possible');
        else if (condition === 'Thunderstorm') narrativeParts.push('Storms possible');
        else if (condition === 'Fog') narrativeParts.push('Fog possible');
        else narrativeParts.push(condition);

        if (hi != null) {
          if (hi >= 95) narrativeParts.push('very hot');
          else if (hi >= 85) narrativeParts.push('warm');
          else if (hi >= 70) narrativeParts.push('mild');
          else if (hi >= 50) narrativeParts.push('cool');
          else narrativeParts.push('cold');
        }

        if (pop != null) {
          if (pop >= 70) narrativeParts.push('high precip chance');
          else if (pop >= 40) narrativeParts.push('some precip possible');
          else if (pop <= 10) narrativeParts.push('dry overall');
        }

        const narrative = `${narrativeParts.join(' • ')}.`;

        return (
          <Pressable
            key={key}
            onPress={() => toggleRow(key)}
            style={[styles.dailyRow, expanded && styles.dailyRowExpanded]}
          >
            <View style={styles.dailyRowTop}>
              <View style={styles.dailyLeft}>
                <Text style={styles.dailyLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>{emoji}</Text> {/* ⬅️ bigger icon */}
                  <Text style={styles.dailyCondition} numberOfLines={1}>
                    {condition}
                  </Text>
                </View>
              </View>

              <View style={styles.dailyRight}>
                <Text style={styles.dailyTemps}>
                  <Text style={styles.dailyHi}>{hi != null ? `${Math.round(hi)}°` : '—'}</Text>
                  <Text style={styles.dailySlash}> / </Text>
                  <Text style={styles.dailyLo}>{lo != null ? `${Math.round(lo)}°` : '—'}</Text>
                </Text>

                <View style={styles.dailyMetaRow}>
                  <Text style={styles.dailyPop}>
                    {pop != null ? `Precip ${Math.round(pop)}%` : 'Precip —'}
                  </Text>
                  <Text style={styles.dailyChevron}>{expanded ? '⌃' : '⌄'}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.dailyNarrative} numberOfLines={expanded ? undefined : 1}>
              {narrative.charAt(0).toUpperCase() + narrative.slice(1)}
            </Text>

            <View style={styles.dailyAstroRow}>
              <Text style={styles.dailyAstroText}>Sunrise {formatClock(sunrise)}</Text>
              <Text style={styles.dailyAstroDot}>•</Text>
              <Text style={styles.dailyAstroText}>Sunset {formatClock(sunset)}</Text>
            </View>

            {expanded ? (
              <View style={styles.dailyExpanded}>
                <View style={styles.dayNightBlock}>
                  <Text style={styles.dayNightTitle}>Day</Text>
                  <Text style={styles.dayNightNarrative}>{split.day.narrative}</Text>
                  <View style={styles.dayNightMetaRow}>
                    <Text style={styles.dayNightMetaText}>
                      {split.day.tempMax != null ? `High ${Math.round(split.day.tempMax)}°` : 'High —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      {split.day.pop != null ? `Precip ${Math.round(split.day.pop)}%` : 'Precip —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      Wind {fmtWind(split.day.wind)}
                    </Text>
                  </View>
                </View>

                <View style={styles.dayNightDivider} />

                <View style={styles.dayNightBlock}>
                  <Text style={styles.dayNightTitle}>Night</Text>
                  <Text style={styles.dayNightNarrative}>{split.night.narrative}</Text>
                  <View style={styles.dayNightMetaRow}>
                    <Text style={styles.dayNightMetaText}>
                      {split.night.tempMin != null ? `Low ${Math.round(split.night.tempMin)}°` : 'Low —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      {split.night.pop != null ? `Precip ${Math.round(split.night.pop)}%` : 'Precip —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      Wind {fmtWind(split.night.wind)}
                    </Text>
                  </View>
                </View>

                <View style={styles.periodStatsWrap}>
                  <View style={styles.periodStatsSection}>
                    <Text style={styles.periodStatsTitle}>Sun and moon</Text>

                    <View style={styles.dailyExpandedGrid}>
                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Sunrise</Text>
                        <Text style={styles.dailyExpandedValue}>{formatClock(sunrise)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Sunset</Text>
                        <Text style={styles.dailyExpandedValue}>{formatClock(sunset)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Moonrise</Text>
                        <Text style={styles.dailyExpandedValue}>{formatClock(rowMoonrise)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Moonset</Text>
                        <Text style={styles.dailyExpandedValue}>{formatClock(rowMoonset)}</Text>
                      </View>
                    </View>

                    <Text style={styles.dailyExpandedSummary}>Day length {formatDayLength(dayLength)}</Text>
                  </View>

                  <View style={styles.periodStatsSection}>
                    <Text style={styles.periodStatsTitle}>Day details</Text>

                    <View style={styles.dailyExpandedGrid}>
                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Condition</Text>
                        <Text style={styles.dailyExpandedValue}>{split.day.condition}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Precip</Text>
                        <Text style={styles.dailyExpandedValue}>
                          {split.day.pop != null ? `${Math.round(split.day.pop)}%` : '—'}
                        </Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Wind</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.day.wind)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Gusts</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.day.gust)}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.periodStatsSection}>
                    <Text style={styles.periodStatsTitle}>Night details</Text>

                    <View style={styles.dailyExpandedGrid}>
                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Condition</Text>
                        <Text style={styles.dailyExpandedValue}>{split.night.condition}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Precip</Text>
                        <Text style={styles.dailyExpandedValue}>
                          {split.night.pop != null ? `${Math.round(split.night.pop)}%` : '—'}
                        </Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Wind</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.night.wind)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Gusts</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.night.gust)}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={styles.dailyExpandedSummary}>
                  High {hi != null ? `${Math.round(hi)}°` : '—'} • Low {lo != null ? `${Math.round(lo)}°` : '—'}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function wmoToCondition(code: number | null): string | null {
  if (code == null) return null;

  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';

  if (code === 45 || code === 48) return 'Fog';

  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';

  return 'Cloudy';
}

const ss = StyleSheet.create({
  wrap: { marginTop: 10, gap: 10 },
  section: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.035)',
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '900',
    marginBottom: 10,
  },
  grid2: { flexDirection: 'row', gap: 10 },
  grid3: { flexDirection: 'row', gap: 10 },
  cell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.028)',
  },
  k: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '900',
  },
  v: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '900',
    color: 'white',
  },
  note: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.55)',
  },
});

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={nd.section}>
      <Text style={nd.sectionTitle}>{title}</Text>
      <View style={nd.sectionBody}>{children}</View>
    </View>
  );
}

function pressureRegimeLabel(
  pressureTrend: { arrow: '↑' | '↓' | '→'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null }
) {
  return pressureTrend.label;
}

function radiationRegimeLabel(cloudCoverPct: number | null) {
  if (cloudCoverPct == null) return '—';
  if (cloudCoverPct <= 20) return 'Radiational';
  if (cloudCoverPct <= 60) return 'Mixed';
  return 'Cloud-limited';
}

function NerdyDeepDive({
  dewpointF,
  humidityPct,
  dpBand,
  spreadF,
  tempF,
  windMph,
  gustMph,
  windDirDeg,
  gf,
  cloudCoverPct,
  uvIndex,
  airQualityLabel,
  precipChancePct,
  visibilityMi,
  pressureHpa,
  pressureInHg,
  pressureTrend,
  astro,
  sunrise,
  sunset,
  moonrise,
  moonset,
  dayLengthSec,
  feelsDriverLabel,
  feelsDriverValue,
  onOpenLearnTopic,
}: {
  dewpointF: number | null;
  humidityPct: number | null;
  dpBand: string | null;
  spreadF: number | null;
  tempF: number | null;
  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
  gf: number | null;
  cloudCoverPct: number | null;
  uvIndex: number | null;
  airQualityLabel: string | null;
  precipChancePct: number | null;
  visibilityMi: number | null;
  pressureHpa: number | null;
  pressureInHg: number | null;
  astro?: {
    civilDusk?: string | null;
    nauticalDusk?: string | null;
    astronomicalDusk?: string | null;
    civilDawn?: string | null;
    nauticalDawn?: string | null;
    astronomicalDawn?: string | null;
    nightStartTime?: string | null;
    nightEndTime?: string | null;
    trueDarkStartTime?: string | null;
    trueDarkEndTime?: string | null;
    bestStartTime?: string | null;
    bestEndTime?: string | null;
  } | null;
  sunrise?: string | null;
  sunset?: string | null;
  moonrise?: string | null;
  moonset?: string | null;
  dayLengthSec?: number | null;
  pressureTrend: { arrow: '↑' | '↓' | '→'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null };
  feelsDriverLabel: string;
  feelsDriverValue: string;
  onOpenLearnTopic: (topicId?: string) => void;
}) {
  const dir = dirToCompass(windDirDeg);
  const dirText = windDirDeg != null ? `${dir ?? ''} ${Math.round(windDirDeg)}°`.trim() : '—';

  const trendHint =
    pressureTrend.deltaHpa == null
      ? `${pressureTrend.arrow} ${pressureTrend.label}`
      : `${pressureTrend.arrow} ${pressureTrend.label} • ${pressureTrend.deltaHpa >= 0 ? '+' : ''}${pressureTrend.deltaHpa.toFixed(1)} hPa`;

  const pressureRegime = pressureRegimeLabel(pressureTrend);
  const radiationRegime = radiationRegimeLabel(cloudCoverPct);
  const astroMilestones = [
    { label: 'Sunrise', value: formatClock(sunrise), topicId: astroLearnTopicId('sunrise') },
    { label: 'Sunset', value: formatClock(sunset), topicId: astroLearnTopicId('sunset') },
    { label: 'Moonrise', value: formatClock(moonrise), topicId: astroLearnTopicId('moonrise') },
    { label: 'Moonset', value: formatClock(moonset), topicId: astroLearnTopicId('moonset') },
    { label: 'Civil dusk', value: formatClock(astro?.civilDusk), topicId: astroLearnTopicId('civil') },
    { label: 'Civil dawn', value: formatClock(astro?.civilDawn), topicId: astroLearnTopicId('civil') },
    { label: 'Nautical dusk', value: formatClock(astro?.nauticalDusk), topicId: astroLearnTopicId('nautical') },
    { label: 'Nautical dawn', value: formatClock(astro?.nauticalDawn), topicId: astroLearnTopicId('nautical') },
    {
      label: 'Astronomical dusk',
      value: formatClock(astro?.astronomicalDusk),
      topicId: astroLearnTopicId('astronomical'),
    },
    {
      label: 'Astronomical dawn',
      value: formatClock(astro?.astronomicalDawn),
      topicId: astroLearnTopicId('astronomical'),
    },
  ];

  return (
    <View style={nd.wrap}>
      <SectionCard title="Comfort">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Dew point"
              value={dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'}
              onPress={() => onOpenLearnTopic('dewpoint')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="RH"
              value={humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}
              onPress={() => onOpenLearnTopic('humidity')}
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Dew band"
              value={dpBand ?? '—'}
              onPress={() => onOpenLearnTopic('dewpoint')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Thermal Spread"
              value={spreadF != null ? `${Math.round(spreadF)}°F` : '—'}
              onPress={() => onOpenLearnTopic('dewpoint')}
            />
          </View>
        </View>

        <StatTile
          label={feelsDriverLabel}
          value={feelsDriverValue}
          onPress={() => onOpenLearnTopic('apparent-temp')}
        />
      </SectionCard>

      <SectionCard title="Wind">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Speed"
              value={windMph != null ? `${Math.round(windMph)} mph` : '—'}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Gusts"
              value={gustMph != null ? `${Math.round(gustMph)} mph` : '—'}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Direction"
              value={dirText}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Gust Factor"
              value={gf != null ? gf.toFixed(2) : '—'}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>
        </View>
      </SectionCard>

      {(() => {
        const hasSky = cloudCoverPct != null || uvIndex != null || !!airQualityLabel;

        if (!hasSky) {
          return (
            <SectionCard title="Sky">
              <Text style={nd.mutedLine}>Sky details not available from this station.</Text>
            </SectionCard>
          );
        }

        return (
          <SectionCard title="Sky">
            <View style={nd.grid2}>
              <View style={nd.gridItem}>
                <StatTile
                  label="Cloud cover"
                  value={cloudCoverPct != null ? `${Math.round(cloudCoverPct)}%` : '—'}
                  onPress={() => onOpenLearnTopic('clouds')}
                />
              </View>

              <View style={nd.gridItem}>
                <StatTile
                  label="UV index"
                  value={uvIndex != null ? fmt(uvIndex, 1) : '—'}
                  onPress={() => onOpenLearnTopic('uv')}
                />
              </View>
            </View>

            <View style={nd.grid2}>
              <View style={nd.gridItem}>
                <StatTile
                  label="Air Quality"
                  value={airQualityLabel ?? '—'}
                  onPress={() => onOpenLearnTopic('air-quality')}
                />
              </View>

              <View style={nd.gridItem}>
                <StatTile
                  label="Radiation Regime"
                  value={radiationRegime}
                  onPress={() => onOpenLearnTopic('clouds')}
                />
              </View>
            </View>
          </SectionCard>
        );
      })()}

      <SectionCard title="Extras">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="POP"
              value={precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}
              onPress={() => onOpenLearnTopic('pop')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Vis"
              value={visibilityMi != null ? `${visibilityMi.toFixed(1)} mi` : '—'}
              onPress={() => onOpenLearnTopic('visibility')}
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Pressure"
              value={pressureHpa != null ? `${fmt(pressureHpa)} hPa ${pressureTrend.arrow}` : `— ${pressureTrend.arrow}`}
              valueHint={
                pressureInHg != null
                  ? `${pressureInHg.toFixed(2)} inHg • ${trendHint}`
                  : `${trendHint}${pressureHpa != null ? ` • ${fmt(pressureHpa)} hPa` : ''}`
              }
              onPress={() => onOpenLearnTopic('pressure')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Pressure Regime"
              value={pressureRegime}
              onPress={() => onOpenLearnTopic('pressure')}
            />
          </View>
        </View>
      </SectionCard>

      <SectionCard title="Sun and Moon">
        <View style={nd.astroGrid}>
          {astroMilestones.map((item) => (
            <View key={item.label} style={nd.astroGridItem}>
              <StatTile
                label={item.label}
                value={item.value}
                onPress={() => onOpenLearnTopic(item.topicId)}
              />
            </View>
          ))}
        </View>

        <StatTile
          label="Night window"
          value={formatWindow(astro?.nightStartTime, astro?.nightEndTime)}
          onPress={() => onOpenLearnTopic(astroLearnTopicId('night'))}
        />

        <StatTile
          label="True dark"
          value={formatWindow(astro?.trueDarkStartTime, astro?.trueDarkEndTime)}
          onPress={() => onOpenLearnTopic(astroLearnTopicId('true-dark'))}
        />

        <StatTile
          label="Best window"
          value={formatWindow(astro?.bestStartTime, astro?.bestEndTime)}
          onPress={() => onOpenLearnTopic(astroLearnTopicId('best'))}
        />

        <StatTile
          label="Day length"
          value={formatDayLength(dayLengthSec)}
          onPress={() => onOpenLearnTopic(astroLearnTopicId('sunrise'))}
        />
      </SectionCard>
    </View>
  );
}

const nd = StyleSheet.create({
  wrap: { marginTop: 10, gap: 8 },
  gridItem: { flex: 1 },
  astroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  astroGridItem: {
    width: '48%',
  },
  section: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '900',
    marginBottom: 10,
  },
  sectionBody: { gap: 8 },
  grid2: { flexDirection: 'row', gap: 8 },
  grid3: { flexDirection: 'row', gap: 8 },
  mutedLine: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
});

function LandWeatherWithCoords({
  coords,
  activeLabel,
  wxLab,
  onPressAlert,
  setLearnOpen,
  setLearnTopicId,
  setExplainPayload,
  setExplainOpen,
  onWeatherCode,
}: {
  coords: { lat: number; lon: number };
  activeLabel: string;
  wxLab: boolean;
  onPressAlert: (primary: any, alerts: any[]) => void;
  setLearnOpen: (v: boolean) => void;
  setLearnTopicId: (v: string | undefined) => void;
  setExplainPayload: (p: ExplainPayload | null) => void;
  setExplainOpen: (v: boolean) => void;
  onWeatherCode: (code: number | null) => void;
}) {
  const units: UnitSystem = 'us';

  const { primary, alerts } = useNwsAlerts({
    lat: coords.lat,
    lon: coords.lon,
    enabled: true,
  });

  const {
    data: currentData,
    loading: currentLoading,
    error: currentError,
    refreshing: currentRefreshing,
    refresh: currentRefresh,
  } = useCurrentWeather({
    lat: coords.lat,
    lon: coords.lon,
    units: 'imperial',
  } as any);

  const {
    data: forecastData,
    loading: forecastLoading,
    error: forecastError,
    refreshing: forecastRefreshing,
    refresh: forecastRefresh,
  } = useOpenMeteoForecast({
    lat: coords.lat,
    lon: coords.lon,
    days: 15,
  });

  const {
    data: astroData,
    refreshing: astroRefreshing,
    refresh: astroRefresh,
  } = useLocationAstroForecast({
    lat: coords.lat,
    lon: coords.lon,
    placeName: activeLabel ?? undefined,
    enabled: true,
  });

  const {
    data: fireContextData,
    refreshing: fireContextRefreshing,
    refresh: fireContextRefresh,
  } = useFireContext({
    lat: coords.lat,
    lon: coords.lon,
    enabled: true,
  });

  const loading = currentLoading || (wxLab && forecastLoading);
  const refreshing = currentRefreshing || forecastRefreshing || astroRefreshing || fireContextRefreshing;

  const onRefresh = () => {
    currentRefresh?.();
    forecastRefresh?.();
    astroRefresh?.();
    fireContextRefresh?.();
  };

  const wx: any = currentData ?? {};

  const tempF = safeNum(wx.temperatureF ?? wx.temp_f ?? wx.temperature ?? wx.temp);
  const feelsLikeF = safeNum(wx.apparentTemperatureF ?? wx.feels_like_f ?? wx.feels_like ?? wx.feels);

  const dewpointF = safeNum(wx.dewpointF ?? wx.dewpoint_f ?? wx.dew_point ?? wx.dewPoint);
  const humidityPct = safeNum(wx.humidity ?? wx.relativeHumidity ?? wx.relative_humidity ?? wx.rh ?? wx.humidityPct);

  const windMph = safeNum(
    wx.windSpeedMph ??
      wx.wind_speed_mph ??
      wx.wind_speed_10m ??
      wx.windspeed_10m ??
      wx.windSpeed ??
      wx.wind
  );
  const gustMph = safeNum(
    wx.windGustMph ??
      wx.wind_gust_mph ??
      wx.wind_gusts_10m ??
      wx.windGust ??
      wx.windGustsMph ??
      wx.gust ??
      wx.windGust
  );
  const windDirDeg = safeNum(
    wx.windDirection ??
      wx.wind_dir ??
      wx.wind_direction ??
      wx.wind_direction_10m ??
      wx.winddirection_10m ??
      wx.windDir
  );

  const cloudCoverPct = safeNum(wx.cloudCoverPct ?? wx.cloud_cover ?? wx.cloudCover ?? wx.cloudCoverPct);

  const daily = (forecastData?.daily ?? []).slice(0, 15);
  const todayDaily = daily[0] ?? null;
  const todaySunrise = typeof todayDaily?.sunrise === 'string' ? todayDaily.sunrise : null;
  const todaySunset = typeof todayDaily?.sunset === 'string' ? todayDaily.sunset : null;
  const todayDayLengthSec = safeNum(todayDaily?.daylightDurationSec) ?? null;
  const todayMoonrise = astroData?.moonrise ?? null;
  const todayMoonset = astroData?.moonset ?? null;
  const hourlyRaw: any[] = forecastData?.hourly ?? [];

  const hourly = useMemo(() => {
    return (hourlyRaw ?? []).map((h: any) => {
      const pressureHpaLocal =
        safeNum(h.pressureHpa) ??
        safeNum(h.pressure_msl) ??
        safeNum(h.pressureMslHpa) ??
        safeNum(h.pressure_hpa) ??
        safeNum(h.pressure) ??
        null;

      return {
        ...h,
        pressureHpa: pressureHpaLocal,
      };
    });
  }, [hourlyRaw]);

  const pressureTrend = useMemo(() => pressureTrendFromHourly(hourly), [hourly]);

  const visibilityMi = (() => {
    const vMi = safeNum(wx.visibilityMi ?? wx.visibility_mi ?? wx.visibility);
    if (vMi != null) return vMi;

    const hrs: any[] = forecastData?.hourly ?? [];
    if (!hrs.length) return null;

    const now = Date.now();
    let best: any = null;
    let bestDt = Infinity;

    for (const h of hrs) {
      const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        best = h;
      }
    }

    const meters = safeNum(best?.visibility ?? best?.visibility_m);
    if (meters == null) return null;

    return meters / 1609.344;
  })();

  const uvIndexFromHourly = (() => {
    const hrs: any[] = forecastData?.hourly ?? [];
    if (!hrs.length) return null;

    const now = Date.now();
    let best: any = null;
    let bestDt = Infinity;

    for (const h of hrs) {
      const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        best = h;
      }
    }

    return safeNum(best?.uvIndex ?? best?.uv_index ?? best?.uv);
  })();

  const uvIndexFromDailyMax = safeNum(forecastData?.daily?.[0]?.uvIndexMax);

  const uvIndex =
    safeNum(wx.uvIndex ?? wx.uv_index ?? wx.uv) ??
    uvIndexFromHourly ??
    uvIndexFromDailyMax ??
    null;
  const airQualityLabel =
    (typeof astroData?.aerosols?.airQualityLabel === 'string' ? astroData.aerosols.airQualityLabel : null) ??
    (typeof astroData?.aerosols?.label === 'string' ? astroData.aerosols.label : null) ??
    null;

  const pressureHpa =
    safeNum(wx.pressureHpa ?? wx.pressure_hpa ?? wx.pressure) ??
    safeNum(wx.pressureMb) ??
    null;

  const pressureInHg =
    safeNum(wx.pressureInHg ?? wx.pressure_inhg) ??
    (pressureHpa != null ? hpaToInHg(pressureHpa) : null);

  const popFromHourly = (() => {
    const hrs: any[] = forecastData?.hourly ?? [];
    if (!hrs.length) return null;

    const now = Date.now();
    let best: any = null;
    let bestDt = Infinity;

    for (const h of hrs) {
      const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        best = h;
      }
    }

    return safeNum(best?.precipitation_probability ?? best?.precipProbPct ?? best?.precipChancePct ?? best?.pop);
  })();

  const popTodayPeak = safeNum(forecastData?.daily?.[0]?.precipProbMaxPct);
  const popFromCurrent = safeNum(wx.precipChancePct ?? wx.precip_probability ?? wx.precipProb ?? wx.pop);
  const precipChancePct = popTodayPeak ?? popFromCurrent ?? popFromHourly;

  const weatherCodeFromCurrent =
    safeNum(wx.weatherCode ?? wx.weathercode ?? wx.weather_code ?? wx.code ?? wx.iconCode ?? wx.icon_code) ?? null;

  const weatherCodeFromHourly = (() => {
    const hrs: any[] = forecastData?.hourly ?? [];
    if (!hrs.length) return null;

    const now = Date.now();
    let best: any = null;
    let bestDt = Infinity;

    for (const h of hrs) {
      const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        best = h;
      }
    }

    return (
      safeNum(best?.weatherCode ?? best?.weather_code ?? best?.weathercode ?? best?.condition_code ?? best?.code) ?? null
    );
  })();

  const weatherCode = weatherCodeFromCurrent ?? weatherCodeFromHourly;

  const condition =
    wx.shortForecast ??
    wx.condition ??
    wx.textDescription ??
    wx.weather ??
    wmoToCondition(weatherCode) ??
    '—';

  useEffect(() => {
    onWeatherCode(weatherCode);
  }, [weatherCode, onWeatherCode]);

  const observationTime: string | null = wx.observedAt ?? wx.timestamp ?? wx.datetime ?? null;

  const dpBand = dewpointF == null ? null : dewPointBandF(dewpointF);
  const hi = tempF != null && humidityPct != null ? heatIndexF(tempF, humidityPct) : null;
  const wc = tempF != null && windMph != null ? windChillF(tempF, windMph) : null;
  const gf = gustFactor(windMph, gustMph);
  const spreadF = tempF != null && dewpointF != null ? tempF - dewpointF : null;

  const feelsDriver = useMemo(() => {
    if (hi != null) return { label: 'Heat Index', value: `${Math.round(hi)}°F`, conf: 'high' as const };
    if (wc != null) return { label: 'Wind Chill', value: `${Math.round(wc)}°F`, conf: 'high' as const };
    if (feelsLikeF != null) return { label: 'Feels Like', value: `${Math.round(feelsLikeF)}°F`, conf: 'medium' as const };
    return { label: 'Feels', value: '—', conf: undefined };
  }, [hi, wc, feelsLikeF]);

  const updatedText = `Updated ${formatUpdatedTime(observationTime)}`;

  const moistureHint =
    dewpointF != null
      ? dewpointF < 30
        ? 'Very dry air • rapid cooling after sunset'
        : dewpointF < 50
          ? 'Comfortable moisture levels'
          : 'Humid air • clouds linger'
      : null;

  const heroSummary =
    dewpointF != null && windMph != null
      ? `${dewpointF < 45 ? 'Dry air' : 'Moist air'} • ${windMph < 5 ? 'calm' : windMph < 15 ? 'breezy' : 'windy'}`
      : '—';

  const openLearnTopic = React.useCallback(
    (topicId?: string) => {
      setLearnTopicId(topicId ?? undefined);
      setLearnOpen(true);
    },
    [setLearnOpen, setLearnTopicId]
  );

  return (
    <>
      {primary ? (
        <View style={{ marginTop: -6, marginBottom: theme.spacing.md }}>
          <AlertBanner primary={primary} count={alerts.length} onPress={() => onPressAlert(primary, alerts)} />
        </View>
      ) : null}

      {loading && !currentData ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.smallText}>Loading weather…</Text>
        </View>
      ) : null}

      {currentError || forecastError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{currentError || forecastError}</Text>
        </Card>
      ) : null}

      <Card style={styles.heroCard}>
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject} />

        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTemp}>{tempF != null ? `${Math.round(tempF)}°` : '—'}</Text>
            <Text style={styles.heroCondition}>{condition}</Text>
            <Text style={styles.heroSummary} numberOfLines={1}>
              {heroSummary}
            </Text>
          </View>

          <View style={styles.heroRight}>
            <Text style={styles.heroMiniLabel}>Feels</Text>
            <Text style={styles.heroMiniValue}>{feelsLikeF != null ? `${Math.round(feelsLikeF)}°` : '—'}</Text>
          </View>
        </View>

        {!wxLab ? (
          <SimpleSummary
            dewpointF={dewpointF}
            humidityPct={humidityPct}
            windMph={windMph}
            gustMph={gustMph}
            windDirDeg={windDirDeg}
            precipChancePct={precipChancePct}
            uvIndex={uvIndex}
            airQualityLabel={airQualityLabel}
            pressureHpa={pressureHpa}
            pressureInHg={pressureInHg}
            pressureTrend={pressureTrend}
            narrative={moistureHint ?? undefined}
            hideWind
          />
        ) : (
          <NerdyDeepDive
            dewpointF={dewpointF}
            humidityPct={humidityPct}
            dpBand={dpBand}
            spreadF={spreadF}
            tempF={tempF}
            windMph={windMph}
            gustMph={gustMph}
            windDirDeg={windDirDeg}
            gf={gf}
            cloudCoverPct={cloudCoverPct}
            uvIndex={uvIndex}
            airQualityLabel={airQualityLabel}
            precipChancePct={precipChancePct}
            visibilityMi={visibilityMi}
            pressureHpa={pressureHpa}
            pressureInHg={pressureInHg}
            pressureTrend={pressureTrend}
            astro={astroData}
            sunrise={todaySunrise}
            sunset={todaySunset}
            moonrise={todayMoonrise}
            moonset={todayMoonset}
            dayLengthSec={todayDayLengthSec}
            feelsDriverLabel={feelsDriver.label}
            feelsDriverValue={feelsDriver.value}
            onOpenLearnTopic={openLearnTopic}
          />
        )}

        <Text style={styles.updatedText}>{updatedText}</Text>
      </Card>

      {daily.length > 0 ? (
        <Card style={styles.forecastCard}>
          <Text style={styles.cardTitle}>{wxLab ? 'Daily (Model Blend)' : '15-Day Forecast'}</Text>

          {wxLab ? (
            <DailyRangeChart daily={daily} />
          ) : (
            <DailyForecastList
              daily={daily}
              hourly={hourly}
              moonrise={todayMoonrise}
              moonset={todayMoonset}
              maxDays={15}
            />
          )}

          <Text style={styles.updatedText}>Source: Open-Meteo (multi-model blend)</Text>
        </Card>
      ) : null}

      {!wxLab && daily.length > 0 ? (
        <ActivityForecastSection
          daily={daily}
          hourly={hourly}
          visibilityMi={visibilityMi}
          astroData={astroData}
          feelsLikeF={feelsLikeF}
          fireContext={fireContextData}
          onLearnTopic={(topicId) => {
            setLearnTopicId(topicId ?? undefined);
            setLearnOpen(true);
          }}
        />
      ) : null}

      {wxLab && hourly.length ? (
        <Card style={styles.hourlyCard}>
          <View style={styles.hourlyHeaderRow}>
            <Text style={styles.cardTitle}>Next 72 hours</Text>
          </View>

          <HourlyCharts72h hours={hourly} maxHours={72} units={units} initialPanel="range" />

          <Text style={styles.updatedText}>Source: Open-Meteo (hourly)</Text>
        </Card>
      ) : null}

      {wxLab && daily.length > 0 ? (
        <ActivityForecastSection
          daily={daily}
          hourly={hourly}
          visibilityMi={visibilityMi}
          astroData={astroData}
          feelsLikeF={feelsLikeF}
          fireContext={fireContextData}
          onLearnTopic={(topicId) => {
            setLearnTopicId(topicId ?? undefined);
            setLearnOpen(true);
          }}
        />
      ) : null}

      <View style={{ display: 'none' }}>
        <Text>{activeLabel}</Text>
        <Text>{String(refreshing)}</Text>
        <Text>{String(onRefresh)}</Text>
        <Text>{String(!!setExplainOpen)}</Text>
        <Text>{String(!!setExplainPayload)}</Text>
      </View>
    </>
  );
}

export default function LandWeatherScreen() {
  const wxLabCtx = useWxLab() as any;
  const wxLab = !!wxLabCtx?.wxLab;

  const placeCtx = usePlace() as any;

  const placeSetActive =
    (typeof placeCtx?.setActive === 'function' && placeCtx.setActive) ||
    (typeof placeCtx?.setActivePlace === 'function' && placeCtx.setActivePlace) ||
    (typeof placeCtx?.setPlace === 'function' && placeCtx.setPlace) ||
    null;

  const placeSetCurrent =
    (typeof placeCtx?.setActiveCurrent === 'function' && placeCtx.setActiveCurrent) ||
    (typeof placeCtx?.setCurrent === 'function' && placeCtx.setCurrent) ||
    null;

  const placeRefreshCurrent =
    (typeof placeCtx?.refreshCurrentLocation === 'function' && placeCtx.refreshCurrentLocation) ||
    (typeof placeCtx?.refreshCurrent === 'function' && placeCtx.refreshCurrent) ||
    null;

  const pushPlaceToContext = (
  name: string,
  lat: number,
  lon: number,
  meta?: { admin1?: string; country?: string }
) => {
  if (!placeSetActive) return;

  const cleaned = formatCompactLocation({
    name,
    admin1: meta?.admin1,
    country: meta?.country,
  });

  placeSetActive({
    name: cleaned,
    lat,
    lon,
    source: 'land',
    kind: 'saved',
    id: `geo:${lat.toFixed(4)},${lon.toFixed(4)}`,
  });
};

  const setWxLab =
    (typeof wxLabCtx?.setWxLab === 'function' && wxLabCtx.setWxLab) ||
    (typeof wxLabCtx?.setEnabled === 'function' && wxLabCtx.setEnabled) ||
    (typeof wxLabCtx?.setWxLabEnabled === 'function' && wxLabCtx.setWxLabEnabled) ||
    null;

  const toggleWxLab =
    (typeof wxLabCtx?.toggleWxLab === 'function' && wxLabCtx.toggleWxLab) ||
    (typeof wxLabCtx?.toggle === 'function' && wxLabCtx.toggle) ||
    null;

  const [pickerOpen, setPickerOpen] = useState(false);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

  const [bgWeatherCode, setBgWeatherCode] = useState<number | null>(null);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 6000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 6000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 19;
  const isSunrise = hour >= 6 && hour < 8;
  const isSunset = hour >= 17 && hour < 19;

  const { activeCoords, activeLabel, state: locState, refreshCurrentLocation, addOrActivateFavorite, setActiveCurrent } =
    useLocations();

  const coords = useMemo(() => {
    return activeCoords ?? null;
  }, [activeCoords]);

  const locationLabel = useMemo(() => {
    const raw = (activeLabel ?? '').trim();
    if (raw) return formatLocLabel({ name: raw });
    return coords ? `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}` : 'Getting location...';
  }, [activeLabel, coords]);

  useEffect(() => {
    if (!coords) return;
    pushPlaceToContext(locationLabel, coords.lat, coords.lon);
  }, [coords?.lat, coords?.lon, locationLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFavorited = useMemo(() => {
    if (!coords) return false;
    const favs = locState.favorites ?? [];
    return favs.some((f) => near(f.lat, coords.lat) && near(f.lon, coords.lon));
  }, [locState.favorites, coords?.lat, coords?.lon, coords]);

  const onToggleFavorite = () => {
    if (!coords) return;
    if (isFavorited) return;
    addOrActivateFavorite(locationLabel, coords.lat, coords.lon);
  };

  const onPickLocation = (loc: SavedLocation) => {
    const label = formatLocLabel(loc);
    addOrActivateFavorite(label, loc.lat, loc.lon);
    pushPlaceToContext(label, loc.lat, loc.lon);
    setPickerOpen(false);
  };

  const onPickCurrent = () => {
    setActiveCurrent();
    refreshCurrentLocation();
    if (placeSetCurrent) placeSetCurrent();
    if (placeRefreshCurrent) placeRefreshCurrent();
    setPickerOpen(false);
  };

  const openQuickExplain = (payload: ExplainPayload) => {
    setExplainPayload(payload);
    setExplainOpen(true);
  };

  const onPressAlert = (primary: any, alerts: any[]) => {
    const officialText =
      primary?.fullText ??
      [
        primary?.headline,
        primary?.description,
        primary?.instruction ? `Instructions: ${primary.instruction}` : undefined,
        primary?.note ? `Note: ${primary.note}` : undefined,
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();

    setExplainPayload({
      title: primary?.event ?? 'Weather Alert',
      summary: officialText || 'No detailed NWS alert text available.',
      whyItMatters: undefined,
      howComputed: undefined,
      confidence: undefined,
      learnTopicId: undefined,
    });

    setExplainOpen(true);
  };

  const favorites = locState.favorites ?? [];

  const onRefresh = () => {
    refreshCurrentLocation();
  };

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.videoLayer}>
        <WeatherVideoBackground weatherCode={bgWeatherCode ?? undefined} isEvening={isNight || isSunset} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(theme.spacing.sm, insets.top * 0.1),
              flexGrow: 1,
            },
          ]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
        >
          <View style={styles.headerHeroWrap}>
            <View style={styles.headerHeroSurface}>
              <View style={styles.headerCompactTopRow}>
                <View style={styles.headerCompactLeft}>
                  <Image
                    source={require('../../assets/brand/omniwx-mark-word.png')}
                    style={styles.headerCompactLogo}
                    resizeMode="contain"
                  />

                  {/* Location + Save inline */}
                  <Pressable onPress={() => setPickerOpen(true)} style={styles.headerCompactLocation}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.locationPrimary} numberOfLines={1}>
                        {locationLabel}
                      </Text>

                      {/* Save inline */}
                      <Pressable
                        onPress={onToggleFavorite}
                        disabled={!coords || isFavorited}
                        style={styles.saveInline}
                      >
                        <Text style={styles.saveInlineText}>
                          {isFavorited ? 'Saved' : 'Save'}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => router.push('/profile')}
                  hitSlop={12}
                  style={styles.settingsIconBtn}
                >
                  <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.9)" />
                </Pressable>
              </View>

              <View style={styles.headerHeroBottomRow}>
                <Pressable onPress={() => router.push('/hourly')} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Hourly</Text>
                </Pressable>

                <Pressable onPress={() => router.push('/(tabs)/almanac')} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Almanac</Text>
                </Pressable>

                <View style={styles.headerModeWrap}>
                  <Pressable
                    onPress={() => setWxLab?.(false)}
                    style={[styles.headerModeBtn, !wxLab ? styles.headerModeBtnActive : null]}
                  >
                    <Text style={[styles.headerModeText, !wxLab ? styles.headerModeTextActive : null]}>Simple</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      if (toggleWxLab && !wxLab) return toggleWxLab();
                      return setWxLab?.(true);
                    }}
                    style={[styles.headerModeBtn, wxLab ? styles.headerModeBtnActive : null]}
                  >
                    <Text style={[styles.headerModeText, wxLab ? styles.headerModeTextActive : null]}>wxLab</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {!coords ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Getting your location…</Text>
              <Text style={styles.errorText}>Enable GPS or pick a place to load weather.</Text>
              <View style={{ marginTop: 12, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Pressable onPress={refreshCurrentLocation} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Try again</Text>
                </Pressable>
                <Pressable onPress={() => setPickerOpen(true)} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Choose location</Text>
                </Pressable>
              </View>
            </Card>
          ) : (
            <>
              <View pointerEvents="none" style={{ height: 0 }}>
                <Animated.View
                  style={[
                    styles.heroBgSoftGlow,
                    {
                      backgroundColor: isNight
                        ? 'rgba(120,160,255,0.10)'
                        : isSunrise || isSunset
                          ? 'rgba(255,180,120,0.14)'
                          : 'rgba(160,220,255,0.10)',
                      opacity: glowAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.55, 0.85],
                      }),
                    },
                  ]}
                />
              </View>

              <LandWeatherWithCoords
                coords={coords}
                activeLabel={locationLabel}
                wxLab={wxLab}
                onPressAlert={onPressAlert}
                setLearnOpen={setLearnOpen}
                setLearnTopicId={setLearnTopicId}
                setExplainPayload={setExplainPayload}
                setExplainOpen={setExplainOpen}
                onWeatherCode={(code) => setBgWeatherCode(code)}
              />
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      <LocationPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPickLocation}
        onPickCurrent={onPickCurrent}
        favorites={favorites}
        activeLabel={locationLabel}
      />

      <NerdyExplainModal
        visible={explainOpen}
        onClose={() => setExplainOpen(false)}
        payload={explainPayload}
        onLearnMore={(topicId) => {
          setExplainOpen(false);
          setLearnTopicId(topicId ?? undefined);
          setLearnOpen(true);
        }}
      />

      <LearnMoreModal visible={learnOpen} onClose={() => setLearnOpen(false)} initialTopicId={learnTopicId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  safe: { flex: 1, backgroundColor: 'transparent', zIndex: 10 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  locationPrimary: { fontSize: 13, fontWeight: '900', color: 'white' },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  settingsIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  headerHeroWrap: {
    marginBottom: theme.spacing.md,
    position: 'relative',
  },

  headerHeroSurface: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },

  headerCompactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  headerCompactLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  headerCompactLogo: {
    width: 80,
    height: 80,
    opacity: 0.96,
  },

  headerCompactLocation: {
  flex: 1,
  minWidth: 0,
  marginRight: 4,
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 16,
  backgroundColor: 'rgba(0,0,0,0.12)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.10)',
},

  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },

  actionPill: {
    width: '33%',
    height: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  actionPillOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },

  actionPillPrimary: {
    backgroundColor: 'rgba(37, 99, 235, 0.72)',
    borderColor: 'rgba(255,255,255,0.16)',
  },

  actionPillPrimaryOn: {
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
  },

  actionPillText: {
    color: 'rgba(255,255,255,0.90)',
    fontWeight: '900',
    fontSize: 12,
  },

  quickNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  quickNavText: { color: 'white', fontWeight: '900', fontSize: 12 },

  headerHeroBottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  smallText: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBg, marginBottom: theme.spacing.lg },
  errorTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.errorText, marginBottom: 4 },
  errorText: { fontSize: 13, color: theme.colors.errorText },

  heroCard: { marginBottom: theme.spacing.lg, overflow: 'hidden' },
  heroBgSoftGlow: {
    position: 'absolute',
    left: -80,
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(160,220,255,0.10)',
  },

  

  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTemp: { fontSize: 64, fontWeight: '900', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, marginTop: 4 },
  heroSummary: { marginTop: 8, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  heroRight: { alignItems: 'flex-end' },
  heroMiniLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  heroMiniValue: { fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary },

  statTile: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  
  tileLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '900',
  },
  tileValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '900',
    color: 'white',
  },
  tileHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.38)',
  },

  updatedText: { ...typography.small, marginTop: theme.spacing.md, opacity: 0.6, fontWeight: '700' },

  dailyList: {
    gap: 10,
    paddingHorizontal: 2,
  },

  dailyLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  dailyLabel: {
    color: 'white',
    fontWeight: '900',
    fontSize: 17,
  },

  dailyCondition: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '800',
  },

  dailyRight: {
    alignItems: 'flex-end',
    minWidth: 88,
  },

  dailyTemps: {
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },

  dailyHi: {
    color: 'white',
  },

  dailySlash: {
    color: 'rgba(255,255,255,0.42)',
  },

  dailyLo: {
    color: 'rgba(255,255,255,0.62)',
  },

  dailyPop: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
  },

  dailyRow: {
    position: 'relative',
    overflow: 'hidden',
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 26,
    backgroundColor: 'rgba(21, 35, 60, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },

  dailyRowExpanded: {
    backgroundColor: 'rgba(27, 44, 74, 0.80)',
    borderColor: 'rgba(255,255,255,0.065)',
  },

  dailyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  headerModeWrap: {
    flexDirection: 'row',
    gap: 8 as any,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },

  headerModeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },

  headerModeBtnActive: {
    backgroundColor: 'rgba(72, 201, 176, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(109, 236, 198, 0.34)',
  },

  headerModeText: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '800',
    fontSize: 12,
  },

  headerModeTextActive: {
    color: '#DDFCF4',
  },
  dailyMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },

  dailyChevron: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '900',
  },

  dailyNarrative: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  dailyAstroRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  dailyAstroText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '800',
  },

  dailyAstroDot: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '900',
  },

  dailyExpanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  dayNightBlock: {
    paddingVertical: 2,
  },

  dayNightTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },

  dayNightNarrative: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.82)', 
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  dayNightMetaRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  dayNightMetaText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '800',
  },

  dayNightMetaDot: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '900',
  },

  dayNightDivider: {
    marginVertical: 10,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  dailyExpandedGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  dailyExpandedCell: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.032)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.028)',
  },

  dailyExpandedLabel: {
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.46)',
    fontWeight: '900',
  },

  dailyExpandedValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '900',
    color: 'white',
  },

  dailyExpandedSummary: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '800',
  },


  periodStatsWrap: {
  marginTop: 10,
  gap: 12,
},

periodStatsSection: {
  gap: 8,
},

periodStatsTitle: {
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
  fontWeight: '900',
},
  favoritePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    gap: 10,
  },

  favoriteEmojiBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  favoriteEmoji: {
    fontSize: 18,
  },

  favoriteMain: {
    flex: 1,
    minWidth: 0,
  },

  favoriteTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 14,
  },

  favoriteSub: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },

  favoriteTempBlock: {
    minWidth: 48,
    alignItems: 'flex-end',
  },

  favoriteHi: {
    color: 'white',
    fontWeight: '900',
    fontSize: 16,
    lineHeight: 18,
  },

  favoriteLo: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.56)',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 14,
  },

  saveInline: {
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.08)',
},

saveInlineText: {
  color: 'white',
  fontSize: 13,
  fontWeight: '900',
},

  activitySectionCard: {
    marginBottom: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: 14,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },

  activitySectionHeader: {
    paddingHorizontal: 8,
    marginBottom: 10,
  },

  activitySectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  activityLearnButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    backgroundColor: 'rgba(15,23,42,0.42)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  activityLearnButtonText: {
    color: 'rgba(191,219,254,0.92)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.3,
  },

  activitySectionSubtext: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.60)',
    fontSize: 12,
    fontWeight: '700',
  },

  activityGrid: {
    paddingHorizontal: 8,
    gap: 10,
  },

  activityWideCard: {
    width: '100%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderWidth: 1,
    overflow: 'hidden',
  },

  activityWideIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  activityMiniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  activityMiniIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activityMiniPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },

  activityMiniPillText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  activityMiniTitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },

  activityMiniHeadline: {
    marginTop: 6,
    color: 'white',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },

  activityWideHeadline: {
    marginTop: 4,
    color: 'white',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },

  activityMiniDetail: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },

  activityMiniReason: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.84)',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
  },

  activityScaleText: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },

  activityMiniKicker: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    fontWeight: '800',
  },

  activityWeekRow: {
    marginTop: 12,
    gap: 8,
  },

  activityWeekItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  activityHourBlock: {
    gap: 4,
  },

  activityWeekLabel: {
    width: 32,
    color: 'rgba(255,255,255,0.66)',
    fontSize: 11,
    fontWeight: '900',
  },

  activityWeekBar: {
    flex: 1,
    height: 7,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  activityWeekFill: {
    height: '100%',
    borderRadius: 999,
  },

  activityWeekScore: {
    width: 28,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '900',
  },

  activityHourlySummary: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },

  activityHourlySummaryTime: {
    color: 'white',
    fontWeight: '900',
  },

  forecastCard: {
    marginBottom: theme.spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 10 },

  hourlyCard: { marginBottom: theme.spacing.lg },
  hourlyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 80,
    bottom: 40,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 22, 35, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 14,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: 'white', fontSize: 16, fontWeight: '900' },
  modalCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalCloseText: { color: 'white', fontWeight: '900', fontSize: 12 },
  modalActive: { marginTop: 10, color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  currentBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  currentBtnText: { color: 'white', fontWeight: '900' },

  searchInput: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: 'white',
  },

  modalSection: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.85)',
  },
  modalError: { marginTop: 8, fontSize: 12, color: '#FFB4B4', fontWeight: '800' },

  pickRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  pickTitle: { color: 'white', fontWeight: '900' },
  pickSub: { marginTop: 2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
});
