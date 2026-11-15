// app/buoy/[buoyId].tsx
// Buoy Detail – live NOAA obs for a single station

import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { OmniStatusCard } from '../../components/common/OmniStatusCard';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings } from '../context/SettingsContext';
import { useBuoyDetail } from '../lib/buoys/detailHooks';
import { useAppChrome } from '../lib/theme/useAppChrome';

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
  const { chrome } = useAppChrome();

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
      <View style={[styles.container, { backgroundColor: chrome.background }]}>
        <View style={styles.content}>
          <OmniStatusCard
            tone="empty"
            title="No buoy selected"
            message="Choose a buoy from Nautical or Maps to view live observations."
          />
        </View>
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
      style={[styles.container, { backgroundColor: chrome.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={!!refreshing} onRefresh={refresh} />
      }
    >
      <View style={styles.header}>
        <Text style={[typography.title, { color: chrome.textPrimary }]}>{displayName}</Text>
        <Text style={[typography.subtitle, { color: chrome.textSecondary }]}>NOAA buoy · {id}</Text>
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
        <OmniStatusCard
          tone="loading"
          title="Loading buoy observations"
          message={`Requesting the latest available report for ${id}.`}
        />
      )}

      {error && (
        <OmniStatusCard
          tone="error"
          title="Buoy observations unavailable"
          message={error}
          actionLabel="Try again"
          onAction={refresh}
        />
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
        <OmniStatusCard
          tone="empty"
          title="No observations found"
          message="This buoy did not return a current observation. The station may be offline or between reports."
          actionLabel="Try again"
          onAction={refresh}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
