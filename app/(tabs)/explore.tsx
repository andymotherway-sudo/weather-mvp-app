// app/(tabs)/explore.tsx
// Buoy Explorer – list of buoys with live risk badges and NOAA obs

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
import { useAllBuoyDetails } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';

// Live risk heuristic based on wave height + wind
function getLiveRisk(
  waveM: number | null | undefined,
  windKts: number | null | undefined,
): { level: 'Low' | 'Moderate' | 'High'; label: string } {
  if (waveM == null && windKts == null) {
    return { level: 'Low', label: 'No recent obs' };
  }

  const ft = waveM != null ? waveM * 3.28084 : null;
  const w = windKts ?? 0;

  if ((ft == null || ft < 3) && w < 15) {
    return { level: 'Low', label: 'Generally calm conditions' };
  }

  if ((ft != null && ft < 6) && w < 25) {
    return { level: 'Moderate', label: 'Choppy / moderate seas' };
  }

  return { level: 'High', label: 'Rough / hazardous conditions' };
}

// One row in the explorer list – uses NOAA data directly
function BuoyListItem({ buoy }: { buoy: BuoyDetailData }) {
  const router = useRouter();

  const waveM = buoy.waveHeightM ?? null;
  const waveFt = waveM != null ? waveM * 3.28084 : null;
  const windKts = buoy.windSpeedKts ?? null;

  const risk = getLiveRisk(waveM, windKts);

  const hasLive = waveM != null || windKts != null;

  const liveLine = hasLive
    ? [
        waveFt != null ? `${waveFt.toFixed(1)} ft` : '— ft',
        windKts != null ? `${windKts.toFixed(0)} kt` : '— kt',
      ].join(' · ')
    : 'No recent sea state';

  const footnote = 'Tap to view live buoy detail.';

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: '/buoy/[buoyId]',
          params: { buoyId: buoy.id, name: buoy.name },
        })
      }
    >
      <Card style={styles.buoyCard}>
        <View style={styles.buoyHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.buoyName}>{buoy.name}</Text>
            <Text style={styles.buoyMeta}>
              NOAA NDBC · {buoy.id}
            </Text>
            <Text style={styles.buoyMeta}>
              {buoy.lat.toFixed(3)}, {buoy.lon.toFixed(3)}
            </Text>
            {buoy.updatedAt && (
              <Text style={styles.buoyMeta}>
                Updated {new Date(buoy.updatedAt).toLocaleString()}
              </Text>
            )}

            <Text style={styles.buoyMeta}>
              Sea state: {liveLine}
            </Text>
          </View>

          <View
            style={[
              styles.riskBadge,
              risk.level === 'Low' && styles.riskLow,
              risk.level === 'Moderate' && styles.riskModerate,
              risk.level === 'High' && styles.riskHigh,
            ]}
          >
            <Text style={styles.riskBadgeLabel}>{risk.level}</Text>
            <Text style={styles.riskBadgeText}>{risk.label}</Text>
          </View>
        </View>

        <Text style={styles.buoyFootnote}>{footnote}</Text>
      </Card>
    </Pressable>
  );
}

export default function ExploreBuoysScreen() {
  const { data, loading, error } = useAllBuoyDetails();
  const buoys: BuoyDetailData[] = data ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={typography.title}>Buoy Explorer</Text>
          <Text style={typography.subtitle}>
            Live NOAA buoys (latest observations)
          </Text>
        </View>
      </View>

      {loading && !data && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={typography.small}>Loading buoys…</Text>
        </View>
      )}

      {error && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {buoys.map((buoy) => (
        <BuoyListItem key={buoy.id} buoy={buoy} />
      ))}

      {!loading && !error && buoys.length === 0 && (
        <View style={styles.center}>
          <Text style={typography.small}>No buoys found.</Text>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  buoyCard: {
    marginBottom: theme.spacing.md,
  },
  buoyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  buoyName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  buoyMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  buoyFootnote: {
    marginTop: theme.spacing.sm,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 140,
  },
  riskBadgeLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  riskBadgeText: {
    fontSize: 10,
    color: '#E5E7EB',
  },
  riskLow: {
    backgroundColor: '#16a34a33',
    borderColor: '#16a34a',
  },
  riskModerate: {
    backgroundColor: '#facc1533',
    borderColor: '#facc15',
  },
  riskHigh: {
    backgroundColor: '#fb923c33',
    borderColor: '#fb923c',
  },
});
