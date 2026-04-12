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

import { useWxLab } from '../context/WxLabContext';
import { useLocations } from '../lib/locations/useLocations';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';

import { OMNI_MARK_WORD } from '../lib/brand/assets';

import WeatherVideoBackground from '../../components/background/WeatherVideoBackground';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';
import { NerdyHourlyTimeline } from '../../components/land/NerdyHourlyTimeline';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

type UnitSystem = 'us' | 'metric';

type VisualState = {
  weatherCode: number | null;
  isNight: boolean;
  isSunrise: boolean;
  isSunset: boolean;
};

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function safeStr(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
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
      safeNum(h.windSpeedMph) ??
      safeNum(h.wind_speed_10m) ??
      safeNum(h.wind_speed_mph) ??
      safeNum(h.windSpeed) ??
      safeNum(h.wind) ??
      null;

    const windGustMph =
      safeNum(h.windGustMph) ??
      safeNum(h.wind_gusts_10m) ??
      safeNum(h.windGustsMph) ??
      safeNum(h.gustMph) ??
      safeNum(h.gust) ??
      null;

    const weatherCode =
      safeNum(h.weatherCode) ??
      safeNum(h.weather_code) ??
      safeNum(h.weathercode) ??
      safeNum(h.condition_code) ??
      safeNum(h.code) ??
      null;

    return {
      ...h,
      pressureHpa,
      temperatureF,
      apparentTemperatureF,
      precipChancePct,
      windMph,
      windGustMph,
      weatherCode,
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

function formatHeroMetricValue(value: number | null, suffix = '', digits = 0) {
  if (value == null) return '—';
  return `${digits > 0 ? value.toFixed(digits) : Math.round(value)}${suffix}`;
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

  const { data, loading, error, refreshing, refresh } = useOpenMeteoForecast({
    lat: coords.lat,
    lon: coords.lon,
    days: 5,
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

  const visibleHourly = useMemo(() => hourly.slice(startIndex), [hourly, startIndex]);
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
  const heroPrecip = safeNum(leadHour.precipChancePct);
  const heroWind = safeNum(leadHour.windMph);
  const heroGust = safeNum(leadHour.windGustMph);
  const heroPressure = safeNum(leadHour.pressureHpa);

  return (
    <>
      <View style={styles.heroCard}>
        <View pointerEvents="none" style={styles.cardGlow} />

        <View style={styles.heroTopRow}>
          <View style={styles.heroMain}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroNowBadge}>
                <Text style={styles.heroNowBadgeText}>NOW</Text>
              </View>
              <Text style={styles.heroNowText}>Current hourly condition</Text>
            </View>
            <Text style={styles.heroTemp}>{heroTemp != null ? `${Math.round(heroTemp)}°` : '—'}</Text>
            <Text style={styles.heroCondition}>{heroCondition}</Text>
            <Text style={styles.heroSummary}>{heroSummary}</Text>
          </View>

          <View style={styles.heroRight}>
            <Text style={styles.heroMiniLabel}>Feels</Text>
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
          <View style={styles.heroQuickStat}>
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

      {!wxLab ? <Text style={styles.sectionLead}>Next 24 hours</Text> : null}

      {wxLab ? (
        <View style={styles.chartBlock}>
          <View style={styles.chartHeader}>
            <Text style={styles.sectionTitle}>Wx Lab</Text>
            <Text style={styles.sectionSub}>Expanded hourly analysis</Text>
          </View>

          <HourlyCharts72h
            hours={visibleHourly}
            maxHours={72}
            units={units}
            initialPanel="range"
            timeZone={forecastTimeZone ?? undefined}
          />
        </View>
      ) : null}

      <NerdyHourlyTimeline
        hours={visibleHourly}
        maxHours={wxLab ? 72 : 24}
        timeZone={forecastTimeZone ?? undefined}
        defaultMode={wxLab ? 'wxlab' : 'simple'}
        onExplain={(payload) => onOpenLearn(payload.learnTopicId)}
      />
    </>
  );
}

export default function HourlyTab() {
  const insets = useSafeAreaInsets();
  const wxLabCtx = useWxLab() as any;
  const wxLab = !!wxLabCtx?.wxLab;

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
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.videoLayer}>
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
            <View style={styles.headerHeroSurface}>
              <View style={styles.headerCompactTopRow}>
                <Image source={OMNI_MARK_WORD} style={styles.headerCompactLogo} resizeMode="contain" />

                <View style={styles.headerCompactLocation}>
                  <Text style={styles.headerEyebrow}>Hourly</Text>
                  <Text style={styles.locationPrimary} numberOfLines={1}>
                    {locationLabel}
                  </Text>
                  <Text style={styles.locationSecondary}>
                    {wxLab ? 'Wx Lab expanded view' : 'Simple expanded view'}
                  </Text>
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
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },

  headerCompactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  headerCompactLogo: {
    width: 80,
    height: 80,
    opacity: 0.96,
  },

  headerCompactLocation: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  headerEyebrow: {
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.54)',
    fontWeight: '900',
    marginBottom: 4,
  },

  locationPrimary: { fontSize: 15, fontWeight: '900', color: 'white' },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 28,
    backgroundColor: 'rgba(20, 33, 56, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  cardGlow: {
    position: 'absolute',
    left: -72,
    top: -94,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(130, 168, 240, 0.14)',
  },

  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroMain: { flex: 1 },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  heroNowBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(140, 190, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(170, 220, 255, 0.28)',
  },
  heroNowBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: 'rgba(255,255,255,0.96)',
  },
  heroNowText: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.56)',
  },
  heroTemp: { fontSize: 64, fontWeight: '900', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, marginTop: 4 },
  heroSummary: { marginTop: 8, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.58)' },

  heroRight: { alignItems: 'flex-end' },
  heroMiniLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  heroMiniValue: { fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary },
  heroQuickStats: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  heroQuickStat: {
    minWidth: 88,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
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
    fontSize: 14,
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
