import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LocationAstroForecast } from '../../app/lib/astro/locationAstro';
import { toLocalLabel } from '../../app/lib/astro/locationAstro';

type Props = {
  forecast: LocationAstroForecast;
};

function formatWindow(start?: string | null, end?: string | null) {
  if (!start) return '—';
  if (!end) return toLocalLabel(start);
  return `${toLocalLabel(start)}–${toLocalLabel(end)}`;
}

function formatBortle(forecast: LocationAstroForecast) {
  const cls = forecast.site?.bortleClass;
  const label = forecast.site?.bortleLabel;

  if (cls == null && !label) return 'Pending';
  if (cls != null && label) return `Bortle ${cls} • ${label}`;
  if (cls != null) return `Bortle ${cls}`;
  return label ?? 'Pending';
}

function formatAerosols(forecast: LocationAstroForecast) {
  const idx = forecast.aerosols?.index;
  const label = forecast.aerosols?.label;

  if (typeof idx === 'number' && Number.isFinite(idx) && label) {
    return `${label} • ${idx.toFixed(2)}`;
  }
  if (typeof idx === 'number' && Number.isFinite(idx)) {
    return idx.toFixed(2);
  }
  if (label) return label;
  return 'Pending';
}

function formatElevation(forecast: LocationAstroForecast) {
  const elevationM = forecast.site?.elevationM;
  if (typeof elevationM !== 'number' || !Number.isFinite(elevationM)) return 'Pending';
  const ft = Math.round(elevationM * 3.28084);
  return `${Math.round(elevationM).toLocaleString()} m • ${ft.toLocaleString()} ft`;
}

function heroSubtitle(forecast: LocationAstroForecast) {
  const bortle = forecast.site?.bortleClass;

  if (bortle != null && bortle <= 2 && forecast.peakScore >= 70) {
    return 'Dark-site observing potential tonight.';
  }
  if (bortle != null && bortle >= 7) {
    return 'Local sky brightness will heavily affect deep-sky viewing.';
  }
  return forecast.bestSummary ?? 'Observing conditions available for tonight.';
}

export function AstroHeroCard({ forecast }: Props) {
  const bestWindow = formatWindow(forecast.bestStartTime, forecast.bestEndTime);
  const darkestWindow = formatWindow(
    forecast.darkestStartTime,
    forecast.darkestEndTime
  );

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Astro Forecast</Text>
      <Text style={styles.place}>{forecast.placeName ?? 'Selected location'}</Text>

      <View style={styles.heroRow}>
        <View style={styles.scoreWrap}>
          <Text style={styles.score}>{forecast.peakScore}</Text>
          <Text style={styles.scoreLabel}>{forecast.peakLabel}</Text>
        </View>

        <View style={styles.summaryWrap}>
          <Text style={styles.summaryTitle}>Tonight</Text>
          <Text style={styles.summaryText}>{heroSubtitle(forecast)}</Text>

          <Text style={styles.metaLabel}>Best window</Text>
          <Text style={styles.metaValue}>{bestWindow}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>Darkest window</Text>
          <Text style={styles.metaValue}>{darkestWindow}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statTile}>
          <Text style={styles.statLabel}>BORTLE</Text>
          <Text style={styles.statValue}>{formatBortle(forecast)}</Text>
        </View>

        <View style={styles.statTile}>
          <Text style={styles.statLabel}>AEROSOLS</Text>
          <Text style={styles.statValue}>{formatAerosols(forecast)}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statTile}>
          <Text style={styles.statLabel}>ELEVATION</Text>
          <Text style={styles.statValue}>{formatElevation(forecast)}</Text>
        </View>

        <View style={styles.statTile}>
          <Text style={styles.statLabel}>SOURCE</Text>
          <Text style={styles.statValue}>{forecast.diagnostics?.siteSource ?? 'Pending'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  eyebrow: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },

  place: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 14,
  },

  heroRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    marginBottom: 14,
  },

  scoreWrap: {
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.25)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  score: {
    color: '#F9FAFB',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 38,
  },

  scoreLabel: {
    color: '#D1D5DB',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },

  summaryWrap: {
    flex: 1,
    gap: 4,
  },

  summaryTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '800',
  },

  summaryText: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },

  metaLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  metaSpacing: {
    marginTop: 6,
  },

  metaValue: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
  },

  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },

  statTile: {
    flex: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  statLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    marginBottom: 4,
  },

  statValue: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 18,
  },
});