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
import { OMNI_MARK_WORD } from '../lib/brand/assets';
import { useLocations } from '../lib/locations/useLocations';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';

import WeatherVideoBackground from '../../components/background/WeatherVideoBackground';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';
import { NerdyHourlyTimeline } from '../../components/land/NerdyHourlyTimeline';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

type UnitSystem = 'us' | 'metric';

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function safeStr(v: any): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
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
    const wall = extractIsoWallClockParts(hours[i]?.time);
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

function HourlyWithCoords({
  coords,
  wxLab,
  onRefreshingChange,
  setRefreshFn,
  onOpenLearn,
  onWeatherCode,
}: {
  coords: { lat: number; lon: number };
  wxLab: boolean;
  onRefreshingChange: (refreshing: boolean) => void;
  setRefreshFn: (fn: null | (() => void)) => void;
  onOpenLearn: (topicId?: string) => void;
  onWeatherCode: (code: number | null) => void;
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
  const backgroundWeatherCode = useMemo(
    () => safeNum(visibleHourly[0]?.weatherCode ?? hourly[0]?.weatherCode) ?? null,
    [visibleHourly, hourly]
  );
  const leadHour = visibleHourly[0] ?? null;
  const leadTemp = safeNum(leadHour?.temperatureF);
  const leadFeels = safeNum(
    leadHour?.apparentTempF ?? leadHour?.apparent_temperature ?? leadHour?.apparent_temperature_f
  );
  const leadPop = safeNum(leadHour?.precipChancePct ?? leadHour?.precipitation_probability);
  const leadWind = safeNum(leadHour?.windMph);
  const leadCondition = safeStr(leadHour?.condition) ?? 'Hourly forecast';

  useEffect(() => {
    onWeatherCode(backgroundWeatherCode);
  }, [backgroundWeatherCode, onWeatherCode]);

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

  if (!visibleHourly.length) return null;

  const tzLabel = formatTzLabel(forecastTimeZone);

  return (
    <>
      <Card style={styles.heroCard}>
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject} />

        <View style={styles.heroTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTemp}>{leadTemp != null ? `${Math.round(leadTemp)}°` : '—'}</Text>
            <Text style={styles.heroCondition}>{leadCondition}</Text>
            <Text style={styles.heroSummary} numberOfLines={1}>
              {leadPop != null ? `${Math.round(leadPop)}% precip chance` : 'Precip signal unavailable'}
              {leadWind != null ? ` • ${Math.round(leadWind)} mph wind` : ''}
            </Text>
          </View>

          <View style={styles.heroRight}>
            <Text style={styles.heroMiniLabel}>Feels</Text>
            <Text style={styles.heroMiniValue}>{leadFeels != null ? `${Math.round(leadFeels)}°` : '—'}</Text>
          </View>
        </View>

        {!!forecastTimeZone && (
          <Text style={styles.updatedText}>
            Times shown for {tzLabel ?? forecastTimeZone} ({forecastTimeZone})
          </Text>
        )}
      </Card>

      {wxLab ? (
        <Card style={styles.chartShellCard}>
          <View style={styles.wxLabHeader}>
            <Text style={styles.sectionTitle}>Wx Lab</Text>
            <Text style={styles.wxLabSub}>Expanded analysis view</Text>
          </View>

          <HourlyCharts72h
            hours={visibleHourly}
            maxHours={72}
            units={units}
            initialPanel="range"
            timeZone={forecastTimeZone ?? undefined}
          />
          <Text style={styles.updatedText}>Source: Open-Meteo (hourly)</Text>
        </Card>
      ) : (
        <Card style={styles.sectionIntroCard}>
          <Text style={styles.sectionTitle}>Next 24 hours</Text>
          <Text style={styles.wxLabSub}>Expandable hour-by-hour details</Text>
        </Card>
      )}

      <Card style={styles.timelineShellCard}>
        <NerdyHourlyTimeline
          hours={visibleHourly}
          maxHours={wxLab ? 72 : 24}
          timeZone={forecastTimeZone ?? undefined}
          defaultMode={wxLab ? 'wxlab' : 'simple'}
          onExplain={(payload) => onOpenLearn(payload.learnTopicId)}
        />
        <Text style={styles.updatedText}>
          {wxLab ? 'Source: Open-Meteo (hourly timeline)' : 'Source: Open-Meteo (next 24 hours)'}
        </Text>
      </Card>
    </>
  );
}

export default function HourlyTab() {
  const insets = useSafeAreaInsets();
  const wxLabCtx = useWxLab() as any;
  const wxLab = !!wxLabCtx?.wxLab;
  const [bgWeatherCode, setBgWeatherCode] = useState<number | null>(null);
  const glowAnim = useRef(new Animated.Value(0)).current;

  const { activeCoords, activeLabel, refreshCurrentLocation } = useLocations();

  const coords = useMemo(() => activeCoords ?? null, [activeCoords]);

  const locationLabel = useMemo(() => {
    const raw = (activeLabel ?? '').trim();
    if (raw) return raw;
    return coords
      ? `Current location (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)})`
      : 'Getting location...';
  }, [activeLabel, coords]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshFnRef = useRef<null | (() => void)>(null);

  const [learnVisible, setLearnVisible] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

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

  return (
    <View style={styles.root}>
      <View style={styles.videoLayer}>
        <WeatherVideoBackground weatherCode={bgWeatherCode ?? undefined} isEvening={isNight || isSunset} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(theme.spacing.sm, insets.top * 0.1),
            },
          ]}
          refreshControl={<RefreshControl refreshing={!!isRefreshing} onRefresh={onPullToRefresh} />}
        >
          <View style={styles.headerHeroWrap}>
            <View style={styles.headerHeroSurface}>
              <View style={styles.headerCompactTopRow}>
                <View style={styles.headerCompactLeft}>
                  <Image source={OMNI_MARK_WORD} style={styles.headerCompactLogo} resizeMode="contain" />
                  <View style={styles.headerCompactLocation}>
                    <Text style={styles.locationEyebrow}>Hourly</Text>
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

              <HourlyWithCoords
                coords={coords}
                wxLab={wxLab}
                onRefreshingChange={setIsRefreshing}
                setRefreshFn={setRefreshFn}
                onOpenLearn={openLearn}
                onWeatherCode={setBgWeatherCode}
              />
            </>
          )}

          <View style={{ height: Math.max(40, insets.bottom + 16) }} />
        </ScrollView>

        <LearnMoreModal
          visible={learnVisible}
          onClose={() => setLearnVisible(false)}
          initialTopicId={learnTopicId}
        />
      </SafeAreaView>
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
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  locationEyebrow: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  locationPrimary: { fontSize: 13, fontWeight: '900', color: 'white', marginTop: 2 },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  heroBgSoftGlow: {
    position: 'absolute',
    left: -80,
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(160,220,255,0.10)',
  },

  tzNote: {
    ...typography.small,
    opacity: 0.7,
    marginBottom: theme.spacing.sm,
  },

  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },

  wxLabHeader: {
    marginBottom: 8,
  },

  wxLabSub: {
    ...typography.small,
    opacity: 0.7,
    marginTop: -2,
    marginBottom: 10,
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

  heroCard: { marginBottom: theme.spacing.lg, overflow: 'hidden' },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTemp: { fontSize: 64, fontWeight: '900', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, marginTop: 4 },
  heroSummary: { marginTop: 8, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },
  heroRight: { alignItems: 'flex-end' },
  heroMiniLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  heroMiniValue: { fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary },
  updatedText: { ...typography.small, marginTop: theme.spacing.md, opacity: 0.6, fontWeight: '700' },
  sectionIntroCard: {
    marginBottom: theme.spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  chartShellCard: {
    marginBottom: theme.spacing.lg,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  timelineShellCard: {
    marginBottom: theme.spacing.lg,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
});
