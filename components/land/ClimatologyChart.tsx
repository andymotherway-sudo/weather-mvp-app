// components/land/ClimatologyChart.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

import type { MonthlyNormalsF } from '../../app/lib/climatology/types';

type SeriesKey = 'tminF' | 'tavgF' | 'tmaxF';

type Props = {
  title?: string;
  normals: MonthlyNormalsF[]; // 12 entries (or partial)
  stationName?: string;
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function norm(v: number, min: number, max: number) {
  if (max === min) return 0.5;
  return (v - min) / (max - min);
}

function buildPath(points: { x: number; y: number }[]) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function monthLabel(m: number) {
  return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][clamp(m, 1, 12) - 1];
}

export function ClimatologyChart({ title = 'Climatology', normals, stationName }: Props) {
  const [focus, setFocus] = useState<SeriesKey>('tavgF');

  const W = 360;
  const H = 220;
  const PAD_L = 34;
  const PAD_R = 18;
  const PAD_T = 18;
  const PAD_B = 26;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const values = useMemo(() => {
    const arr: number[] = [];
    for (const m of normals) {
      if (m.tminF != null) arr.push(m.tminF);
      if (m.tavgF != null) arr.push(m.tavgF);
      if (m.tmaxF != null) arr.push(m.tmaxF);
    }
    if (!arr.length) return { min: 0, max: 100 };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const pad = Math.max(6, (max - min) * 0.12);
    return { min: min - pad, max: max + pad };
  }, [normals]);

  const xForMonthIdx = (i: number) => PAD_L + (i / 11) * innerW;

  const seriesPts = useMemo(() => {
    const mk = (key: SeriesKey) =>
      normals
        .map((m, i) => {
          const v = (m as any)[key] as number | null;
          if (v == null) return null;
          const x = xForMonthIdx(i);
          const y = PAD_T + (1 - norm(v, values.min, values.max)) * innerH;
          return { x, y, v, month: m.month };
        })
        .filter(Boolean) as Array<{ x: number; y: number; v: number; month: number }>;

    return {
      tmin: mk('tminF'),
      tavg: mk('tavgF'),
      tmax: mk('tmaxF'),
    };
  }, [normals, values.min, values.max, innerH]);

  const bandRects = useMemo(() => {
    // Shaded band between Tmin and Tmax
    const rects: Array<{ x: number; y: number; h: number; w: number }> = [];
    for (let i = 0; i < normals.length; i++) {
      const m = normals[i];
      if (m.tminF == null || m.tmaxF == null) continue;

      const x = xForMonthIdx(i);
      const nextX = i < 11 ? xForMonthIdx(i + 1) : x + innerW / 11;
      const w = Math.max(8, nextX - x);

      const yMax = PAD_T + (1 - norm(m.tmaxF, values.min, values.max)) * innerH;
      const yMin = PAD_T + (1 - norm(m.tminF, values.min, values.max)) * innerH;

      const top = Math.min(yMax, yMin);
      const bottom = Math.max(yMax, yMin);
      rects.push({ x: x - w / 2 + 1, y: top, h: bottom - top, w: w - 2 });
    }
    return rects;
  }, [normals, values.min, values.max, innerH]);

  const ticks = useMemo(() => {
    // simple 4 ticks
    const n = 4;
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      out.push(values.min + (i / (n - 1)) * (values.max - values.min));
    }
    return out;
  }, [values.min, values.max]);

  const strokeFor = (k: SeriesKey) => {
    // keep consistent with your aesthetic; no explicit color requirement from you
    // (using subtle whites w/ different opacity)
    if (k === 'tminF') return 'rgba(255,255,255,0.45)';
    if (k === 'tmaxF') return 'rgba(255,255,255,0.70)';
    return 'rgba(255,255,255,0.90)';
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subTitle} numberOfLines={1}>
            {stationName ? `Normals • ${stationName}` : 'Monthly normals'}
          </Text>
        </View>

        <View style={styles.pills}>
          <Pill label="Min" active={focus === 'tminF'} onPress={() => setFocus('tminF')} />
          <Pill label="Avg" active={focus === 'tavgF'} onPress={() => setFocus('tavgF')} />
          <Pill label="Max" active={focus === 'tmaxF'} onPress={() => setFocus('tmaxF')} />
        </View>
      </View>

      <Svg width={W} height={H}>
        <Rect x={0} y={0} width={W} height={H} rx={18} fill="rgba(255,255,255,0.02)" />

        {/* band */}
        {bandRects.map((r, idx) => (
          <Rect key={`b-${idx}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.06)" rx={6} />
        ))}

        {/* grid + ticks */}
        {ticks.map((t, idx) => {
          const y = PAD_T + (1 - norm(t, values.min, values.max)) * innerH;
          return (
            <G key={`tick-${idx}`}>
              <Line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              <SvgText
                x={PAD_L - 6}
                y={y + 3}
                fontSize="9"
                fill="rgba(255,255,255,0.40)"
                fontWeight="800"
                textAnchor="end"
              >
                {Math.round(t)}
              </SvgText>
            </G>
          );
        })}

        {/* month labels */}
        {normals.map((m, i) => (
          <SvgText
            key={`m-${m.month}-${i}`}
            x={xForMonthIdx(i)}
            y={PAD_T + innerH + 18}
            fontSize="10"
            fill="rgba(255,255,255,0.55)"
            fontWeight="900"
            textAnchor="middle"
          >
            {monthLabel(m.month)}
          </SvgText>
        ))}

        {/* lines */}
        {(['tminF', 'tavgF', 'tmaxF'] as SeriesKey[]).map((k) => {
          const pts =
            k === 'tminF' ? seriesPts.tmin : k === 'tavgF' ? seriesPts.tavg : seriesPts.tmax;
          if (!pts.length) return null;

          const d = buildPath(pts);

          const isFocus = focus === k;
          return (
            <Path
              key={k}
              d={d}
              stroke={strokeFor(k)}
              strokeWidth={isFocus ? 2.75 : 1.6}
              opacity={isFocus ? 1 : 0.55}
              fill="none"
            />
          );
        })}
      </Svg>

      <Text style={styles.footer}>Tip: this is “calendar-year” context for your location (monthly normals).</Text>
    </Card>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.textPrimary },
  subTitle: { marginTop: 2, fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '700' },

  pills: { flexDirection: 'row', gap: 8 },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pillActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  pillText: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.75)' },
  pillTextActive: { color: 'white' },

  footer: { marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
});

export default ClimatologyChart;
