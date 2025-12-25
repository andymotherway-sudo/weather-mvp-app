// app/buoy/[buoyId].tsx
// Buoy Detail – live NOAA obs for a single station

import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings } from '../context/SettingsContext';
import { useBuoyDetail } from '../lib/buoys/detailHooks';

function degToCompass(deg: number | null | undefined): string {
  if (deg == null || isNaN(deg)) return '—';
  const dirs = [
    'N', 'NNE', 'NE', 'ENE',
    'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW',
    'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round((deg % 360) / 22.5) % 16;
  return dirs[idx];
}

function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}° ${ns}, ${Math.abs(lon).toFixed(
    2,
  )}° ${ew}`;
}

function formatTemp(
  c: number | null | undefined,
  unit: 'F' | 'C',
): string {
  if (c == null) return '—';
  if (unit === 'C') return `${c.toFixed(1)} °C`;
  const f = (c * 9) / 5 + 32;
  return `${f.toFixed(1)} °F`;
}

export default function BuoyDetailScreen() {
  const { buoyId, name } = useLocalSearchParams<{
    buoyId?: string;
    name?: string;
  }>();

  const { tempUnit } = useSettings();

  const id = buoyId ?? '';
  const {
    data,
    loading,
    error,
    refreshing,
    refresh,
  } = useBuoyDetail(id);

  // simple guards
  if (!id) {
    return (
      <View style={styles.center}>
        <Text style={typography.body}>No buoy selected.</Text>
      </View>
    );
  }

  const displayName = name ?? data?.name ?? id;

  const waveFt =
    data?.waveHeightM != null ? data.waveHeightM * 3.28084 : null;
  const windKts = data?.windSpeedKts ?? null;
  const gustKts = data?.windGustKts ?? null;
  const windDirDeg = data?.windDirectionDeg ?? null;
  const windDir = degToCompass(windDirDeg ?? null);

  const waterTemp = formatTemp(data?.waterTempC, tempUnit);
  const airTemp = formatTemp(data?.airTempC, tempUnit);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={!!refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.header}>
        <Text style={typography.title}>{displayName}</Text>
        <Text style={typography.subtitle}>NOAA buoy · {id}</Text>
        {data && (
          <Text style={styles.meta}>
            {formatLatLon(data.lat, data.lon)}
          </Text>
        )}
        {data?.updatedAt && (
          <Text style={styles.meta}>
            Updated{' '}
            {new Date(data.updatedAt).toLocaleString()}
          </Text>
        )}
      </View>

      {loading && !data && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={typography.small}>Loading buoy data…</Text>
        </View>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {data && (
        <>
          {/* Sea state */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Sea State</Text>
            <Text style={styles.bigValue}>
              {waveFt != null ? `${waveFt.toFixed(1)} ft` : '—'}
            </Text>
            <Text style={styles.meta}>
              Significant wave height (Hs)
            </Text>
            {data.dominantPeriodSec != null && (
              <Text style={styles.meta}>
                Dominant period {data.dominantPeriodSec.toFixed(1)} s
              </Text>
            )}
          </Card>

          {/* Wind */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Wind</Text>
            <Text style={styles.valueLine}>
              {windKts != null
                ? `${windKts.toFixed(0)} kt`
                : '—'}{' '}
              {gustKts != null
                ? `(gust ${gustKts.toFixed(0)} kt)`
                : ''}
            </Text>
            <Text style={styles.meta}>
              Direction {windDir}{' '}
              {windDirDeg != null
                ? `(${Math.round(windDirDeg)}°)`
                : ''}
            </Text>
          </Card>

          {/* Temps & pressure */}
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Environment</Text>
            <Text style={styles.valueLine}>
              Water {waterTemp}
            </Text>
            <Text style={styles.valueLine}>
              Air {airTemp}
            </Text>
            {data.pressureHpa != null && (
              <Text style={styles.meta}>
                Pressure {data.pressureHpa.toFixed(1)} hPa
              </Text>
            )}
            {data.visibilityNm != null && (
              <Text style={styles.meta}>
                Visibility {data.visibilityNm.toFixed(1)} nm
              </Text>
            )}
          </Card>
        </>
      )}

      {!loading && !error && !data && (
        <View style={styles.center}>
          <Text style={typography.small}>
            No observations found for this buoy.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  meta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  errorCard: {
    backgroundColor: theme.colors.errorBg,
    borderColor: theme.colors.errorBg,
    marginBottom: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.errorText,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.errorText,
  },
  card: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  bigValue: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  valueLine: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
});
