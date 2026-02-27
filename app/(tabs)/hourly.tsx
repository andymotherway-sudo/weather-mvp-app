// app/(tabs)/hourly.tsx
// ✅ Drop-in replacement
// ✅ Keeps useLocations + branded header + charts
// ✅ Pull-to-refresh refreshes forecast when coords exist; otherwise re-tries GPS
// ✅ Removes "Show/Hide hourly details" (details always visible)
// ✅ Removes hidden "display:none" unused-warnings block

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocations } from '../lib/locations/useLocations';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';

import { OMNI_MARK_WORD } from '../lib/brand/assets';

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

function normalizeHourly(hourlyRaw: any[]) {
  return (hourlyRaw ?? []).map((h: any) => {
    const pressureHpa =
      safeNum(h.pressure_msl) ??
      safeNum(h.pressureMslHpa) ??
      safeNum(h.surface_pressure) ??
      safeNum(h.pressureSurfaceHpa) ??
      safeNum(h.pressure_hpa) ??
      safeNum(h.pressureHpa) ??
      null;

    return { ...h, pressureHpa };
  });
}

function HourlyWithCoords({
  coords,
  onRefreshingChange,
  setRefreshFn,
}: {
  coords: { lat: number; lon: number };
  onRefreshingChange: (refreshing: boolean) => void;
  setRefreshFn: (fn: null | (() => void)) => void;
}) {
  const units: UnitSystem = 'us';

  const { data, loading, error, refreshing, refresh } = useOpenMeteoForecast({
    lat: coords.lat,
    lon: coords.lon,
    days: 5,
  });

  // Let parent RefreshControl reflect actual refresh state
  useEffect(() => {
    onRefreshingChange(!!refreshing);
  }, [refreshing, onRefreshingChange]);

  // Give parent a callable refresh fn (or clear it)
  useEffect(() => {
    setRefreshFn(refresh ? () => refresh() : null);
    return () => setRefreshFn(null);
  }, [refresh, setRefreshFn]);

  const hourlyRaw: any[] = data?.hourly ?? [];

  const hourly = useMemo(() => normalizeHourly(hourlyRaw), [hourlyRaw]);

  if (loading && !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.small}>Loading hourly forecast…</Text>
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

  if (!hourly.length) return null;

  return (
    <>
      <HourlyCharts72h hours={hourly} maxHours={72} units={units} initialPanel="range" />
      <NerdyHourlyTimeline hours={hourly} maxHours={72} />
    </>
  );
}

export default function HourlyTab() {
  const insets = useSafeAreaInsets();
  const { activeCoords, activeLabel, state: locState, refreshCurrentLocation } = useLocations();



  const coords = useMemo(() => activeCoords ?? null, [activeCoords]);

  const locationLabel = useMemo(() => {
    const raw = (activeLabel ?? '').trim();
    if (raw) return raw;
    return coords ? `Current location (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)})` : 'Getting location…';
  }, [activeLabel, coords]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshFnRef = useRef<null | (() => void)>(null);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(theme.spacing.md, Math.round(insets.top * 0.25)) },
        ]}
        refreshControl={<RefreshControl refreshing={!!isRefreshing} onRefresh={onPullToRefresh} />}
      >
        {/* Header aligned with Land */}
        <View style={styles.header}>
          <Image source={OMNI_MARK_WORD} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.title}>Hourly</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {locationLabel}
          </Text>
        </View>

        {!coords ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Getting your location…</Text>
            <Text style={styles.errorText}>Enable GPS or pick a place in Land Wx.</Text>
            <View style={{ marginTop: 12 }}>
              <Pressable onPress={refreshCurrentLocation} style={styles.retryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          <HourlyWithCoords
            coords={coords}
            onRefreshingChange={setIsRefreshing}
            setRefreshFn={setRefreshFn}
          />
        )}

        <View style={{ height: Math.max(24, insets.bottom) }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  header: { marginBottom: theme.spacing.md },
  wordmark: { width: 92, height: 92, marginBottom: 6 },
  title: { ...typography.title },
  sub: { ...typography.subtitle, opacity: 0.75 },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  small: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: {
    backgroundColor: theme.colors.errorBg,
    borderColor: theme.colors.errorBg,
    marginBottom: theme.spacing.lg,
  },
  errorTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.errorText, marginBottom: 4 },
  errorText: { fontSize: 13, color: theme.colors.errorText },

  retryBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  retryText: { color: 'white', fontWeight: '900', fontSize: 12, opacity: 0.9 },
});