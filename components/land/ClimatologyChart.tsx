// components/land/ClimatologyChart.tsx
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

import type { LastYearSeries, MonthlyNormalsF } from '../../app/lib/climatology/types';

type SeriesKey = 'tminF' | 'tavgF' | 'tmaxF';

type Props = {
  title?: string;
  normals: MonthlyNormalsF[]; // ideally 12 entries (or partial)
  stationName?: string;

  /** Optional selected day-of-year marker (1..365). If omitted, no marker is drawn. */
  selectedDoy?: number;

  /** Optional label displayed near the marker (e.g., "Today", "Feb 8"). */
  markerLabel?: string;

  /** Optional monthly precip normals (inches), 12 entries month=1..12 */
  precipMonthlyIn?: Array<number | null>;

  /** Optional last-year daily overlay (°F), arrays should be length 365 */
  lastYear?: LastYearSeries;
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

// Midpoints (day-of-year) for each month (non-leap). Used as anchors for interpolation.
const MONTH_MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
// Approx start-of-month doy for label placement
const MONTH_START_DOY = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function fillMissing12(vals: Array<number | null>) {
  // simple forward/back fill so interpolation doesn't collapse on partial data
  const out = vals.slice();
  // forward fill
  let last: number | null = null;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null && last != null) out[i] = last;
    if (out[i] != null) last = out[i]!;
  }
  // backward fill
  last = null;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] == null && last != null) out[i] = last;
    if (out[i] != null) last = out[i]!;
  }
  // if still null (all missing) set to 0
  for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = 0;
  return out as number[];
}

/**
 * Build a smooth daily series (length 365) by interpolating between monthly midpoint anchors.
 * Uses circular wrap (Dec -> Jan).
 */
function interpolateDailyFromMonthly(monthly12: number[]) {
  const anchors = monthly12;
  const daily = new Array<number>(365);

  for (let d = 1; d <= 365; d++) {
    let j = 0;
    const du = d <= MONTH_MID_DOY[0] ? d + 365 : d;

    const midsU = MONTH_MID_DOY.map((x) => x);
    const midsU2 = midsU.concat([MONTH_MID_DOY[0] + 365]);

    for (let k = 0; k < 12; k++) {
      const a = midsU2[k];
      const b = midsU2[k + 1];
      if (du >= a && du <= b) {
        j = k;
        break;
      }
    }

    const aMid = midsU2[j];
    const bMid = midsU2[j + 1];
    const t = bMid === aMid ? 0 : (du - aMid) / (bMid - aMid);

    const aVal = anchors[j % 12];
    const bVal = anchors[(j + 1) % 12];

    daily[d - 1] = lerp(aVal, bVal, clamp(t, 0, 1));
  }

  return daily;
}

function numOrNull(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function ClimatologyChart({
  title = 'Almanac',
  normals,
  stationName,
  selectedDoy,
  markerLabel,
  precipMonthlyIn,
  lastYear,
}: Props) {
  const [focus, setFocus] = useState<SeriesKey>('tavgF');

  const W = 360;
  const H = 240;
  const PAD_L = 36;
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 34;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xForDoy = (doy1: number) => {
    const d = clamp(doy1, 1, 365) - 1;
    return PAD_L + (d / 364) * innerW;
  };

  const monthly = useMemo(() => {
    const byMonth = new Array<MonthlyNormalsF | null>(12).fill(null);
    for (const m of normals) {
      const idx = clamp((m.month ?? 1) - 1, 0, 11);
      byMonth[idx] = m;
    }

    const tmin12 = fillMissing12(byMonth.map((m) => (m?.tminF ?? null) as number | null));
    const tavg12 = fillMissing12(byMonth.map((m) => (m?.tavgF ?? null) as number | null));
    const tmax12 = fillMissing12(byMonth.map((m) => (m?.tmaxF ?? null) as number | null));

    return { tmin12, tavg12, tmax12 };
  }, [normals]);

  const daily = useMemo(() => {
    const tmin = interpolateDailyFromMonthly(monthly.tmin12);
    const tavg = interpolateDailyFromMonthly(monthly.tavg12);
    const tmax = interpolateDailyFromMonthly(monthly.tmax12);
    return { tmin, tavg, tmax };
  }, [monthly.tmin12, monthly.tavg12, monthly.tmax12]);

  const values = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 365; i++) arr.push(daily.tmin[i], daily.tavg[i], daily.tmax[i]);

    // Include last-year values in scale if present (prevents last-year from clipping).
    if (lastYear?.tminF?.length && lastYear?.tmaxF?.length) {
      const a = lastYear.tminF.slice(0, 365).map(numOrNull).filter((x): x is number => x != null);
      const b = lastYear.tmaxF.slice(0, 365).map(numOrNull).filter((x): x is number => x != null);
      arr.push(...a, ...b);
    }

    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const pad = Math.max(6, (max - min) * 0.12);
    return { min: min - pad, max: max + pad };
  }, [daily.tmin, daily.tavg, daily.tmax, lastYear?.tminF, lastYear?.tmaxF]);

  const yForVal = (v: number) => PAD_T + (1 - norm(v, values.min, values.max)) * innerH;

  const ticks = useMemo(() => {
    const n = 4;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(values.min + (i / (n - 1)) * (values.max - values.min));
    return out;
  }, [values.min, values.max]);

  const seriesPts = useMemo(() => {
    const mk = (arr: number[]) =>
      arr.map((v, i) => ({
        x: PAD_L + (i / 364) * innerW,
        y: yForVal(v),
        v,
        doy: i + 1,
      }));

    return {
      tmin: mk(daily.tmin),
      tavg: mk(daily.tavg),
      tmax: mk(daily.tmax),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily.tmin, daily.tavg, daily.tmax, values.min, values.max, innerW, innerH]);

  const bandPath = useMemo(() => {
    const top = seriesPts.tmax;
    const bot = seriesPts.tmin.slice().reverse();
    const pts = top.concat(bot);
    if (!pts.length) return '';
    return `${buildPath(pts)} Z`;
  }, [seriesPts.tmax, seriesPts.tmin]);

  // --- NEW: precip "mountain" (monthly precip normals) ---
  const precipPath = useMemo(() => {
    if (!precipMonthlyIn || precipMonthlyIn.length < 12) return '';

    const vals = precipMonthlyIn.slice(0, 12).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
    const max = Math.max(...vals);
    if (!Number.isFinite(max) || max <= 0) return '';

    const baseY = PAD_T + innerH; // bottom of chart area
    const peakH = 28; // height of mountain

    // Use month starts for x placement
    const pts = vals.map((v, i) => {
      const x = xForDoy(MONTH_START_DOY[i]);
      const h = (v / max) * peakH;
      const y = baseY - h;
      return { x, y };
    });

    // Construct filled area (left base -> peaks -> right base)
    const d = [
      `M ${PAD_L.toFixed(2)} ${baseY.toFixed(2)}`,
      ...pts.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
      `L ${(PAD_L + innerW).toFixed(2)} ${baseY.toFixed(2)}`,
      'Z',
    ].join(' ');

    return d;
  }, [precipMonthlyIn, innerW, innerH]);

  // --- NEW: last year overlay band (daily min/max) ---
  const lastYearBandPath = useMemo(() => {
    const lyMin = lastYear?.tminF;
    const lyMax = lastYear?.tmaxF;
    if (!lyMin || !lyMax) return '';
    if (lyMin.length < 365 || lyMax.length < 365) return '';

    const top = lyMax.slice(0, 365).map((v, i) => {
      const n = numOrNull(v);
      const y = n == null ? yForVal(daily.tmax[i]) : yForVal(n);
      return { x: PAD_L + (i / 364) * innerW, y };
    });

    const bot = lyMin
      .slice(0, 365)
      .reverse()
      .map((v, revIdx) => {
        const i = 364 - revIdx;
        const n = numOrNull(v);
        const y = n == null ? yForVal(daily.tmin[i]) : yForVal(n);
        return { x: PAD_L + (i / 364) * innerW, y };
      });

    const pts = top.concat(bot);
    if (!pts.length) return '';
    return `${buildPath(pts)} Z`;
  }, [lastYear?.tminF, lastYear?.tmaxF, innerW, daily.tmin, daily.tmax, values.min, values.max]);

  const pathFor = (k: SeriesKey) => {
    const pts = k === 'tminF' ? seriesPts.tmin : k === 'tavgF' ? seriesPts.tavg : seriesPts.tmax;
    return buildPath(pts);
  };

  const strokeFor = (k: SeriesKey) => {
    if (k === 'tminF') return 'rgba(255,255,255,0.45)';
    if (k === 'tmaxF') return 'rgba(255,255,255,0.70)';
    return 'rgba(255,255,255,0.92)';
  };

  const markerX = selectedDoy ? xForDoy(selectedDoy) : null;
  const markerText = markerLabel ?? (selectedDoy ? 'Today' : undefined);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subTitle} numberOfLines={1}>
            {stationName ? `30-yr normals • ${stationName}` : '30-yr monthly normals (interpolated daily)'}
          </Text>
        </View>

        <View style={styles.pills}>
          <Pill label="Min" active={focus === 'tminF'} onPress={() => setFocus('tminF')} />
          <Pill label="Avg" active={focus === 'tavgF'} onPress={() => setFocus('tavgF')} />
          <Pill label="Max" active={focus === 'tmaxF'} onPress={() => setFocus('tmaxF')} />
        </View>
      </View>

      <Svg width={W} height={H}>
        <Defs>
          <LinearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="rgba(255,255,255,0.10)" />
            <Stop offset="1" stopColor="rgba(255,255,255,0.03)" />
          </LinearGradient>

          {/* precip gradient */}
          <LinearGradient id="precipGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="rgba(160,220,255,0.18)" />
            <Stop offset="1" stopColor="rgba(160,220,255,0.04)" />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={W} height={H} rx={18} fill="rgba(255,255,255,0.02)" />

        {/* precip mountain behind everything (subtle) */}
        {precipPath ? <Path d={precipPath} fill="url(#precipGrad)" /> : null}

        {/* last year overlay band (behind normals band) */}
        {lastYearBandPath ? (
          <Path d={lastYearBandPath} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
        ) : null}

        {/* normals band */}
        <Path d={bandPath} fill="url(#bandGrad)" />

        {/* grid + ticks */}
        {ticks.map((t, idx) => {
          const y = yForVal(t);
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
        {MONTH_START_DOY.map((doy, i) => (
          <SvgText
            key={`ml-${i}`}
            x={xForDoy(doy)}
            y={PAD_T + innerH + 22}
            fontSize="10"
            fill="rgba(255,255,255,0.55)"
            fontWeight="900"
            textAnchor="middle"
          >
            {monthLabel(i + 1)}
          </SvgText>
        ))}

        {/* series lines */}
        {(['tminF', 'tavgF', 'tmaxF'] as SeriesKey[]).map((k) => {
          const d = pathFor(k);
          const isFocus = focus === k;
          return (
            <Path
              key={k}
              d={d}
              stroke={strokeFor(k)}
              strokeWidth={isFocus ? 2.8 : 1.6}
              opacity={isFocus ? 1 : 0.55}
              fill="none"
            />
          );
        })}

        {/* marker line */}
        {markerX != null ? (
          <G>
            <Line
              x1={markerX}
              y1={PAD_T}
              x2={markerX}
              y2={PAD_T + innerH}
              stroke="rgba(160,220,255,0.35)"
              strokeWidth={1.5}
            />
            {markerText ? (
              <SvgText
                x={markerX + 6}
                y={PAD_T + 12}
                fontSize="10"
                fill="rgba(160,220,255,0.75)"
                fontWeight="900"
                textAnchor="start"
              >
                {markerText}
              </SvgText>
            ) : null}
          </G>
        ) : null}
      </Svg>

      <Text style={styles.footer}>
        Tip: normals are a smooth “season curve” (monthly → daily). Precip + last year show when available.
      </Text>
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