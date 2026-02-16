// components/land/ClimatologyChart.tsx
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

import type { LastYearSeries, MonthlyNormalsF } from '../../app/lib/climatology/types';

type SeriesKey = 'tminF' | 'tavgF' | 'tmaxF';

type Props = {
  title?: string;
  normals: MonthlyNormalsF[];
  stationName?: string;

  selectedDoy?: number; // 1..365
  markerLabel?: string;

  /** NEW: called when user scrubs the chart */
  onSelectDoy?: (doy: number) => void;

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
  const out = vals.slice();
  let last: number | null = null;
  for (let i = 0; i < out.length; i++) {
    if (out[i] == null && last != null) out[i] = last;
    if (out[i] != null) last = out[i]!;
  }
  last = null;
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] == null && last != null) out[i] = last;
    if (out[i] != null) last = out[i]!;
  }
  for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = 0;
  return out as number[];
}

function interpolateDailyFromMonthly(monthly12: number[]) {
  const anchors = monthly12;
  const daily = new Array<number>(365);

  for (let d = 1; d <= 365; d++) {
    let j = 0;
    const du = d <= MONTH_MID_DOY[0] ? d + 365 : d;

    const midsU2 = MONTH_MID_DOY.concat([MONTH_MID_DOY[0] + 365]);

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

function fmtInches(v: number | null | undefined) {
  if (v == null) return '—';
  if (!Number.isFinite(v)) return '—';
  if (v < 0.005) return '0.00"';
  return `${v.toFixed(2)}"`;
}

function monthFromDoy(doy1: number) {
  const d = clamp(doy1, 1, 365);
  for (let i = 11; i >= 0; i--) {
    if (d >= MONTH_START_DOY[i]) return i + 1; // 1..12
  }
  return 1;
}

export function ClimatologyChart({
  title = 'Almanac',
  normals,
  stationName,
  selectedDoy,
  markerLabel,
  onSelectDoy,
  precipMonthlyIn,
  lastYear,
}: Props) {
  const [scrubDoy, setScrubDoy] = useState<number | null>(null);
  const scrubbingRef = useRef(false);

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

  const doyForX = (x: number) => {
    // x is local within the SVG/view box (0..W)
    const clamped = clamp(x, PAD_L, PAD_L + innerW);
    const t = (clamped - PAD_L) / innerW; // 0..1
    return clamp(1 + Math.round(t * 364), 1, 365);
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

  const precipPath = useMemo(() => {
    if (!precipMonthlyIn || precipMonthlyIn.length < 12) return '';

    const vals = precipMonthlyIn.slice(0, 12).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
    const max = Math.max(...vals);
    if (!Number.isFinite(max) || max <= 0) return '';

    const baseY = PAD_T + innerH;
    const peakH = 28;

    const pts = vals.map((v, i) => {
      const x = xForDoy(MONTH_START_DOY[i]);
      const h = (v / max) * peakH;
      const y = baseY - h;
      return { x, y };
    });

    return [
      `M ${PAD_L.toFixed(2)} ${baseY.toFixed(2)}`,
      ...pts.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`),
      `L ${(PAD_L + innerW).toFixed(2)} ${baseY.toFixed(2)}`,
      'Z',
    ].join(' ');
  }, [precipMonthlyIn, innerW, innerH]);

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

  const activeDoy = scrubDoy ?? selectedDoy ?? null;
  const markerX = activeDoy ? xForDoy(activeDoy) : null;

  const markerText = useMemo(() => {
    if (!activeDoy) return undefined;
    if (scrubDoy != null) return 'Selected';
    return markerLabel ?? 'Today';
  }, [activeDoy, scrubDoy, markerLabel]);

  const detail = useMemo(() => {
    if (!activeDoy) return null;
    const idx = clamp(activeDoy, 1, 365) - 1;

    const tmin = daily.tmin[idx];
    const tavg = daily.tavg[idx];
    const tmax = daily.tmax[idx];

    const m = monthFromDoy(activeDoy);
    const p = precipMonthlyIn && precipMonthlyIn.length >= 12 ? precipMonthlyIn[m - 1] : null;

    return {
      tmin,
      tavg,
      tmax,
      precip: typeof p === 'number' ? p : null,
      month: m,
    };
  }, [activeDoy, daily.tmin, daily.tavg, daily.tmax, precipMonthlyIn]);

  const panResponder = useMemo(() => {
    if (!onSelectDoy) return null;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        scrubbingRef.current = true;
        const x = evt.nativeEvent.locationX;
        const doy = doyForX(x);
        setScrubDoy(doy);
        onSelectDoy(doy);
      },

      onPanResponderMove: (evt) => {
        if (!scrubbingRef.current) return;
        const x = evt.nativeEvent.locationX;
        const doy = doyForX(x);
        setScrubDoy(doy);
        onSelectDoy(doy);
      },

      onPanResponderRelease: () => {
        scrubbingRef.current = false;
        setScrubDoy(null);
      },
      onPanResponderTerminate: () => {
        scrubbingRef.current = false;
        setScrubDoy(null);
      },
    });
  }, [onSelectDoy]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subTitle} numberOfLines={1}>
            {stationName ? `30-yr normals • ${stationName}` : '30-yr monthly normals (interpolated daily)'}
          </Text>

          {/* NEW: single detail line */}
          {detail ? (
            <Text style={styles.detailLine} numberOfLines={1}>
              Typical low: {Math.round(detail.tmin)}°   Avg: {Math.round(detail.tavg)}°   Typical high: {Math.round(detail.tmax)}°
              {'   '}Avg precip: {fmtInches(detail.precip)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Wrap the SVG in a View that receives touches */}
      <View {...(panResponder ? panResponder.panHandlers : {})}>
        <Svg width={W} height={H}>
          <Defs>
            <LinearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(255,255,255,0.10)" />
              <Stop offset="1" stopColor="rgba(255,255,255,0.03)" />
            </LinearGradient>

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

          {/* series lines (all 3, with avg emphasized) */}
          {(['tminF', 'tavgF', 'tmaxF'] as SeriesKey[]).map((k) => {
            const d = pathFor(k);
            const isFocus = k === 'tavgF';
            const stroke =
              k === 'tminF' ? 'rgba(255,255,255,0.45)' : k === 'tmaxF' ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.92)';
            return (
              <Path key={k} d={d} stroke={stroke} strokeWidth={isFocus ? 2.8 : 1.6} opacity={isFocus ? 1 : 0.55} fill="none" />
            );
          })}

          {/* marker line */}
          {markerX != null ? (
            <G>
              <Line x1={markerX} y1={PAD_T} x2={markerX} y2={PAD_T + innerH} stroke="rgba(160,220,255,0.35)" strokeWidth={1.5} />
              {markerText ? (
                <SvgText x={markerX + 6} y={PAD_T + 12} fontSize="10" fill="rgba(160,220,255,0.75)" fontWeight="900" textAnchor="start">
                  {markerText}
                </SvgText>
              ) : null}
            </G>
          ) : null}
        </Svg>
      </View>

      <Text style={styles.footer}>
        Tip: drag on the chart to scrub days. Precip is monthly normal for the selected day’s month.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.textPrimary },
  subTitle: { marginTop: 2, fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '700' },

  detailLine: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.82)',
  },

  footer: { marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
});

export default ClimatologyChart;