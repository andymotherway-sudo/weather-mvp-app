import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LocationAstroForecast } from '../../app/lib/astro/locationAstro';
import { toLocalLabel } from '../../app/lib/astro/locationAstro';

type Props = {
  forecast: LocationAstroForecast;
};

export function BestWindowCard({ forecast }: Props) {
  const hasWindow = !!forecast.bestStartTime && !!forecast.bestEndTime;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Best Observing Window</Text>

      {hasWindow ? (
        <>
          <Text style={styles.window}>
            {toLocalLabel(forecast.bestStartTime, forecast.timezone)}–{toLocalLabel(forecast.bestEndTime, forecast.timezone)}
          </Text>
          <Text style={styles.summary}>
            {forecast.bestSummary ?? `${forecast.peakLabel} observing conditions expected during the best part of the night.`}
          </Text>
        </>
      ) : (
        <Text style={styles.summary}>A clear observing window was not identified for tonight.</Text>
      )}

      <View style={styles.row}>
        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Peak Score</Text>
          <Text style={styles.pillValue}>{forecast.peakScore}</Text>
        </View>

        <View style={styles.pill}>
          <Text style={styles.pillLabel}>Rating</Text>
          <Text style={styles.pillValue}>{forecast.peakLabel}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  window: {
    color: '#F9FAFB',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  summary: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  pill: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pillLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  pillValue: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '800',
  },
});
