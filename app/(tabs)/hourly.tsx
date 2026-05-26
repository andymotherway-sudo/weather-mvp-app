import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useSettings } from '../context/SettingsContext';
import { useWxLab } from '../context/WxLabContext';
import { useLocations } from '../lib/locations/useLocations';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useAppChrome } from '../lib/theme/useAppChrome';

import { OMNI_MARK_WORD } from '../lib/brand/assets';

import WeatherVideoBackground from '../../components/background/WeatherVideoBackground';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';
import { NerdyHourlyTimeline } from '../../components/land/NerdyHourlyTimeline';
import { Card } from '../../components/layout/Card';
import { PremiumWeatherIcon } from '../../components/weather/PremiumWeatherIcon';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

type UnitSystem = 'us' | 'metric';

type VisualState = {
  weatherCode: number | null;
  isNight: boolean;
  isSunrise: boolean;
  isSunset: boolean;
};

const GLASS_SURFACE_BG = 'rgba(44, 70, 102, 0.68)';
const GLASS_SURFACE_BORDER = 'rgba(255,255,255,0.12)';

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function safeStr(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function forecastModelLabel(model: 'best_match' | 'gfs' | 'ecmwf' | 'dwd_icon') {
  switch (model) {
    case 'gfs':
      return 'NOAA U.S.';
    case 'ecmwf':
      return 'ECMWF';
    case 'dwd_icon':
      return 'DWD ICON';
    case 'best_match':
    default:
      return 'Best match';
  }
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
  if ([80, 81, 82].includes(code)) return '🌧️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '☁️';
}

function formatTzLabel(timeZone: string | null): string | null {
  if (!timeZone) return null;
  const parts = timeZone.split('/');
  return parts[parts.length - 1]?.replace(/_/g, ' ') ?? timeZone;
}

function normalizeHourly(hourlyRaw: any[], timeZone: string | null) {
  return (hourlyRaw ?? []).map((h: any) => {
    const pressureHpa =
      safeNum(h.pressure_msl) ??
      safeNum(h.pressureMslHpa) ??
      safeNum(h.surface_pressure) ??
      safeNum(h.pressureSurfaceHpa) ??
      safeNum(h.pressure_hpa) ??
      safeNum(h.pressureHpa) ??
      null;

    const temperatureF =
      safeNum(h.temperatureF) ??
      safeNum(h.tempF) ??
      safeNum(h.temperature_2m) ??
      safeNum(h.temperature) ??
      safeNum(h.temp) ??
      null;

    const apparentTemperatureF =
      safeNum(h.apparentTempF) ??
      safeNum(h.apparent_temperature_f) ??
      safeNum(h.apparent_temperature) ??
      null;

    const precipChancePct =
      safeNum(h.precipitation_probability) ??
      safeNum(h.precipProbPct) ??
      safeNum(h.precipChancePct) ??
      safeNum(h.pop) ??
      null;

    const windMph =
      safeNum(h.windMph) ??
      safeNum(h.windSpeedMph) ??
      safeNum(h.windspeed_10m) ??
      safeNum(h.wind_speed_10m) ??
      safeNum(h.wind_speed_mph) ??
      safeNum(h.windSpeed) ??
      safeNum(h.wind) ??
      null;

    const windGustMph =
      safeNum(h.windGustMph) ??
      safeNum(h.windgusts_10m) ??
      safeNum(h.wind_gusts_10m) ??
      safeNum(h.windGustsMph) ??
      safeNum(h.gustMph) ??
      safeNum(h.gust) ??
      null;

    const windDirDeg =
      safeNum(h.windDirDeg) ??
      safeNum(h.winddirection_10m) ??
      safeNum(h.wind_direction_10m) ??
      safeNum(h.windDir) ??
      null;

    const weatherCode =
      safeNum(h.weatherCode) ??
      safeNum(h.weather_code) ??
      safeNum(h.weathercode) ??
      safeNum(h.condition_code) ??
      safeNum(h.code) ??
      null;

    const dewpointF =
      safeNum(h.dewpointF) ??
      safeNum(h.dewPointF) ??
      safeNum(h.dew_point) ??
      safeNum(h.dewpoint_f) ??
      null;

    const humidityPct =
      safeNum(h.humidityPct) ??
      safeNum(h.relative_humidity) ??
      safeNum(h.relativeHumidity) ??
      safeNum(h.rh) ??
      null;

    const cloudCoverPct =
      safeNum(h.cloudCoverPct) ??
      safeNum(h.cloud_cover) ??
      safeNum(h.cloudCover) ??
      null;

    return {
      ...h,
      pressureHpa,
      pressureInHg: pressureHpa != null ? pressureHpa * 0.029529983071445 : null,
      temperatureF,
      apparentTemperatureF,
      precipChancePct,
      windMph,
      windGustMph,
      windDirDeg,
      weatherCode,
      dewpointF,
      humidityPct,
      cloudCoverPct,
      timeZone: safeStr(h.timeZone) ?? timeZone ?? undefined,
      timezone: safeStr(h.timezone) ?? timeZone ?? undefined,
    };
  });
}

function extractIsoWallClockParts(value: unknown): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  if (typeof value !== 'string') return null;

  const s = value.trim();
  if (!s) return null;

  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function getForecastStartIndex(hours: any[], timeZone?: string | null) {
  if (!hours?.length) return 0;

  let nowHour = -1;
  let nowDayKey = '';

  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(now);

    const year = parts.find((p) => p.type === 'year')?.value ?? '';
    const month = parts.find((p) => p.type === 'month')?.value ?? '';
    const day = parts.find((p) => p.type === 'day')?.value ?? '';
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '';

    nowHour = Number(hour);
    nowDayKey = `${year}-${month}-${day}`;
  } catch {
    const now = new Date();
    nowHour = now.getHours();
    nowDayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }

  for (let i = 0; i < hours.length; i += 1) {
    const raw = hours[i]?.time;
    const wall = extractIsoWallClockParts(raw);
    if (!wall) continue;

    const rowDayKey = `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(
      2,
      '0'
    )}`;

    if (rowDayKey > nowDayKey) return i;
    if (rowDayKey === nowDayKey && wall.hour >= nowHour) return i;
  }

  return 0;
}

function getClockState(timeZone?: string | null): Omit<VisualState, 'weatherCode'> {
  let hour = new Date().getHours();

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      hour: '2-digit',
      hour12: false,
    }).formatToParts(new Date());

    hour = Number(parts.find((part) => part.type === 'hour')?.value ?? hour);
  } catch {
    hour = new Date().getHours();
  }

  return {
    isNight: hour < 6 || hour >= 19,
    isSunrise: hour >= 6 && hour < 8,
    isSunset: hour >= 17 && hour < 19,
  };
}

function formatHeroSummary(hour: any) {
  const precipChance = safeNum(hour?.precipChancePct);
  const windMph = safeNum(hour?.windMph);
  const parts: string[] = [];

  if (precipChance != null) parts.push(`${Math.round(precipChance)}% precip chance`);
  if (windMph != null) parts.push(`${Math.round(windMph)} mph wind`);

  return parts.length ? parts.join(' • ') : 'Forecast details ready';
}

function buildWxLabHeroNarrative(hour: any) {
  const cloud = safeNum(hour?.cloudCoverPct);
  const wind = safeNum(hour?.windMph);
  const pressure = safeNum(hour?.pressureHpa);
  const humidity = safeNum(hour?.humidityPct);
  const dew = safeNum(hour?.dewpointF);
  const temp = safeNum(hour?.temperatureF);
  const parts: string[] = [];

  if (temp != null && dew != null) {
    const spread = temp - dew;
    parts.push(spread >= 18 ? 'Dry air' : spread <= 6 ? 'Moist air' : 'Balanced air');
  } else if (humidity != null) {
    parts.push(humidity >= 75 ? 'Humid' : humidity <= 35 ? 'Dry air' : 'Balanced air');
  }

  if (wind != null) parts.push(wind >= 16 ? 'Windy' : wind >= 8 ? 'Breezy' : 'Light wind');
  if (cloud != null) parts.push(cloud >= 80 ? 'Cloud-limited' : cloud >= 40 ? 'Filtered sun' : 'Open sky');
  if (pressure != null) parts.push(pressure <= 1008 ? 'Lower pressure' : pressure >= 1022 ? 'Higher pressure' : 'Near-normal pressure');

  return parts.slice(0, 4).join(' • ');
}

function formatHeroMetricValue(value: number | null, suffix = '', digits = 0) {
  if (value == null) return '—';
  return `${digits > 0 ? value.toFixed(digits) : Math.round(value)}${suffix}`;
}

function weatherCodeToIconName(code: number | null, isNight = false): keyof typeof Ionicons.glyphMap {
  if (code == null) return isNight ? 'moon-outline' : 'partly-sunny-outline';
  if (code === 0 || code === 1) return isNight ? 'moon-outline' : 'sunny-outline';
  if (code === 2) return 'partly-sunny-outline';
  if (code === 3 || code === 45 || code === 48) return 'cloud-outline';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rainy-outline';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow-outline';
  if ([95, 96, 99].includes(code)) return 'thunderstorm-outline';
  return 'cloud-outline';
}

function formatHourSlot(value: unknown, timeZone?: string | null) {
  if (typeof value !== 'string') return { day: '—', time: '—', short: '—', isNight: false };
  const wall = extractIsoWallClockParts(value);
  if (wall) {
    const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, 12));
    const hour12 = ((wall.hour + 11) % 12) + 1;
    const suffix = wall.hour >= 12 ? 'PM' : 'AM';
    const label = `${hour12} ${suffix}`;
    return {
      day: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' })
        .format(date)
        .toUpperCase(),
      time: label,
      short: label,
      isNight: wall.hour < 6 || wall.hour >= 19,
    };
  }

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { day: '—', time: '—', short: '—', isNight: false };
  const opts = timeZone ? { timeZone } : undefined;
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', hour12: false, ...opts })
      .formatToParts(d)
      .find((part) => part.type === 'hour')?.value ?? '12'
  );
  return {
    day: d.toLocaleDateString([], { weekday: 'short', ...opts }).toUpperCase(),
    time: d.toLocaleTimeString([], { hour: 'numeric', ...opts }),
    short: d.toLocaleTimeString([], { hour: 'numeric', ...opts }),
    isNight: hour < 6 || hour >= 19,
  };
}

function formatWindFeel(windMph: number | null, gustMph: number | null) {
  const reference = Math.max(windMph ?? 0, gustMph ?? 0);
  if (reference >= 25) return 'Strong';
  if (reference >= 15) return 'Gusty';
  if (reference >= 7) return 'Breezy';
  if (reference > 0) return 'Light';
  return 'Calm';
}

function metricBarPercent(value: number | null, max: number) {
  if (value == null || max <= 0) return 0.02;
  return Math.max(0.02, Math.min(1, value / max));
}

function MetricBarRow({
  label,
  value,
  percent,
}: {
  label: string;
  value: string;
  percent: number;
}) {
  return (
    <View style={styles.metricBarRow}>
      <Text style={styles.metricBarLabel}>{label}</Text>
      <View style={styles.metricBarTrack}>
        <View style={[styles.metricBarFill, { width: `${Math.max(2, percent * 100)}%` }]} />
      </View>
      <Text style={styles.metricBarValue}>{value}</Text>
    </View>
  );
}

function buildHourlyDetailRows(hour: any) {
  return [
    {
      label: 'Feels like',
      value: formatHeroMetricValue(safeNum(hour?.apparentTemperatureF), '°'),
      percent: metricBarPercent(safeNum(hour?.apparentTemperatureF), 120),
    },
    {
      label: 'Dew point',
      value: formatHeroMetricValue(safeNum(hour?.dewpointF), '°'),
      percent: metricBarPercent(safeNum(hour?.dewpointF), 80),
    },
    {
      label: 'Humidity',
      value: formatHeroMetricValue(safeNum(hour?.humidityPct), '%'),
      percent: metricBarPercent(safeNum(hour?.humidityPct), 100),
    },
    {
      label: 'Cloud cover',
      value: formatHeroMetricValue(safeNum(hour?.cloudCoverPct), '%'),
      percent: metricBarPercent(safeNum(hour?.cloudCoverPct), 100),
    },
    {
      label: 'Precip chance',
      value: formatHeroMetricValue(safeNum(hour?.precipChancePct), '%'),
      percent: metricBarPercent(safeNum(hour?.precipChancePct), 100),
    },
    {
      label: 'Wind',
      value: formatHeroMetricValue(safeNum(hour?.windMph), ' mph'),
      percent: metricBarPercent(safeNum(hour?.windMph), 40),
    },
    {
      label: 'Wind gusts',
      value: formatHeroMetricValue(safeNum(hour?.windGustMph), ' mph'),
      percent: metricBarPercent(safeNum(hour?.windGustMph), 50),
    },
    {
      label: 'Wind feel',
      value: formatWindFeel(safeNum(hour?.windMph), safeNum(hour?.windGustMph)),
      percent: metricBarPercent(
        Math.max(safeNum(hour?.windMph) ?? 0, safeNum(hour?.windGustMph) ?? 0),
        30
      ),
    },
  ];
}

function HourlySimpleTimeline({
  hours,
  timeZone,
}: {
  hours: any[];
  timeZone?: string | null;
}) {
  const { chrome } = useAppChrome();
  const featured = hours[0] ?? null;
  const rest = hours.slice(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!featured) return null;

  const featuredSlot = formatHourSlot(featured.time, timeZone);
  const detailRows = [
    {
      label: 'Feels like',
      value: formatHeroMetricValue(safeNum(featured.apparentTemperatureF), '°'),
      percent: metricBarPercent(safeNum(featured.apparentTemperatureF), 120),
    },
    {
      label: 'Dew point',
      value: formatHeroMetricValue(safeNum(featured.dewpointF), '°'),
      percent: metricBarPercent(safeNum(featured.dewpointF), 80),
    },
    {
      label: 'Humidity',
      value: formatHeroMetricValue(safeNum(featured.humidityPct), '%'),
      percent: metricBarPercent(safeNum(featured.humidityPct), 100),
    },
    {
      label: 'Cloud cover',
      value: formatHeroMetricValue(safeNum(featured.cloudCoverPct), '%'),
      percent: metricBarPercent(safeNum(featured.cloudCoverPct), 100),
    },
    {
      label: 'Precip chance',
      value: formatHeroMetricValue(safeNum(featured.precipChancePct), '%'),
      percent: metricBarPercent(safeNum(featured.precipChancePct), 100),
    },
    {
      label: 'Wind',
      value: formatHeroMetricValue(safeNum(featured.windMph), ' mph'),
      percent: metricBarPercent(safeNum(featured.windMph), 40),
    },
    {
      label: 'Wind gusts',
      value: formatHeroMetricValue(safeNum(featured.windGustMph), ' mph'),
      percent: metricBarPercent(safeNum(featured.windGustMph), 50),
    },
    {
      label: 'Wind feel',
      value: formatWindFeel(safeNum(featured.windMph), safeNum(featured.windGustMph)),
      percent: metricBarPercent(Math.max(safeNum(featured.windMph) ?? 0, safeNum(featured.windGustMph) ?? 0), 30),
    },
  ];

  return (
    <View style={styles.hourlySimpleWrap}>
      <View style={[styles.hourlyFeatureCard, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
        <View style={styles.hourlyFeatureTop}>
          <View style={styles.hourlyFeatureTimeCol}>
            <Text style={styles.hourlyFeatureDay}>{featuredSlot.day}</Text>
            <Text style={styles.hourlyFeatureTime}>{featuredSlot.time}</Text>
          </View>

          <View style={styles.hourlyFeatureMain}>
            <View style={styles.hourlyFeatureSummaryRow}>
              <PremiumWeatherIcon code={safeNum(featured.weatherCode)} size={42} variant="hero" style={styles.hourlyFeatureIconBadge} />
              <View style={styles.hourlyFeatureSummaryText}>
                <Text style={styles.hourlyFeatureTemp}>
                  {safeNum(featured.temperatureF) != null ? `${Math.round(safeNum(featured.temperatureF) as number)}°` : '—'}
                </Text>
                <Text style={styles.hourlyFeatureCondition}>{weatherCodeToLabel(safeNum(featured.weatherCode))}</Text>
                <Text style={styles.hourlyFeatureMeta}>{formatHeroSummary(featured)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.hourlyFeaturePressure}>
            <Text style={styles.hourlyFeaturePressurePrimary}>{formatHeroMetricValue(safeNum(featured.pressureHpa), ' hPa')}</Text>
            <Text style={styles.hourlyFeaturePressureSecondary}>
              {safeNum(featured.pressureInHg) != null ? `${(safeNum(featured.pressureInHg) as number).toFixed(2)} inHg` : '—'}
            </Text>
            <Text style={styles.hourlyFeaturePressureLabel}>Pressure</Text>
          </View>
        </View>

        <View style={styles.hourlyMetricBars}>
          {detailRows.map((row) => (
            <MetricBarRow key={row.label} label={row.label} value={row.value} percent={row.percent} />
          ))}
        </View>
      </View>

      {rest.map((hour, idx) => {
        const slot = formatHourSlot(hour.time, timeZone);
        return (
          <View key={String(hour.time ?? idx)} style={[styles.hourlyMiniCard, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
            <View style={styles.hourlyMiniTimeCol}>
              <Text style={styles.hourlyMiniDay}>{slot.day}</Text>
              <Text style={styles.hourlyMiniTime}>{slot.short}</Text>
            </View>

            <View style={styles.hourlyMiniMain}>
              <PremiumWeatherIcon code={safeNum(hour.weatherCode)} size={28} variant="inline" style={styles.hourlyMiniIconBadge} />
              <View style={styles.hourlyMiniSummary}>
                <Text style={styles.hourlyMiniTemp}>
                  {safeNum(hour.temperatureF) != null ? `${Math.round(safeNum(hour.temperatureF) as number)}°` : '—'}
                </Text>
                <Text style={styles.hourlyMiniCondition}>{weatherCodeToLabel(safeNum(hour.weatherCode))}</Text>
                <Text style={styles.hourlyMiniMeta}>{formatHeroSummary(hour)}</Text>
              </View>
            </View>

            <View style={styles.hourlyMiniPressure}>
              <Text style={styles.hourlyMiniPressurePrimary}>{formatHeroMetricValue(safeNum(hour.pressureHpa), ' hPa')}</Text>
              <Text style={styles.hourlyMiniPressureSecondary}>
                {safeNum(hour.pressureInHg) != null ? `${(safeNum(hour.pressureInHg) as number).toFixed(2)} inHg` : '—'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="rgba(255,255,255,0.72)" />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function HourlySimpleTimelineExpanded({
  hours,
  timeZone,
}: {
  hours: any[];
  timeZone?: string | null;
}) {
  const { chrome } = useAppChrome();
  const featured = hours[0] ?? null;
  const rest = hours.slice(1);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (!featured) return null;

  const featuredSlot = formatHourSlot(featured.time, timeZone);
  const detailRows = buildHourlyDetailRows(featured);

  return (
    <View style={styles.hourlySimpleWrap}>
      <View style={[styles.hourlyFeatureCard, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
        <View style={styles.hourlyFeatureTop}>
          <View style={styles.hourlyFeatureTimeCol}>
            <Text style={styles.hourlyFeatureDay}>{featuredSlot.day}</Text>
            <Text style={styles.hourlyFeatureTime}>{featuredSlot.time}</Text>
          </View>

          <View style={styles.hourlyFeatureMain}>
            <View style={styles.hourlyFeatureSummaryRow}>
              <PremiumWeatherIcon code={safeNum(featured.weatherCode)} size={42} variant="hero" style={styles.hourlyFeatureIconBadge} />
              <View style={styles.hourlyFeatureSummaryText}>
                <Text style={styles.hourlyFeatureTemp}>
                  {safeNum(featured.temperatureF) != null ? `${Math.round(safeNum(featured.temperatureF) as number)}°` : '—'}
                </Text>
                <Text style={styles.hourlyFeatureCondition}>
                  {weatherCodeToLabel(safeNum(featured.weatherCode))}
                </Text>
                <Text style={styles.hourlyFeatureMeta}>{formatHeroSummary(featured)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.hourlyFeaturePressure}>
            <Text style={styles.hourlyFeaturePressurePrimary}>
              {formatHeroMetricValue(safeNum(featured.pressureHpa), ' hPa')}
            </Text>
            <Text style={styles.hourlyFeaturePressureSecondary}>
              {safeNum(featured.pressureInHg) != null ? `${(safeNum(featured.pressureInHg) as number).toFixed(2)} inHg` : '—'}
            </Text>
            <Text style={styles.hourlyFeaturePressureLabel}>Pressure</Text>
          </View>
        </View>

        <View style={styles.hourlyMetricBars}>
          {detailRows.map((row) => (
            <MetricBarRow key={row.label} label={row.label} value={row.value} percent={row.percent} />
          ))}
        </View>
      </View>

      {rest.map((hour, idx) => {
        const slot = formatHourSlot(hour.time, timeZone);
        const rowKey = String(hour.time ?? idx);
        const isOpen = expandedKey === rowKey;
        const miniDetailRows = buildHourlyDetailRows(hour);

        return (
          <Pressable
            key={rowKey}
            onPress={() => setExpandedKey((current) => (current === rowKey ? null : rowKey))}
            style={[styles.hourlyMiniCard, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}
          >
            <View style={styles.hourlyMiniTopRow}>
              <View style={styles.hourlyMiniTimeCol}>
                <Text style={styles.hourlyMiniDay}>{slot.day}</Text>
                <Text style={styles.hourlyMiniTime}>{slot.short}</Text>
              </View>

              <View style={styles.hourlyMiniMain}>
                <PremiumWeatherIcon code={safeNum(hour.weatherCode)} size={28} variant="inline" style={styles.hourlyMiniIconBadge} />
                <View style={styles.hourlyMiniSummary}>
                  <Text style={styles.hourlyMiniTemp}>
                    {safeNum(hour.temperatureF) != null ? `${Math.round(safeNum(hour.temperatureF) as number)}°` : '—'}
                  </Text>
                  <Text style={styles.hourlyMiniCondition}>
                    {weatherCodeToLabel(safeNum(hour.weatherCode))}
                  </Text>
                  <Text style={styles.hourlyMiniMeta}>{formatHeroSummary(hour)}</Text>
                </View>
              </View>

              <View style={styles.hourlyMiniPressure}>
                <Text style={styles.hourlyMiniPressurePrimary}>
                  {formatHeroMetricValue(safeNum(hour.pressureHpa), ' hPa')}
                </Text>
                <Text style={styles.hourlyMiniPressureSecondary}>
                  {safeNum(hour.pressureInHg) != null ? `${(safeNum(hour.pressureInHg) as number).toFixed(2)} inHg` : '—'}
                </Text>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="rgba(255,255,255,0.72)"
                />
              </View>
            </View>

            {isOpen ? (
              <View style={styles.hourlyMiniExpanded}>
                <View style={styles.hourlyMiniBars}>
                  {miniDetailRows.map((row) => (
                    <MetricBarRow
                      key={`${rowKey}:${row.label}`}
                      label={row.label}
                      value={row.value}
                      percent={row.percent}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function HourlyWithCoords({
  coords,
  wxLab,
  onRefreshingChange,
  setRefreshFn,
  onOpenLearn,
  onVisualStateChange,
}: {
  coords: { lat: number; lon: number };
  wxLab: boolean;
  onRefreshingChange: (refreshing: boolean) => void;
  setRefreshFn: (fn: null | (() => void)) => void;
  onOpenLearn: (topicId?: string) => void;
  onVisualStateChange: (state: VisualState) => void;
}) {
  const units: UnitSystem = 'us';
  const { forecastModel } = useSettings();
  const { chrome } = useAppChrome();

  const { data, loading, error, refreshing, refresh } = useOpenMeteoForecast({
    lat: coords.lat,
    lon: coords.lon,
    days: 5,
    model: forecastModel,
  });

  useEffect(() => {
    onRefreshingChange(!!refreshing);
  }, [refreshing, onRefreshingChange]);

  useEffect(() => {
    setRefreshFn(refresh ? () => refresh() : null);
    return () => setRefreshFn(null);
  }, [refresh, setRefreshFn]);

  const forecastTimeZone = useMemo(() => safeStr(data?.timezone) ?? null, [data]);
  const hourly = useMemo(
    () => normalizeHourly(data?.hourly ?? [], forecastTimeZone),
    [data?.hourly, forecastTimeZone]
  );

  const startIndex = useMemo(
    () => getForecastStartIndex(hourly, forecastTimeZone),
    [hourly, forecastTimeZone]
  );

  const visibleHourly = useMemo(() => hourly.slice(startIndex, startIndex + 72), [hourly, startIndex]);
  const leadHour = visibleHourly[0] ?? hourly[0] ?? null;

  useEffect(() => {
    const clockState = getClockState(forecastTimeZone);
    onVisualStateChange({
      weatherCode: safeNum(leadHour?.weatherCode),
      ...clockState,
    });
  }, [forecastTimeZone, leadHour, onVisualStateChange]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.small}>Loading hourly forecast...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <Card style={styles.errorCard}>
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorText}>{String(error)}</Text>
      </Card>
    );
  }

  if (!visibleHourly.length || !leadHour) return null;

  const tzLabel = formatTzLabel(forecastTimeZone);
  const heroTemp = safeNum(leadHour.temperatureF);
  const heroFeels = safeNum(leadHour.apparentTemperatureF);
  const heroCondition = weatherCodeToLabel(safeNum(leadHour.weatherCode));
  const heroSummary = formatHeroSummary(leadHour);
  const heroNarrative = buildWxLabHeroNarrative(leadHour);
  const heroSlot = formatHourSlot(leadHour.time, forecastTimeZone ?? undefined);
  const heroPrecip = safeNum(leadHour.precipChancePct);
  const heroWind = safeNum(leadHour.windMph);
  const heroGust = safeNum(leadHour.windGustMph);
  const heroPressure = safeNum(leadHour.pressureHpa);
  const modelLabel = forecastModelLabel(forecastModel);

  if (!wxLab) {
    return (
      <>
        <View style={styles.hourlySectionHeader}>
          <Text style={styles.hourlyScreenTitle}>Hourly forecast</Text>
          <Text style={styles.hourlyScreenMeta}>72 hours - Model: {modelLabel}</Text>
        </View>
        <HourlySimpleTimelineExpanded
          hours={visibleHourly}
          timeZone={forecastTimeZone ?? undefined}
        />
      </>
    );
  }

  return (
    <>
      <View style={[styles.heroCard, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
        <View pointerEvents="none" style={styles.cardGlow} />
        <View pointerEvents="none" style={styles.heroHaze} />

        <View style={styles.heroTopRow}>
          <View style={styles.heroMain}>
            <View style={styles.heroBadgeRow}>
              <Text style={styles.heroKicker}>{`NOW • ${heroSlot.time}`}</Text>
              <View style={styles.heroStatusDot} />
            </View>

            <View style={styles.heroPrimaryRow}>
              <View style={styles.heroWeatherBadge}>
                <PremiumWeatherIcon code={safeNum(leadHour.weatherCode)} size={58} variant="hero" style={styles.heroIconBadge} />
              </View>
              <View style={styles.heroPrimaryText}>
                <Text style={styles.heroTemp}>{heroTemp != null ? `${Math.round(heroTemp)}°` : '—'}</Text>
                <Text style={styles.heroCondition} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>{heroCondition}</Text>
                <Text style={styles.heroNarrative} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.84}>{heroNarrative || heroSummary}</Text>
                <View style={styles.heroInlineMeta}>
                  <Text style={styles.heroInlineMetaText}>{formatHeroMetricValue(heroPrecip, '%')} precip chance</Text>
                  <Text style={styles.heroInlineMetaDot}>•</Text>
                  <Text style={styles.heroInlineMetaText}>{formatHeroMetricValue(heroWind, ' mph')} wind</Text>
                </View>
                <Text style={styles.heroModelText}>Model: {modelLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.heroRightCard}>
            <Text style={styles.heroMiniLabel}>Feels like</Text>
            <Text style={styles.heroMiniValue}>{heroFeels != null ? `${Math.round(heroFeels)}°` : '—'}</Text>
          </View>
        </View>

        <View style={styles.heroQuickStats}>
          <View style={styles.heroQuickStat}>
            <Text style={styles.heroQuickLabel}>Precip</Text>
            <Text style={styles.heroQuickValue}>{formatHeroMetricValue(heroPrecip, '%')}</Text>
          </View>
          <View style={styles.heroQuickStat}>
            <Text style={styles.heroQuickLabel}>Wind</Text>
            <Text style={styles.heroQuickValue}>{formatHeroMetricValue(heroWind, ' mph')}</Text>
          </View>
          <View style={styles.heroQuickStat}>
            <Text style={styles.heroQuickLabel}>Gust</Text>
            <Text style={styles.heroQuickValue}>{formatHeroMetricValue(heroGust, ' mph')}</Text>
          </View>
          <View style={[styles.heroQuickStat, styles.heroQuickStatLast]}>
            <Text style={styles.heroQuickLabel}>Pressure</Text>
            <Text style={styles.heroQuickValue}>{formatHeroMetricValue(heroPressure, ' hPa')}</Text>
          </View>
        </View>

        {forecastTimeZone ? (
          <Text style={styles.updatedText}>
            Times shown for {tzLabel ?? forecastTimeZone} ({forecastTimeZone})
          </Text>
        ) : null}
      </View>

      {!wxLab ? <Text style={styles.sectionLead}>Next 72 hours</Text> : null}

      {wxLab ? (
        <View style={styles.chartBlock}>
          <HourlyCharts72h
            hours={visibleHourly}
            maxHours={72}
            units={units}
            initialPanel="range"
            timeZone={forecastTimeZone ?? undefined}
            landscapePresentation="modal"
          />
        </View>
      ) : null}

      <NerdyHourlyTimeline
        hours={visibleHourly}
        maxHours={72}
        timeZone={forecastTimeZone ?? undefined}
        defaultMode={wxLab ? 'wxlab' : 'simple'}
        onExplain={(payload) => onOpenLearn(payload.learnTopicId)}
      />
    </>
  );
}

export default function HourlyTab() {
  const { appColorMode, chrome } = useAppChrome();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const wxLabCtx = useWxLab() as any;
  const wxLab = !!wxLabCtx?.wxLab;
  const setWxLab =
    (typeof wxLabCtx?.setWxLab === 'function' && wxLabCtx.setWxLab) ||
    (typeof wxLabCtx?.setEnabled === 'function' && wxLabCtx.setEnabled) ||
    (typeof wxLabCtx?.setWxLabEnabled === 'function' && wxLabCtx.setWxLabEnabled) ||
    null;
  const toggleWxLab =
    (typeof wxLabCtx?.toggleWxLab === 'function' && wxLabCtx.toggleWxLab) ||
    (typeof wxLabCtx?.toggle === 'function' && wxLabCtx.toggle) ||
    null;

  const { activeCoords, activeLabel, refreshCurrentLocation } = useLocations();

  const coords = useMemo(() => activeCoords ?? null, [activeCoords]);

  const locationLabel = useMemo(() => {
    const raw = (activeLabel ?? '').trim();
    if (raw) return raw;
    return coords
      ? `${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)}`
      : 'Getting location...';
  }, [activeLabel, coords]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshFnRef = useRef<null | (() => void)>(null);
  const [learnVisible, setLearnVisible] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
  const [visualState, setVisualState] = useState<VisualState>({
    weatherCode: null,
    ...getClockState(null),
  });

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

  const setRefreshFn = useCallback((fn: null | (() => void)) => {
    refreshFnRef.current = fn;
  }, []);

  const onPullToRefresh = useCallback(() => {
    if (coords && refreshFnRef.current) {
      refreshFnRef.current();
      return;
    }
    refreshCurrentLocation();
  }, [coords, refreshCurrentLocation]);

  const openLearn = useCallback((topicId?: string) => {
    setLearnTopicId(topicId);
    setLearnVisible(true);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: chrome.background }]}>
      <View
        pointerEvents="none"
        style={[styles.videoLayer, appColorMode === 'classic' ? null : styles.videoLayerMuted]}
      >
        <WeatherVideoBackground
          weatherCode={visualState.weatherCode ?? undefined}
          isEvening={visualState.isNight || visualState.isSunset}
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
          refreshControl={<RefreshControl refreshing={!!isRefreshing} onRefresh={onPullToRefresh} />}
        >
          <View style={styles.headerHeroWrap}>
            <View style={[styles.headerHeroSurface, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
              <View style={styles.headerCompactTopRow}>
                <View style={styles.hourlyHeaderLeft}>
                  <Image source={OMNI_MARK_WORD} style={styles.headerCompactLogo} resizeMode="contain" />

                  <View style={[styles.headerCompactLocation, { backgroundColor: chrome.card, borderColor: chrome.border }]}>
                    <View style={styles.hourlyLocationRow}>
                      <Ionicons name="location-outline" size={18} color="rgba(255,255,255,0.92)" />
                      <Text style={styles.locationPrimary} numberOfLines={1}>
                        {locationLabel}
                      </Text>
                    </View>
                    <Text style={styles.locationSecondary}>
                      {wxLab ? 'Detailed hourly analysis' : 'Simple hour-by-hour view'}
                    </Text>
                  </View>
                </View>

                <View style={styles.hourlyHeaderRight}>
                  <Pressable onPress={() => router.push('/profile')} hitSlop={12} style={[styles.settingsIconBtn, { backgroundColor: chrome.pill, borderColor: chrome.border }]}>
                    <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.92)" />
                  </Pressable>
                </View>
              </View>

              <View style={styles.headerHeroBottomRow}>
                <Pressable onPress={() => router.push('/(tabs)')} style={[styles.quickNavBtn, { backgroundColor: chrome.pill, borderColor: chrome.border }]}>
                  <Text style={styles.quickNavText}>Land</Text>
                </Pressable>

                <Pressable onPress={() => router.push('/(tabs)/almanac')} style={[styles.quickNavBtn, { backgroundColor: chrome.pill, borderColor: chrome.border }]}>
                  <Text style={styles.quickNavText}>Almanac</Text>
                </Pressable>

                <View style={[styles.headerModeWrap, { backgroundColor: chrome.card, borderColor: chrome.border }]}>
                  <Pressable
                    onPress={() => setWxLab?.(false)}
                    style={[styles.headerModeBtn, { backgroundColor: chrome.pill, borderColor: chrome.border }, !wxLab ? styles.headerModeBtnActive : null, !wxLab ? { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong } : null]}
                  >
                    <Text style={[styles.headerModeText, !wxLab ? styles.headerModeTextActive : null]}>Simple</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (toggleWxLab && !wxLab) return toggleWxLab();
                      return setWxLab?.(true);
                    }}
                    style={[styles.headerModeBtn, { backgroundColor: chrome.pill, borderColor: chrome.border }, wxLab ? styles.headerModeBtnActive : null, wxLab ? { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong } : null]}
                  >
                    <Text style={[styles.headerModeText, wxLab ? styles.headerModeTextActive : null]}>wxLab</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>

          {!coords ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Getting your location...</Text>
              <Text style={styles.errorText}>Enable GPS or pick a place in Land Wx.</Text>
              <View style={{ marginTop: 12 }}>
                <Pressable onPress={refreshCurrentLocation} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Try again</Text>
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
                      backgroundColor: visualState.isNight
                        ? 'rgba(120,160,255,0.10)'
                        : visualState.isSunrise || visualState.isSunset
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

              <HourlyWithCoords
                coords={coords}
                wxLab={wxLab}
                onRefreshingChange={setIsRefreshing}
                setRefreshFn={setRefreshFn}
                onOpenLearn={openLearn}
                onVisualStateChange={setVisualState}
              />
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      <LearnMoreModal
        visible={learnVisible}
        onClose={() => setLearnVisible(false)}
        initialTopicId={learnTopicId}
      />
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
  content: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  headerHeroWrap: {
    marginBottom: theme.spacing.md,
    position: 'relative',
  },

  headerHeroSurface: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 22,
    backgroundColor: GLASS_SURFACE_BG,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
    overflow: 'hidden',
  },

  headerCompactTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },

  hourlyHeaderLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  headerCompactLocation: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: GLASS_SURFACE_BG,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
  },

  hourlyLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  hourlyHeaderRight: {
    alignItems: 'flex-end',
    gap: 10,
  },

  headerCompactLogo: {
    width: 80,
    height: 80,
    opacity: 0.96,
  },

  locationPrimary: { fontSize: 15, fontWeight: '900', color: 'white' },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  settingsIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GLASS_SURFACE_BG,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
  },

  headerModeWrap: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 999,
    backgroundColor: GLASS_SURFACE_BG,
    marginLeft: 'auto',
  },
  headerModeBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  headerModeBtnActive: {
    backgroundColor: 'rgba(146, 238, 205, 0.20)',
  },
  headerModeText: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '800',
    fontSize: 12,
  },
  headerModeTextActive: {
    color: '#E9FFF8',
  },
  quickNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
    backgroundColor: GLASS_SURFACE_BG,
  },
  quickNavText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
  },
  headerHeroBottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },

  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 28,
    backgroundColor: GLASS_SURFACE_BG,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
  },

  cardGlow: {
    position: 'absolute',
    left: -72,
    top: -94,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(160,220,255,0.06)',
  },

  heroHaze: {
    position: 'absolute',
    right: -28,
    bottom: -54,
    width: 220,
    height: 150,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.035)',
    transform: [{ rotate: '-10deg' }],
  },

  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroMain: { flex: 1 },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  heroPrimaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroEmoji: {
    fontSize: 46,
    lineHeight: 52,
    width: 52,
    textAlign: 'center',
  },
  heroIconBadge: { width: 58 },
  heroWeatherBadge: {
    width: 74,
    height: 74,
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  heroPrimaryText: { flex: 1, minWidth: 0 },
  heroKicker: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: 'rgba(255,255,255,0.92)',
  },
  heroStatusDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(116,224,195,0.9)',
  },
  heroNowText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.56)',
  },
  heroTemp: { fontSize: 64, lineHeight: 68, fontWeight: '900', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 20, lineHeight: 24, fontWeight: '800', color: theme.colors.textPrimary, marginTop: 2 },
  heroSummary: { marginTop: 6, fontSize: 14, lineHeight: 19, fontWeight: '700', color: 'rgba(255,255,255,0.66)' },
  heroNarrative: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  heroInlineMeta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  heroInlineMetaText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '800',
  },
  heroInlineMetaDot: {
    color: 'rgba(255,255,255,0.48)',
    fontSize: 12,
    fontWeight: '900',
  },
  heroModelText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.66)',
  },

  heroRightCard: {
    minWidth: 106,
    alignItems: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 0,
    backgroundColor: 'transparent',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.18)',
  },
  heroMiniLabel: { fontSize: 13, opacity: 0.9, color: theme.colors.textSecondary, fontWeight: '700' },
  heroMiniValue: { marginTop: 8, fontSize: 56, lineHeight: 60, fontWeight: '900', color: theme.colors.textPrimary },
  heroMiniSub: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.48)',
  },
  heroQuickStats: {
    marginTop: theme.spacing.lg,
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    paddingTop: 14,
  },
  heroQuickStat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.14)',
  },
  heroQuickStatLast: {
    borderRightWidth: 0,
  },
  heroQuickLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.46)',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  heroQuickValue: {
    fontSize: 15,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.92)',
  },

  updatedText: { ...typography.small, marginTop: theme.spacing.md, opacity: 0.6, fontWeight: '700' },

  chartBlock: {
    marginBottom: theme.spacing.sm,
  },

  chartHeader: {
    marginBottom: theme.spacing.sm,
  },

  sectionLead: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },

  sectionSub: {
    ...typography.small,
    opacity: 0.72,
    marginTop: 2,
  },

  hourlySectionHeader: {
    marginBottom: theme.spacing.md,
  },
  hourlyScreenTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: 'white',
  },
  hourlyScreenMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
  },

  hourlySimpleWrap: {
    gap: 14,
  },
  hourlyFeatureCard: {
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 28,
    backgroundColor: GLASS_SURFACE_BG,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
    overflow: 'hidden',
  },
  hourlyFeatureTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  hourlyFeatureTimeCol: {
    width: 70,
  },
  hourlyFeatureDay: {
    fontSize: 16,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.75)',
  },
  hourlyFeatureTime: {
    marginTop: 6,
    fontSize: 19,
    fontWeight: '900',
    color: 'white',
  },
  hourlyFeatureMain: {
    flex: 1,
    minWidth: 0,
  },
  hourlyFeatureSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hourlyFeatureEmoji: {
    fontSize: 42,
    lineHeight: 46,
    width: 44,
    textAlign: 'center',
  },
  hourlyFeatureIconBadge: {
    width: 44,
    height: 44,
  },
  hourlyFeatureSummaryText: {
    flex: 1,
    minWidth: 0,
  },
  hourlyFeatureTemp: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: '900',
    color: 'white',
  },
  hourlyFeatureCondition: {
    marginTop: 2,
    fontSize: 18,
    fontWeight: '800',
    color: 'white',
  },
  hourlyFeatureMeta: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.74)',
  },
  hourlyFeaturePressure: {
    width: 88,
    alignItems: 'flex-end',
  },
  hourlyFeaturePressurePrimary: {
    fontSize: 13,
    fontWeight: '900',
    color: 'white',
    textAlign: 'right',
  },
  hourlyFeaturePressureSecondary: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.68)',
    textAlign: 'right',
  },
  hourlyFeaturePressureLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  hourlyMetricBars: {
    marginTop: 16,
    gap: 10,
  },
  metricBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minWidth: 0,
  },
  metricBarLabel: {
    width: 88,
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  metricBarTrack: {
    flex: 1,
    minWidth: 0,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  metricBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  metricBarValue: {
    width: 74,
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
    color: 'white',
  },
  hourlyMiniCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: GLASS_SURFACE_BG,
    borderWidth: 1,
    borderColor: GLASS_SURFACE_BORDER,
    overflow: 'hidden',
  },
  hourlyMiniTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  hourlyMiniTimeCol: {
    width: 68,
  },
  hourlyMiniDay: {
    fontSize: 13,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.75)',
  },
  hourlyMiniTime: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: '900',
    color: 'white',
  },
  hourlyMiniMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hourlyMiniEmoji: {
    fontSize: 28,
    lineHeight: 32,
    width: 30,
    textAlign: 'center',
  },
  hourlyMiniIconBadge: {
    width: 30,
    height: 30,
  },
  hourlyMiniSummary: {
    flex: 1,
    minWidth: 0,
  },
  hourlyMiniTemp: {
    fontSize: 24,
    fontWeight: '900',
    color: 'white',
  },
  hourlyMiniCondition: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  hourlyMiniMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
  },
  hourlyMiniPressure: {
    width: 80,
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  hourlyMiniPressurePrimary: {
    fontSize: 12,
    fontWeight: '900',
    color: 'white',
    textAlign: 'right',
  },
  hourlyMiniPressureSecondary: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.62)',
    textAlign: 'right',
  },
  hourlyMiniExpanded: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    gap: 12,
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  hourlyMiniBars: {
    gap: 8,
  },
  hourlyMiniFacts: {
    flexDirection: 'row',
    gap: 10,
  },
  hourlyMiniFactPill: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(18, 37, 63, 0.26)',
  },
  hourlyMiniFactLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.68)',
  },
  hourlyMiniFactValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '900',
    color: 'white',
  },

  heroBgSoftGlow: {
    position: 'absolute',
    left: -80,
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(160,220,255,0.10)',
  },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  small: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: {
    backgroundColor: theme.colors.errorBg,
    borderColor: theme.colors.errorBg,
    marginBottom: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.errorText,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.errorText,
  },

  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  retryText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
    opacity: 0.9,
  },
});
