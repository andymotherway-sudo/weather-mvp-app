// components/land/NerdyInsightsCard.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NerdyInsight } from '../../app/lib/land/nerdyInsights';
import { theme } from '../../styles/theme';

export function NerdyInsightsCard({
  insights,
  onPressLearn,
  onPressInsightTopic,
  onPressDewpoint,
  title = 'Insights',
  dewpointLine,
}: {
  insights: NerdyInsight[];
  onPressLearn: () => void;
  onPressInsightTopic: (topicId?: string) => void;
  onPressDewpoint?: () => void;
  title?: string;
  dewpointLine?: string | null;
}) {
  if (!insights.length && !dewpointLine) return null;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>

        <Pressable onPress={onPressLearn} style={styles.learnChip}>
          <Text style={styles.learnText}>wxLearn</Text>
        </Pressable>
      </View>

      {dewpointLine ? (
        <Pressable
          onPress={onPressDewpoint}
          disabled={!onPressDewpoint}
          style={[styles.row, styles.dewRow]}
        >
          <View style={{ flex: 1 }}>
            <View style={styles.rowTopLine}>
              <Text style={styles.rowTitle}>Dew point</Text>
              {onPressDewpoint ? <Text style={styles.rowHint}>Tap</Text> : null}
            </View>
            <Text style={styles.rowBadge}>{dewpointLine}</Text>
          </View>
        </Pressable>
      ) : null}

      {insights.map((it, idx) => {
        const topicId = (it.explain as any)?.learnTopicId;

        return (
          <Pressable
            key={it.id}
            onPress={() => onPressInsightTopic(topicId)}
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
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  title: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
  },

  learnChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  learnText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
  },

  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  dewRow: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  rowTop: {
    marginTop: 10,
  },

  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  rowTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 13,
  },

  rowBadge: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.62)',
    fontWeight: '800',
    fontSize: 12,
  },

  rowValue: {
    color: 'white',
    fontWeight: '900',
    fontSize: 14,
  },

  rowHint: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.40)',
    fontWeight: '800',
    fontSize: 11,
    textTransform: 'uppercase',
  },
});
