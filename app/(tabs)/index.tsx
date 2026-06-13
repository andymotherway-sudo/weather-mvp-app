// app/(tabs)/index.tsx
// Land Wx - Rich + Nerdy (Branded + Alpha polish)
// Drop-in replacement
// Compresses header so current conditions sit higher
// Simple mode shows vertical 15-day forecast list
// wxLab shows daily chart + insights + hourly chart
// Keeps location picker, alerts, video bg, favorites, explain + learn modals
// Nerdy education taps now go straight to LearnMoreModal

import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
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
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';

import { usePlace } from '../context/PlaceContext';
import { useSettings } from '../context/SettingsContext';
import { useLocationAstroForecast } from '../lib/astro/locationAstro';
import { useFireContext } from '../lib/fire/useFireContext';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useAppChrome } from '../lib/theme/useAppChrome';
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
import { PremiumMoonIcon, PremiumWeatherIcon } from '../../components/weather/PremiumWeatherIcon';

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

function formatSurfaceVisibility(valueMi: number | null) {
  if (valueMi == null || !Number.isFinite(valueMi)) return '—';
  if (valueMi >= 20) return 'Excellent';
  if (valueMi >= 10) return 'Very good';
  if (valueMi >= 6) return 'Good';
  if (valueMi >= 3) return 'Reduced';
  if (valueMi >= 1) return 'Poor';
  return 'Very poor';
}

function isTemporaryWeatherError(message?: string | null) {
  if (!message) return false;
  return /\bHTTP\s+5\d\d\b/i.test(message) || /timeout|timed out|network request failed|failed to fetch/i.test(message);
}

function formatWeatherError(message?: string | null) {
  if (!message) return null;
  if (/\bHTTP\s+502\b/i.test(message)) return 'A weather service returned a temporary bad gateway response. Please try again.';
  if (/\bHTTP\s+5\d\d\b/i.test(message)) return 'A weather service is temporarily unavailable. Please try again.';
  if (/timeout|timed out/i.test(message)) return 'The weather request timed out. Please try again.';
  if (/network request failed|failed to fetch/i.test(message)) return 'The weather service could not be reached. Please check your connection.';
  return message;
}

function near(a: number, b: number, eps = 0.0005) {
  return Math.abs(a - b) < eps;
}

function forecastModelLabel(model: 'best_match' | 'gfs' | 'ecmwf' | 'dwd_icon') {
  switch (model) {
    case 'gfs':
      return 'NOAA GFS';
    case 'ecmwf':
      return 'ECMWF';
    case 'dwd_icon':
      return 'DWD ICON';
    case 'best_match':
    default:
      return 'Best match';
  }
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

function extractIsoWallClockParts(value: unknown): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  if (typeof value !== 'string') return null;
  const m = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/);
  if (!m) return null;
  const parts = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) };
  return Object.values(parts).every((v) => Number.isFinite(v)) ? parts : null;
}

function formatWallHour(hour: number, minute = 0) {
  const hour12 = ((hour + 11) % 12) + 1;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return minute ? `${hour12}:${String(minute).padStart(2, '0')} ${suffix}` : `${hour12} ${suffix}`;
}

function wallClockToSortableMs(parts: { year: number; month: number; day: number; hour: number; minute: number }) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function getNowSortableMs(timeZone?: string | null) {
  if (timeZone) {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const parts = fmt.formatToParts(new Date());
    const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
    return wallClockToSortableMs({ year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour'), minute: pick('minute') });
  }
  const now = new Date();
  return wallClockToSortableMs({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), hour: now.getHours(), minute: now.getMinutes() });
}

function formatUpdatedTime(observationTime: string | null, timeZone?: string | null) {
  if (!observationTime) return '—';
  const wall = extractIsoWallClockParts(observationTime);
  if (wall && !/[zZ]|[+-]\d{2}:\d{2}$/.test(observationTime.trim())) return formatWallHour(wall.hour, wall.minute);
  const d = new Date(observationTime);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timeZone || undefined });
}


function todayDateKeyLocal() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function hpaToInHg(hpa: number) {
  return hpa * 0.029529983071445;
}

function findClosestHour(hours: any[], targetMs: number, timeZone?: string | null) {
  let best: any = null;
  let bestDt = Infinity;
  const target = timeZone ? getNowSortableMs(timeZone) : targetMs;

  for (const h of hours ?? []) {
    const raw = h.time ?? h.datetime ?? h.date ?? '';
    const wall = extractIsoWallClockParts(raw);
    const t = wall ? wallClockToSortableMs(wall) : new Date(raw).getTime();
    if (!Number.isFinite(t)) continue;

    const dt = Math.abs(t - target);
    if (dt < bestDt) {
      bestDt = dt;
      best = h;
    }
  }

  return best;
}

function pressureTrendFromHourly(hours: any[], timeZone?: string | null) {
  const nowMs = Date.now();
  const now = findClosestHour(hours, nowMs, timeZone);
  const past = findClosestHour(hours, nowMs - 3 * 60 * 60 * 1000, timeZone);

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
  weatherCode?: number | null;
  emoji?: string;
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

function isPrecipWeatherCode(code: number | null): boolean {
  return code != null && (
    [51, 53, 55, 56, 57].includes(code) ||
    [61, 63, 65, 66, 67].includes(code) ||
    [71, 73, 75, 77, 85, 86].includes(code) ||
    [80, 81, 82].includes(code) ||
    [95, 96, 99].includes(code)
  );
}

function dryWeatherCodeFromCondition(condition: string): number | null {
  const text = condition.toLowerCase();
  if (text.includes('clear') || text.includes('sun')) return 0;
  if (text.includes('mostly')) return 1;
  if (text.includes('partly')) return 2;
  if (text.includes('overcast') || text.includes('cloud')) return 3;
  if (text.includes('fog')) return 45;
  return null;
}

function reconcileDailyWeatherCode(code: number | null, precipChancePct: number | null, currentCondition: string): number | null {
  if (isPrecipWeatherCode(code) && precipChancePct != null && precipChancePct <= 10) {
    return dryWeatherCodeFromCondition(currentCondition) ?? null;
  }
  return code;
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

function formatClock(iso?: string | null, timeZone?: string | null) {
  if (!iso) return '—';
  const wall = extractIsoWallClockParts(iso);
  if (wall && !/[zZ]|[+-]\d{2}:\d{2}$/.test(iso.trim())) return formatWallHour(wall.hour, wall.minute);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: timeZone || undefined });
}

function minutesFromClockIso(iso?: string | null) {
  const wall = extractIsoWallClockParts(iso);
  if (wall) return wall.hour * 60 + wall.minute;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

function buildArcPath(
  displayStart: number,
  displayEnd: number,
  cycleStart: number,
  cycleEnd: number,
  opts: { width: number; margin: number; baseline: number; height: number }
) {
  // SVG arcs are sampled as short line segments instead of a single cubic
  // curve because sunrise/sunset and moonrise/moonset can cross midnight. The
  // segment model keeps wraparound cases predictable.
  const span = Math.max(1, cycleEnd - cycleStart);
  const samples = 20;
  const points: string[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = displayStart + ((displayEnd - displayStart) * i) / samples;
    const dayMinute = ((t % 1440) + 1440) % 1440;
    const x = opts.margin + (dayMinute / 1440) * (opts.width - opts.margin * 2);
    const progress = Math.max(0, Math.min(1, (t - cycleStart) / span));
    const y = opts.baseline - Math.sin(progress * Math.PI) * opts.height;
    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return points.join(' ');
}

function dayArcSegments(startMinute: number | null, endMinute: number | null) {
  // If the event ends after midnight, split it into two visible pieces so the
  // chart still reads left-to-right across one local day.
  if (startMinute == null || endMinute == null) return [];
  const normalizedEnd = endMinute <= startMinute ? endMinute + 1440 : endMinute;
  if (normalizedEnd <= 1440) {
    return [{ displayStart: startMinute, displayEnd: normalizedEnd, cycleStart: startMinute, cycleEnd: normalizedEnd }];
  }
  return [
    { displayStart: startMinute, displayEnd: 1440, cycleStart: startMinute, cycleEnd: normalizedEnd },
    { displayStart: 1440, displayEnd: normalizedEnd, cycleStart: startMinute, cycleEnd: normalizedEnd },
  ];
}

function DayMoonArc({
  sunrise,
  sunset,
  moonrise,
  moonset,
  showMoon = false,
  showTimes = true,
  embedded = false,
}: {
  sunrise?: string | null;
  sunset?: string | null;
  moonrise?: string | null;
  moonset?: string | null;
  showMoon?: boolean;
  showTimes?: boolean;
  embedded?: boolean;
}) {
  // Simple mode uses only the sun arc; wxLab can add moonrise/moonset in the
  // same compact space. The colors are intentionally distinct but muted enough
  // to live inside the glass daily card.
  const width = 320;
  const height = 104;
  const margin = 24;
  const baseline = 66;
  const arcHeight = 38;
  const sunStart = minutesFromClockIso(sunrise);
  const sunEnd = minutesFromClockIso(sunset);
  const moonStart = minutesFromClockIso(moonrise);
  const moonEnd = minutesFromClockIso(moonset);
  const sunSegments = dayArcSegments(sunStart, sunEnd);
  const moonSegments = showMoon ? dayArcSegments(moonStart, moonEnd) : [];
  const hasSun = sunSegments.length > 0;
  const hasMoon = moonSegments.length > 0;

  return (
    <View style={[styles.dayArcCard, embedded ? styles.dayArcEmbedded : null]}>
      <View style={styles.dayArcHeader}>
        <Text style={styles.dayArcTitle}>{showMoon ? 'Sun & moon arc' : 'Sun arc'}</Text>
        <View style={styles.dayArcLegend}>
          <View style={[styles.dayArcLegendDot, { backgroundColor: 'rgba(255, 198, 89, 0.96)' }]} />
          <Text style={styles.dayArcLegendText}>Sun</Text>
          {showMoon ? (
            <>
              <View style={[styles.dayArcLegendDot, { backgroundColor: 'rgba(96, 190, 255, 0.96)' }]} />
              <Text style={styles.dayArcLegendText}>Moon</Text>
            </>
          ) : null}
        </View>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Path
          d={`M ${margin} ${baseline} L ${width - margin} ${baseline}`}
          stroke="rgba(255,255,255,0.16)"
          strokeWidth={2}
          strokeLinecap="round"
        />
        <Path
          d={`M ${margin} ${baseline} C ${width * 0.33} ${baseline - 18}, ${width * 0.67} ${baseline - 18}, ${width - margin} ${baseline}`}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          strokeDasharray="4 7"
          fill="none"
        />
        {moonSegments.map((segment, idx) => (
          <Path
            key={`moon-${idx}`}
            d={buildArcPath(segment.displayStart, segment.displayEnd, segment.cycleStart, segment.cycleEnd, { width, margin, baseline, height: arcHeight - 8 })}
            stroke="rgba(96, 190, 255, 0.92)"
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
        ))}
        {sunSegments.map((segment, idx) => (
          <Path
            key={`sun-${idx}`}
            d={buildArcPath(segment.displayStart, segment.displayEnd, segment.cycleStart, segment.cycleEnd, { width, margin, baseline, height: arcHeight })}
            stroke="rgba(255, 198, 89, 0.96)"
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
          />
        ))}
        {sunStart != null ? <Circle cx={margin + (sunStart / 1440) * (width - margin * 2)} cy={baseline} r={4.5} fill="rgba(255, 198, 89, 1)" /> : null}
        {sunEnd != null ? <Circle cx={margin + (sunEnd / 1440) * (width - margin * 2)} cy={baseline} r={4.5} fill="rgba(255, 198, 89, 1)" /> : null}
        {showMoon && moonStart != null ? <Circle cx={margin + (moonStart / 1440) * (width - margin * 2)} cy={baseline} r={4} fill="rgba(96, 190, 255, 1)" /> : null}
        {showMoon && moonEnd != null ? <Circle cx={margin + (moonEnd / 1440) * (width - margin * 2)} cy={baseline} r={4} fill="rgba(96, 190, 255, 1)" /> : null}
      </Svg>
      {showTimes ? (
        <View style={styles.dayArcTimes}>
          <View style={styles.dayArcTimeBlock}>
            <Text style={styles.dayArcTimeLabel}>Sunrise</Text>
            <Text style={styles.dayArcTimeValue}>{formatClock(sunrise)}</Text>
          </View>
          <View style={styles.dayArcTimeBlock}>
            <Text style={styles.dayArcTimeLabel}>Sunset</Text>
            <Text style={styles.dayArcTimeValue}>{formatClock(sunset)}</Text>
          </View>
          {showMoon ? (
            <>
              <View style={styles.dayArcTimeBlock}>
                <Text style={styles.dayArcTimeLabel}>Moonrise</Text>
                <Text style={[styles.dayArcTimeValue, styles.dayArcMoonText]}>{formatClock(moonrise)}</Text>
              </View>
              <View style={styles.dayArcTimeBlock}>
                <Text style={styles.dayArcTimeLabel}>Moonset</Text>
                <Text style={[styles.dayArcTimeValue, styles.dayArcMoonText]}>{formatClock(moonset)}</Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
      {!hasSun && (!showMoon || !hasMoon) ? <Text style={styles.dayArcPending}>Arc timing pending</Text> : null}
    </View>
  );
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
  const wall = extractIsoWallClockParts(raw);
  if (wall) return formatWallHour(wall.hour);
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
  const { chrome } = useAppChrome();
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
            style={[styles.activityLearnButton, { backgroundColor: chrome.pill, borderColor: chrome.border }]}
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
                  backgroundColor: chrome.cardStrong,
                  borderColor: chrome.border,
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
                    {typeof item.weatherCode === 'number' ? (
                      <PremiumWeatherIcon code={item.weatherCode} size={24} />
                    ) : (
                      <Text style={styles.favoriteEmoji}>{item.emoji}</Text>
                    )}
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
      <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} allowFontScaling={false}>
        {value}
      </Text>
      {valueHint ? <Text style={styles.tileHint} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72} allowFontScaling={false}>{valueHint}</Text> : null}
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

function getIsoDateKey(raw: any) {
  const s = typeof raw === 'string' ? raw : '';
  if (!s) return '';
  return s.slice(0, 10);
}

function getHour(raw: any) {
  const s = typeof raw === 'string' ? raw : '';
  if (!s || s.length < 13) return null;
  const h = Number(s.slice(11, 13));
  return Number.isFinite(h) ? h : null;
}

function summarizeHourBlock(block: any[], label: 'Day' | 'Night') {
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

  const pops = block
    .map((h) => safeNum(h?.precipitation_probability ?? h?.precipProbPct ?? h?.precipChancePct ?? h?.pop))
    .filter((v): v is number => v != null);
  const winds = block
    .map((h) => safeNum(h?.windMph ?? h?.windSpeedMph ?? h?.wind_speed_mph ?? h?.windSpeed ?? h?.wind))
    .filter((v): v is number => v != null);
  const gusts = block
    .map((h) => safeNum(h?.gustMph ?? h?.windGustMph ?? h?.wind_gust_mph ?? h?.gust ?? h?.windGust))
    .filter((v): v is number => v != null);
  const temps = block
    .map((h) => safeNum(h?.tempF ?? h?.temperatureF ?? h?.temperature_2m ?? h?.temperature ?? h?.temp))
    .filter((v): v is number => v != null);

  const conditionCounts = new Map<string, number>();
  for (const h of block) {
    const code =
      safeNum(h?.weatherCode ?? h?.weather_code ?? h?.weathercode ?? h?.condition_code ?? h?.code) ?? null;
    const condition = weatherCodeToLabel(code);
    conditionCounts.set(condition, (conditionCounts.get(condition) ?? 0) + 1);
  }

  let dominantCondition = '—';
  let dominantCount = -1;
  for (const [condition, count] of conditionCounts.entries()) {
    if (count > dominantCount) {
      dominantCondition = condition;
      dominantCount = count;
    }
  }

  const pop = pops.length ? Math.max(...pops) : null;
  const wind = winds.length ? Math.max(...winds) : null;
  const gust = gusts.length ? Math.max(...gusts) : null;
  const tempMin = temps.length ? Math.min(...temps) : null;
  const tempMax = temps.length ? Math.max(...temps) : null;

  const phrases: string[] = [];
  if (dominantCondition === 'Clear') phrases.push(label === 'Day' ? 'Clear skies' : 'Clear tonight');
  else if (dominantCondition === 'Mostly clear') phrases.push(label === 'Day' ? 'Mostly sunny' : 'Mostly clear');
  else if (dominantCondition === 'Partly cloudy') phrases.push('Partly cloudy');
  else if (dominantCondition === 'Overcast') phrases.push('Cloudy');
  else if (dominantCondition === 'Rain') phrases.push('Rain likely');
  else if (dominantCondition === 'Showers') phrases.push('Showers around');
  else if (dominantCondition === 'Drizzle') phrases.push('Light drizzle possible');
  else if (dominantCondition === 'Snow') phrases.push('Snow possible');
  else if (dominantCondition === 'Thunderstorm') phrases.push('Storms possible');
  else if (dominantCondition === 'Fog') phrases.push('Fog possible');

  if (pop != null) {
    if (pop >= 70) phrases.push('high precip chance');
    else if (pop >= 40) phrases.push('some precip possible');
    else if (pop <= 10) phrases.push('mainly dry');
  }

  if (wind != null) {
    if (wind >= 20) phrases.push('windy');
    else if (wind >= 10) phrases.push('breezy');
  }

  return {
    label,
    condition: dominantCondition,
    pop,
    wind,
    gust,
    tempMin,
    tempMax,
    narrative: phrases.length ? phrases.join(' • ') : `${label} conditions vary.`,
  };
}

function buildDayNightSummary(dateRaw: any, hourly?: any[]) {
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
    day: summarizeHourBlock(dayHours, 'Day'),
    night: summarizeHourBlock(nightHours, 'Night'),
  };
}

function SimpleDailyOverview({
  tempF,
  condition,
  heroSummary,
  feelsLikeF,
  dewpointF,
  precipChancePct,
  windMph,
  gustMph,
  humidityPct,
  uvIndex,
  airQualityLabel,
  airQualityIndex,
  daily,
  hourly,
  sunrise,
  sunset,
  moonrise,
  moonset,
  moonDays,
  dayLengthSec,
}: {
  tempF: number | null;
  condition: string;
  heroSummary: string;
  feelsLikeF: number | null;
  dewpointF: number | null;
  precipChancePct: number | null;
  windMph: number | null;
  gustMph: number | null;
  humidityPct: number | null;
  uvIndex: number | null;
  airQualityLabel: string | null;
  airQualityIndex: number | null;
  daily: any[];
  hourly: any[];
  sunrise?: string | null;
  sunset?: string | null;
  moonrise?: string | null;
  moonset?: string | null;
  moonDays?: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  dayLengthSec?: number | null;
}) {
  const { chrome } = useAppChrome();
  const today = daily[0] ?? null;
  const todayKey =
    typeof today?.date === 'string'
      ? today.date.slice(0, 10)
      : typeof today?.time === 'string'
        ? today.time.slice(0, 10)
        : '';
  const nextDays = daily.slice(0, 15);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);
  const moonByDate = React.useMemo(
    () => new Map((moonDays ?? []).map((day) => [day.date, day] as const)),
    [moonDays]
  );
  const todayMoon = (todayKey ? moonByDate.get(todayKey) : undefined) ?? moonDays?.[0];
  const tonightMoonLabel = [
    todayMoon?.moonPhaseLabel,
    typeof todayMoon?.moonIlluminationPct === 'number' && Number.isFinite(todayMoon.moonIlluminationPct)
      ? `${Math.round(todayMoon.moonIlluminationPct)}% full`
      : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const todaySplit = buildDayNightSummary(today?.date ?? today?.time, hourly);
  const fmtWind = (v: number | null) => (v != null ? `${Math.round(v)} mph` : '—');
  const todayHi =
    safeNum(today?.tempMaxF ?? today?.temperatureMaxF ?? today?.temperature_2m_max ?? today?.maxTempF ?? today?.highF) ?? null;
  const todayLo =
    safeNum(today?.tempMinF ?? today?.temperatureMinF ?? today?.temperature_2m_min ?? today?.minTempF ?? today?.lowF) ?? null;
  const todayPop =
    safeNum(today?.precipProbMaxPct ?? today?.precipitationProbabilityMax ?? today?.pop ?? today?.precipChancePct) ?? null;
  const todayCode = safeNum(today?.weatherCode ?? today?.weather_code ?? today?.weathercode ?? today?.code) ?? null;
  const displayTodayCode = reconcileDailyWeatherCode(todayCode, todayPop, condition);
  const todayCondition = weatherCodeToLabel(displayTodayCode);
  const todayEmoji = weatherCodeToEmoji(todayCode);
  const currentMarkerPct =
    todayHi != null && todayLo != null && tempF != null && todayHi !== todayLo
      ? Math.max(0, Math.min(100, ((tempF - todayLo) / (todayHi - todayLo)) * 100))
      : 50;
  const feelsMarkerPct =
    todayHi != null && todayLo != null && feelsLikeF != null && todayHi !== todayLo
      ? Math.max(0, Math.min(100, ((feelsLikeF - todayLo) / (todayHi - todayLo)) * 100))
      : null;
  const todayNarrative = [
    todayCondition,
    todayHi != null && todayHi >= 85 ? 'Warm' : todayHi != null && todayHi <= 55 ? 'Cool' : 'Mild',
    todayPop != null && todayPop <= 10 ? 'Dry overall' : todayPop != null && todayPop >= 40 ? 'Some precip possible' : null,
  ]
    .filter(Boolean)
    .join(' • ');
  const currentAqiValue = airQualityIndex != null ? `${Math.round(airQualityIndex)}` : '—';
  const currentAqiSub = airQualityLabel?.replace(/^AQI\s*:?\s*/i, '').trim() || undefined;
  const todayWindSub = gustMph != null ? `Gust ${Math.round(gustMph)} mph` : '—';
  const tonightWindSub = todaySplit.night.gust != null ? `Gust ${Math.round(todaySplit.night.gust)} mph` : '—';
  const currentMetrics = [
    { value: precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—', label: 'Precip chance' },
    { value: windMph != null ? `${Math.round(windMph)} mph` : '—', label: 'Wind', sub: todayWindSub.replace('???', '—') },
    { value: humidityPct != null ? `${Math.round(humidityPct)}%` : '—', label: 'RH' },
    { value: uvIndex != null ? `${Math.round(uvIndex)}` : '—', label: 'UV index' },
    { value: currentAqiValue.replace('???', '—'), label: 'AQI', sub: currentAqiSub },
    { value: dewpointF != null ? `${Math.round(dewpointF)}°` : '—', label: 'Dew point' },
  ];
  const dailyCurrentSummaryText =
    [todayNarrative, todayPop != null ? `${Math.round(todayPop)}% precip chance` : null]
      .filter(Boolean)
      .join(' • ') || heroSummary;

  return (
    <View style={styles.dailySimpleWrap}>
      <View style={[styles.dailyCurrentCard, styles.dailyRangeCard, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
        <View style={styles.dailyRangeHeaderRow}>
          <Text style={styles.dailyPanelEyebrow}>Daily Range</Text>
        </View>
        <View style={styles.dailyCurrentTop}>
          <PremiumWeatherIcon code={displayTodayCode} size={54} variant="hero" style={styles.dailyCurrentIconBadge} />
          <Text style={styles.dailyCurrentTemp}>{tempF != null ? `${Math.round(tempF)}°` : '—'}</Text>
          <View style={styles.dailyCurrentText}>
            <Text
              style={styles.dailyCurrentCondition}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.58}
              allowFontScaling={false}
            >
              {condition}
            </Text>
          </View>
        </View>
        <View style={styles.dailyCurrentSummaryBox}>
          <Text style={styles.dailyCurrentSummary}>{dailyCurrentSummaryText}</Text>
        </View>

        <View style={styles.dailyRangeStats}>
          <View style={styles.dailyRangeStat}>
            <Text style={styles.dailyRangeStatLabel}>Low</Text>
            <Text style={styles.dailyRangeStatValue}>{todayLo != null ? `${Math.round(todayLo)}°` : '—'}</Text>
          </View>
          <View style={styles.dailyRangeStat}>
            <Text style={styles.dailyRangeStatLabel}>High</Text>
            <Text style={styles.dailyRangeStatValue}>{todayHi != null ? `${Math.round(todayHi)}°` : '—'}</Text>
          </View>
        </View>

        <View style={styles.dailyTempRangeBlock}>
          <View style={styles.dailyTempRangeLabels}>
            <Text style={styles.dailyTempRangeEndpoint}>{todayLo != null ? `${Math.round(todayLo)}°` : '—'}</Text>
            <View style={styles.dailyTempRangeLegend}>
              <View style={styles.dailyTempRangeLegendItem}>
                <View style={styles.dailyTempRangeActualSwatch} />
                <Text style={styles.dailyTempRangeNow}>Actual</Text>
              </View>
              {feelsLikeF != null ? (
                <View style={styles.dailyTempRangeLegendItem}>
                  <View style={styles.dailyTempRangeFeelsSwatch} />
                  <Text style={styles.dailyTempRangeNow}>Feels {Math.round(feelsLikeF)}°</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.dailyTempRangeEndpoint}>{todayHi != null ? `${Math.round(todayHi)}°` : '—'}</Text>
          </View>
          <View style={styles.dailyTempRangeTrack}>
            <LinearGradient
              colors={['rgba(72, 160, 255, 0.82)', 'rgba(255, 205, 92, 0.78)', 'rgba(255, 86, 86, 0.84)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.dailyTempRangeFill}
            />
            <View style={[styles.dailyTempRangeMarker, { left: `${currentMarkerPct}%` }]}>
              <View style={styles.dailyTempRangeMarkerDot} />
            </View>
            {feelsMarkerPct != null ? (
              <View style={[styles.dailyTempRangeFeelsMarker, { left: `${feelsMarkerPct}%` }]}>
                <View style={styles.dailyTempRangeFeelsDot} />
              </View>
            ) : null}
          </View>
        </View>

        <DayMoonArc sunrise={sunrise} sunset={sunset} />

        <View style={[styles.dailyCurrentMetricRow, { backgroundColor: chrome.pill, borderColor: chrome.border }]}>
          {currentMetrics.map((item) => (
            <View key={item.label} style={styles.dailyCurrentMetricCell}>
              <Text style={styles.dailyCurrentMetricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {item.label}
              </Text>
              <Text style={styles.dailyCurrentMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                {item.value}
              </Text>
              <Text
                style={[styles.dailyCurrentMetricSub, !item.sub && styles.dailyCurrentMetricSubEmpty]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.76}
              >
                {item.sub || '—'}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.nextDaysHeader}>
        <Text style={styles.nextDaysTitle}>15-day forecast</Text>
      </View>
      <View style={styles.nextDaysList}>
        {nextDays.map((day: any, idx: number) => {
          const key = String(day?.date ?? day?.time ?? idx);
          const expanded = expandedKey === key;
          const hi =
            safeNum(day?.tempMaxF ?? day?.temperatureMaxF ?? day?.temperature_2m_max ?? day?.maxTempF ?? day?.highF) ?? null;
          const lo =
            safeNum(day?.tempMinF ?? day?.temperatureMinF ?? day?.temperature_2m_min ?? day?.minTempF ?? day?.lowF) ?? null;
          const pop =
            safeNum(day?.precipProbMaxPct ?? day?.precipitationProbabilityMax ?? day?.pop ?? day?.precipChancePct) ?? null;
          const code = safeNum(day?.weatherCode ?? day?.weather_code ?? day?.weathercode ?? day?.code) ?? null;
          const wind =
            safeNum(day?.windSpeedMaxMph ?? day?.windMaxMph ?? day?.maxWindMph ?? day?.wind_mph ?? day?.windSpeedMph) ?? null;
          const gust =
            safeNum(day?.windGustMaxMph ?? day?.gustMaxMph ?? day?.maxGustMph ?? day?.windGustMph) ?? null;
          const split = buildDayNightSummary(day?.date ?? day?.time, hourly);
          const dayKey = typeof day?.date === 'string' ? day.date.slice(0, 10) : typeof day?.time === 'string' ? day.time.slice(0, 10) : '';
          const moonForDay = dayKey ? moonByDate.get(dayKey) : undefined;
          const sunriseForDay = typeof day?.sunrise === 'string' ? day.sunrise : null;
          const sunsetForDay = typeof day?.sunset === 'string' ? day.sunset : null;
          const moonriseForDay =
            (typeof moonForDay?.moonrise === 'string' ? moonForDay.moonrise : null) ??
            (typeof day?.moonrise === 'string' ? day.moonrise : null) ??
            null;
          const moonsetForDay =
            (typeof moonForDay?.moonset === 'string' ? moonForDay.moonset : null) ??
            (typeof day?.moonset === 'string' ? day.moonset : null) ??
            null;
          const dayLength =
            safeNum(day?.daylightDurationSec ?? day?.daylight_duration ?? day?.daylightDuration) ?? null;
          const uvMax =
            safeNum(day?.uvIndexMax ?? day?.uv_index_max ?? day?.uvMax ?? day?.uv) ?? uvIndex ?? null;
          const humidityText =
            safeNum(day?.humidityMaxPct ?? day?.relativeHumidityMaxPct ?? day?.humidityPct) != null
              ? `${Math.round(safeNum(day?.humidityMaxPct ?? day?.relativeHumidityMaxPct ?? day?.humidityPct) ?? 0)}%`
              : '—';
          const pressureText =
            safeNum(day?.pressureHpa ?? day?.pressure_hpa ?? day?.surfacePressureHpa) != null
              ? `${Math.round(safeNum(day?.pressureHpa ?? day?.pressure_hpa ?? day?.surfacePressureHpa) ?? 0)} hPa`
              : '—';
          const aqiText = airQualityIndex != null ? `${Math.round(airQualityIndex)}` : '—';
          const label = formatDailyLabel(day?.date ?? day?.time ?? day?.datetime);
          const emoji = weatherCodeToEmoji(code);
          const conditionLabel = weatherCodeToLabel(code);
          const labelParts = label.split(',');
          const dayLabel = labelParts[0]?.trim() || label;
          const dateLabel = labelParts.slice(1).join(',').trim();
          const humidityValue =
            safeNum(day?.humidityMaxPct ?? day?.relativeHumidityMaxPct ?? day?.humidityPct) ?? null;
          const pressureValue =
            safeNum(day?.pressureHpa ?? day?.pressure_hpa ?? day?.surfacePressureHpa) ?? null;
          const summaryLine = [
            wind != null ? `${Math.round(wind)} mph wind` : null,
            gust != null ? `${Math.round(gust)} mph gust` : null,
          ]
            .filter(Boolean)
            .join(' • ');
          const metricRows = [
            { label: 'Wind', value: fmtWind(wind), ratio: wind != null ? Math.max(0, Math.min(1, wind / 40)) : 0 },
            { label: 'Wind gusts', value: fmtWind(gust), ratio: gust != null ? Math.max(0, Math.min(1, gust / 50)) : 0 },
            { label: 'RH', value: humidityText.replace('???', '—'), ratio: humidityValue != null ? Math.max(0, Math.min(1, humidityValue / 100)) : 0 },
            { label: 'Precip chance', value: pop != null ? `${Math.round(pop)}%` : '—', ratio: pop != null ? Math.max(0, Math.min(1, pop / 100)) : 0 },
            { label: 'Pressure', value: pressureText.replace('???', '—'), ratio: pressureValue != null ? Math.max(0, Math.min(1, (pressureValue - 980) / 60)) : 0 },
            { label: 'Air quality', value: aqiText.replace('???', '—'), ratio: airQualityIndex != null ? Math.max(0, Math.min(1, airQualityIndex / 150)) : 0 },
          ].filter((row) => row.value !== '???' && row.value !== '—');

          return (
            <Pressable
              key={key}
              onPress={() => setExpandedKey((prev) => (prev === key ? null : key))}
              style={[
                styles.nextDayRow,
                { backgroundColor: chrome.cardStrong, borderColor: chrome.border },
                expanded && styles.nextDayRowExpanded,
                expanded && { borderColor: chrome.borderStrong },
              ]}
            >
              <View style={styles.dailyForecastTop}>
                <View style={styles.dailyForecastWhen}>
                  <Text style={styles.dailyForecastDay}>{dayLabel}</Text>
                  {dateLabel ? <Text style={styles.dailyForecastDate}>{dateLabel}</Text> : null}
                </View>
                <View style={styles.dailyForecastMain}>
                  <Text style={styles.dailyTemps}>
                    <Text style={styles.dailyHi}>{hi != null ? `${Math.round(hi)}°` : '—'}</Text>
                    <Text style={styles.dailySlash}> / </Text>
                    <Text style={styles.dailyLo}>{lo != null ? `${Math.round(lo)}°` : '—'}</Text>
                  </Text>
                  <View style={styles.dailyForecastConditionRow}>
                    <PremiumWeatherIcon code={code} size={26} variant="inline" style={styles.dailyForecastIconBadge} />
                    <Text style={styles.dailyCondition} numberOfLines={1}>
                      {conditionLabel}
                    </Text>
                  </View>
                  <Text style={styles.dailyForecastSummary} numberOfLines={expanded ? 2 : 1}>
                    {summaryLine}
                  </Text>
                </View>
                <View style={styles.dailyForecastSide}>
                  <Text style={styles.dailyForecastSideValue}>{pop != null ? `${Math.round(pop)}%` : '—'}</Text>
                  <Text style={styles.dailyChevron}>{expanded ? '⌃' : '⌄'}</Text>
                </View>
              </View>

              {expanded ? (
                <View style={styles.dailyExpanded}>
                  {metricRows.map((row) => (
                    <View key={row.label} style={styles.dailyMetricRow}>
                      <Text style={styles.dailyMetricLabel}>{row.label}</Text>
                      <View style={styles.dailyMetricTrack}>
                        <View style={[styles.dailyMetricFill, { width: `${Math.max(12, row.ratio * 100)}%` }]} />
                      </View>
                      <Text style={styles.dailyMetricValue}>{row.value}</Text>
                    </View>
                  ))}
                  <View style={styles.dailySunRow}>
                    <Text style={styles.dailySunLabel}>Sunrise</Text>
                    <Text style={styles.dailySunValue}>{formatClock(sunriseForDay)}</Text>
                  </View>
                  <View style={styles.dailySunRow}>
                    <Text style={styles.dailySunLabel}>Sunset</Text>
                    <Text style={styles.dailySunValue}>{formatClock(sunsetForDay)}</Text>
                  </View>
                  <Text style={styles.dailyExpandedSummary}>Day length {formatDayLength(dayLength)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function DailyForecastList({
  daily,
  hourly,
  moonrise,
  moonset,
  moonDays,
  maxDays = 15,
}: {
  daily: any[];
  hourly?: any[];
  moonrise?: string | null;
  moonset?: string | null;
  moonDays?: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  maxDays?: number;
}) {
  const rows = (daily ?? []).slice(0, maxDays);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);

  if (!rows.length) return null;

  const fmtWind = (v: number | null) => (v != null ? `${Math.round(v)} mph` : '—');

  return (
    <View style={styles.dailyList}>
      {rows.map((day: any, idx: number) => {
        const key = String(day?.date ?? day?.time ?? `day-${idx}`);
        const expanded = expandedKey === key;
        const label = formatDailyLabel(day?.date ?? day?.time);
        const labelParts = label.split(',');
        const dayLabel = labelParts[0]?.trim() || label;
        const dateLabel = labelParts.slice(1).join(',').trim();
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
        const humidity =
          safeNum(day?.humidityMaxPct ?? day?.relativeHumidityMaxPct ?? day?.humidityPct ?? day?.humidity) ?? null;
        const dewPoint =
          safeNum(day?.dewPointMaxF ?? day?.dewpointMaxF ?? day?.dewPointF ?? day?.dewpointF) ?? null;
        const cloudCover =
          safeNum(day?.cloudCoverAvgPct ?? day?.cloudCoverPct ?? day?.cloudcover ?? day?.cloudCover) ?? null;
        const feelsLike =
          safeNum(day?.apparentTempMaxF ?? day?.feelsLikeMaxF ?? day?.apparentTemperatureMaxF ?? day?.feelsLikeF) ?? hi;
        const dailyAqi =
          safeNum(day?.airQualityUsAqiMax ?? day?.airQualityIndexMax ?? day?.airQualityUsAqi ?? day?.aqiMax) ?? null;
        const dailyAqiLabel =
          typeof day?.airQualityLabel === 'string'
            ? day.airQualityLabel
            : typeof day?.aqiLabel === 'string'
              ? day.aqiLabel
              : null;
        const sunrise = typeof day?.sunrise === 'string' ? day.sunrise : null;
        const sunset = typeof day?.sunset === 'string' ? day.sunset : null;
        const emoji = weatherCodeToEmoji(code);
        const condition = weatherCodeToLabel(code);

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
        const windFeel =
          wind == null ? '—' : wind >= 25 ? 'Strong' : wind >= 15 ? 'Breezy' : wind >= 8 ? 'Light' : 'Calm';
        const summaryLine = [
          wind != null ? `${Math.round(wind)} mph wind` : null,
          gust != null ? `${Math.round(gust)} mph gust` : null,
        ]
          .filter(Boolean)
          .join(' • ');
        const barRows = [
          { label: 'AQI', value: dailyAqi != null ? `${Math.round(dailyAqi)}` : '—', ratio: dailyAqi != null ? Math.max(0, Math.min(1, dailyAqi / 150)) : 0 },
          { label: 'Feels like', value: feelsLike != null ? `${Math.round(feelsLike)}°` : '—', ratio: feelsLike != null ? Math.max(0, Math.min(1, (feelsLike - 20) / 90)) : 0 },
          { label: 'Dew point', value: dewPoint != null ? `${Math.round(dewPoint)}°` : '—', ratio: dewPoint != null ? Math.max(0, Math.min(1, dewPoint / 80)) : 0 },
          { label: 'RH', value: humidity != null ? `${Math.round(humidity)}%` : '—', ratio: humidity != null ? Math.max(0, Math.min(1, humidity / 100)) : 0 },
          { label: 'Cloud cover', value: cloudCover != null ? `${Math.round(cloudCover)}%` : '—', ratio: cloudCover != null ? Math.max(0, Math.min(1, cloudCover / 100)) : 0 },
          { label: 'Precip chance', value: pop != null ? `${Math.round(pop)}%` : '—', ratio: pop != null ? Math.max(0, Math.min(1, pop / 100)) : 0 },
          { label: 'Wind', value: fmtWind(wind), ratio: wind != null ? Math.max(0, Math.min(1, wind / 40)) : 0 },
          { label: 'Wind gusts', value: fmtWind(gust), ratio: gust != null ? Math.max(0, Math.min(1, gust / 50)) : 0 },
          { label: 'Wind feel', value: windFeel, ratio: wind != null ? Math.max(0, Math.min(1, wind / 35)) : 0 },
        ];

        return (
          <Pressable
            key={key}
            onPress={() => setExpandedKey((prev) => (prev === key ? null : key))}
            style={[styles.dailyRow, expanded && styles.dailyRowExpanded]}
          >
            <View style={styles.dailyForecastTop}>
              <View style={styles.dailyForecastWhen}>
                <Text style={styles.dailyForecastDay}>{dayLabel}</Text>
                {dateLabel ? <Text style={styles.dailyForecastDate}>{dateLabel}</Text> : null}
              </View>

              <View style={styles.dailyForecastMain}>
                <Text style={styles.dailyTemps}>
                  <Text style={styles.dailyHi}>{hi != null ? `${Math.round(hi)}°` : '—'}</Text>
                  <Text style={styles.dailySlash}> / </Text>
                  <Text style={styles.dailyLo}>{lo != null ? `${Math.round(lo)}°` : '—'}</Text>
                </Text>
                <Text style={styles.dailyFeelsProminent}>
                  Feels {feelsLike != null ? `${Math.round(feelsLike)}°` : '—'}
                  {dailyAqi != null ? `  AQI ${Math.round(dailyAqi)}${dailyAqiLabel ? ` ${dailyAqiLabel}` : ''}` : ''}
                </Text>
                <View style={styles.dailyForecastConditionRow}>
                  <PremiumWeatherIcon code={code} size={26} variant="inline" style={styles.dailyForecastIconBadge} />
                  <Text style={styles.dailyCondition} numberOfLines={1}>
                    {condition}
                  </Text>
                </View>
                <Text style={styles.dailyForecastSummary} numberOfLines={expanded ? 2 : 1}>
                  {summaryLine || narrative.charAt(0).toUpperCase() + narrative.slice(1)}
                </Text>
              </View>

              <View style={styles.dailyForecastSide}>
                <Text style={styles.dailyForecastSideValue}>{pop != null ? `${Math.round(pop)}%` : '—'}</Text>
                <Text style={styles.dailyChevron}>{expanded ? '⌃' : '⌄'}</Text>
              </View>
            </View>

            {expanded ? (
              <View style={styles.dailyExpanded}>
                {barRows.map((row) => (
                  <View key={row.label} style={styles.dailyMetricRow}>
                    <Text style={styles.dailyMetricLabel}>{row.label}</Text>
                    <View style={styles.dailyMetricTrack}>
                      <View style={[styles.dailyMetricFill, { width: `${Math.max(12, row.ratio * 100)}%` }]} />
                    </View>
                    <Text style={styles.dailyMetricValue}>{row.value}</Text>
                  </View>
                ))}
                <View style={styles.dailySunRow}>
                  <Text style={styles.dailySunLabel}>Sunrise</Text>
                  <Text style={styles.dailySunValue}>{formatClock(sunrise)}</Text>
                </View>
                <View style={styles.dailySunRow}>
                  <Text style={styles.dailySunLabel}>Sunset</Text>
                  <Text style={styles.dailySunValue}>{formatClock(sunset)}</Text>
                </View>
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

const GLASS_PANEL_BG = 'rgba(18,28,45,0.56)';
const GLASS_PANEL_BG_STRONG = 'rgba(18,28,45,0.56)';
const GLASS_INSET_BG = 'rgba(255,255,255,0.08)';
const GLASS_INSET_BG_SOFT = 'rgba(255,255,255,0.06)';
const GLASS_BORDER = 'rgba(255,255,255,0.10)';
const GLASS_BORDER_SOFT = 'rgba(255,255,255,0.08)';

const ss = StyleSheet.create({
  wrap: { marginTop: 10, gap: 10 },
  section: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
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
  condition,
  heroSummary,
  updatedText,
  dewpointF,
  humidityPct,
  dpBand,
  spreadF,
  tempF,
  feelsLikeF,
  windMph,
  gustMph,
  windDirDeg,
  gf,
  cloudCoverPct,
  uvIndex,
  airQualityLabel,
  airQualityIndex,
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
  moonIlluminationPct,
  moonPhaseDegrees,
  moonPhaseLabel,
  dayLengthSec,
  feelsDriverLabel,
  feelsDriverValue,
  feelsDriverTopicId,
  onOpenLearnTopic,
}: {
  condition: string;
  heroSummary: string;
  updatedText: string | null;
  dewpointF: number | null;
  humidityPct: number | null;
  dpBand: string | null;
  spreadF: number | null;
  tempF: number | null;
  feelsLikeF: number | null;
  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
  gf: number | null;
  cloudCoverPct: number | null;
  uvIndex: number | null;
  airQualityLabel: string | null;
  airQualityIndex: number | null;
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
  moonIlluminationPct?: number | null;
  moonPhaseDegrees?: number | null;
  moonPhaseLabel?: string | null;
  dayLengthSec?: number | null;
  pressureTrend: { arrow: '\u2191' | '\u2193' | '\u2192'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null };
  feelsDriverLabel: string;
  feelsDriverValue: string;
  feelsDriverTopicId: string;
  onOpenLearnTopic: (topicId?: string) => void;
}) {
  const dir = dirToCompass(windDirDeg);
  const dirHeading = dir ?? '\u2014';
  const dirDegrees = windDirDeg != null ? `${Math.round(windDirDeg)}\u00B0` : '\u2014';
  const pressureRegime = pressureRegimeLabel(pressureTrend);
  const radiationRegime = radiationRegimeLabel(cloudCoverPct);
  const windState = windMph == null ? 'Wind variable' : windMph < 5 ? 'Calm' : windMph < 15 ? 'Breezy' : windMph < 25 ? 'Steady winds' : 'Windy';
  const moistureState = dewpointF == null ? 'Moisture' : dewpointF < 45 ? 'Dry Air' : dewpointF < 60 ? 'Comfortable' : 'Humid';
  const cloudState = radiationRegime === '\u2014' ? 'Sky state' : radiationRegime;
  const pressureState = pressureRegime;
  const pressurePrimary = pressureHpa != null ? `${Math.round(pressureHpa)} hPa ${pressureTrend.arrow}` : `\u2014 ${pressureTrend.arrow}`;
  const pressureSecondary = pressureInHg != null ? `${pressureInHg.toFixed(2)} inHg` : '\u2014';
  const pressureTrendText = pressureTrend.deltaHpa == null
    ? pressureTrend.label
    : `${pressureTrend.label} ${pressureTrend.deltaHpa >= 0 ? '+' : ''}${pressureTrend.deltaHpa.toFixed(1)} hPa`;
  const cloudBarPct = cloudCoverPct == null ? 0 : Math.max(0, Math.min(100, Math.round(cloudCoverPct)));
  const moonFullLabel = moonIlluminationPct != null && Number.isFinite(moonIlluminationPct) ? `${Math.round(moonIlluminationPct)}% full` : 'Phase pending';
  const summaryCards = [
    { label: 'Night Window', value: formatWindow(astro?.nightStartTime, astro?.nightEndTime), topicId: astroLearnTopicId('night') },
    { label: 'Best Window', value: formatWindow(astro?.bestStartTime, astro?.bestEndTime), topicId: astroLearnTopicId('best') },
    { label: 'True Dark', value: formatWindow(astro?.trueDarkStartTime, astro?.trueDarkEndTime), topicId: astroLearnTopicId('true-dark') },
    { label: 'Day Length', value: formatDayLength(dayLengthSec), topicId: astroLearnTopicId('sunrise') },
  ];
  const quickChips = [moistureState, windState, cloudState, pressureState];

  return (
    <View style={nd.wrap}>
      <View style={nd.topBar}>
        <Text style={nd.kicker}>WX LAB DAILY</Text>
        {updatedText ? <Text style={nd.updated}>{updatedText}</Text> : null}
      </View>

      <View style={nd.heroShell}>
        <View style={nd.heroRow}>
          <Text style={nd.heroTemp}>{tempF != null ? `${Math.round(tempF)}°` : '—'}</Text>

          <View style={nd.heroCopy}>
            <Text style={nd.heroCondition}>{condition}</Text>
            <Text style={nd.heroSummary}>{heroSummary}</Text>
          </View>

          <View style={nd.heroFeelsBlock}>
            <Text style={nd.heroFeelsLabel}>Feels</Text>
            <Text style={nd.heroFeelsValue}>{feelsLikeF != null ? `${Math.round(feelsLikeF)}°` : '—'}</Text>
          </View>
        </View>

        <View style={nd.chipRow}>
          {quickChips.map((chip) => (
            <View key={chip} style={nd.chip}>
              <Text style={nd.chipText}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={nd.panelGrid}>
        <View style={nd.panelRow}>
          <View style={nd.panelHalf}>
            <View style={nd.panelHeader}>
              <Ionicons name="water-outline" size={18} color="rgba(255,255,255,0.62)" />
              <Text style={nd.panelTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>Air & Comfort</Text>
            </View>
            <Pressable style={nd.panelHeroBlock} onPress={() => onOpenLearnTopic('dewpoint')}>
              <Text style={nd.panelHeroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.48}>
                {dpBand ?? 'â€”'}
              </Text>
              <Text style={nd.panelHeroLabel}>Dew Band</Text>
            </Pressable>
            <View style={nd.panelRule} />
            <View style={nd.metricGrid2}>
              <Pressable style={[nd.metricCard, nd.metricCellDivider]} onPress={() => onOpenLearnTopic('dewpoint')}>
                <Text style={nd.metricLabel}>Dew Pt</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'}</Text>
              </Pressable>
              <Pressable style={nd.metricCard} onPress={() => onOpenLearnTopic('humidity')}>
                <Text style={nd.metricLabel}>RH</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}</Text>
              </Pressable>
            </View>
            <View style={nd.metricGrid2}>
              <Pressable style={[nd.metricCard, nd.metricCellDivider]} onPress={() => onOpenLearnTopic(feelsDriverTopicId)}>
                <Text style={nd.metricLabel}>{feelsDriverLabel}</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.66}>{feelsDriverValue}</Text>
              </Pressable>
              <Pressable style={nd.metricCard} onPress={() => onOpenLearnTopic('spread_temp_dew')}>
                <Text style={nd.metricLabel}>Spread</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{spreadF != null ? `${Math.round(spreadF)}°F` : '—'}</Text>
              </Pressable>
            </View>
            <Pressable style={nd.metricHiddenCard} onPress={() => onOpenLearnTopic('dewpoint')}>
              <Text style={nd.metricLabel}>Dew Band</Text>
              <Text style={[nd.metricWideValue, nd.metricStackedValue]}>{dpBand ?? '—'}</Text>
            </Pressable>
          </View>

          <View style={nd.panelHalf}>
            <View style={nd.panelHeader}>
              <Ionicons name="reorder-three-outline" size={20} color="rgba(255,255,255,0.62)" />
              <Text style={nd.panelTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>Wind</Text>
            </View>
            <Pressable style={[nd.panelHeroBlock, nd.panelHeroCentered]} onPress={() => onOpenLearnTopic('wind-direction')}>
              <Text style={nd.windHeroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.66}>
                {dirHeading}
              </Text>
              <Text style={nd.panelHeroLabel}>{dirDegrees}</Text>
            </Pressable>
            <View style={nd.panelRule} />
            <View style={nd.metricGrid2}>
              <Pressable style={[nd.metricCard, nd.metricCellDivider]} onPress={() => onOpenLearnTopic('wind')}>
                <Text style={nd.metricLabel}>Speed</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.56}>{windMph != null ? `${Math.round(windMph)} mph` : '—'}</Text>
              </Pressable>
              <Pressable style={nd.metricCard} onPress={() => onOpenLearnTopic('gusts')}>
                <Text style={nd.metricLabel}>Gusts</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.56}>{gustMph != null ? `${Math.round(gustMph)} mph` : '—'}</Text>
              </Pressable>
            </View>
            <View style={nd.metricGrid2Tall}>
              <Pressable style={[nd.metricCard, nd.metricCellDivider]} onPress={() => onOpenLearnTopic('gust_factor')}>
                <Text style={nd.metricLabel}>Gust Fx</Text>
                <Text style={nd.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{gf != null ? gf.toFixed(2) : '—'}</Text>
              </Pressable>
              <Pressable style={[nd.metricCard, nd.metricTallCard]} onPress={() => onOpenLearnTopic('wind')}>
                <Text style={nd.metricLabel}>{windState}</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>{windState}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={nd.panelRow}>
          <View style={nd.panelHalf}>
            <View style={nd.panelHeader}>
              <Ionicons name="cloud-outline" size={19} color="rgba(255,255,255,0.62)" />
              <Text style={nd.panelTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.76}>Sky, Sun & Air</Text>
            </View>
            <Pressable style={nd.metricWideCard} onPress={() => onOpenLearnTopic('clouds')}>
              <Text style={nd.metricLabel}>Cloud Cover</Text>
              <View style={nd.cloudRow}>
                <Text style={nd.metricWideValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{cloudCoverPct != null ? `${Math.round(cloudCoverPct)}%` : '—'}</Text>
                <View style={nd.cloudTrack}>
                  <View style={[nd.cloudFill, { width: `${cloudBarPct}%` }]} />
                </View>
              </View>
            </Pressable>
            <View style={nd.metricStack}>
              <Pressable style={[nd.metricCard, nd.metricCardFull]} onPress={() => onOpenLearnTopic('uv')}>
                <Text style={nd.metricLabel}>UV Index</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{uvIndex != null ? fmt(uvIndex, 1) : '—'}</Text>
              </Pressable>
              <Pressable style={[nd.metricCard, nd.metricCardFull]} onPress={() => onOpenLearnTopic('air-quality')}>
                <Text style={nd.metricLabel}>Air</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.66}>{airQualityIndex != null ? `${Math.round(airQualityIndex)} AQI` : '—'}</Text>
                {airQualityLabel ? <Text style={nd.metricHint}>{airQualityLabel}</Text> : null}
              </Pressable>
              <Pressable style={[nd.metricCard, nd.metricCardFull]} onPress={() => onOpenLearnTopic('radiation-regime')}>
                <Text style={nd.metricLabel}>Radiation Regime</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>{radiationRegime}</Text>
              </Pressable>
            </View>
          </View>

          <View style={nd.panelHalf}>
            <View style={nd.panelHeader}>
              <Ionicons name="speedometer-outline" size={18} color="rgba(255,255,255,0.62)" />
              <Text style={nd.panelTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>Pressure, Visibility & Precip</Text>
            </View>
            <Pressable style={nd.pressureHeroCard} onPress={() => onOpenLearnTopic('pressure')}>
              <Text style={nd.metricLabel}>Pressure</Text>
              <Text style={nd.pressureHeroValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>{pressurePrimary}</Text>
              <Text style={nd.pressureHeroSub}>{pressureSecondary}</Text>
              <Text style={nd.pressureHeroHint}>{pressureTrendText}</Text>
            </Pressable>
            <View style={nd.metricStack}>
              <Pressable style={[nd.metricCard, nd.metricCardFull]} onPress={() => onOpenLearnTopic('visibility')}>
                <Text style={nd.metricLabel}>Visibility</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>{formatSurfaceVisibility(visibilityMi)}</Text>
              </Pressable>
              <Pressable style={[nd.metricCard, nd.metricCardFull]} onPress={() => onOpenLearnTopic('pop')}>
                <Text style={nd.metricLabel}>POP</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}</Text>
              </Pressable>
              <Pressable style={[nd.metricCard, nd.metricCardFull]} onPress={() => onOpenLearnTopic('pressure')}>
                <Text style={nd.metricLabel}>Pressure Regime</Text>
                <Text style={nd.metricValueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.62}>{pressureRegime}</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={nd.panelFull}>
          <Text style={nd.panelTitle}>Sun & Moon</Text>
          <DayMoonArc sunrise={sunrise} sunset={sunset} moonrise={moonrise} moonset={moonset} showMoon embedded />

          <View style={nd.moonSummaryRow}>
            <Pressable style={nd.moonPhaseCard} onPress={() => onOpenLearnTopic(astroLearnTopicId('moonrise'))}>
              <PremiumMoonIcon size={46} illuminationPct={moonIlluminationPct} phaseDegrees={moonPhaseDegrees} />
              <View style={nd.moonPhaseCopy}>
                <Text style={nd.timelineNodeLabel}>Moon Phase</Text>
                <Text style={[nd.moonPhaseText, nd.moonPhaseTextWide]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} allowFontScaling={false}>{moonPhaseLabel ?? 'Moon phase'}</Text>
                <Text style={[nd.moonFullText, nd.moonPhaseTextWide]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76} allowFontScaling={false}>{moonFullLabel}</Text>
              </View>
            </Pressable>
          </View>

          <View style={nd.metricGrid4}>
            {summaryCards.map((item) => (
              <Pressable key={item.label} style={nd.summaryCard} onPress={() => onOpenLearnTopic(item.topicId)}>
                <Text style={nd.metricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false}>{item.label}</Text>
                <Text style={nd.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} allowFontScaling={false}>{item.value}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const nd = StyleSheet.create({
  wrap: { marginTop: 8, gap: 12 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  kicker: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '900',
  },
  updated: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  heroShell: {
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 18,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 0,
    gap: 16,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  heroTemp: {
    fontSize: 64,
    lineHeight: 66,
    fontWeight: '900',
    color: 'white',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 12,
  },
  heroCondition: {
    fontSize: 22,
    fontWeight: '900',
    color: 'white',
  },
  heroSummary: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  heroFeelsBlock: {
    alignItems: 'flex-end',
    paddingTop: 6,
    minWidth: 68,
  },
  heroFeelsLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.54)',
  },
  heroFeelsValue: {
    marginTop: 6,
    fontSize: 32,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.92)',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: GLASS_INSET_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.88)',
  },
  panelGrid: { gap: 10 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.64)', fontWeight: '900' },
  sectionBody: { gap: 10 },
  panelRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  panelHalf: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 0,
    gap: 14,
    overflow: 'hidden',
  },
  panelFull: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 0,
    gap: 10,
  },
  panelTitle: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.68)',
    fontWeight: '900',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 20,
  },
  panelHeroBlock: {
    gap: 4,
  },
  panelHeroCentered: {
    alignItems: 'center',
  },
  panelHeroValue: {
    width: '100%',
    color: 'white',
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '900',
    letterSpacing: 0,
    includeFontPadding: false,
  },
  windHeroValue: {
    color: 'white',
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '900',
    letterSpacing: 0,
    includeFontPadding: false,
    textAlign: 'center',
    width: '100%',
  },
  panelHeroLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  panelRule: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  metricGrid2: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingTop: 14,
  },
  metricGrid2Tall: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    paddingTop: 14,
  },
  metricGrid3: {
    flexDirection: 'row',
    gap: 8,
  },
  metricGrid3Wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricStack: {
    gap: 0,
  },
  metricGrid4: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 58,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 8,
  },
  metricCellDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.12)',
  },
  metricTallCard: {
    minHeight: 62,
  },
  metricDialCard: {
    minHeight: 62,
    alignItems: 'flex-start',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.12)',
  },
  metricWideCard: {
    minHeight: 72,
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center',
    gap: 8,
  },
  metricHiddenCard: {
    display: 'none',
  },
  metricCardHalf: {
    flexBasis: '48%',
    flexGrow: 1,
  },
  metricCardFull: {
    width: '100%',
    flexBasis: '100%',
    minHeight: 68,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
  },
  metricWideHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  metricLabel: {
    fontSize: 10,
    letterSpacing: 0.55,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '900',
    lineHeight: 12,
    includeFontPadding: false,
  },
  metricValue: {
    width: '100%',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    color: 'white',
    includeFontPadding: false,
  },
  metricValueSmall: {
    width: '100%',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
    color: 'white',
  },
  metricWideValue: {
    minWidth: 42,
    fontSize: 20,
    fontWeight: '900',
    color: 'white',
  },
  metricStackedValue: {
    marginTop: 2,
  },
  metricHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.58)',
  },
  directionMain: {
    width: '100%',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '900',
    color: 'white',
    textAlign: 'left',
    includeFontPadding: false,
  },
  directionSub: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.58)',
  },
  cloudRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cloudTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  cloudFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(120, 180, 255, 0.72)',
  },
  pressureHeroCard: {
    minHeight: 136,
    paddingVertical: 0,
    paddingHorizontal: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    justifyContent: 'center',
    gap: 10,
  },
  pressureHeroValue: {
    width: '100%',
    marginTop: 4,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: 'white',
  },
  pressureHeroSub: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.58)',
  },
  pressureHeroHint: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.52)',
  },
  timelineLabel: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.46)',
    fontWeight: '900',
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  timelineNode: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 0,
    gap: 6,
  },
  timelineNodeLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    includeFontPadding: false,
  },
  timelineNodeValue: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: 'white',
    includeFontPadding: false,
  },
  moonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  moonSummaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  moonNode: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 0,
    gap: 6,
  },
  moonCenter: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moonPhaseCard: {
    flex: 1,
    minHeight: 84,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moonPhaseCopy: {
    flex: 1,
    minWidth: 0,
  },
  moonPhaseText: {
    marginTop: 5,
    maxWidth: 92,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.66)',
    textAlign: 'center',
  },
  moonPhaseTextWide: {
    maxWidth: '100%',
    textAlign: 'left',
  },
  moonFullText: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  moonGlyph: {
    display: 'none',
  },
  summaryCard: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 80,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
    justifyContent: 'space-between',
  },
  summaryValue: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    color: 'white',
    includeFontPadding: false,
  },
});

function LandWeatherWithCoords({
  coords,
  activeLabel,
  wxLab,
  setWxLab,
  toggleWxLab,
  onPressAlert,
  setLearnOpen,
  setLearnTopicId,
  setExplainPayload,
  setExplainOpen,
  onWeatherCode,
  enabled = true,
}: {
  coords: { lat: number; lon: number };
  activeLabel: string;
  wxLab: boolean;
  setWxLab?: ((value: boolean) => void) | null;
  toggleWxLab?: (() => void) | null;
  onPressAlert: (primary: any, alerts: any[]) => void;
  setLearnOpen: (v: boolean) => void;
  setLearnTopicId: (v: string | undefined) => void;
  setExplainPayload: (p: ExplainPayload | null) => void;
  setExplainOpen: (v: boolean) => void;
  onWeatherCode: (code: number | null, condition?: string | null) => void;
  enabled?: boolean;
}) {
  const units: UnitSystem = 'us';
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && width >= 640;
  const landscapeChartHeight = Math.max(250, Math.min(height - 96, 360));
  const [landscapeGraphMode, setLandscapeGraphMode] = useState<'daily' | 'hourly'>('daily');
  const { forecastModel, tempUnit } = useSettings();
  const { primary, alerts } = useNwsAlerts({
    lat: coords.lat,
    lon: coords.lon,
    enabled,
    units: tempUnit === 'C' ? 'metric' : 'imperial',
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
    enabled,
  });

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
    model: forecastModel,
    enabled,
  });

  const {
    data: astroData,
    refreshing: astroRefreshing,
    refresh: astroRefresh,
  } = useLocationAstroForecast({
    lat: coords.lat,
    lon: coords.lon,
    placeName: activeLabel ?? undefined,
    enabled,
  });

  const {
    data: fireContextData,
    refreshing: fireContextRefreshing,
    refresh: fireContextRefresh,
  } = useFireContext({
    lat: coords.lat,
    lon: coords.lon,
    enabled,
  });

  const loading = currentLoading || (wxLab && forecastLoading);
  const refreshing = currentRefreshing || forecastRefreshing || astroRefreshing || fireContextRefreshing;

  const onRefresh = () => {
    if (!enabled) return;
    currentRefresh?.();
    forecastRefresh?.();
    astroRefresh?.();
    fireContextRefresh?.();
  };

  const wx: any = currentData ?? {};

  const currentTempF = safeNum(wx.temperatureF ?? wx.temp_f ?? wx.temperature ?? wx.temp);
  const currentFeelsLikeF = safeNum(wx.apparentTemperatureF ?? wx.feels_like_f ?? wx.feels_like ?? wx.feels);

  const currentDewpointF = safeNum(wx.dewpointF ?? wx.dewpoint_f ?? wx.dew_point ?? wx.dewPoint);
  const currentHumidityPct = safeNum(wx.humidity ?? wx.relativeHumidity ?? wx.relative_humidity ?? wx.rh ?? wx.humidityPct);

  const currentWindMph = safeNum(
    wx.windSpeedMph ??
      wx.wind_speed_mph ??
      wx.wind_speed_10m ??
      wx.windspeed_10m ??
      wx.windSpeed ??
      wx.wind
  );
  const currentGustMph = safeNum(
    wx.windGustMph ??
      wx.wind_gust_mph ??
      wx.wind_gusts_10m ??
      wx.windGust ??
      wx.windGustsMph ??
      wx.gust ??
      wx.windGust
  );
  const currentWindDirDeg = safeNum(
    wx.windDirection ??
      wx.wind_dir ??
      wx.wind_direction ??
      wx.wind_direction_10m ??
      wx.winddirection_10m ??
      wx.windDir
  );

  const currentCloudCoverPct = safeNum(wx.cloudCoverPct ?? wx.cloud_cover ?? wx.cloudCover ?? wx.cloudCoverPct);

  const daily = (forecastData?.daily ?? []).slice(0, 15);
  const forecastTimeZone =
    typeof forecastData?.timezone === 'string' && forecastData.timezone.trim() ? forecastData.timezone.trim() : null;
  const todayDaily = daily[0] ?? null;
  const todaySunrise = typeof todayDaily?.sunrise === 'string' ? todayDaily.sunrise : null;
  const todaySunset = typeof todayDaily?.sunset === 'string' ? todayDaily.sunset : null;
  const todayDayLengthSec = safeNum(todayDaily?.daylightDurationSec) ?? null;
  const todayMoonrise = astroData?.moonrise ?? null;
  const todayMoonset = astroData?.moonset ?? null;
  const todayMoonDay =
    astroData?.moonDays?.find((day: any) => day?.date === todayDateKeyLocal()) ?? astroData?.moonDays?.[0] ?? null;
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

  const nearestHourly = useMemo(() => findClosestHour(hourly, Date.now(), forecastTimeZone), [hourly, forecastTimeZone]);

  const tempF =
    currentTempF ??
    safeNum(nearestHourly?.tempF ?? nearestHourly?.temperatureF ?? nearestHourly?.temperature_2m ?? nearestHourly?.temperature ?? nearestHourly?.temp) ??
    null;
  const feelsLikeF =
    currentFeelsLikeF ??
    safeNum(nearestHourly?.apparentTempF ?? nearestHourly?.apparentTemperatureF ?? nearestHourly?.apparent_temperature ?? nearestHourly?.feelsLikeF) ??
    tempF;
  const dewpointF =
    currentDewpointF ??
    safeNum(nearestHourly?.dewPointF ?? nearestHourly?.dewpointF ?? nearestHourly?.dew_point_2m ?? nearestHourly?.dew_point) ??
    safeNum(todayDaily?.dewPointMaxF) ??
    null;
  const humidityPct =
    currentHumidityPct ??
    safeNum(nearestHourly?.humidityPct ?? nearestHourly?.relative_humidity_2m ?? nearestHourly?.relativeHumidity ?? nearestHourly?.rh) ??
    safeNum(todayDaily?.humidityMaxPct) ??
    null;
  const windMph =
    currentWindMph ??
    safeNum(nearestHourly?.windMph ?? nearestHourly?.windSpeedMph ?? nearestHourly?.wind_speed_10m ?? nearestHourly?.windspeed_10m ?? nearestHourly?.wind) ??
    null;
  const gustMph =
    currentGustMph ??
    safeNum(nearestHourly?.windGustMph ?? nearestHourly?.gustMph ?? nearestHourly?.wind_gusts_10m ?? nearestHourly?.gust ?? nearestHourly?.windGust) ??
    safeNum(todayDaily?.windGustMaxMph) ??
    null;
  const windDirDeg =
    currentWindDirDeg ??
    safeNum(nearestHourly?.windDirDeg ?? nearestHourly?.wind_direction_10m ?? nearestHourly?.winddirection_10m ?? nearestHourly?.windDirection) ??
    safeNum(todayDaily?.windDirDominantDeg) ??
    null;
  const cloudCoverPct =
    currentCloudCoverPct ??
    safeNum(nearestHourly?.cloudCoverPct ?? nearestHourly?.cloud_cover ?? nearestHourly?.cloudcover ?? nearestHourly?.cloudCover) ??
    safeNum(todayDaily?.cloudCoverAvgPct) ??
    null;

  const pressureTrend = useMemo(() => pressureTrendFromHourly(hourly, forecastTimeZone), [hourly, forecastTimeZone]);

  const visibilityMi = (() => {
    const vMi = safeNum(wx.visibilityMi ?? wx.visibility_mi ?? wx.visibility);
    if (vMi != null) return vMi;

    const meters = safeNum(nearestHourly?.visibility ?? nearestHourly?.visibility_m);
    if (meters == null) return null;

    return meters / 1609.344;
  })();

  const uvIndexFromHourly = (() => {
    return safeNum(nearestHourly?.uvIndex ?? nearestHourly?.uv_index ?? nearestHourly?.uv);
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
  const airQualityIndex = safeNum(astroData?.aerosols?.airQualityIndex);

  const pressureHpa =
    safeNum(wx.pressureHpa ?? wx.pressure_hpa ?? wx.pressure) ??
    safeNum(wx.pressureMb) ??
    safeNum(nearestHourly?.pressureHpa ?? nearestHourly?.pressure_msl ?? nearestHourly?.pressureMslHpa ?? nearestHourly?.pressure_hpa ?? nearestHourly?.pressure) ??
    null;

  const pressureInHg =
    safeNum(wx.pressureInHg ?? wx.pressure_inhg) ??
    (pressureHpa != null ? hpaToInHg(pressureHpa) : null);

  const popFromHourly = (() => {
    return safeNum(nearestHourly?.precipitation_probability ?? nearestHourly?.precipProbPct ?? nearestHourly?.precipChancePct ?? nearestHourly?.pop);
  })();

  const popTodayPeak = safeNum(forecastData?.daily?.[0]?.precipProbMaxPct);
  const popFromCurrent = safeNum(wx.precipChancePct ?? wx.precip_probability ?? wx.precipProb ?? wx.pop);
  const precipChancePct = popTodayPeak ?? popFromCurrent ?? popFromHourly;

  const weatherCodeFromCurrent =
    safeNum(wx.weatherCode ?? wx.weathercode ?? wx.weather_code ?? wx.code ?? wx.iconCode ?? wx.icon_code) ?? null;

  const weatherCodeFromHourly = (() => {
    return (
      safeNum(nearestHourly?.weatherCode ?? nearestHourly?.weather_code ?? nearestHourly?.weathercode ?? nearestHourly?.condition_code ?? nearestHourly?.code) ?? null
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
    onWeatherCode(weatherCode, typeof condition === 'string' ? condition : null);
  }, [weatherCode, condition, onWeatherCode]);

  const observationTime: string | null = wx.observedAt ?? wx.timestamp ?? wx.datetime ?? null;

  const dpBand = dewpointF == null ? null : dewPointBandF(dewpointF);
  const hi = tempF != null && humidityPct != null ? heatIndexF(tempF, humidityPct) : null;
  const wc = tempF != null && windMph != null ? windChillF(tempF, windMph) : null;
  const gf = gustFactor(windMph, gustMph);
  const spreadF = tempF != null && dewpointF != null ? tempF - dewpointF : null;

  const feelsDriver = useMemo(() => {
    if (hi != null) return { label: 'Heat Index', value: `${Math.round(hi)}°F`, topicId: 'heat-index', conf: 'high' as const };
    if (wc != null) return { label: 'Wind Chill', value: `${Math.round(wc)}°F`, topicId: 'wind-chill', conf: 'high' as const };
    if (feelsLikeF != null) return { label: 'Apparent', value: `${Math.round(feelsLikeF)}°F`, topicId: 'apparent-temp', conf: 'medium' as const };
    return { label: 'Apparent', value: '—', topicId: 'apparent-temp', conf: undefined };
  }, [hi, wc, feelsLikeF]);

  const updatedTimeLabel = observationTime ? formatUpdatedTime(observationTime, forecastTimeZone) : null;
  const updatedText = updatedTimeLabel ? `Updated ${updatedTimeLabel}` : null;

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

  const rawWeatherError = currentError || forecastError;
  const hasUsableWeatherData = Boolean(currentData || forecastData || tempF != null || daily.length > 0 || hourly.length > 0);
  const displayWeatherError =
    rawWeatherError && (!hasUsableWeatherData || !isTemporaryWeatherError(rawWeatherError))
      ? formatWeatherError(rawWeatherError)
      : null;

  useEffect(() => {
    if (!isLandscape || !wxLab) return;
    if (landscapeGraphMode === 'hourly' && !hourly.length && daily.length) setLandscapeGraphMode('daily');
    if (landscapeGraphMode === 'daily' && !daily.length && hourly.length) setLandscapeGraphMode('hourly');
  }, [daily.length, hourly.length, isLandscape, landscapeGraphMode, wxLab]);

  if (!wxLab) {
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
            <Text style={styles.smallText}>Loading weatherâ€¦</Text>
          </View>
        ) : null}

        {displayWeatherError ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Weather temporarily unavailable</Text>
            <Text style={styles.errorText}>{displayWeatherError}</Text>
          </Card>
        ) : null}

        <SimpleDailyOverview
          tempF={tempF}
          condition={condition}
          heroSummary={heroSummary}
          feelsLikeF={feelsLikeF}
          dewpointF={dewpointF}
          precipChancePct={precipChancePct}
          windMph={windMph}
          gustMph={gustMph}
          humidityPct={humidityPct}
          uvIndex={uvIndex}
          airQualityLabel={airQualityLabel}
          airQualityIndex={airQualityIndex}
          daily={daily}
          hourly={hourly}
          sunrise={todaySunrise}
          sunset={todaySunset}
          moonrise={todayMoonrise}
          moonset={todayMoonset}
          moonDays={astroData?.moonDays}
          dayLengthSec={todayDayLengthSec}
        />

        {updatedText ? <Text style={styles.updatedText}>{updatedText}</Text> : null}
        <Text style={styles.updatedText}>Model: {forecastModelLabel(forecastModel)}</Text>

        {daily.length > 0 ? (
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

      {displayWeatherError ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Weather temporarily unavailable</Text>
          <Text style={styles.errorText}>{displayWeatherError}</Text>
        </Card>
      ) : null}

      {!wxLab ? (
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

          {updatedText ? <Text style={styles.updatedText}>{updatedText}</Text> : null}
        </Card>
      ) : (
        <NerdyDeepDive
          condition={condition}
          heroSummary={heroSummary}
          updatedText={updatedText}
          dewpointF={dewpointF}
          humidityPct={humidityPct}
          dpBand={dpBand}
          spreadF={spreadF}
          tempF={tempF}
          feelsLikeF={feelsLikeF}
          windMph={windMph}
          gustMph={gustMph}
          windDirDeg={windDirDeg}
          gf={gf}
          cloudCoverPct={cloudCoverPct}
          uvIndex={uvIndex}
          airQualityLabel={airQualityLabel}
          airQualityIndex={airQualityIndex}
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
          moonIlluminationPct={safeNum(todayMoonDay?.moonIlluminationPct)}
          moonPhaseDegrees={safeNum(todayMoonDay?.moonPhaseDegrees)}
          moonPhaseLabel={typeof todayMoonDay?.moonPhaseLabel === 'string' ? todayMoonDay.moonPhaseLabel : null}
          dayLengthSec={todayDayLengthSec}
          feelsDriverLabel={feelsDriver.label}
          feelsDriverValue={feelsDriver.value}
          feelsDriverTopicId={feelsDriver.topicId}
          onOpenLearnTopic={openLearnTopic}
        />
      )}

      {wxLab && isLandscape && (daily.length > 0 || hourly.length > 0) ? (
        <>
          <Card style={styles.landscapeGraphPlaceholder}>
            <Text style={styles.landscapeGraphPlaceholderText}>Land wxLab graph is open full screen</Text>
          </Card>
          <Modal visible transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right']}>
            <SafeAreaView style={styles.landscapeGraphOverlay}>
              <View style={styles.landscapeGraphShell}>
                <View style={styles.landscapeGraphHeader}>
                  <View>
                    <Text style={styles.cardTitle}>
                      {landscapeGraphMode === 'daily' ? 'Daily Forecast' : 'Next 72 Hours'}
                    </Text>
                    <Text style={styles.landscapeGraphSubtitle}>Horizontal graph view</Text>
                  </View>
                  <View style={styles.landscapeGraphToggle}>
                    <Pressable
                      onPress={() => setLandscapeGraphMode('daily')}
                      disabled={!daily.length}
                      style={[
                        styles.landscapeGraphToggleButton,
                        landscapeGraphMode === 'daily' ? styles.landscapeGraphToggleButtonActive : null,
                        !daily.length ? styles.landscapeGraphToggleButtonDisabled : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.landscapeGraphToggleText,
                          landscapeGraphMode === 'daily' ? styles.landscapeGraphToggleTextActive : null,
                        ]}
                      >
                        Daily
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setLandscapeGraphMode('hourly')}
                      disabled={!hourly.length}
                      style={[
                        styles.landscapeGraphToggleButton,
                        landscapeGraphMode === 'hourly' ? styles.landscapeGraphToggleButtonActive : null,
                        !hourly.length ? styles.landscapeGraphToggleButtonDisabled : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.landscapeGraphToggleText,
                          landscapeGraphMode === 'hourly' ? styles.landscapeGraphToggleTextActive : null,
                        ]}
                      >
                        Hourly
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.landscapeGraphBody}>
                  {landscapeGraphMode === 'daily' && daily.length > 0 ? (
                    <DailyRangeChart daily={daily} landscape chartHeight={landscapeChartHeight} />
                  ) : null}
                  {landscapeGraphMode === 'hourly' && hourly.length > 0 ? (
                    <HourlyCharts72h
                      hours={hourly}
                      maxHours={72}
                      units={units}
                      initialPanel="range"
                      timeZone={forecastTimeZone ?? undefined}
                      landscapePresentation="content"
                      chartHeight={landscapeChartHeight}
                    />
                  ) : null}
                </View>

                <Text style={styles.landscapeGraphSource}>
                  {landscapeGraphMode === 'daily'
                    ? `Model: ${forecastModelLabel(forecastModel)}`
                    : 'Source: Open-Meteo (hourly)'}
                </Text>
              </View>
            </SafeAreaView>
          </Modal>
        </>
      ) : null}

      {daily.length > 0 && (!wxLab || !isLandscape) ? (
        <Card style={styles.forecastCard}>
          <Text style={styles.cardTitle}>{wxLab ? 'Daily Forecast' : '15-Day Forecast'}</Text>

          {wxLab ? (
            <DailyRangeChart daily={daily} />
          ) : (
            <DailyForecastList
              daily={daily}
              hourly={hourly}
              moonrise={todayMoonrise}
              moonset={todayMoonset}
              moonDays={astroData?.moonDays}
              maxDays={15}
            />
          )}

          <Text style={styles.updatedText}>Model: {forecastModelLabel(forecastModel)}</Text>
          <Text style={styles.updatedText}>Source: Open-Meteo</Text>
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

      {wxLab && hourly.length && !isLandscape ? (
        <View style={styles.hourlyCard}>
          <View style={styles.hourlyHeaderRow}>
            <Text style={styles.cardTitle}>Next 72 hours</Text>
          </View>

          <HourlyCharts72h
            hours={hourly}
            maxHours={72}
            units={units}
            initialPanel="range"
            timeZone={forecastTimeZone ?? undefined}
          />

          <Text style={styles.updatedText}>Source: Open-Meteo (hourly)</Text>
        </View>
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
  const { appColorMode, chrome } = useAppChrome();
  const isFocused = useIsFocused();
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
  const [bgConditionText, setBgConditionText] = useState<string | null>(null);

  const router = useRouter();
  const insets = useSafeAreaInsets();

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isFocused) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 6000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 6000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim, isFocused]);

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
      summary: officialText || 'No detailed alert text available.',
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
    <View style={[styles.root, { backgroundColor: chrome.background }]}>
      <View
        pointerEvents="none"
        style={[styles.videoLayer, appColorMode === 'classic' ? null : styles.videoLayerMuted]}
      >
        <WeatherVideoBackground
          weatherCode={bgWeatherCode ?? undefined}
          conditionText={bgConditionText}
          isEvening={isNight || isSunset}
        />
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
            <View style={[styles.headerHeroSurface, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
              <View style={styles.headerCompactTopRow}>
                <View style={styles.headerCompactLeft}>
                  <Pressable
                    onPress={() => router.push('/profile')}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Open settings"
                    style={styles.headerLogoButton}
                  >
                    <Image
                      source={require('../../assets/brand/omniwx-mark-word.png')}
                      style={styles.headerCompactLogo}
                      resizeMode="contain"
                    />
                  </Pressable>

                  {/* Location + Save inline */}
                  <Pressable onPress={() => setPickerOpen(true)} style={styles.headerCompactLocation}>
                    <View style={styles.headerLocationInner}>
                      <Text style={styles.locationPrimary} numberOfLines={1} ellipsizeMode="tail">
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

                <View style={[styles.headerModeToggle, { backgroundColor: chrome.pill, borderColor: chrome.border }]}>
                  <Pressable
                    onPress={() => setWxLab?.(false)}
                    style={[
                      styles.headerModeBtn,
                      !wxLab ? styles.dailyModeBtnActive : null,
                      !wxLab ? { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong } : null,
                    ]}
                  >
                    <Text style={[styles.headerModeText, !wxLab ? styles.dailyModeTextActive : null]}>Simple</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (toggleWxLab && !wxLab) return toggleWxLab();
                      return setWxLab?.(true);
                    }}
                    style={[
                      styles.headerModeBtn,
                      wxLab ? styles.dailyModeBtnActive : null,
                      wxLab ? { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong } : null,
                    ]}
                  >
                    <Text style={[styles.headerModeText, wxLab ? styles.dailyModeTextActive : null]}>wxLab</Text>
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
                setWxLab={setWxLab}
                toggleWxLab={toggleWxLab}
                onPressAlert={onPressAlert}
                setLearnOpen={setLearnOpen}
                setLearnTopicId={setLearnTopicId}
                setExplainPayload={setExplainPayload}
                setExplainOpen={setExplainOpen}
                onWeatherCode={(code, conditionText) => {
                  setBgWeatherCode(code);
                  setBgConditionText(conditionText ?? null);
                }}
                enabled={isFocused}
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
  videoLayerMuted: {
    opacity: 0.18,
  },

  safe: { flex: 1, backgroundColor: 'transparent', zIndex: 10 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing['2xl'] },

  locationPrimary: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '900', color: 'white' },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  headerHeroWrap: {
    marginBottom: 8,
    position: 'relative',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },

  headerHeroSurface: {
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRadius: 18,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },

  headerCompactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  headerCompactLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  headerLogoButton: {
    width: 54,
    height: 48,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerCompactLogo: {
    width: 54,
    height: 48,
    opacity: 0.96,
  },

  headerCompactLocation: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  headerLocationInner: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  headerModeToggle: {
    width: 108,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    padding: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: GLASS_PANEL_BG,
  },

  headerModeBtn: {
    flex: 1,
    minHeight: 30,
    paddingHorizontal: 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerModeText: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 10,
    fontWeight: '900',
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
    backgroundColor: GLASS_PANEL_BG,
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
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: GLASS_PANEL_BG,
  },

  quickNavText: { color: 'white', fontWeight: '900', fontSize: 12 },

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
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
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

  dailySimpleWrap: {
    gap: 14,
    marginBottom: theme.spacing.lg,
  },
  dailyCurrentCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: GLASS_PANEL_BG_STRONG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  dailyRangeCard: {
    gap: 12,
  },
  dailyRangeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dailyCurrentTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
  },
  dailyPanelEyebrow: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.66)',
  },
  dailyCurrentEmoji: {
    fontSize: 54,
    lineHeight: 58,
    marginTop: 6,
  },
  dailyCurrentIconBadge: {
    marginTop: 8,
  },
  dailyCurrentTemp: {
    fontSize: 76,
    lineHeight: 78,
    fontWeight: '900',
    color: 'white',
  },
  dailyCurrentText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 10,
  },
  dailyCurrentCondition: {
    fontSize: 26,
    fontWeight: '900',
    color: 'white',
  },
  dailyCurrentSummaryBox: {
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: GLASS_INSET_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
  },
  dailyCurrentSummary: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.82)',
  },
  dailyCurrentFeels: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  dailyRangeStats: {
    flexDirection: 'row',
    gap: 10,
  },
  dailyRangeStat: {
    flex: 1,
    minHeight: 68,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
    justifyContent: 'space-between',
  },
  dailyRangeStatLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.58)',
  },
  dailyRangeStatValue: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900',
    color: 'white',
  },
  dailyTempRangeBlock: {
    gap: 8,
  },
  dailyTempRangeLabels: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dailyTempRangeEndpoint: {
    width: 54,
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.76)',
  },
  dailyTempRangeNow: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.48)',
  },
  dailyTempRangeLegend: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  dailyTempRangeLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dailyTempRangeActualSwatch: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: 'rgba(64, 156, 255, 0.9)',
  },
  dailyTempRangeFeelsSwatch: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#fbbf24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.78)',
  },
  dailyTempRangeTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'visible',
  },
  dailyTempRangeFill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  dailyTempRangeMarker: {
    position: 'absolute',
    top: -5,
    width: 22,
    height: 22,
    marginLeft: -11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyTempRangeMarkerDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'white',
    borderWidth: 3,
    borderColor: 'rgba(64, 156, 255, 0.9)',
  },
  dailyTempRangeFeelsMarker: {
    position: 'absolute',
    top: -2,
    width: 16,
    height: 16,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyTempRangeFeelsDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#fbbf24',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.88)',
  },
  dayArcCard: {
    borderRadius: 18,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: GLASS_INSET_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
    overflow: 'hidden',
  },
  dayArcEmbedded: {
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderColor: GLASS_BORDER_SOFT,
    paddingBottom: 4,
  },
  dayArcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dayArcTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.62)',
  },
  dayArcLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dayArcLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  dayArcLegendText: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.58)',
  },
  dayArcTimes: {
    marginTop: -8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayArcTimeBlock: {
    flexGrow: 1,
    flexBasis: '22%',
    minWidth: 72,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
  },
  dayArcTimeLabel: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.46)',
  },
  dayArcTimeValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255, 216, 132, 0.96)',
  },
  dayArcMoonText: {
    color: 'rgba(132, 209, 255, 0.96)',
  },
  dayArcPending: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
  },
  dailyCurrentMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: GLASS_INSET_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
    rowGap: 10,
  },
  dailyCurrentMetricCell: {
    width: '31%',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    minHeight: 76,
    paddingHorizontal: 4,
  },
  dailyCurrentMetricValue: {
    minHeight: 21,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: 'white',
    textAlign: 'center',
  },
  dailyCurrentMetricLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  dailyCurrentMetricSub: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
  },
  dailyCurrentMetricSubEmpty: {
    opacity: 0,
  },
  dailyCurrentMetricDivider: {
    display: 'none',
  },
  dailyFeatureCard: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 28,
    backgroundColor: GLASS_PANEL_BG_STRONG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  dailyFeatureTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  dailyTwinColumns: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },
  dailyTwinColumn: {
    flex: 1,
    minWidth: 0,
  },
  dailyTwinDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dailyFeatureMiniTitle: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.66)',
  },
  dailyFeatureTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },
  dailyFeatureRange: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
  },
  dailyFeatureSummaryRow: {
    marginTop: 16,
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dailyFeatureEmoji: {
    fontSize: 46,
  },
  dailyFeatureIconBadge: {
    marginTop: 10,
  },
  dailyFeatureSummaryText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  dailyFeatureCondition: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
    color: 'white',
  },
  dailyFeatureNarrative: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.76)',
  },
  dailyFeatureMoonMeta: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.66)',
  },
  dailyModeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: GLASS_PANEL_BG,
  },
  dailyModeBtn: {
    minHeight: 30,
    minWidth: 70,
    paddingHorizontal: 12,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyModeBtnActive: {
    borderWidth: 1,
    borderColor: 'rgba(145,205,255,0.35)',
  },
  dailyModeText: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 12,
    fontWeight: '900',
  },
  dailyModeTextActive: {
    color: 'white',
  },
  dailyAstroHeroRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.14)',
  },
  dailyAstroHeroText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.76)',
  },
  dailyAstroHeroDot: {
    fontSize: 14,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.34)',
  },
  dailyFeatureMetricStrip: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  dailyFeatureMetricText: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.84)',
  },
  dailyNightSummaryRow: {
    marginTop: 16,
    minHeight: 112,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  dailyNightEmoji: {
    fontSize: 42,
    display: 'none',
  },
  dailyNightIconBadge: {
    marginTop: 10,
  },
  dailyNightTemp: {
    fontSize: 60,
    lineHeight: 62,
    fontWeight: '900',
    color: 'white',
  },
  dailyNightText: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  dailyDetailList: {
    marginTop: 14,
    gap: 10,
  },
  dailyDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  dailyDetailStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
    paddingLeft: 14,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.14)',
  },
  dailyDetailLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
  },
  dailyDetailValue: {
    fontSize: 13,
    fontWeight: '900',
    color: 'white',
    textAlign: 'right',
  },
  dailyDetailValueStack: {
    alignItems: 'flex-end',
    gap: 1,
  },
  dailyDetailPair: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'flex-end',
    gap: 6,
  },
  dailyDetailPairDivider: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.48)',
  },
  dailyDetailSub: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'right',
  },
  nextDaysHeader: {
    marginTop: 6,
    marginBottom: 2,
  },
  nextDaysTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },
  nextDaysList: {
    gap: 16,
  },
  nextDayRow: {
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: 28,
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
  },
  nextDayRowExpanded: {
    backgroundColor: GLASS_PANEL_BG_STRONG,
    borderColor: GLASS_BORDER,
  },
  nextDayTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  nextDayLabel: {
    width: 96,
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },
  nextDayVisual: {
    flex: 1,
    minWidth: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  nextDayIcon: {
    fontSize: 30,
    width: 36,
    textAlign: 'center',
  },
  nextDayCondition: {
    width: '100%',
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.84)',
    textAlign: 'center',
  },
  nextDayRange: {
    width: 90,
    fontSize: 22,
    fontWeight: '900',
    color: 'white',
    textAlign: 'right',
  },
  nextDayPop: {
    width: 42,
    fontSize: 17,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'right',
  },
  nextDayExpanded: {
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    gap: 16,
  },
  nextDayExpandedMetaRows: {
    gap: 8,
  },
  nextDayExpandedMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  nextDayExpandedMetaItem: {
    fontSize: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.82)',
  },
  nextDayExpandedPeriods: {
    flexDirection: 'row',
    gap: 10,
  },
  nextDayExpandedPeriodCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 2,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  nextDayExpandedPeriodHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  nextDayExpandedPeriodTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: 'white',
  },
  nextDayExpandedPeriodTemp: {
    fontSize: 18,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.9)',
  },
  nextDayExpandedPeriodText: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.76)',
  },
  nextDayExpandedDetailRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  nextDayExpandedDetailItem: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.82)',
  },
  nextDayMoonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  nextDayMoonChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  nextDayMoonChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.86)',
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
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
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

  dailyFeelsProminent: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 18,
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
    backgroundColor: GLASS_PANEL_BG,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },

  dailyRowExpanded: {
    backgroundColor: GLASS_PANEL_BG_STRONG,
  },

  dailyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },

  dailyForecastTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },

  dailyForecastWhen: {
    width: 74,
    paddingTop: 2,
  },

  dailyForecastDay: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 15,
    fontWeight: '900',
    textTransform: 'uppercase',
  },

  dailyForecastDate: {
    marginTop: 4,
    color: 'white',
    fontSize: 17,
    fontWeight: '900',
  },

  dailyForecastMain: {
    flex: 1,
    minWidth: 0,
  },

  dailyForecastConditionRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  dailyForecastIcon: {
    fontSize: 24,
  },
  dailyForecastIconBadge: {},

  dailyForecastSummary: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 17,
  },

  dailyForecastSide: {
    width: 64,
    alignItems: 'flex-end',
    paddingTop: 2,
  },

  dailyForecastSideValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
  },

  dailyForecastSideLabel: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 11,
    fontWeight: '800',
  },

  dailyMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },

  dailyMetricLabel: {
    width: 82,
    color: 'rgba(255,255,255,0.84)',
    fontSize: 13,
    fontWeight: '800',
  },

  dailyMetricTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  dailyMetricFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.78)',
  },

  dailyMetricValue: {
    width: 62,
    textAlign: 'right',
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
  },

  dailySunRow: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  dailySunLabel: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 12,
    fontWeight: '800',
  },

  dailySunValue: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
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
    backgroundColor: GLASS_INSET_BG_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
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
    backgroundColor: GLASS_PANEL_BG_STRONG,
    borderColor: GLASS_BORDER,
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

  landscapeGraphPlaceholder: {
    marginBottom: theme.spacing.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: GLASS_PANEL_BG_STRONG,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
  },
  landscapeGraphPlaceholderText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  landscapeGraphOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.98)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  landscapeGraphShell: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,28,45,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  landscapeGraphHeader: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  landscapeGraphSubtitle: {
    marginTop: -1,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: '800',
  },
  landscapeGraphBody: {
    flex: 1,
  },
  landscapeGraphSource: {
    paddingHorizontal: 18,
    paddingBottom: 8,
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    fontWeight: '800',
  },
  landscapeGraphToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  landscapeGraphToggleButton: {
    minWidth: 68,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  landscapeGraphToggleButtonActive: {
    backgroundColor: 'rgba(80, 155, 245, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(145,205,255,0.35)',
  },
  landscapeGraphToggleButtonDisabled: {
    opacity: 0.42,
  },
  landscapeGraphToggleText: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 11,
    fontWeight: '900',
  },
  landscapeGraphToggleTextActive: {
    color: 'white',
  },

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
