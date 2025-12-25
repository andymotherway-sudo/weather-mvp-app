// app/(tabs)/solar.tsx

import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSpaceWeatherSummary } from '../lib/spaceweather/hooks';

export default function SolarScreen() {
  const { data, loading, error, refreshing, refresh } =
    useSpaceWeatherSummary();

  const formatUpdated = (iso: string | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const getKpDescription = (kp: number | undefined) => {
    if (kp === undefined || Number.isNaN(kp)) return '—';
    if (kp < 3) return 'Quiet geomagnetic conditions';
    if (kp < 5) return 'Active – possible minor aurora at high latitudes';
    if (kp < 7) return 'Storm – good aurora chances at mid/high latitudes';
    return 'Strong storm – intense geomagnetic activity';
  };

  const getAuroraChance = (kp: number | undefined) => {
    if (kp === undefined || Number.isNaN(kp)) return 0;
    if (kp < 3) return 5;
    if (kp < 4) return 15;
    if (kp < 5) return 30;
    if (kp < 6) return 55;
    if (kp < 7) return 75;
    if (kp < 8) return 90;
    return 98;
  };

  const renderKpGauge = (kp: number) => {
    const segments = Array.from({ length: 9 }, (_, i) => i + 1);
    return (
      <View style={styles.kpGaugeContainer}>
        <View style={styles.kpGaugeRow}>
          {segments.map((value) => {
            const active = kp >= value - 0.5;
            let color = '#16a34a'; // green
            if (value >= 4 && value < 6) color = '#facc15'; // yellow
            if (value >= 6 && value < 7) color = '#f97316'; // orange
            if (value >= 7) color = '#ef4444'; // red

            return (
              <View
                key={value}
                style={[
                  styles.kpSegment,
                  {
                    backgroundColor: active ? color : '#111827',
                    borderColor: color,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.kpGaugeLabels}>
          <Text style={styles.smallText}>0</Text>
          <Text style={styles.smallText}>3</Text>
          <Text style={styles.smallText}>5</Text>
          <Text style={styles.smallText}>7</Text>
          <Text style={styles.smallText}>9</Text>
        </View>
      </View>
    );
  };

  const renderSpeedDial = (speed: number) => {
    // Typical range ~250–800 km/s
    const min = 250;
    const max = 800;
    const clamped = Math.min(Math.max(speed, min), max);
    const pct = (clamped - min) / (max - min);

    return (
      <View style={styles.speedDialContainer}>
        <View style={styles.speedDialTrack}>
          <View
            style={[styles.speedDialFill, { flex: pct || 0.05 }]}
          />
          <View style={{ flex: 1 - pct }} />
        </View>
        <View style={styles.speedDialLabels}>
          <Text style={styles.smallText}>Slow</Text>
          <Text style={styles.smallText}>Fast</Text>
        </View>
      </View>
    );
  };

  const renderAuroraBar = (kp: number) => {
    const chance = getAuroraChance(kp);
    const pct = Math.max(0.05, Math.min(chance / 100, 1));
    let color = '#16a34a';
    if (kp >= 4 && kp < 6) color = '#facc15';
    if (kp >= 6 && kp < 7) color = '#f97316';
    if (kp >= 7) color = '#ef4444';

    return (
      <View style={styles.auroraContainer}>
        <View style={styles.auroraTrack}>
          <View
            style={[
              styles.auroraFill,
              {
                flex: pct,
                backgroundColor: color,
              },
            ]}
          />
          <View style={{ flex: 1 - pct }} />
        </View>
        <Text style={styles.smallText}>
          Simple aurora likelihood estimate: {chance.toFixed(0)}%
        </Text>
      </View>
    );
  };

  const renderWindHistory = () => {
    if (!data?.windHistory?.length) return null;

    const history = data.windHistory;
    const maxSpeed =
      history.reduce((max, s) => Math.max(max, s.speed), 0) || 1;

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Solar Wind Speed – last few hours</Text>
        <View style={styles.historyGraph}>
          {history.map((sample, idx) => {
            const h = Math.max(
              8,
              (sample.speed / maxSpeed) * 50 // max 50px tall
            );
            const isLast = idx === history.length - 1;
            return (
              <View key={sample.time} style={styles.historyBarWrapper}>
                <View
                  style={[
                    styles.historyBar,
                    {
                      height: h,
                      opacity: isLast ? 1 : 0.6,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.historyLabels}>
          <Text style={styles.smallText}>Earlier</Text>
          <Text style={styles.smallText}>Now</Text>
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} />
      }
    >
      <Text style={styles.title}>Omni Wx – Solar Weather</Text>
      <Text style={styles.subtitle}>
        Real-time solar wind and geomagnetic activity
      </Text>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.smallText}>Loading solar data...</Text>
        </View>
      ) : error ? (
        <View style={styles.cardError}>
          <Text style={styles.cardTitle}>Error</Text>
          <Text style={styles.cardValue}>{error}</Text>
        </View>
      ) : data ? (
        <>
          {/* Solar Wind Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Solar Wind (L1)</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Speed</Text>
                <Text style={styles.cardValue}>
                  {data.solarWindSpeed.toFixed(1)} km/s
                </Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Density</Text>
                <Text style={styles.cardValue}>
                  {data.solarWindDensity.toFixed(2)} /cm³
                </Text>
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Temperature</Text>
                <Text style={styles.cardValue}>
                  {Math.round(data.solarWindTemp).toLocaleString()} K
                </Text>
              </View>
            </View>

            {renderSpeedDial(data.solarWindSpeed)}
          </View>

          {/* Geomagnetic / Aurora Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Geomagnetic Activity</Text>
            <Text style={styles.label}>Planetary Kp Index</Text>
            <Text style={styles.kpValue}>{data.kp.toFixed(1)}</Text>
            {renderKpGauge(data.kp)}
            <Text style={styles.kpDescription}>
              {getKpDescription(data.kp)}
            </Text>
            {renderAuroraBar(data.kp)}
          </View>

          {/* Wind history mini-graph */}
          {renderWindHistory()}

          {/* Meta */}
          <View style={styles.footer}>
            <Text style={styles.smallText}>
              Last updated: {formatUpdated(data.updatedAt)}
            </Text>
            <Text style={styles.smallText}>
              Data source: NOAA SWPC (solar wind & Kp)
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.center}>
          <Text>No solar data available.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020817', // dark navy
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#E5E7EB',
    marginBottom: 4,
    textTransform: 'capitalize',
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  center: {
    marginTop: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardError: {
    backgroundColor: '#7F1D1D',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F9FAFB',
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  kpValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FBBF24',
    marginTop: 4,
  },
  kpDescription: {
    marginTop: 8,
    fontSize: 13,
    color: '#D1D5DB',
  },
  row: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },
  col: {
    flex: 1,
  },
  footer: {
    marginTop: 8,
  },
  smallText: {
    fontSize: 11,
    color: '#6B7280',
  },
  kpGaugeContainer: {
    marginTop: 8,
  },
  kpGaugeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  kpSegment: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  kpGaugeLabels: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  speedDialContainer: {
    marginTop: 12,
  },
  speedDialTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  speedDialFill: {
    backgroundColor: '#38bdf8',
  },
  speedDialLabels: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  auroraContainer: {
    marginTop: 12,
  },
  auroraTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
    marginBottom: 4,
  },
  auroraFill: {
    borderRadius: 999,
  },
  historyGraph: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 8,
    height: 60,
  },
  historyBarWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  historyBar: {
    width: 6,
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },
  historyLabels: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
