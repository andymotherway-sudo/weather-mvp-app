// app/(tabs)/extremes.tsx
// Global buoy extremes: biggest waves, strongest winds, warmest/coldest water

import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings } from '../context/SettingsContext';
import { useAllBuoyDetails } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';

const MAX_ROWS = 10;

type Severity = 'calm' | 'moderate' | 'rough' | 'extreme';

function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}° ${ns}, ${Math.abs(lon).toFixed(
    1,
  )}° ${ew}`;
}

function formatTemp(valueC: number | null | undefined, unit: 'F' | 'C') {
  if (valueC == null) return '—';
  if (unit === 'C') {
    return `${valueC.toFixed(1)} °C`;
  }
  const f = (valueC * 9) / 5 + 32;
  return `${f.toFixed(1)} °F`;
}

// Same severity logic as buoy-map
function getSeverity(
  waveM: number | null | undefined,
  windKts: number | null | undefined,
): Severity {
  const ft = waveM != null ? waveM * 3.28084 : null;
  const w = windKts ?? 0;

  if ((ft == null || ft < 3) && w < 15) return 'calm';
  if ((ft != null && ft < 6) && w < 25) return 'moderate';
  if ((ft != null && ft < 10) || w < 35) return 'rough';
  return 'extreme';
}

function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'calm':
      return '#22c55e'; // green
    case 'moderate':
      return '#eab308'; // yellow
    case 'rough':
      return '#f97316'; // orange
    case 'extreme':
      return '#ef4444'; // red
    default:
      return '#6b7280';
  }
}

function getSeverityLabel(severity: Severity): string {
  switch (severity) {
    case 'calm':
      return 'Calm';
    case 'moderate':
      return 'Moderate';
    case 'rough':
      return 'Rough';
    case 'extreme':
      return 'Extreme';
    default:
      return 'Unknown';
  }
}

function Section({
  title,
  subtitle,
  items,
  renderValue,
}: {
  title: string;
  subtitle: string;
  items: BuoyDetailData[];
  renderValue: (b: BuoyDetailData) => string;
}) {
  const router = useRouter();

  if (!items.length) return null;

  return (
    <Card style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>

      {items.map((b, idx) => {
        const waveM = b.waveHeightM ?? null;
        const windKts = b.windSpeedKts ?? null;
        const severity = getSeverity(waveM, windKts);
        const severityColor = getSeverityColor(severity);
        const severityLabel = getSeverityLabel(severity);

        return (
          <Pressable
            key={b.id}
            onPress={() =>
              router.push({
                pathname: '/buoy-map',
                params: { buoyId: b.id, name: b.name ?? b.id },
              })
            }
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: '#020617' },
            ]}
          >
            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{idx + 1}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.buoyName}>{b.name ?? b.id}</Text>
              <Text style={styles.buoyMeta}>{formatLatLon(b.lat, b.lon)}</Text>
              {b.updatedAt && (
                <Text style={styles.buoyMetaSmall}>
                  Updated {new Date(b.updatedAt).toLocaleTimeString()}
                </Text>
              )}
            </View>

            {/* Severity pill */}
            <View style={[styles.severityPill, { borderColor: severityColor }]}>
              <View
                style={[
                  styles.severityDot,
                  { backgroundColor: severityColor },
                ]}
              />
              <Text style={styles.severityLabel}>{severityLabel}</Text>
            </View>

            <Text style={styles.valueText}>{renderValue(b)}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

export default function ExtremesScreen() {
  const { tempUnit } = useSettings();

  const { data, loading, error } = useAllBuoyDetails();
  const buoys: BuoyDetailData[] = data ?? [];

  const withWaves = buoys
    .filter((b) => b.waveHeightM != null)
    .sort((a, b) => (b.waveHeightM ?? 0) - (a.waveHeightM ?? 0))
    .slice(0, MAX_ROWS);

  const withWind = buoys
    .filter((b) => b.windSpeedKts != null)
    .sort((a, b) => (b.windSpeedKts ?? 0) - (a.windSpeedKts ?? 0))
    .slice(0, MAX_ROWS);

  const withWarmWater = buoys
    .filter((b) => b.waterTempC != null)
    .sort((a, b) => (b.waterTempC ?? -Infinity) - (a.waterTempC ?? -Infinity))
    .slice(0, MAX_ROWS);

  const withColdWater = buoys
    .filter((b) => b.waterTempC != null)
    .sort((a, b) => (a.waterTempC ?? Infinity) - (b.waterTempC ?? Infinity))
    .slice(0, MAX_ROWS);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={typography.title}>Extremes</Text>
        <Text style={typography.subtitle}>
          Biggest seas, strongest winds, and most extreme water temps
        </Text>
      </View>

      {loading && !data && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={typography.small}>Scanning global buoys…</Text>
        </View>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {!loading && !error && (
        <>
          <Section
            title="Highest Waves"
            subtitle="Significant wave height (Hs)"
            items={withWaves}
            renderValue={(b) =>
              b.waveHeightM != null
                ? `${(b.waveHeightM * 3.28084).toFixed(1)} ft`
                : '—'
            }
          />

          <Section
            title="Strongest Winds"
            subtitle="Sustained wind speed"
            items={withWind}
            renderValue={(b) =>
              b.windSpeedKts != null
                ? `${b.windSpeedKts.toFixed(0)} kt`
                : '—'
            }
          />

          <Section
            title="Warmest Water"
            subtitle="Sea surface temperature"
            items={withWarmWater}
            renderValue={(b) => formatTemp(b.waterTempC, tempUnit)}
          />

          <Section
            title="Coldest Water"
            subtitle="Sea surface temperature"
            items={withColdWater}
            renderValue={(b) => formatTemp(b.waterTempC, tempUnit)}
          />
        </>
      )}

      {!loading && !error && !buoys.length && (
        <View style={styles.center}>
          <Text style={typography.small}>
            No buoy data available right now.
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
  center: {
    marginTop: theme.spacing['2xl'],
    alignItems: 'center',
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
  sectionCard: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
  },
  rankCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  buoyName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  buoyMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  buoyMetaSmall: {
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#f97316',
    marginLeft: 8,
  },
  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    marginHorizontal: 6,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  severityLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
});
