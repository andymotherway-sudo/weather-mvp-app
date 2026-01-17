// components/alerts/AlertBanner.tsx
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NWSAlert } from '../../app/lib/alerts/nws';
import { severityRank } from '../../app/lib/alerts/nws';
import { theme } from '../../styles/theme';

function fmtWindow(alert: NWSAlert): string {
  const startIso = alert.onset ?? alert.effective ?? alert.sent;
  const endIso = alert.ends ?? alert.expires;

  const start = startIso ? new Date(startIso) : null;
  const end = endIso ? new Date(endIso) : null;

  const t = (d: Date) =>
    d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

  if (start && end) return `${t(start)} → ${t(end)}`;
  if (end) return `Until ${t(end)}`;
  return 'Active';
}

function sevPill(sev?: string): { text: string; bg: string; fg: string } {
  const r = severityRank(sev);
  if (r >= 4) return { text: 'EXTREME', bg: 'rgba(255,80,80,0.18)', fg: 'rgba(255,200,200,1)' };
  if (r >= 3) return { text: 'SEVERE', bg: 'rgba(255,170,0,0.16)', fg: 'rgba(255,220,160,1)' };
  if (r >= 2) return { text: 'MOD', bg: 'rgba(120,200,255,0.14)', fg: 'rgba(190,235,255,1)' };
  if (r >= 1) return { text: 'MINOR', bg: 'rgba(255,255,255,0.10)', fg: 'rgba(255,255,255,0.85)' };
  return { text: 'ALERT', bg: 'rgba(255,255,255,0.08)', fg: 'rgba(255,255,255,0.8)' };
}

type Props = {
  primary: NWSAlert;
  count: number;
  onPress: () => void;
};

export function AlertBanner({ primary, count, onPress }: Props) {
  const pill = useMemo(() => sevPill(primary.severity), [primary.severity]);
  const headline = primary.headline ?? primary.event;
  const windowText = useMemo(() => fmtWindow(primary), [primary]);

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <View style={styles.row}>
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.fg }]}>{pill.text}</Text>
        </View>

        <View style={styles.mid}>
          <Text style={styles.title} numberOfLines={1}>
            {headline}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {windowText}
            {count > 1 ? ` • +${count - 1} more` : ''}
          </Text>
        </View>

        <Text style={styles.chev}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.md,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  pillText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  mid: { flex: 1 },
  title: { color: 'white', fontWeight: '900', fontSize: 13 },
  sub: { marginTop: 2, color: 'rgba(255,255,255,0.72)', fontWeight: '800', fontSize: 12 },
  chev: { color: 'rgba(255,255,255,0.7)', fontSize: 24, fontWeight: '900', paddingHorizontal: 6 },
});
