// components/land/HybridTrends.tsx
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../../../styles/theme';
import { Card } from '../../layout/Card';

import ClimatologyChart from '../ClimatologyChart';
import HourlyCharts72h from '../HourlyCharts72h';

import { useClimatologyNormals } from '../../../app/lib/climatology/hook';
import type { ForecastHour } from '../../../app/lib/openmeteo/hooks';

type TabId = 'hourly' | 'climo';

export function HybridTrends({
  hours,
  lat,
  lon,
  locationLabel,
}: {
  hours: ForecastHour[];
  lat: number;
  lon: number;
  locationLabel?: string;
}) {
  const [tab, setTab] = useState<TabId>('hourly');

  const { data: climo, loading: climoLoading, error: climoError, refresh: climoRefresh, hasToken } =
    useClimatologyNormals({ lat, lon, enabled: tab === 'climo', preferCache: true });

  const stationName = useMemo(() => climo?.station?.name ?? undefined, [climo?.station?.name]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Trends</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {locationLabel ? locationLabel : 'Hourly + climatology context'}
          </Text>
        </View>

        <View style={styles.tabs}>
          <Tab label="Hourly" active={tab === 'hourly'} onPress={() => setTab('hourly')} />
          <Tab label="Climo" active={tab === 'climo'} onPress={() => setTab('climo')} />
        </View>
      </View>

      {tab === 'hourly' ? (
        <HourlyCharts72h hours={hours} maxHours={72} units="us" initialPanel="temp" />
      ) : (
        <View>
          {climoLoading && !climo ? (
            <View style={styles.center}>
              <ActivityIndicator />
              <Text style={styles.small}>Loading climatology…</Text>
            </View>
          ) : null}

          {climoError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Climatology unavailable</Text>
              <Text style={styles.errorText}>{climoError}</Text>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                <Pressable onPress={climoRefresh} style={styles.btn}>
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
            </View>
          ) : null}

          {climo?.normals?.length ? (
            <ClimatologyChart
              title="Climatology"
              normals={climo.normals}
              stationName={stationName ? `${stationName}` : undefined}
            />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.textPrimary },
  sub: { marginTop: 2, fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '700' },

  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.22)' },
  tabText: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.75)' },
  tabTextActive: { color: 'white' },

  center: { paddingVertical: 18, alignItems: 'center' },
  small: { marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },

  errorBox: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  errorTitle: { fontSize: 13, fontWeight: '900', color: 'white' },
  errorText: { marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: '700', lineHeight: 17 },

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

export default HybridTrends;
