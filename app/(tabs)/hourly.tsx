// app/(tabs)/hourly.tsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { DEFAULT_LOCATION } from '../lib/weather/locations';

import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';
import { NerdyHourlyTimeline } from '../../components/land/NerdyHourlyTimeline';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

type UnitSystem = 'us' | 'metric';

export default function HourlyTab() {
  const insets = useSafeAreaInsets();
  const units: UnitSystem = 'us';
  const [showDetails, setShowDetails] = useState(false);

  // ✅ Pull global location state (so it matches Land)
  const { activeCoords, activeLabel, state: locState, refreshCurrentLocation } = useLocations();

  // ✅ Only refresh GPS if the user is actually on "current" (avoid stomping favorites)
  useEffect(() => {
    if (locState.active.kind === 'current') {
      refreshCurrentLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locState.active.kind]);

  const coords = useMemo(() => {
    if (activeCoords) return activeCoords;
    return { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon };
  }, [activeCoords]);

  const locationLabel = useMemo(() => {
  const raw = (activeCoords ? activeLabel : '')?.trim();
  if (raw && raw.toLowerCase() !== 'current location') return raw;

  // fallback: show coordinates so it’s never misleading
  const c = activeCoords ?? { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon };
  return `Current location (${c.lat.toFixed(2)}, ${c.lon.toFixed(2)})`;
}, [activeCoords, activeLabel]);

  // ✅ Always request enough days to cover 72h cleanly, regardless of "day edge"
  // (Open-Meteo can return partial-day hourly sets depending on run/time)
  const { data, loading, error, refreshing, refresh } = useOpenMeteoForecast({
    lat: coords.lat,
    lon: coords.lon,
    days: 5,
  });

  const hourly = data?.hourly ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(theme.spacing.md, Math.round(insets.top * 0.25)) },
        ]}
        refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Hourly</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {locationLabel}
          </Text>

          {hourly.length ? (
            <Text style={styles.hint}>72h panels • tap panels to switch • optional nerdy timeline</Text>
          ) : null}
        </View>

        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.small}>Loading hourly forecast…</Text>
          </View>
        ) : null}

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {hourly.length ? (
          <>
            <HourlyCharts72h hours={hourly} maxHours={72} units={units} initialPanel="temp" />

            <View style={{ marginTop: theme.spacing.sm }}>
              <Pressable onPress={() => setShowDetails((v) => !v)} style={styles.toggleBtn}>
                <Text style={styles.toggleText}>{showDetails ? 'Hide hourly details' : 'Show hourly details'}</Text>
              </Pressable>
            </View>

            {showDetails ? <NerdyHourlyTimeline hours={hourly} maxHours={72} /> : null}
          </>
        ) : null}

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
  title: { ...typography.title },
  sub: { ...typography.subtitle, opacity: 0.75 },
  hint: { marginTop: 6, color: 'rgba(255,255,255,0.65)', fontWeight: '800', fontSize: 12 },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  small: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBg, marginBottom: theme.spacing.lg },
  errorTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.errorText, marginBottom: 4 },
  errorText: { fontSize: 13, color: theme.colors.errorText },

  toggleBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  toggleText: { color: 'white', fontWeight: '900', fontSize: 12, opacity: 0.9 },
});
