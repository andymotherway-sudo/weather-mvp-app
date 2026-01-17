import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ForecastHour } from '../../app/lib/openmeteo/hooks';
import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

type Props = {
  hours: ForecastHour[];
  maxHours?: number; // default 72
};

function round(v: number | null) {
  return v == null ? '—' : `${Math.round(v)}`;
}
function pct(v: number | null) {
  return v == null ? '—' : `${Math.round(v)}%`;
}

export function NerdyHourlyTimeline({ hours, maxHours = 72 }: Props) {
  const [range, setRange] = useState<24 | 48 | 72>(72);

  const slice = useMemo(
    () => hours.slice(0, Math.min(hours.length, Math.min(maxHours, range))),
    [hours, maxHours, range]
  );

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Hourly details</Text>
        <View style={styles.ranges}>
          <Chip label="24h" active={range === 24} onPress={() => setRange(24)} />
          <Chip label="48h" active={range === 48} onPress={() => setRange(48)} />
          <Chip label="72h" active={range === 72} onPress={() => setRange(72)} />
        </View>
      </View>

      {/* Header row (keep it short) */}
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.cell, styles.time]}>Time</Text>
        <Text style={[styles.cell, styles.t]}>T</Text>
        <Text style={[styles.cell, styles.dp]}>DP</Text>
        <Text style={[styles.cell, styles.pop]}>POP</Text>
        <Text style={[styles.cell, styles.cld]}>☁︎</Text>
        <Text style={[styles.cell, styles.wind]}>W→G</Text>
      </View>

      {slice.map((h, i) => {
        const dt = new Date(h.time);
        const label = dt.toLocaleTimeString(undefined, { hour: 'numeric' });

        return (
          <View key={h.time} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
            <Text style={[styles.cell, styles.time]}>{label}</Text>
            <Text style={[styles.cell, styles.t]}>{round(h.tempF)}°</Text>

            {/* Dew point primary */}
            <Text style={[styles.cell, styles.dp]}>{round(h.dewPointF)}°</Text>

            <Text style={[styles.cell, styles.pop]}>{pct(h.precipProbPct)}</Text>
            <Text style={[styles.cell, styles.cld]}>{pct(h.cloudCoverPct)}</Text>

            {/* Wind→Gust paired */}
            <Text style={[styles.cell, styles.wind]}>
              {round(h.windMph)}→{round(h.windGustMph)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary },

  ranges: { flexDirection: 'row', gap: 6 },

  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  chipText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.textPrimary },

  headRow: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2 },
  rowAlt: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10 },

  cell: { fontSize: 12, color: theme.colors.textPrimary },
  time: { width: 48, opacity: 0.85 },
  t: { width: 40, fontWeight: '700' },
  dp: { width: 44, fontWeight: '900' },
  pop: { width: 54 },
  cld: { width: 54 },
  wind: { flex: 1, textAlign: 'right', fontWeight: '800' },
});
