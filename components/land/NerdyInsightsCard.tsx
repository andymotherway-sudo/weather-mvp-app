// components/land/NerdyInsightsCard.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NerdyInsight } from '../../app/lib/land/nerdyInsights';
import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

export function NerdyInsightsCard({
  insights,
  onPressInsight,
  onPressLearn,
  title = 'Insights',
  dewpointLine,
}: {
  insights: NerdyInsight[];
  onPressInsight: (i: NerdyInsight) => void;
  onPressLearn: () => void;
  title?: string;
  /** Example: "49°F • Comfortable" or "—" (omit to hide) */
  dewpointLine?: string | null;
}) {
  if (!insights.length && !dewpointLine) return null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Pressable onPress={onPressLearn} style={styles.learnChip}>
          <Text style={styles.learnText}>Learn</Text>
        </Pressable>
      </View>

      {dewpointLine ? (
        <View style={[styles.row, styles.dewRow]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Dew point</Text>
            <Text style={styles.rowBadge}>{dewpointLine}</Text>
          </View>
        </View>
      ) : null}

      {insights.map((it, idx) => (
        <Pressable
          key={it.id}
          onPress={() => onPressInsight(it)}
          style={[
            styles.row,
            (idx > 0 || !!dewpointLine) && styles.rowTop,
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{it.title}</Text>
            {it.badge ? <Text style={styles.rowBadge}>{it.badge}</Text> : null}
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.rowValue}>{it.value}</Text>
            <Text style={styles.rowHint}>Tap</Text>
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.md },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },

  title: { color: theme.colors.textPrimary, fontSize: 15, fontWeight: '900' },

  learnChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  learnText: { color: 'white', fontWeight: '900', fontSize: 12 },

  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  dewRow: {
    // slightly calmer look since it isn’t tappable
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  rowTop: { marginTop: 10 },

  rowTitle: { color: 'white', fontWeight: '900' },
  rowBadge: { marginTop: 4, color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 12 },

  rowValue: { color: 'white', fontWeight: '900', fontSize: 14 },
  rowHint: { marginTop: 2, color: 'rgba(255,255,255,0.40)', fontWeight: '800', fontSize: 11 },
});