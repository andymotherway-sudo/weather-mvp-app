import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Line,
  Path,
  Polyline,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import type { AstroHourRow } from '../../app/lib/astro/locationAstro';

type Props = {
  hours: AstroHourRow[];
  title?: string;
};

function scoreColor(score: number) {
  if (score >= 85) return '#22C55E';
  if (score >= 70) return '#84CC16';
  if (score >= 55) return '#FACC15';
  if (score >= 35) return '#FB923C';
  return '#EF4444';
}

function isDaylightHour(hour: AstroHourRow) {
  return (
    !hour.isNight &&
    !hour.isCivilTwilight &&
    !hour.isNauticalTwilight &&
    !hour.isAstronomicalTwilight &&
    !hour.isTrueDark
  );
}

function hourVisualOpacity(hour: AstroHourRow) {
  if (hour.isTrueDark) return 1;
  if (hour.isAstronomicalTwilight) return 0.92;
  if (hour.isNauticalTwilight) return 0.82;
  if (hour.isCivilTwilight) return 0.62;
  if (hour.isNight) return 0.88;
  return 0.22;
}

function backgroundFillForHour(hour: AstroHourRow) {
  if (hour.isTrueDark) return 'rgba(99,102,241,0.10)';
  if (hour.isAstronomicalTwilight) return 'rgba(139,92,246,0.08)';
  if (hour.isNauticalTwilight) return 'rgba(59,130,246,0.07)';
  if (hour.isCivilTwilight) return 'rgba(251,146,60,0.06)';
  return 'rgba(255,255,255,0.035)';
}

function lineTickColorForHour(hour: AstroHourRow) {
  if (hour.isTrueDark) return 'rgba(255,255,255,0.16)';
  if (hour.isAstronomicalTwilight) return 'rgba(255,255,255,0.14)';
  if (hour.isNauticalTwilight) return 'rgba(255,255,255,0.12)';
  if (hour.isCivilTwilight) return 'rgba(255,255,255,0.10)';
  return 'rgba(255,255,255,0.06)';
}

function hourLabel(hour: AstroHourRow, index: number, total: number) {
  const shouldShow =
    total <= 16 ||
    index === 0 ||
    index === total - 1 ||
    index % 2 === 0;

  return shouldShow ? hour.timeLabel : '';
}

export function SkyScoreChart({
  hours,
  title = 'Sky Score Trend',
}: Props) {
  const chart = useMemo(() => {
    if (!hours.length) return null;

    const is72h = hours.length > 18;
    const colW = is72h ? 34 : 44;
    const width = Math.max(320, hours.length * colW);
    const height = 206;
    const padL = 30;
    const padR = 16;
    const padT = 18;
    const padB = 38;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;
    const stepX = hours.length <= 1 ? 0 : plotW / (hours.length - 1);

    const xFor = (i: number) =>
      padL + (hours.length <= 1 ? plotW / 2 : (i / (hours.length - 1)) * plotW);

    const yFor = (score: number) => padT + (1 - score / 100) * plotH;

    const linePoints = hours
      .map((h, i) => `${xFor(i)},${yFor(h.score)}`)
      .join(' ');

    const areaPath = [
      `M ${xFor(0)} ${padT + plotH}`,
      ...hours.map((h, i) => `L ${xFor(i)} ${yFor(h.score)}`),
      `L ${xFor(hours.length - 1)} ${padT + plotH}`,
      'Z',
    ].join(' ');

    const best = [...hours].sort((a, b) => b.score - a.score)[0];
    const bestIndex = hours.findIndex((h) => h.time === best.time);

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      stepX,
      xFor,
      yFor,
      linePoints,
      areaPath,
      best,
      bestIndex,
      is72h,
    };
  }, [hours]);

  if (!chart || !hours.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {title || (hours.length > 18 ? 'Sky Score Trend (72h)' : 'Sky Score Trend')}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Svg width={chart.width} height={chart.height}>
          <Rect
            x={0}
            y={0}
            width={chart.width}
            height={chart.height}
            fill="transparent"
          />

          {hours.map((h, i) => {
            const x = chart.xFor(i);
            const left =
              i === 0 ? chart.padL : x - chart.stepX / 2;
            const right =
              i === hours.length - 1
                ? chart.width - chart.padR
                : x + chart.stepX / 2;

            return (
              <Rect
                key={`bg-${h.time}`}
                x={left}
                y={chart.padT}
                width={Math.max(0, right - left)}
                height={chart.plotH}
                fill={backgroundFillForHour(h)}
              />
            );
          })}

          {[0, 25, 50, 75, 100].map((tick) => {
            const y = chart.yFor(tick);
            return (
              <React.Fragment key={tick}>
                <Line
                  x1={chart.padL}
                  y1={y}
                  x2={chart.width - chart.padR}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                />
                <SvgText
                  x={4}
                  y={y + 4}
                  fill="rgba(255,255,255,0.45)"
                  fontSize="10"
                >
                  {tick}
                </SvgText>
              </React.Fragment>
            );
          })}

          {hours.map((h, i) => {
            if (!isDaylightHour(h)) return null;
            const x = chart.xFor(i);
            const left = i === 0 ? chart.padL : x - chart.stepX / 2;
            const right =
              i === hours.length - 1
                ? chart.width - chart.padR
                : x + chart.stepX / 2;

            return (
              <Rect
                key={`day-${h.time}`}
                x={left}
                y={chart.padT}
                width={Math.max(0, right - left)}
                height={chart.plotH}
                fill="rgba(255,255,255,0.035)"
              />
            );
          })}

          <Path d={chart.areaPath} fill="rgba(59,130,246,0.10)" />
          <Polyline
            points={chart.linePoints}
            fill="none"
            stroke="#60A5FA"
            strokeWidth={3}
          />

          {hours.map((h, i) => {
            const x = chart.xFor(i);
            const y = chart.yFor(h.score);
            const isBest = i === chart.bestIndex;
            const fill = isBest ? '#FBBF24' : scoreColor(h.score);
            const opacity = hourVisualOpacity(h);

            return (
              <React.Fragment key={h.time}>
                <Line
                  x1={x}
                  y1={chart.padT + chart.plotH}
                  x2={x}
                  y2={chart.padT + chart.plotH + 6}
                  stroke={lineTickColorForHour(h)}
                  strokeWidth={1}
                />
                {!!hourLabel(h, i, hours.length) && (
                  <SvgText
                    x={x - 9}
                    y={chart.height - 10}
                    fill={`rgba(255,255,255,${0.30 + opacity * 0.35})`}
                    fontSize="10"
                  >
                    {hourLabel(h, i, hours.length)}
                  </SvgText>
                )}
                <Rect
                  x={x - (isBest ? 4 : 3)}
                  y={y - (isBest ? 4 : 3)}
                  width={isBest ? 8 : 6}
                  height={isBest ? 8 : 6}
                  rx={999}
                  ry={999}
                  fill={fill}
                  opacity={opacity}
                />
              </React.Fragment>
            );
          })}
        </Svg>
      </ScrollView>

      <Text style={styles.caption}>
        Peak {chart.best.score} at {chart.best.timeLabel}
        {chart.is72h ? ' • Daytime dimmed' : ''}
      </Text>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
          <Text style={styles.legendText}>Day</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: 'rgba(251,146,60,0.16)' }]} />
          <Text style={styles.legendText}>Civil</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: 'rgba(59,130,246,0.18)' }]} />
          <Text style={styles.legendText}>Nautical</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: 'rgba(139,92,246,0.18)' }]} />
          <Text style={styles.legendText}>Astro</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: 'rgba(99,102,241,0.22)' }]} />
          <Text style={styles.legendText}>True dark</Text>
        </View>
      </View>
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
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  caption: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 8,
    paddingHorizontal: 16,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  legendText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '700',
  },
});