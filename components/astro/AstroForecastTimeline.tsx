import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';

import type { AstroHourRow } from '../../app/lib/astro/locationAstro';
import type { KpForecastSample } from '../../app/lib/spaceweather/types';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';

type Props = {
  hours: AstroHourRow[];
  latitude: number;
  timeZone: string;
  kpForecast?: KpForecastSample[];
  moonDays?: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  title?: string;
};

const COLUMN_WIDTH = 142;
const CHART_HEIGHT = 210;
const PAD_TOP = 30;
const PAD_BOTTOM = 34;
const PLOT_HEIGHT = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

function dateKey(value: string) {
  return value.slice(0, 10);
}

function dayLabel(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function scoreColor(score: number) {
  if (score >= 85) return '#22C55E';
  if (score >= 70) return '#84CC16';
  if (score >= 55) return '#FACC15';
  if (score >= 35) return '#FB923C';
  return '#EF4444';
}

function phaseLabel(hour: AstroHourRow) {
  if (hour.isTrueDark) return 'True dark';
  if (hour.isAstronomicalTwilight) return 'Astro twilight';
  if (hour.isNauticalTwilight) return 'Nautical twilight';
  if (hour.isCivilTwilight) return 'Civil twilight';
  if (hour.isNight) return 'Night';
  return 'Daylight';
}

function temperatureF(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round((value * 9) / 5 + 32)}°`;
}

function visibilityLabel(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '--';
  const miles = value / 1609.344;
  if (miles >= 20) return 'Excellent';
  if (miles >= 10) return 'Very good';
  if (miles >= 6) return 'Good';
  if (miles >= 3) return 'Reduced';
  return 'Poor';
}

function windMph(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 2.23694)} mph`;
}

function wallClockMs(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!match) return null;
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
}

function isoToWallClockMs(value: string, timeZone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((entry) => entry.type === type)?.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  } catch {
    return date.getTime();
  }
}

function shortTime(value?: string | null) {
  const match = value?.match(/[T\s](\d{2}):(\d{2})/);
  if (!match) return '--';
  const hour = Number(match[1]);
  const minute = match[2];
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function auroraViewingPotential(kp: number | null, latitude: number, hour: AstroHourRow) {
  if (kp == null || !hour.isNight) return 0;
  const activity =
    kp < 3 ? 0 : kp < 4 ? 15 : kp < 5 ? 30 : kp < 6 ? 55 : kp < 7 ? 75 : kp < 8 ? 90 : 98;
  if (activity === 0) return 0;
  const equatorwardGuide = 67 - kp * 4.5;
  const latitudeFit = Math.max(0, Math.min(1, (Math.abs(latitude) - equatorwardGuide + 4) / 12));
  return Math.round(activity * latitudeFit * Math.max(0, Math.min(1, hour.score / 100)));
}

export function AstroForecastTimeline({
  hours,
  latitude,
  timeZone,
  kpForecast = [],
  moonDays = [],
  title = '72-Hour Night Sky Forecast',
}: Props) {
  const { chrome } = useAppChrome();
  const model = useMemo(() => {
    if (!hours.length) return null;

    const localizedKp = kpForecast
      .map((sample) => ({
        ...sample,
        wallMs: isoToWallClockMs(sample.time, timeZone),
      }))
      .filter((sample): sample is KpForecastSample & { wallMs: number } => sample.wallMs != null)
      .sort((a, b) => a.wallMs - b.wallMs);
    const enrichedHours = hours.map((hour) => {
      const hourMs = wallClockMs(hour.time);
      let sample: (KpForecastSample & { wallMs: number }) | null = null;
      if (hourMs != null) {
        for (const candidate of localizedKp) {
          if (candidate.wallMs <= hourMs) sample = candidate;
          else break;
        }
        if (sample && hourMs - sample.wallMs > 6 * 60 * 60 * 1000) sample = null;
      }
      return {
        hour,
        kpSample: sample,
        auroraPotential: auroraViewingPotential(sample?.kp ?? null, latitude, hour),
      };
    });

    const width = Math.max(320, hours.length * COLUMN_WIDTH);
    const xFor = (index: number) => index * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    const yFor = (score: number) => PAD_TOP + (1 - score / 100) * PLOT_HEIGHT;
    const linePoints = hours.map((hour, index) => `${xFor(index)},${yFor(hour.score)}`).join(' ');
    const areaPath = [
      `M ${xFor(0)} ${PAD_TOP + PLOT_HEIGHT}`,
      ...hours.map((hour, index) => `L ${xFor(index)} ${yFor(hour.score)}`),
      `L ${xFor(hours.length - 1)} ${PAD_TOP + PLOT_HEIGHT}`,
      'Z',
    ].join(' ');
    const best = hours.reduce((winner, hour) => (hour.score > winner.score ? hour : winner), hours[0]);

    const dayGroups: Array<{
      key: string;
      label: string;
      start: number;
      count: number;
      peak: AstroHourRow;
      minCloud: number | null;
      maxCloud: number | null;
      moonIllumination: number | null;
      trueDarkHours: number;
      maxWindMps: number | null;
      maxKp: number | null;
      maxAuroraPotential: number;
      moonrise: string | null;
      moonset: string | null;
      moonPhaseLabel: string | null;
    }> = [];
    for (let index = 0; index < enrichedHours.length; index += 1) {
      const { hour, kpSample, auroraPotential } = enrichedHours[index];
      const key = dateKey(hour.time);
      const moonDay = moonDays.find((day) => day.date === key);
      const existing = dayGroups[dayGroups.length - 1];
      if (!existing || existing.key !== key) {
        dayGroups.push({
          key,
          label: dayLabel(hour.time),
          start: index,
          count: 1,
          peak: hour,
          minCloud: hour.cloudTotal,
          maxCloud: hour.cloudTotal,
          moonIllumination: hour.moonIlluminationPct,
          trueDarkHours: hour.isTrueDark ? 1 : 0,
          maxWindMps: hour.windMps,
          maxKp: kpSample?.kp ?? null,
          maxAuroraPotential: auroraPotential,
          moonrise: moonDay?.moonrise ?? null,
          moonset: moonDay?.moonset ?? null,
          moonPhaseLabel: moonDay?.moonPhaseLabel ?? null,
        });
      } else {
        existing.count += 1;
        if (hour.score > existing.peak.score) existing.peak = hour;
        if (hour.cloudTotal != null) {
          existing.minCloud =
            existing.minCloud == null ? hour.cloudTotal : Math.min(existing.minCloud, hour.cloudTotal);
          existing.maxCloud =
            existing.maxCloud == null ? hour.cloudTotal : Math.max(existing.maxCloud, hour.cloudTotal);
        }
        if (hour.moonIlluminationPct != null) existing.moonIllumination = hour.moonIlluminationPct;
        if (hour.isTrueDark) existing.trueDarkHours += 1;
        if (hour.windMps != null) {
          existing.maxWindMps =
            existing.maxWindMps == null ? hour.windMps : Math.max(existing.maxWindMps, hour.windMps);
        }
        if (kpSample?.kp != null) {
          existing.maxKp = existing.maxKp == null ? kpSample.kp : Math.max(existing.maxKp, kpSample.kp);
        }
        existing.maxAuroraPotential = Math.max(existing.maxAuroraPotential, auroraPotential);
      }
    }

    return { width, xFor, yFor, linePoints, areaPath, best, dayGroups, enrichedHours };
  }, [hours, kpForecast, latitude, moonDays, timeZone]);

  if (!model) return null;

  return (
    <View style={[styles.card, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>OBSERVING FORECAST</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          Sky score, darkness, moonlight, clouds, visibility, temperature, and wind
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: model.width }}>
          <View style={styles.daySummaryRow}>
            {model.dayGroups.map((group) => (
              <View
                key={group.key}
                style={[
                  styles.daySummary,
                  {
                    width: group.count * COLUMN_WIDTH,
                    borderColor: chrome.border,
                  },
                ]}
              >
                <Text style={styles.dayLabel}>{group.label}</Text>
                <Text style={styles.dayPeak}>
                  Peak {group.peak.score} · {group.peak.timeLabel}
                </Text>
                <Text style={styles.dayDetails} numberOfLines={1}>
                  Clouds{' '}
                  {group.minCloud == null
                    ? '--'
                    : `${Math.round(group.minCloud)}–${Math.round(group.maxCloud ?? group.minCloud)}%`}
                  {' · '}Moon {group.moonIllumination == null ? '--' : `${Math.round(group.moonIllumination)}%`}
                  {' · '}Dark {group.trueDarkHours}h
                  {' · '}Wind {windMph(group.maxWindMps)}
                </Text>
                <Text style={styles.dayDetails} numberOfLines={1}>
                  Kp {group.maxKp == null ? '--' : group.maxKp.toFixed(1)}
                  {' · '}Aurora view {group.maxAuroraPotential}%
                  {' · '}{group.moonPhaseLabel ?? 'Moon'} {shortTime(group.moonrise)}–{shortTime(group.moonset)}
                </Text>
              </View>
            ))}
          </View>

          <Svg width={model.width} height={CHART_HEIGHT}>
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = model.yFor(tick);
              return (
                <React.Fragment key={tick}>
                  <Line
                    x1={0}
                    y1={y}
                    x2={model.width}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth={1}
                  />
                  <SvgText x={6} y={y - 5} fill="rgba(255,255,255,0.42)" fontSize="10">
                    {tick}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {hours.map((hour, index) => (
              <Rect
                key={`phase-${hour.time}`}
                x={index * COLUMN_WIDTH}
                y={PAD_TOP}
                width={COLUMN_WIDTH}
                height={PLOT_HEIGHT}
                fill={
                  hour.isTrueDark
                    ? 'rgba(30,41,86,0.30)'
                    : hour.isNight
                      ? 'rgba(30,41,86,0.18)'
                      : 'rgba(148,163,184,0.035)'
                }
              />
            ))}

            <Path d={model.areaPath} fill="rgba(59,130,246,0.12)" />
            <Polyline
              points={model.linePoints}
              fill="none"
              stroke="#60A5FA"
              strokeWidth={3}
            />

            {hours.map((hour, index) => {
              const x = model.xFor(index);
              const y = model.yFor(hour.score);
              return (
                <React.Fragment key={hour.time}>
                  <Line
                    x1={x}
                    y1={PAD_TOP}
                    x2={x}
                    y2={PAD_TOP + PLOT_HEIGHT}
                    stroke="rgba(255,255,255,0.035)"
                    strokeWidth={1}
                  />
                  <Rect
                    x={x - 4}
                    y={y - 4}
                    width={8}
                    height={8}
                    rx={4}
                    fill={scoreColor(hour.score)}
                  />
                  <SvgText
                    x={x}
                    y={CHART_HEIGHT - 10}
                    fill="rgba(255,255,255,0.68)"
                    fontSize="10"
                    fontWeight="700"
                    textAnchor="middle"
                  >
                    {hour.timeLabel}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>

          <View style={styles.hourRow}>
            {model.enrichedHours.map(({ hour, kpSample, auroraPotential }) => (
              <View
                key={`detail-${hour.time}`}
                style={[
                  styles.hourColumn,
                  {
                    width: COLUMN_WIDTH,
                    borderColor: chrome.border,
                    opacity: hour.isNight ? 1 : 0.66,
                  },
                ]}
              >
                <View style={styles.hourTop}>
                  <Text style={styles.hourTime}>{hour.timeLabel}</Text>
                  <Text style={[styles.hourScore, { color: scoreColor(hour.score) }]}>
                    {hour.score}
                  </Text>
                </View>
                <Text style={styles.hourQuality}>{hour.label}</Text>
                <Text style={styles.phase}>{phaseLabel(hour)}</Text>
                <View style={styles.metricGrid}>
                  <Text style={styles.metric}>Clouds {hour.cloudTotal == null ? '--' : `${Math.round(hour.cloudTotal)}%`}</Text>
                  <Text style={styles.metric}>
                    {hour.moonIsUp
                      ? `Moon ${hour.moonIlluminationPct == null ? 'up' : `${Math.round(hour.moonIlluminationPct)}%`}`
                      : 'Moon down'}
                  </Text>
                  <Text style={styles.metric}>Vis {visibilityLabel(hour.visibilityM)}</Text>
                  <Text style={styles.metric}>Wind {windMph(hour.windMps)}</Text>
                  <Text style={styles.metric}>Temp {temperatureF(hour.temperatureC)}</Text>
                  <Text style={styles.metric}>
                    Kp {kpSample == null ? '--' : kpSample.kp.toFixed(1)} {kpSample?.status ?? ''}
                  </Text>
                  <Text style={styles.metric}>Aurora view {auroraPotential}%</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Text style={styles.footer}>
        Best hour: {model.best.timeLabel} · Sky Score {model.best.score}
      </Text>
      <Text style={styles.disclaimer}>
        Aurora view is an OMNIwx planning estimate using forecast Kp, latitude, darkness, and local sky quality. It is not an exact auroral-oval forecast.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  eyebrow: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 5,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  daySummaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 0,
  },
  daySummary: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(15,23,42,0.62)',
  },
  dayLabel: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '900',
  },
  dayPeak: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  dayDetails: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 3,
  },
  hourRow: {
    flexDirection: 'row',
    paddingBottom: 4,
  },
  hourColumn: {
    minHeight: 174,
    paddingHorizontal: 11,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderRightWidth: 1,
    backgroundColor: 'rgba(2,6,23,0.34)',
  },
  hourTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  hourTime: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '900',
  },
  hourScore: {
    fontSize: 20,
    fontWeight: '900',
  },
  hourQuality: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  phase: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    minHeight: 14,
  },
  metricGrid: {
    gap: 5,
    marginTop: 12,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
  },
  metric: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  disclaimer: {
    color: '#64748B',
    fontSize: 9,
    lineHeight: 13,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
});
