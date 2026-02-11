// app/(tabs)/climo.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlace } from '../context/PlaceContext';

import { useOpenMeteoDayContext } from '../lib/almanac/dayContextHook';
import { useDailyRecords } from '../lib/almanac/useDailyRecordsHook';
import { useClimatologyNormals } from '../lib/climatology/hook';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';

import ClimatologyChart from '../../components/land/ClimatologyChart';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

const OMNI_MARK = require('../../assets/brand/omniwx-mark.png');

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
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function isoToDoy(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / DAY_MS); // 1..366
}

function fmtDow(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

function fmtMonDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtTemp(v: number | null | undefined) {
  return v == null ? '—' : `${Math.round(v)}°`;
}

function fmtRain(v: number | null | undefined) {
  if (v == null) return '—';
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
  const m = new Date(`${iso}T12:00:00`).getMonth() + 1;
  const found = normals.find((x) => x.month === m);
  return {
    normalHiF: found?.tmaxF ?? null,
    normalLoF: found?.tminF ?? null,
    normalAvgF: found?.tavgF ?? null,
  };
}

function fmtElapsed(s: number) {
  if (!Number.isFinite(s) || s <= 0) return '';
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

/* ---------------- component ---------------- */

export default function ClimoTab() {
  const insets = useSafeAreaInsets();

  // ✅ single source of truth
  const { active } = usePlace();
  const hasPlace = !!active;

  const coords = useMemo(() => {
    return active ? { lat: active.lat, lon: active.lon } : null;
  }, [active?.lat, active?.lon]);

  const locationLabel = useMemo(() => {
    return active ? active.name : 'Select a location…';
  }, [active]);

  /* ---------- date navigation ---------- */

  const todayIso = useMemo(() => isoTodayLocal(), []);
  const [selectedIso, setSelectedIso] = useState(todayIso);

  const minSelectable = OBS_START_ISO;
  const maxSelectable = useMemo(() => `${todayIso.slice(0, 4)}-12-31`, [todayIso]);

  const canBack = selectedIso > minSelectable;
  const canFwd = selectedIso < maxSelectable;

  const bumpDay = useCallback(
    (delta: number) => {
      setSelectedIso((cur) => {
        const next = addDaysIso(cur, delta);
        if (next < minSelectable) return minSelectable;
        if (next > maxSelectable) return maxSelectable;
        return next;
      });
    },
    [maxSelectable]
  );

  const jumpToday = useCallback(() => setSelectedIso(todayIso), [todayIso]);

  /* ---------- data hooks ---------- */

  const climo = useClimatologyNormals({
    lat: coords?.lat ?? 0,
    lon: coords?.lon ?? 0,
    enabled: hasPlace,
    preferCache: true,
  });

  const forecast = useOpenMeteoForecast({
    lat: coords?.lat ?? 0,
    lon: coords?.lon ?? 0,
    days: FORECAST_DAYS,
  });

  const forecastByDate = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of forecast.data?.daily ?? []) m.set(d.date, d);
    return m;
  }, [forecast.data?.daily]);

  const yesterdayIso = useMemo(() => addDaysIso(todayIso, -1), [todayIso]);
  const lastForecastIso = useMemo(() => addDaysIso(todayIso, FORECAST_DAYS - 1), [todayIso]);

  const mode = useMemo<'observed' | 'forecast' | 'normals'>(() => {
    if (selectedIso <= yesterdayIso) return 'observed';
    if (selectedIso >= todayIso && selectedIso <= lastForecastIso && forecastByDate.has(selectedIso)) return 'forecast';
    return 'normals';
  }, [selectedIso, yesterdayIso, todayIso, lastForecastIso, forecastByDate]);

  const dayCtx = useOpenMeteoDayContext({
    lat: coords?.lat ?? 0,
    lon: coords?.lon ?? 0,
    date: selectedIso,
    enabled: hasPlace && mode === 'observed',
    preferCache: true,
  });

  /* ---------- records (with "first-load gate" + one-shot auto-retry) ---------- */

  const records = useDailyRecords({
    lat: coords?.lat ?? 0,
    lon: coords?.lon ?? 0,
    enabled: hasPlace,
  });

  const recordsMap = (records as any)?.records ?? null;

  const selectedRecord = useMemo(() => {
    const key = `${selectedIso.slice(5, 7)}-${selectedIso.slice(8, 10)}`; // "MM-DD"
    return recordsMap?.[key] ?? null;
  }, [recordsMap, selectedIso]);

  // Track "did records ever resolve" so we don't show "No record data" while still warming up.
  const [recordsEverResolved, setRecordsEverResolved] = useState(false);

  // One-shot auto retry to handle occasional first-call empties / races.
  const [recordsAutoRetried, setRecordsAutoRetried] = useState(false);

  useEffect(() => {
    // reset when location changes
    setRecordsEverResolved(false);
    setRecordsAutoRetried(false);
  }, [coords?.lat, coords?.lon]);

  useEffect(() => {
    const loading = !!(records as any)?.loading;
    const err = (records as any)?.error;
    const map = (records as any)?.records;
    if (!loading && (err || map)) setRecordsEverResolved(true);
  }, [(records as any)?.loading, (records as any)?.error, (records as any)?.records]);

  useEffect(() => {
    if (!hasPlace) return;

    const loading = !!(records as any)?.loading;
    const map = (records as any)?.records;
    const empty = !map || (typeof map === 'object' && Object.keys(map).length === 0);

    if (loading) return;
    if (!empty) return;
    if (recordsAutoRetried) return;

    setRecordsAutoRetried(true);
    const t = setTimeout(() => (records as any)?.refresh?.(), 700);
    return () => clearTimeout(t);
  }, [hasPlace, recordsAutoRetried, (records as any)?.loading, (records as any)?.records]);

  /* ---------- Records UX: elapsed timer + animated progress bar ---------- */

  const rLoading = !!(records as any)?.loading;
  const rErr = (records as any)?.error;
  const rMap = (records as any)?.records;
  const rEmpty = !rMap || (typeof rMap === 'object' && Object.keys(rMap).length === 0);

  const [recordsStartedAt, setRecordsStartedAt] = useState<number | null>(null);
  const [recordsElapsedSec, setRecordsElapsedSec] = useState(0);

  useEffect(() => {
    // reset on location change
    setRecordsStartedAt(null);
    setRecordsElapsedSec(0);
  }, [coords?.lat, coords?.lon]);

  useEffect(() => {
    if (rLoading) {
      setRecordsStartedAt((cur) => cur ?? Date.now());
      return;
    }
    // when loading ends, freeze the elapsed time (keep it displayed if we show retry messaging)
  }, [rLoading]);

  useEffect(() => {
    if (!recordsStartedAt) return;
    const id = setInterval(() => {
      setRecordsElapsedSec((_) => Math.max(0, (Date.now() - recordsStartedAt) / 1000));
    }, 400);
    return () => clearInterval(id);
  }, [recordsStartedAt]);

  // Animated indeterminate bar (subtle movement)
  const progAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(rLoading || (!recordsEverResolved && hasPlace))) {
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
  }, [progAnim, rLoading, recordsEverResolved, hasPlace]);

  const recordsStatus = useMemo(() => {
    const elapsed = fmtElapsed(recordsElapsedSec);
    const suffix = elapsed ? ` • ${elapsed}` : '';

    // Warm-up (first response hasn't landed yet)
    if (!recordsEverResolved) {
      // More confident copy after a few seconds
      if (recordsElapsedSec >= 10) return `Still working on NOAA records…${suffix}`;
      return `Fetching NOAA records…${suffix}`;
    }

    // Actively loading again
    if (rLoading) {
      if (recordsAutoRetried) return `NOAA is slow — retrying automatically…${suffix}`;
      if (recordsElapsedSec >= 12) return `Still working on NOAA records…${suffix}`;
      return `Loading records…${suffix}`;
    }

    // Past warm-up but ended empty (your one-shot retry can cause this briefly)
    if (!rLoading && rEmpty && recordsAutoRetried) {
      return `NOAA is slow — retrying automatically…${suffix}`;
    }

    return '';
  }, [recordsEverResolved, rLoading, rEmpty, recordsAutoRetried, recordsElapsedSec]);

  const recordsHint = useMemo(() => {
    // A calm, steady reassurance line (only while loading/warming up)
    if (!hasPlace) return '';
    if (!recordsEverResolved || rLoading || (!rLoading && rEmpty && recordsAutoRetried)) {
      return 'First load can take a bit — we’ll keep trying.';
    }
    return '';
  }, [hasPlace, recordsEverResolved, rLoading, rEmpty, recordsAutoRetried]);

  /* ---------- refresh on place change (tabs stay mounted) ---------- */
  useEffect(() => {
    if (!hasPlace) return;
    climo.refresh();
    forecast.refresh();
    (records as any).refresh?.();
    if (mode === 'observed') dayCtx.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lon]);

  /* ---------- meta display ---------- */

  const stationName = useMemo(() => climo.data?.station?.name ?? undefined, [climo.data?.station?.name]);
  const normalsCount = climo.data?.normals?.length ?? 0;
  const updatedLabel = useMemo(() => fmtUpdatedFromIso(climo.data?.fetchedAtIso), [climo.data?.fetchedAtIso]);

  const normalsForSelected = useMemo(() => {
    const normals = climo.data?.normals ?? [];
    return approxMonthlyNormalForDate(normals as any, selectedIso);
  }, [climo.data?.normals, selectedIso]);

  /* ---------- build tile ---------- */

  const tile = useMemo(() => {
    const base = {
      title: `${fmtDow(selectedIso)} • ${fmtMonDay(selectedIso)}`,
      station: stationName ?? '—',
      normalHi: normalsForSelected.normalHiF,
      normalLo: normalsForSelected.normalLoF,
    };

    if (mode === 'observed') {
      const hi = (dayCtx.data as any)?.tempMaxF ?? null;
      const lo = (dayCtx.data as any)?.tempMinF ?? null;

      return {
        ...base,
        mode,
        hi,
        lo,
        rain: dayCtx.data?.precipTotalIn ?? null,
        precipChance: null as number | null,
        condition: dayCtx.data?.conditionLabel ?? '—',
        cloudMin: dayCtx.data?.cloudMinPct ?? null,
        cloudMax: dayCtx.data?.cloudMaxPct ?? null,
        windMax: dayCtx.data?.windMaxMph ?? null,
        footer: 'Observed: Open-Meteo Archive • Normals: NOAA',
      };
    }

    if (mode === 'forecast') {
      const f: any = forecastByDate.get(selectedIso);

      return {
        ...base,
        mode,
        hi: f?.tempMaxF ?? null,
        lo: f?.tempMinF ?? null,
        rain: (f?.precipTotalIn ?? null) as number | null,
        precipChance: f?.precipProbMaxPct ?? null,
        condition: 'Forecast conditions',
        cloudMin: typeof f?.cloudCoverMinPct === 'number' ? f.cloudCoverMinPct : null,
        cloudMax: typeof f?.cloudCoverMaxPct === 'number' ? f.cloudCoverMaxPct : null,
        windMax: typeof f?.windMaxMph === 'number' ? f.windMaxMph : null,
        footer: 'Forecast: Open-Meteo • Normals: NOAA',
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
      footer: 'Normals: NOAA (monthly)',
    };
  }, [
    selectedIso,
    stationName,
    normalsForSelected.normalHiF,
    normalsForSelected.normalLoF,
    mode,
    dayCtx.data,
    forecastByDate,
  ]);

  /* ---------- refresh ---------- */

  const onRefreshAll = useCallback(() => {
    if (!hasPlace) return;
    climo.refresh();
    forecast.refresh();
    if (mode === 'observed') dayCtx.refresh();
    (records as any).refresh?.();
  }, [climo, forecast, mode, dayCtx, records, hasPlace]);

  const anyLoading =
    hasPlace &&
    ((climo.loading && !climo.data) ||
      (forecast.loading && !forecast.data) ||
      (mode === 'observed' && dayCtx.loading && !dayCtx.data));

  const anyRefreshing =
    hasPlace &&
    (!!climo.refreshing || !!forecast.refreshing || !!dayCtx.refreshing || !!(records as any).refreshing);

  const markerLabel = useMemo(() => (selectedIso === todayIso ? 'Today' : fmtMonDay(selectedIso)), [selectedIso, todayIso]);
  const selectedDoy = useMemo(() => isoToDoy(selectedIso), [selectedIso]);

  const recordsTitle = useMemo(() => {
    const name = (records as any)?.stationNameUsed;
    return name ? `Records (${name})` : 'Records (nearby major station)';
  }, [records]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(theme.spacing.md, Math.round(insets.top * 0.25)) },
        ]}
        refreshControl={<RefreshControl refreshing={!!anyRefreshing} onRefresh={onRefreshAll} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandLeft}>
              <Image source={OMNI_MARK} style={styles.brandMark} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>
                  ALMANAC<Text style={styles.sup}>wx</Text>
                </Text>
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

          {/* Meta pills */}
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
          </View>

          <Text style={styles.helper} numberOfLines={2}>
            Single-tile day navigator: observed context (since {OBS_START_ISO}) • forecast window • seasonal averages.
          </Text>
        </View>

        {/* No place selected */}
        {!hasPlace ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Select a location</Text>
            <Text style={styles.errorText}>
              Go to Land Wx and pick a location (or enable GPS). Almanac will update automatically.
            </Text>
          </Card>
        ) : null}

        {/* Loading */}
        {anyLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.small}>Loading almanac…</Text>
          </View>
        ) : null}

        {/* Errors */}
        {climo.error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Normals unavailable</Text>
            <Text style={styles.errorText}>{climo.error}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={climo.refresh} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
              {!climo.hasToken ? (
                <View style={styles.hintBox}>
                  <Text style={styles.hintText}>
                    Add <Text style={{ fontWeight: '900' }}>EXPO_PUBLIC_NOAA_NCEI_TOKEN</Text> to enable NOAA normals.
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {forecast.error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Forecast unavailable</Text>
            <Text style={styles.errorText}>{forecast.error}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={forecast.refresh} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {dayCtx.error && mode === 'observed' ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Observed day unavailable</Text>
            <Text style={styles.errorText}>{dayCtx.error}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={dayCtx.refresh} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {(records as any).error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Records unavailable</Text>
            <Text style={styles.errorText}>{(records as any).error}</Text>
            <View style={styles.actionRow}>
              <Pressable onPress={() => (records as any).refresh?.()} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}

        {/* Day tile */}
        {hasPlace ? (
          <Card style={styles.dayCard}>
            <View style={styles.dayTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.daySmall}>Day brief</Text>
                <Text style={styles.dayTitle}>{tile.title}</Text>
                <Text style={styles.daySub}>Station • {tile.station}</Text>
              </View>

              <View style={styles.normalPill}>
                <Text style={styles.normalPillLabel}>Normal</Text>
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
                <Text style={styles.kpiVal}>{fmtTemp((tile as any).hi)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Low</Text>
                <Text style={styles.kpiVal}>{fmtTemp((tile as any).lo)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>Rain</Text>
                <Text style={styles.kpiVal}>{fmtRain((tile as any).rain)}</Text>
              </View>
            </View>

            <View style={styles.metaRow2}>
              <Text style={styles.metaText}>{(tile as any).condition}</Text>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.metaText}>
                {(tile as any).cloudMin != null && (tile as any).cloudMax != null
                  ? `Cloud ${Math.round((tile as any).cloudMin)}–${Math.round((tile as any).cloudMax)}%`
                  : 'Cloud —'}
              </Text>
              <Text style={styles.dot}>•</Text>
              <Text style={styles.metaText}>
                {(tile as any).windMax != null ? `Wind ${Math.round((tile as any).windMax)} mph` : 'Wind —'}
              </Text>
            </View>

            {/* Records */}
            {(() => {
              // While warming up, show a reassuring loader instead of “No record data”.
              const showWarmup = !recordsEverResolved || (rLoading && !recordsEverResolved);

              if (showWarmup || rLoading || (!rLoading && rEmpty && recordsAutoRetried)) {
                return (
                  <View style={styles.recordsBox}>
                    <Text style={styles.recordsTitle}>Records</Text>
                    <Text style={styles.recordsItem}>{recordsStatus || 'Loading records…'}</Text>
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
                                  outputRange: [-120, 220], // tune for typical phone widths
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

              // Past warm-up: error/empty -> friendlier state + Retry
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

              // Data available
              if (selectedRecord) {
                return (
                  <View style={styles.recordsBox}>
                    <Text style={styles.recordsTitle}>{recordsTitle}</Text>

                    {selectedRecord.recordHighF != null ? (
                      <Text style={styles.recordsItem}>
                        High {Math.round(selectedRecord.recordHighF)}°
                        {selectedRecord.recordHighYears?.length ? ` (${selectedRecord.recordHighYears.join(', ')})` : ''}
                      </Text>
                    ) : null}

                    {selectedRecord.recordLowF != null ? (
                      <Text style={styles.recordsItem}>
                        Low {Math.round(selectedRecord.recordLowF)}°
                        {selectedRecord.recordLowYears?.length ? ` (${selectedRecord.recordLowYears.join(', ')})` : ''}
                      </Text>
                    ) : null}

                    {selectedRecord.recordPrecipIn != null ? (
                      <Text style={styles.recordsItem}>
                        Rain {selectedRecord.recordPrecipIn.toFixed(2)}″
                        {selectedRecord.recordPrecipYears?.length ? ` (${selectedRecord.recordPrecipYears.join(', ')})` : ''}
                      </Text>
                    ) : null}
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
              <Text style={styles.bottomNote}>{(tile as any).footer}</Text>

              {(tile as any).mode === 'forecast' && (tile as any).precipChance != null ? (
                <View style={styles.chancePill}>
                  <Text style={styles.chancePillText}>{Math.round((tile as any).precipChance)}% chance</Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {/* Curve */}
        {hasPlace && climo.data?.normals?.length ? (
          <ClimatologyChart
            title="ALMANAC"
            normals={climo.data.normals}
            stationName={stationName ? `${stationName}` : undefined}
            selectedDoy={selectedDoy}
            markerLabel={markerLabel}
          />
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
  brandMark: { width: 28, height: 28, borderRadius: 8 },
  brandRight: { flexDirection: 'row', alignItems: 'center' },

  title: { ...typography.title },
  sup: { fontSize: 11, fontWeight: '900', opacity: 0.85, lineHeight: 18 },
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

  hintBox: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(160, 220, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(160, 220, 255, 0.14)',
    flex: 1,
    minWidth: 180,
  },
  hintText: { color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 12, lineHeight: 16 },

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
    minWidth: 112,
    alignItems: 'flex-end',
  },
  normalPillLabel: { fontSize: 11, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  normalPillValue: { marginTop: 3, fontSize: 13, color: 'white', fontWeight: '900' },

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

  // progress bar (animated indeterminate)
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