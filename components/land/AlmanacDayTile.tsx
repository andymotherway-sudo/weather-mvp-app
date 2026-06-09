// components/land/AlmanacDayTile.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

export type DayMode = 'observed' | 'forecast' | 'normals';

export type DayTileData = {
  mode: DayMode;
  date: string; // YYYY-MM-DD
  title: string; // "Today • Feb 8" or "Feb 8"
  stationLabel?: string;
  conditionLabel?: string;

  hiF: number | null;
  loF: number | null;
  rainIn: number | null; // observed precip OR normal precip
  precipProbPct?: number | null; // forecast
  cloudMinPct?: number | null;
  cloudMaxPct?: number | null;
  windMaxMph?: number | null;

  normalHiF?: number | null;
  normalLoF?: number | null;
};

function fmtTemp(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${Math.round(v)}°`;
}
function fmtIn(v: number | null | undefined) {
  if (v == null || !Number.isFinite(v)) return '—';
  if (v < 0.01) return '<0.01"';
  return `${v.toFixed(v < 1 ? 2 : 1)}"`;
}
function badgeLabel(mode: DayMode) {
  if (mode === 'observed') return 'OBSERVED';
  if (mode === 'forecast') return 'FORECAST';
  return 'NORMALS';
}

export default function AlmanacDayTile({ d }: { d: DayTileData }) {
  return (
    <Card style={styles.card}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Day</Text>
          <Text style={styles.title}>{d.title}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {d.stationLabel ? `Station • ${d.stationLabel}` : 'Station • —'}
          </Text>
        </View>

        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badgeLabel(d.mode)}</Text>
        </View>
      </View>

      <View style={styles.bigRow}>
        <View style={styles.bigCell}>
          <Text style={styles.bigLabel}>High</Text>
          <Text style={styles.bigValue}>{fmtTemp(d.hiF)}</Text>
          {d.normalHiF != null ? <Text style={styles.bigSub}>Avg {fmtTemp(d.normalHiF)}</Text> : null}
        </View>

        <View style={styles.bigCell}>
          <Text style={styles.bigLabel}>Low</Text>
          <Text style={styles.bigValue}>{fmtTemp(d.loF)}</Text>
          {d.normalLoF != null ? <Text style={styles.bigSub}>Avg {fmtTemp(d.normalLoF)}</Text> : null}
        </View>

        <View style={styles.bigCell}>
          <Text style={styles.bigLabel}>Rain</Text>
          <Text style={styles.bigValue}>{fmtIn(d.rainIn)}</Text>
          {d.mode === 'forecast' && d.precipProbPct != null ? (
            <Text style={styles.bigSub}>{Math.round(d.precipProbPct)}% chance</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
        <Text style={styles.metaText}>{d.conditionLabel ?? '—'}</Text>
        <Text style={styles.dot}>•</Text>
          {d.cloudMinPct != null && d.cloudMaxPct != null
            ? `Cloud ${Math.round(d.cloudMinPct)}–${Math.round(d.cloudMaxPct)}%`
            : 'Cloud —'}
        </Text>
        <Text style={styles.dot}>•</Text>
        <Text style={styles.metaText}>{d.windMaxMph != null ? `Wind ${Math.round(d.windMaxMph)} mph` : 'Wind —'}</Text>
      </View>

      <Text style={styles.note}>
        {d.mode === 'observed'
          ? 'Observed: station daily history'
          : d.mode === 'forecast'
          ? 'Forecast: Open-Meteo'
          : 'Normals: 30-year climate averages'}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },

  topRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  kicker: { fontSize: 11, opacity: 0.7, color: 'rgba(255,255,255,0.65)', fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '900', color: 'white', marginTop: 2 },
  sub: { marginTop: 2, fontSize: 12, opacity: 0.65, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },

  badge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  badgeText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 11, letterSpacing: 0.6 },

  bigRow: { marginTop: 12, flexDirection: 'row', gap: 10 },
  bigCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  bigLabel: { fontSize: 11, opacity: 0.75, color: 'rgba(255,255,255,0.75)', fontWeight: '900' },
  bigValue: { marginTop: 4, fontSize: 18, color: 'white', fontWeight: '900' },
  bigSub: { marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.60)', fontWeight: '800' },

  metaRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, color: 'rgba(255,255,255,0.70)', fontWeight: '800' },
  dot: { marginHorizontal: 8, color: 'rgba(255,255,255,0.25)', fontWeight: '900' },

  note: { marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '700' },
});
