// app/(tabs)/almanac.tsx
import { useIsFocused } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlace } from '../context/PlaceContext';
import { useSettings } from '../context/SettingsContext';

import { useAlmanacPreload } from '../../components/boot/AlmanacWarmup';
import { ClimatologyChart } from '../../components/land/ClimatologyChart';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useOpenMeteoDayContext } from '../lib/almanac/dayContextHook';
import { isAlmanacAreaDownloaded, markAlmanacAreaDownloaded } from '../lib/almanac/downloadManifest';
import { useDailyRecords } from '../lib/almanac/useDailyRecordsHook';
import { OMNI_MARK_WORD } from '../lib/brand/assets';
import { useClimatologyNormals } from '../lib/climatology/hook';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useAppChrome } from '../lib/theme/useAppChrome';

const OBS_START_ISO = '2025-01-01';
const FORECAST_DAYS = 15;
const DAY_MS = 86_400_000;

/* ---------------- helpers ---------------- */

function isoTodayLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return isoTodayLocal();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isoToDoy(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return 1;
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  const doy = Math.floor(diff / DAY_MS);
  return Number.isFinite(doy) && doy >= 1 ? doy : 1;
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

function fmtDow(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

function fmtMonDay(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtTemp(v: number | null | undefined) {
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}°` : '—';
}

function fmtRain(v: number | null | undefined) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  if (v < 0.005) return '0.00"';
  return `${v.toFixed(2)}"`;
}

function fmtUpdatedFromIso(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return '—';

  const delta = Date.now() - ms;
  if (!Number.isFinite(delta) || delta < 0) return '—';

  const mins = Math.floor(delta / 60_000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;

  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;

  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function approxMonthlyNormalForDate(
  normals: Array<{ month: number; tminF: number | null; tmaxF: number | null; tavgF: number | null }>,
  iso: string
) {
  const d = new Date(`${iso}T12:00:00`);
  const m = Number.isFinite(d.getTime()) ? d.getMonth() + 1 : 1;
  const found = normals.find((x) => x?.month === m);
  return {
    normalHiF: typeof found?.tmaxF === 'number' && Number.isFinite(found.tmaxF) ? found.tmaxF : null,
    normalLoF: typeof found?.tminF === 'number' && Number.isFinite(found.tminF) ? found.tminF : null,
    normalAvgF: typeof found?.tavgF === 'number' && Number.isFinite(found.tavgF) ? found.tavgF : null,
  };
}

function fmtElapsed(s: number) {
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

function clampYearsToWindow(years: number[] | undefined, win?: { from: number; to: number } | null) {
  const arr = Array.isArray(years) ? years : [];
  const filtered = win
    ? arr.filter((y) => Number.isFinite(y) && y >= win.from && y <= win.to)
    : arr.filter((y) => Number.isFinite(y));

  return Array.from(new Set(filtered)).sort((a, b) => a - b);
}

function isoFromYearAndDoy(year: number, doy1: number) {
  const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
  const doy = Math.round(clamp(doy1, 1, 366));
  const d = new Date(safeYear, 0, 1);
  d.setDate(d.getDate() + (doy - 1));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function safeFiniteNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function safeString(v: unknown, fallback = '—') {
  return typeof v === 'string' && v.trim() ? v : fallback;
}

/* ---------------- component ---------------- */

export default function ClimoTab() {
  const insets = useSafeAreaInsets();
  const { chrome } = useAppChrome();
  const isFocused = useIsFocused();

  const { active } = usePlace();
  const preload = useAlmanacPreload();
  const hasPlace = !!active;

  const coords = useMemo(() => {
    if (!active) return null;
    const lat = safeFiniteNumber(active.lat);
    const lon = safeFiniteNumber(active.lon);
    if (lat == null || lon == null) return null;
    return { lat, lon };
  }, [active?.lat, active?.lon]);

  const preloadMatches = useMemo(() => {
    if (!coords || !preload?.coords) return false;
    return Math.abs(coords.lat - preload.coords.lat) < 0.0001 && Math.abs(coords.lon - preload.coords.lon) < 0.0001;
  }, [coords?.lat, coords?.lon, preload?.coords?.lat, preload?.coords?.lon]);

  const [areaDownloaded, setAreaDownloaded] = useState(false);
  const [areaDownloadRequested, setAreaDownloadRequested] = useState(false);

  useEffect(() => {
    let mounted = true;
    setAreaDownloadRequested(false);
    setAreaDownloaded(false);

    if (!coords) {
      return;
    }

    isAlmanacAreaDownloaded(coords.lat, coords.lon)
      .then((downloaded) => {
        if (mounted) setAreaDownloaded(downloaded);
      })
      .catch(() => {
        if (mounted) setAreaDownloaded(false);
      });

    return () => {
      mounted = false;
    };
  }, [coords?.lat, coords?.lon]);

  const shouldLoadAreaAlmanac = !!coords && (preloadMatches || areaDownloaded || areaDownloadRequested);

  const locationLabel = useMemo(() => {
    return active?.name ? active.name : 'Select a location…';
  }, [active]);

  /* ---------- date navigation ---------- */

  const todayIso = isoTodayLocal();
  const [selectedIso, setSelectedIso] = useState(todayIso);

  useEffect(() => {
    setSelectedIso((cur) => (cur ? cur : todayIso));
  }, [todayIso]);

  const minSelectable = OBS_START_ISO;
  const maxSelectable = useMemo(() => `${todayIso.slice(0, 4)}-12-31`, [todayIso]);

  const canBack = selectedIso > minSelectable;
  const canFwd = selectedIso < maxSelectable;

  const bumpDay = useCallback(
    (delta: number) => {
      setSelectedIso((cur) => {
        const base = cur || todayIso;
        const next = addDaysIso(base, delta);
        if (next < minSelectable) return minSelectable;
        if (next > maxSelectable) return maxSelectable;
        return next;
      });
    },
    [maxSelectable, minSelectable, todayIso]
  );

  const jumpToday = useCallback(() => setSelectedIso(todayIso), [todayIso]);

  /* ---------- swipe "day carousel" ---------- */

  const swipeX = useRef(new Animated.Value(0)).current;

  const SWIPE_TRIGGER_PX = 55;
  const SWIPE_MAX_DRAG_PX = 90;

  const dayPanResponder = useMemo(() => {
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => {
        const dx = Math.abs(g.dx);
        const dy = Math.abs(g.dy);
        return dx > 10 && dx > dy * 1.25;
      },
      onPanResponderGrant: () => {
        swipeX.stopAnimation();
        swipeX.setValue(0);
      },
      onPanResponderMove: (_evt, g) => {
        swipeX.setValue(clamp(g.dx, -SWIPE_MAX_DRAG_PX, SWIPE_MAX_DRAG_PX));
      },
      onPanResponderRelease: (_evt, g) => {
        const dx = g.dx;

        Animated.timing(swipeX, {
          toValue: 0,
          duration: 160,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();

        if (dx <= -SWIPE_TRIGGER_PX) bumpDay(+1);
        else if (dx >= SWIPE_TRIGGER_PX) bumpDay(-1);
      },
      onPanResponderTerminate: () => {
        Animated.timing(swipeX, {
          toValue: 0,
          duration: 140,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      },
    });
  }, [bumpDay, swipeX]);

  /* ---------- data hooks ---------- */

  const localClimo = useClimatologyNormals({
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    enabled: isFocused && hasPlace && !!coords && !preloadMatches && shouldLoadAreaAlmanac,
    preferCache: true,
  } as any);
  const { forecastModel } = useSettings();
  const climo = preloadMatches && preload?.climo ? preload.climo : localClimo;

  const localForecast = useOpenMeteoForecast({
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    days: FORECAST_DAYS,
    model: forecastModel,
    enabled: isFocused && hasPlace && !!coords && !preloadMatches,
  });
  const forecast = preloadMatches && preload?.forecast ? preload.forecast : localForecast;
  const forecastModelName = forecastModelLabel(forecastModel);

  const safeForecastDaily = useMemo(() => {
    const raw = forecast.data?.daily;
    return Array.isArray(raw) ? raw.filter(Boolean) : [];
  }, [forecast.data?.daily]);

  const forecastByDate = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of safeForecastDaily) {
      if (typeof d?.date === 'string' && d.date) {
        m.set(d.date, d);
      }
    }
    return m;
  }, [safeForecastDaily]);

  
  const yesterdayIso = useMemo(() => addDaysIso(todayIso, -1), [todayIso]);
  const lastForecastIso = useMemo(() => addDaysIso(todayIso, FORECAST_DAYS - 1), [todayIso]);

  const mode = useMemo<'observed' | 'forecast' | 'normals'>(() => {
    if (selectedIso <= yesterdayIso) return 'observed';
    if (selectedIso >= todayIso && selectedIso <= lastForecastIso && forecastByDate.has(selectedIso)) return 'forecast';
    return 'normals';
  }, [selectedIso, yesterdayIso, todayIso, lastForecastIso, forecastByDate]);

  const dayCtx = useOpenMeteoDayContext({
    lat: coords?.lat ?? null,
    lon: coords?.lon ?? null,
    date: selectedIso,
    enabled: isFocused && hasPlace && !!coords && mode === 'observed',
    preferCache: true,
  } as any);

  /* ---------- records ---------- */

  const localRecords = useDailyRecords({
    lat: coords?.lat ?? 0,
    lon: coords?.lon ?? 0,
    enabled: isFocused && hasPlace && !!coords && !preloadMatches && shouldLoadAreaAlmanac,
  });
  const records = preloadMatches && preload?.records ? preload.records : localRecords;

  useEffect(() => {
    if (!coords) return;
    const normalsReady = Array.isArray(climo.data?.normals) && climo.data.normals.length > 0;
    const rawRecords = (records as any)?.records;
    const recordsReady = !!rawRecords && typeof rawRecords === 'object' && Object.keys(rawRecords).length > 0;
    if (!normalsReady || !recordsReady) return;
    setAreaDownloaded(true);
    markAlmanacAreaDownloaded(coords.lat, coords.lon).catch(() => {});
  }, [coords?.lat, coords?.lon, climo.data?.normals, (records as any)?.records]);

  const recordsMap = useMemo(() => {
    const raw = (records as any)?.records;
    return raw && typeof raw === 'object' ? raw : null;
  }, [(records as any)?.records]);

  const selectedRecord = useMemo(() => {
    const key = `${selectedIso.slice(5, 7)}-${selectedIso.slice(8, 10)}`;
    return recordsMap?.[key] ?? null;
  }, [recordsMap, selectedIso]);

  const [recordsEverResolved, setRecordsEverResolved] = useState(false);

  useEffect(() => {
    setRecordsEverResolved(false);
  }, [coords?.lat, coords?.lon]);

  useEffect(() => {
    const loading = !!(records as any)?.loading;
    const err = (records as any)?.error;
    const map = (records as any)?.records;
    if (!loading && (err || map)) setRecordsEverResolved(true);
  }, [(records as any)?.loading, (records as any)?.error, (records as any)?.records]);

  /* ---------- Records UX ---------- */

  const rLoading = !!(records as any)?.loading;
  const rErr = (records as any)?.error;
  const rProgress = (records as any)?.progress as
    | null
    | {
        phase?: string;
        message?: string;
        pages?: number;
        rows?: number;
        pct?: number;
        yearFrom?: number;
        yearTo?: number;
      };
  const rMap = (records as any)?.records;
  const rEmpty = !rMap || (typeof rMap === 'object' && Object.keys(rMap).length === 0);

  const [recordsStartedAt, setRecordsStartedAt] = useState<number | null>(null);
  const [recordsElapsedSec, setRecordsElapsedSec] = useState(0);

  useEffect(() => {
    setRecordsStartedAt(null);
    setRecordsElapsedSec(0);
  }, [coords?.lat, coords?.lon]);

  useEffect(() => {
    if (rLoading) {
      setRecordsStartedAt((cur) => cur ?? Date.now());
    }
  }, [rLoading]);

  useEffect(() => {
    if (!isFocused || !recordsStartedAt) return;
    const id = setInterval(() => {
      setRecordsElapsedSec(Math.max(0, (Date.now() - recordsStartedAt) / 1000));
    }, 400);
    return () => clearInterval(id);
  }, [isFocused, recordsStartedAt]);

  const progAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isFocused || !shouldLoadAreaAlmanac || !(rLoading || (!recordsEverResolved && hasPlace))) {
      progAnim.stopAnimation();
      progAnim.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progAnim, rLoading, recordsEverResolved, hasPlace, shouldLoadAreaAlmanac, isFocused]);

  const recordsStatus = useMemo(() => {
    if (!shouldLoadAreaAlmanac) return '';

    const elapsed = fmtElapsed(recordsElapsedSec);
    const suffix = elapsed ? ` • ${elapsed}` : '';

    if (!recordsEverResolved) {
      if (recordsElapsedSec >= 10) return `Still working on NOAA records…${suffix}`;
      return `Fetching NOAA records…${suffix}`;
    }

    if (rLoading) {
      if (recordsElapsedSec >= 12) return `Still working on NOAA records…${suffix}`;
      return `Loading records…${suffix}`;
    }

    return '';
  }, [recordsEverResolved, rLoading, recordsElapsedSec, shouldLoadAreaAlmanac]);

  const recordsHint = useMemo(() => {
    if (!shouldLoadAreaAlmanac) return '';
    if (!hasPlace) return '';
    if (!recordsEverResolved || rLoading) {
      return 'First load can take a bit — especially on a new station.';
    }
    return '';
  }, [hasPlace, recordsEverResolved, rLoading, shouldLoadAreaAlmanac]);

  /* ---------- normals availability ---------- */

  const chartNormals = useMemo(() => {
  const raw = climo.data?.normals;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (n: any) =>
        n &&
        Number.isFinite(n.month) &&
        n.month >= 1 &&
        n.month <= 12
    )
    .sort((a: any, b: any) => a.month - b.month);
}, [climo.data?.normals]);

const hasNormals = chartNormals.length > 0;
  const showNormalsFailureHint = hasPlace && !hasNormals && !!climo.error && !climo.loading && !climo.refreshing;
  const normalsLoading = shouldLoadAreaAlmanac && !hasNormals && (climo.loading || climo.refreshing);
  const normalsFailed = shouldLoadAreaAlmanac && !hasNormals && !!climo.error && !climo.loading && !climo.refreshing;

  /* ---------- meta display ---------- */

  const stationName = useMemo(() => {
    return typeof climo.data?.station?.name === 'string' ? climo.data.station.name : undefined;
  }, [climo.data?.station?.name]);
  const normalsLabel = useMemo(() => {
    if (climo.data?.source === 'open_meteo_archive_normals') {
      const start = climo.data.diagnostics?.baselineStartYear;
      const end = climo.data.diagnostics?.baselineEndYear;
      return Number.isFinite(start) && Number.isFinite(end)
        ? `${start}-${end} archive normals`
        : 'Archive normals';
    }
    return '30-yr normals';
  }, [climo.data?.diagnostics?.baselineEndYear, climo.data?.diagnostics?.baselineStartYear, climo.data?.source]);
  const normalsSourceFooter = climo.data?.source === 'open_meteo_archive_normals'
    ? 'archive normals'
    : 'climate station normals';

  const normalsCount = chartNormals.length;
  const updatedLabel = useMemo(() => fmtUpdatedFromIso(climo.data?.fetchedAtIso), [climo.data?.fetchedAtIso]);

  const normalsForSelected = useMemo(() => {
    return approxMonthlyNormalForDate(chartNormals as any, selectedIso);
  }, [chartNormals, selectedIso]);

  /* ---------- build tile ---------- */

  const tile = useMemo(() => {
    const base = {
      title: `${fmtDow(selectedIso)} • ${fmtMonDay(selectedIso)}`,
      station: stationName ?? '—',
      normalHi: normalsForSelected.normalHiF,
      normalLo: normalsForSelected.normalLoF,
    };

    if (mode === 'observed') {
      const hi = safeFiniteNumber((dayCtx.data as any)?.tempMaxF);
      const lo = safeFiniteNumber((dayCtx.data as any)?.tempMinF);

      return {
        ...base,
        mode,
        hi,
        lo,
        rain: safeFiniteNumber(dayCtx.data?.precipTotalIn),
        precipChance: null as number | null,
        condition: safeString(dayCtx.data?.conditionLabel),
        cloudMin: safeFiniteNumber(dayCtx.data?.cloudMinPct),
        cloudMax: safeFiniteNumber(dayCtx.data?.cloudMaxPct),
        windMax: safeFiniteNumber(dayCtx.data?.windMaxMph),
        footer: `Observed: Open-Meteo Archive | Normals: ${normalsSourceFooter}`,
      };
    }

    if (mode === 'forecast') {
      const f: any = forecastByDate.get(selectedIso);

      return {
        ...base,
        mode,
        hi: safeFiniteNumber(f?.tempMaxF),
        lo: safeFiniteNumber(f?.tempMinF),
        rain: safeFiniteNumber(f?.precipTotalIn),
        precipChance: safeFiniteNumber(f?.precipProbMaxPct),
        condition: 'Forecast conditions',
        cloudMin: safeFiniteNumber(f?.cloudCoverMinPct),
        cloudMax: safeFiniteNumber(f?.cloudCoverMaxPct),
        windMax: safeFiniteNumber(f?.windMaxMph),
        footer: `Forecast: Open-Meteo | Normals: ${normalsSourceFooter}`,
      };
    }

    return {
      ...base,
      mode,
      hi: normalsForSelected.normalHiF,
      lo: normalsForSelected.normalLoF,
      rain: null as number | null,
      precipChance: null as number | null,
      condition: 'Seasonal average',
      cloudMin: null as number | null,
      cloudMax: null as number | null,
      windMax: null as number | null,
      footer: `Normals: ${normalsSourceFooter}`,
    };
  }, [selectedIso, stationName, normalsForSelected.normalHiF, normalsForSelected.normalLoF, mode, dayCtx.data, forecastByDate, normalsSourceFooter]);

  /* ---------- refresh ---------- */

  const onRefreshAll = useCallback(() => {
    if (!hasPlace || !coords) return;

    try {
      forecast.refresh?.();
    } catch {}

    if (shouldLoadAreaAlmanac) {
      try {
        (records as any).refresh?.();
      } catch {}
    }
  }, [forecast, hasPlace, coords, records, shouldLoadAreaAlmanac]);

  const anyLoading =
    hasPlace &&
    ((climo.loading && !climo.data) ||
      (forecast.loading && !forecast.data) ||
      (mode === 'observed' && dayCtx.loading && !dayCtx.data));

  const recordsRefreshing = !!(records as any)?.refreshing || !!(records as any)?.loading;
  const anyRefreshing = hasPlace && (!!forecast.refreshing || recordsRefreshing);

  const markerLabel = useMemo(
    () => (selectedIso === todayIso ? 'Today' : fmtMonDay(selectedIso)),
    [selectedIso, todayIso]
  );

  const selectedDoy = useMemo(() => isoToDoy(selectedIso), [selectedIso]);
  const safeSelectedDoy = Number.isFinite(selectedDoy) ? clamp(selectedDoy, 1, 366) : 1;

  const recordsTitle = useMemo(() => {
    const name = (records as any)?.stationNameUsed;
    const y = (records as any)?.years as { from: number; to: number } | null;
    const windowLabel = y?.from && y?.to ? ` • ${y.from}–${y.to}` : '';
    return name ? `Records (${name}${windowLabel})` : `Records (nearby major station${windowLabel})`;
  }, [(records as any)?.stationNameUsed, (records as any)?.years?.from, (records as any)?.years?.to]);

  const chartPrecip = useMemo(() => {
  const raw = (climo.data as any)?.precipMonthlyIn;
  return Array.isArray(raw) && raw.length === 12 ? raw : undefined;
}, [(climo.data as any)?.precipMonthlyIn]);

  const chartLastYear = useMemo(() => {
    const raw = (climo.data as any)?.lastYear;
    if (!raw || typeof raw !== 'object') return undefined;
    return raw;
  }, [(climo.data as any)?.lastYear]);

  const canRenderChart =
  hasPlace &&
  shouldLoadAreaAlmanac &&
  chartNormals.length === 12 &&
  safeSelectedDoy >= 1 &&
  safeSelectedDoy <= 366;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: chrome.background }]} edges={['top', 'left', 'right']}>
      <ScrollView
        style={[styles.container, { backgroundColor: chrome.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(theme.spacing.md, Math.round(insets.top * 0.25)) },
        ]}
        refreshControl={<RefreshControl refreshing={!!anyRefreshing} onRefresh={onRefreshAll} />}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandLeft}>
              <Image source={OMNI_MARK_WORD} style={styles.brandWordmark} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <View style={styles.domainPill}>
                  <Text style={styles.domainPillText}>Almanac</Text>
                </View>

                <Text style={styles.sub} numberOfLines={1}>
                  {locationLabel}
                </Text>
              </View>
            </View>

            <View style={styles.brandRight}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>NOAA</Text>
              </View>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Station</Text>
              <Text style={styles.metaPillValue} numberOfLines={1}>
                {stationName ?? '—'}
              </Text>
            </View>

            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Months</Text>
              <Text style={styles.metaPillValue}>{normalsCount ? `${normalsCount} / 12` : '—'}</Text>
            </View>

            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Updated</Text>
              <Text style={styles.metaPillValue}>{updatedLabel}</Text>
            </View>

            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Forecast</Text>
              <Text style={styles.metaPillValue}>{forecastModelName}</Text>
            </View>
          </View>

          {showNormalsFailureHint ? (
            <Text style={[styles.helper, { marginTop: 8 }]}>
              Climate normals could not be downloaded. Forecasts and records can still be used.
            </Text>
          ) : null}

        </View>

        {!hasPlace ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Select a location</Text>
            <Text style={styles.errorText}>
              Go to Land Wx and pick a location (or enable GPS). Almanac will update automatically.
            </Text>
          </Card>
        ) : null}

        {anyLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.small}>Loading almanac…</Text>
          </View>
        ) : null}

        {forecast.error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Forecast unavailable</Text>
            <Text style={styles.errorText}>{String(forecast.error)}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={() => forecast.refresh?.()} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {dayCtx.error && mode === 'observed' ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Observed day unavailable</Text>
            <Text style={styles.errorText}>{String(dayCtx.error)}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={() => dayCtx.refresh?.()} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {hasPlace ? (
          <Card style={styles.dayCard}>
            <Animated.View {...dayPanResponder.panHandlers} style={{ transform: [{ translateX: swipeX }] }}>
              <View style={styles.dayTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.daySmall}>Day brief</Text>
                  <Text style={styles.dayTitle}>{tile.title}</Text>
                  <Text style={styles.daySub}>Station • {tile.station}</Text>
                </View>

                <View style={styles.normalPill}>
                  <Text style={styles.normalPillLabel} numberOfLines={1}>
                    Monthly normal
                  </Text>
                  <Text style={styles.normalPillValue}>
                    {fmtTemp(tile.normalHi)} / {fmtTemp(tile.normalLo)}
                  </Text>
                </View>
              </View>

              <View style={styles.navRow}>
                <Pressable
                  onPress={() => bumpDay(-1)}
                  disabled={!canBack}
                  style={[styles.navBtn, !canBack && styles.navBtnDisabled]}
                >
                  <Text style={styles.navBtnText}>◀</Text>
                </Pressable>

                <Pressable onPress={jumpToday} style={styles.todayBtn}>
                  <Text style={styles.todayBtnText}>Today</Text>
                </Pressable>

                <Pressable
                  onPress={() => bumpDay(1)}
                  disabled={!canFwd}
                  style={[styles.navBtn, !canFwd && styles.navBtnDisabled]}
                >
                  <Text style={styles.navBtnText}>▶</Text>
                </Pressable>
              </View>

              <View style={styles.kpiRow}>
                <View style={styles.kpi}>
                  <Text style={styles.kpiLabel}>High</Text>
                  <Text style={styles.kpiVal}>{fmtTemp(tile.hi)}</Text>
                </View>
                <View style={styles.kpi}>
                  <Text style={styles.kpiLabel}>Low</Text>
                  <Text style={styles.kpiVal}>{fmtTemp(tile.lo)}</Text>
                </View>
                <View style={styles.kpi}>
                  <Text style={styles.kpiLabel}>Rain</Text>
                  <Text style={styles.kpiVal}>{fmtRain(tile.rain)}</Text>
                </View>
              </View>

              <View style={styles.metaRow2}>
                <Text style={styles.metaText}>{tile.condition}</Text>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.metaText}>
                  {tile.cloudMin != null && tile.cloudMax != null
                    ? `Cloud ${Math.round(tile.cloudMin)}–${Math.round(tile.cloudMax)}%`
                    : 'Cloud —'}
                </Text>
                <Text style={styles.dot}>•</Text>
                <Text style={styles.metaText}>
                  {tile.windMax != null ? `Wind ${Math.round(tile.windMax)} mph` : 'Wind —'}
                </Text>
              </View>

              {(() => {
                if (!shouldLoadAreaAlmanac) {
                  return (
                    <View style={styles.recordsBox}>
                      <Text style={styles.recordsTitle}>Area data</Text>
                      <Text style={styles.recordsItem}>Records and climate normals are not downloaded for this area yet.</Text>
                      <Text style={styles.recordsHint}>Download once, then future visits load from saved Almanac data.</Text>
                      <View style={styles.actionRowTight}>
                        <Pressable onPress={() => setAreaDownloadRequested(true)} style={styles.primaryBtn}>
                          <Text style={styles.primaryBtnText}>Download Almanac Data</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                const showWarmup = !recordsEverResolved || (rLoading && !recordsEverResolved);

                if (showWarmup || rLoading) {
                  return (
                    <View style={styles.recordsBox}>
                      <Text style={styles.recordsTitle}>Records</Text>
                      <Text style={styles.recordsItem}>
                        {rProgress?.message ? rProgress.message : recordsStatus || 'Loading records…'}
                      </Text>

                      {typeof rProgress?.pct === 'number' ? (
                        <Text style={styles.recordsHint}>
                          {Math.round(rProgress.pct * 100)}% • {rProgress.pages ?? 0} pages • {rProgress.rows ?? 0} rows
                        </Text>
                      ) : null}

                      {rProgress?.yearFrom && rProgress?.yearTo ? (
                        <Text style={styles.recordsHint}>
                          Window: {rProgress.yearFrom}–{rProgress.yearTo}
                        </Text>
                      ) : null}

                      {recordsHint ? <Text style={styles.recordsHint}>{recordsHint}</Text> : null}

                      <View style={styles.progressTrack}>
                        <Animated.View
                          style={[
                            styles.progressIndeterminate,
                            {
                              transform: [
                                {
                                  translateX: progAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [-120, 220],
                                  }),
                                },
                              ],
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                }

                if (rErr || rEmpty) {
                  return (
                    <View style={styles.recordsBox}>
                      <Text style={styles.recordsTitle}>{recordsTitle}</Text>
                      <Text style={styles.recordsItem}>
                        {rErr ? 'Couldn’t load records yet.' : 'No record data for this date.'}
                      </Text>
                      <View style={styles.actionRowTight}>
                        <Pressable onPress={() => (records as any).refresh?.()} style={styles.btn}>
                          <Text style={styles.btnText}>Retry</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                if (selectedRecord) {
                  const win = (records as any)?.years as { from: number; to: number } | null;

                  const hiYears = clampYearsToWindow(selectedRecord.recordHighYears, win);
                  const loYears = clampYearsToWindow(selectedRecord.recordLowYears, win);

                  const pRaw = selectedRecord.recordPrecipIn;
                  const p = typeof pRaw === 'number' && Number.isFinite(pRaw) ? pRaw : 0;

                  const showPrecipYears = p > 0.0049;
                  const prYears = showPrecipYears
                    ? clampYearsToWindow(selectedRecord.recordPrecipYears, win)
                    : [];

                  return (
                    <View style={styles.recordsBox}>
                      <Text style={styles.recordsTitle}>{recordsTitle}</Text>

                      {selectedRecord.recordHighF != null ? (
                        <Text style={styles.recordsItem}>
                          High {Math.round(selectedRecord.recordHighF)}°
                          {hiYears.length ? ` (${hiYears.join(', ')})` : ''}
                        </Text>
                      ) : null}

                      {selectedRecord.recordLowF != null ? (
                        <Text style={styles.recordsItem}>
                          Low {Math.round(selectedRecord.recordLowF)}°
                          {loYears.length ? ` (${loYears.join(', ')})` : ''}
                        </Text>
                      ) : null}

                      <Text style={styles.recordsItem}>
                        Rain {fmtRain(p)}
                        {showPrecipYears && prYears.length ? ` (${prYears.join(', ')})` : ''}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View style={styles.recordsBox}>
                    <Text style={styles.recordsTitle}>{recordsTitle}</Text>
                    <Text style={styles.recordsItem}>No record data for this date.</Text>
                  </View>
                );
              })()}

              <View style={styles.bottomNoteRow}>
                <Text style={styles.bottomNote}>{tile.footer}</Text>

                {tile.mode === 'forecast' && tile.precipChance != null ? (
                  <View style={styles.chancePill}>
                    <Text style={styles.chancePillText}>{Math.round(tile.precipChance)}% chance</Text>
                  </View>
                ) : null}
              </View>
            </Animated.View>
          </Card>
        ) : null}

        {canRenderChart ? (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <ClimatologyChart
              title="ALMANAC"
              normals={chartNormals}
              stationName={stationName ? `${stationName}` : undefined}
              normalsLabel={normalsLabel}
              selectedDoy={safeSelectedDoy}
              markerLabel={markerLabel}
              onSelectDoy={(doy: number) => {
                const year = Number(selectedIso.slice(0, 4));
                const iso = isoFromYearAndDoy(year, doy);
                setSelectedIso(iso);
              }}
              precipMonthlyIn={chartPrecip}
              lastYear={chartLastYear}
            />
          </View>
        ) : hasPlace && shouldLoadAreaAlmanac ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {normalsFailed ? 'Climate normals need a retry' : 'Downloading climate normals'}
            </Text>
            <Text style={styles.errorText}>
              {normalsFailed
                ? 'Climate normals could not be downloaded for this area. You can retry, or keep using forecasts and records.'
                : normalsLoading
                  ? 'Monthly normals are downloading for this area. First download can take a minute for a new climate station.'
                  : 'Download climate normals and records for this area to unlock the full Almanac chart.'}
            </Text>
            <Text style={styles.errorText}>
              Normals: {chartNormals.length} / 12 - DOY: {safeSelectedDoy}
            </Text>
            {normalsFailed ? (
              <View style={styles.actionRow}>
                <Pressable onPress={() => climo.refresh?.()} style={styles.btn}>
                  <Text style={styles.btnText}>Retry Normals</Text>
                </Pressable>
              </View>
            ) : null}
          </Card>
        ) : null}
        <View style={{ height: Math.max(24, insets.bottom) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  header: { marginBottom: theme.spacing.md },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  brandRight: { flexDirection: 'row', alignItems: 'center' },

  brandWordmark: { width: 92, height: 92, backgroundColor: 'transparent' },

  sub: { ...typography.subtitle, opacity: 0.75 },

  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 12 },

  metaRow: { marginTop: 10, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaPill: {
    flexGrow: 1,
    minWidth: 120,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  metaPillLabel: { fontSize: 11, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  metaPillValue: { marginTop: 4, fontSize: 13, color: 'white', fontWeight: '900' },

  domainPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  domainPillText: { fontSize: 11, fontWeight: '900', color: 'white' },

  helper: { marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.60)', fontWeight: '700' },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  small: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },
  errorTitle: { fontSize: 14, fontWeight: '900', color: 'white' },
  errorText: { marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: '700', lineHeight: 17 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  actionRowTight: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },

  btn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  btnText: { color: 'white', fontWeight: '900', fontSize: 12 },

  primaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.42)',
    backgroundColor: 'rgba(14,165,233,0.22)',
  },
  primaryBtnText: { color: 'white', fontWeight: '900', fontSize: 12 },

  dayCard: { marginBottom: theme.spacing.lg, paddingVertical: 14 },
  dayTopRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },

  daySmall: { fontSize: 11, opacity: 0.65, color: theme.colors.textSecondary, fontWeight: '900' },
  dayTitle: { marginTop: 2, fontSize: 20, color: 'white', fontWeight: '900' },
  daySub: { marginTop: 2, fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },

  normalPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    minWidth: 124,
    alignItems: 'flex-end',
  },
  normalPillLabel: { fontSize: 10, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '900' },
  normalPillValue: { marginTop: 2, fontSize: 13, color: 'white', fontWeight: '900' },

  navRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  navBtn: {
    width: 46,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  navBtnDisabled: { opacity: 0.35 },
  navBtnText: { color: 'white', fontWeight: '900', fontSize: 16 },

  todayBtn: {
    flex: 1,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  todayBtnText: { color: 'white', fontWeight: '900', fontSize: 13 },

  kpiRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  kpi: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  kpiLabel: { fontSize: 11, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '900' },
  kpiVal: { marginTop: 6, fontSize: 18, color: 'white', fontWeight: '900' },

  metaRow2: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: '700' },
  dot: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: '900' },

  recordsBox: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  recordsTitle: { fontSize: 11, opacity: 0.65, color: theme.colors.textSecondary, fontWeight: '900' },
  recordsItem: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.80)', fontWeight: '800' },
  recordsHint: { marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },

  progressTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressIndeterminate: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 120,
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(160,220,255,0.35)',
  },

  bottomNoteRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  bottomNote: { fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '700', flex: 1 },

  chancePill: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(160,220,255,0.18)',
    backgroundColor: 'rgba(160,220,255,0.08)',
  },
  chancePillText: { color: 'rgba(220,245,255,0.92)', fontWeight: '900', fontSize: 12 },
});
