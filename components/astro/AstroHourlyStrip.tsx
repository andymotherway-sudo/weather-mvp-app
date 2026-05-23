import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AstroHourRow } from '../../app/lib/astro/locationAstro';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';

type Props = {
  hours: AstroHourRow[];
  title?: string;
};

function scoreTone(score: number) {
  if (score >= 85) return '#22C55E';
  if (score >= 70) return '#84CC16';
  if (score >= 55) return '#FACC15';
  if (score >= 35) return '#FB923C';
  return '#EF4444';
}

function phaseTone(hour: AstroHourRow) {
  if (hour.isTrueDark) {
    return null;
  }

  if (hour.isAstronomicalTwilight) {
    return {
      label: 'Astro twilight',
      bg: 'rgba(139,92,246,0.16)',
      border: 'rgba(167,139,250,0.32)',
      text: '#DDD6FE',
    };
  }

  if (hour.isNauticalTwilight) {
    return {
      label: 'Nautical',
      bg: 'rgba(14,165,233,0.14)',
      border: 'rgba(56,189,248,0.28)',
      text: '#BAE6FD',
    };
  }

  if (hour.isCivilTwilight) {
    return {
      label: 'Civil',
      bg: 'rgba(251,146,60,0.14)',
      border: 'rgba(251,146,60,0.30)',
      text: '#FED7AA',
    };
  }

  if (hour.isNight) {
    return {
      label: 'Night',
      bg: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.10)',
      text: '#E5E7EB',
    };
  }

  return {
    label: 'Day',
    bg: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.08)',
    text: '#CBD5E1',
  };
}

function windMph(mps?: number | null) {
  if (mps == null || !Number.isFinite(mps)) return '—';
  return Math.round(mps * 2.23694);
}

function visMiles(visibilityM?: number | null) {
  if (visibilityM == null || !Number.isFinite(visibilityM)) return '—';
  const mi = visibilityM / 1609.344;
  if (mi >= 20) return 'Excellent';
  if (mi >= 10) return 'Very good';
  if (mi >= 6) return 'Good';
  if (mi >= 3) return 'Reduced';
  if (mi >= 1) return 'Poor';
  return 'Very poor';
}

function moonText(hour: AstroHourRow) {
  if (!hour.moonIsUp) return 'Moon down';
  const pct =
    hour.moonIlluminationPct != null && Number.isFinite(hour.moonIlluminationPct)
      ? `${Math.round(hour.moonIlluminationPct)}%`
      : 'Up';
  return `Moon ${pct}`;
}

function cloudText(hour: AstroHourRow) {
  if (hour.cloudTotal == null || !Number.isFinite(hour.cloudTotal)) return 'Clouds —';
  return `Clouds ${Math.round(hour.cloudTotal)}%`;
}

function tempText(hour: AstroHourRow) {
  if (hour.temperatureC == null || !Number.isFinite(hour.temperatureC)) return '—';
  const f = hour.temperatureC * 9 / 5 + 32;
  return `${Math.round(f)}°F`;
}

export function AstroHourlyStrip({
  hours,
  title = 'Hourly Astro Forecast',
}: Props) {
  const { chrome } = useAppChrome();
  if (!hours.length) return null;

  return (
    <View style={[styles.card, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
      <Text style={styles.title}>{title}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {hours.map((hour) => {
          const tone = scoreTone(hour.score);
          const phase = phaseTone(hour);

          return (
            <View key={hour.time} style={styles.hourCard}>
              <View style={styles.topRow}>
                <Text style={styles.time}>{hour.timeLabel}</Text>
                {phase ? (
                  <View
                    style={[
                      styles.phasePill,
                      {
                        backgroundColor: phase.bg,
                        borderColor: phase.border,
                      },
                    ]}
                  >
                    <Text style={[styles.phaseText, { color: phase.text }]}>
                      {phase.label}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.heroRow}>
                <View style={[styles.scoreBadge, { borderColor: tone }]}>
                  <Text style={[styles.scoreText, { color: tone }]}>{hour.score}</Text>
                </View>

                <View style={styles.heroMeta}>
                  <Text style={styles.label}>{hour.label}</Text>
                  <Text style={styles.temp}>{tempText(hour)}</Text>
                </View>
              </View>

              <Text style={styles.summary} numberOfLines={3}>
                {hour.summary}
              </Text>

              <View style={styles.metaBlock}>
                <Text style={styles.meta}>{cloudText(hour)}</Text>
                <Text style={styles.meta}>{moonText(hour)}</Text>
                <Text style={styles.meta}>Visibility {visMiles(hour.visibilityM)}</Text>
                <Text style={styles.meta}>Wind {windMph(hour.windMps)} mph</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  title: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    paddingHorizontal: 16,
  },

  content: {
    paddingHorizontal: 16,
    gap: 12,
  },

  hourCard: {
    width: 170,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },

  time: {
    color: '#F9FAFB',
    fontSize: 14,
    fontWeight: '800',
  },

  phasePill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },

  phaseText: {
    fontSize: 10,
    fontWeight: '800',
  },

  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },

  scoreBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  scoreText: {
    fontSize: 20,
    fontWeight: '900',
  },

  heroMeta: {
    flex: 1,
    gap: 2,
  },

  label: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },

  temp: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '700',
  },

  summary: {
    color: '#9CA3AF',
    fontSize: 11,
    lineHeight: 15,
    minHeight: 44,
    marginBottom: 10,
  },

  metaBlock: {
    gap: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },

  meta: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '700',
  },
});
