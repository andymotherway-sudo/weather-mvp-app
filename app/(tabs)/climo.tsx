// app/(tabs)/climo.tsx
import React, { useEffect, useMemo } from 'react';
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
import { DEFAULT_LOCATION } from '../lib/weather/locations';

// ✅ Your tree shows app/lib/climatology/useClimatology.ts (not "hook")
import { useClimatologyNormals } from '../lib/climatology/hook';

import ClimatologyChart from '../../components/land/ClimatologyChart';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

export default function ClimoTab() {
  const insets = useSafeAreaInsets();
  const { activeCoords, activeLabel, refreshCurrentLocation } = useLocations();

  useEffect(() => {
    refreshCurrentLocation();
  }, [refreshCurrentLocation]);

  const coords = useMemo(() => {
    if (activeCoords) return activeCoords;
    return { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon };
  }, [activeCoords]);

  const locationLabel = useMemo(() => {
    if (activeCoords) return activeLabel;
    return `${DEFAULT_LOCATION.name}${DEFAULT_LOCATION.region ? `, ${DEFAULT_LOCATION.region}` : ''}`;
  }, [activeCoords, activeLabel]);

  const { data, loading, error, refresh, hasToken, refreshing } = useClimatologyNormals({
    lat: coords.lat,
    lon: coords.lon,
    enabled: true,
    preferCache: true,
  });

  const stationName = useMemo(() => data?.station?.name ?? undefined, [data?.station?.name]);
  const normalsCount = data?.normals?.length ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          // ✅ extra safety on Android status bar overlays
          { paddingTop: Math.max(theme.spacing.md, Math.round(insets.top * 0.25)) },
        ]}
        refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Climatology</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {locationLabel}
          </Text>

          {/* Small meta row */}
          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Station</Text>
              <Text style={styles.metaPillValue} numberOfLines={1}>
                {stationName ?? '—'}
              </Text>
            </View>

            <View style={styles.metaPill}>
              <Text style={styles.metaPillLabel}>Normals</Text>
              <Text style={styles.metaPillValue}>{normalsCount ? `${normalsCount} mo` : '—'}</Text>
            </View>
          </View>
        </View>

        {loading && !data ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={styles.small}>Loading NOAA normals…</Text>
          </View>
        ) : null}

        {error ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Climatology unavailable</Text>
            <Text style={styles.errorText}>{error}</Text>

            <View style={styles.actionRow}>
              <Pressable onPress={refresh} style={styles.btn}>
                <Text style={styles.btnText}>Retry</Text>
              </Pressable>

              {!hasToken ? (
                <View style={styles.hintBox}>
                  <Text style={styles.hintText}>
                    Add <Text style={{ fontWeight: '900' }}>EXPO_PUBLIC_NOAA_NCEI_TOKEN</Text> to enable NOAA normals.
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {data?.normals?.length ? (
          <ClimatologyChart
            title="Climatology"
            normals={data.normals}
            stationName={stationName ? `${stationName}` : undefined}
          />
        ) : null}

        {/* ✅ bottom breathing room above tab bar */}
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

  metaRow: { marginTop: 10, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  metaPill: {
    flexGrow: 1,
    minWidth: 160,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  metaPillLabel: { fontSize: 11, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  metaPillValue: { marginTop: 4, fontSize: 13, color: 'white', fontWeight: '900' },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  small: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' },
  errorTitle: { fontSize: 14, fontWeight: '900', color: 'white' },
  errorText: { marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: '700', lineHeight: 17 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
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
});
