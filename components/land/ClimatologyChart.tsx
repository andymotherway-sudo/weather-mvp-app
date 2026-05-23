// components/land/ClimatologyChart.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  onSelectDoy?: (doy: number) => void;

  precipMonthlyIn?: Array<number | null>;
  lastYear?: LastYearSeries;
  chartWidth?: number;
  chartHeight?: number;
  allowExpand?: boolean;
  expanded?: boolean;
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
function buildLinePath(points: { x: number; y: number | null }[]) {
  let out = '';
  let open = false;
  for (const p of points) {
    if (p.y == null || !Number.isFinite(p.y)) {
      open = false;
      continue;
    }
    out += `${open ? ' L' : ' M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    open = true;
  }
  return out.trim();
}
function monthLabel(m: number) {
  return ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'][clamp(m, 1, 12) - 1];
}

const MONTH_MID_DOY = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];
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

function fmtTempPair(low: number | null | undefined, high: number | null | undefined) {
  const lo = typeof low === 'number' && Number.isFinite(low) ? Math.round(low) : '--';
  const hi = typeof high === 'number' && Number.isFinite(high) ? Math.round(high) : '--';
  return `${lo} / ${hi}`;
}

function smoothSeries(valsIn?: Array<number | null>, radius = 3) {
  if (!Array.isArray(valsIn) || !valsIn.length) return [];
  const vals = valsIn.map(numOrNull);
  return vals.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(vals.length - 1, i + radius); j++) {
      const v = vals[j];
      if (v == null || !Number.isFinite(v)) continue;
      sum += v;
      count += 1;
    }
    return count ? sum / count : null;
  });
}
function fmtShortTemp(v: number | null | undefined) {
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}°` : '--';
}

function monthFromDoy(doy1: number) {
  const d = clamp(doy1, 1, 365);
  for (let i = 11; i >= 0; i--) {
    if (d >= MONTH_START_DOY[i]) return i + 1;
  }
  return 1;
}

// ✅ SVG animated components
const AView = Animated.createAnimatedComponent(View);

export function ClimatologyChart({
  title = 'Almanac',
  normals,
  stationName,
  selectedDoy,
  markerLabel,
  onSelectDoy,
  precipMonthlyIn,
  lastYear,
  chartWidth,
  chartHeight,
  allowExpand = true,
  expanded = false,
}: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [scrubDoy, setScrubDoy] = useState<number | null>(null);
  const [zoomWindow, setZoomWindow] = useState<{ start: number; end: number }>({ start: 1, end: 365 });
  const [expandOpen, setExpandOpen] = useState(false);
  const [chartBoxWidth, setChartBoxWidth] = useState(0);
  const scrubbingRef = useRef(false);
  const pinchRef = useRef<{
    startDistance: number;
    startSpan: number;
    centerDoy: number;
  } | null>(null);

  // ---- Layout
  const measuredPreviewWidth = chartBoxWidth > 0 ? Math.floor(chartBoxWidth) : 0;
  const fallbackPreviewWidth = Math.max(260, Math.min(360, Math.floor(windowWidth - 88)));
  const W = chartWidth ?? Math.max(260, Math.min(360, measuredPreviewWidth || fallbackPreviewWidth));
  const H = chartHeight ?? Math.max(210, Math.min(240, Math.round(W * 0.66)));
  const PAD_L = 36;
  const PAD_R = 16;
  const PAD_T = 18;
  const PAD_B = 34;

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const visibleSpan = Math.max(1, zoomWindow.end - zoomWindow.start);

  const xForDoy = (doy1: number) => {
    const d = clamp(doy1, zoomWindow.start, zoomWindow.end) - zoomWindow.start;
    return PAD_L + (d / visibleSpan) * innerW;
  };

  const doyForX = (x: number) => {
    const clamped = clamp(x, PAD_L, PAD_L + innerW);
    const t = (clamped - PAD_L) / innerW;
    return clamp(zoomWindow.start + Math.round(t * visibleSpan), 1, 365);
  };

  const distanceBetweenTouches = (touches: readonly any[]) => {
    if (!touches || touches.length < 2) return 0;
    const [a, b] = touches;
    const dx = (b.pageX ?? 0) - (a.pageX ?? 0);
    const dy = (b.pageY ?? 0) - (a.pageY ?? 0);
    return Math.sqrt(dx * dx + dy * dy);
  };

  const midpointLocationX = (touches: readonly any[]) => {
    if (!touches || touches.length < 2) return null;
    const [a, b] = touches;
    const ax = a.locationX ?? a.pageX ?? 0;
    const bx = b.locationX ?? b.pageX ?? 0;
    return (ax + bx) / 2;
  };

  // ---- Data prep
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

  for (let i = 0; i < 365; i++) {
    const a = daily.tmin[i];
    const b = daily.tavg[i];
    const c = daily.tmax[i];

    if (Number.isFinite(a)) arr.push(a);
    if (Number.isFinite(b)) arr.push(b);
    if (Number.isFinite(c)) arr.push(c);
  }

  if (lastYear?.tminF?.length && lastYear?.tmaxF?.length) {
    const a = lastYear.tminF.slice(0, 365).map(numOrNull);
    const b = lastYear.tmaxF.slice(0, 365).map(numOrNull);

    for (const v of a) if (v != null && Number.isFinite(v)) arr.push(v);
    for (const v of b) if (v != null && Number.isFinite(v)) arr.push(v);
  }

  if (arr.length < 2) {
    return { min: 0, max: 100 };
  }

  let min = Math.min(...arr);
  let max = Math.max(...arr);

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 100 };
  }

  if (min === max) {
    min -= 1;
    max += 1;
  }

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

  if (!top.length || !bot.length) return '';

  const pts = top.concat(bot);
  if (!pts.length) return '';

  return `${buildPath(pts)} Z`;
}, [seriesPts.tmax, seriesPts.tmin]);

  const buildPrecipShape = (valsIn?: Array<number | null>) => {
    if (!valsIn || valsIn.length < 12) return { area: '', ridge: '' };

    const vals = valsIn.slice(0, 12).map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0));
    const max = vals.length ? Math.max(...vals) : 0;
    if (!Number.isFinite(max) || max <= 0) return { area: '', ridge: '' };

    const baseY = PAD_T + innerH;
    const peakH = 16;
    const referenceMax = 6;
    const monthPts = vals.map((v, i) => {
      const x = xForDoy(MONTH_START_DOY[i]);
      const intensity = Math.sqrt(clamp(v / referenceMax, 0, 1));
      return { x, y: baseY - intensity * peakH };
    });

    const left = { x: PAD_L, y: monthPts[0]?.y ?? baseY };
    const right = { x: PAD_L + innerW, y: monthPts[monthPts.length - 1]?.y ?? baseY };
    const pts = [left, ...monthPts, right];
    const ridge = buildPath(pts);
    const area =
      pts.length >= 2
        ? `${ridge} L ${right.x.toFixed(2)} ${baseY.toFixed(2)} L ${left.x.toFixed(2)} ${baseY.toFixed(2)} Z`
        : '';

    return { area, ridge };
  };

  const buildDailyPrecipShape = (valsIn?: Array<number | null>) => {
    if (!Array.isArray(valsIn) || valsIn.length < 365) return { area: '', ridge: '' };

    const vals = valsIn
      .slice(0, 365)
      .map((v) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, v) : 0));
    const max = vals.length ? Math.max(...vals) : 0;
    if (!Number.isFinite(max) || max <= 0) return { area: '', ridge: '' };

    const baseY = PAD_T + innerH;
    const peakH = 24;
    const referenceMax = Math.max(0.2, Math.min(1.5, max));
    const pts = vals.map((v, i) => ({
      x: PAD_L + (i / 364) * innerW,
      y: baseY - Math.sqrt(clamp(v / referenceMax, 0, 1)) * peakH,
    }));

    const ridge = buildPath(pts);
    const left = pts[0];
    const right = pts[pts.length - 1];
    const area =
      pts.length >= 2
        ? `${ridge} L ${right.x.toFixed(2)} ${baseY.toFixed(2)} L ${left.x.toFixed(2)} ${baseY.toFixed(2)} Z`
        : '';

    return { area, ridge };
  };

  const precipShape = useMemo(() => buildPrecipShape(precipMonthlyIn), [precipMonthlyIn, innerW, innerH]);
  const lastYearPrecipShape = useMemo(
    () => buildDailyPrecipShape(lastYear?.precipDailyIn),
    [lastYear?.precipDailyIn, innerW, innerH]
  );
  const smoothedLastYearHigh = useMemo(() => smoothSeries(lastYear?.tmaxF, 3), [lastYear?.tmaxF]);
  const smoothedLastYearLow = useMemo(() => smoothSeries(lastYear?.tminF, 3), [lastYear?.tminF]);

  const lastYearHighPath = useMemo(() => {
    const lyMax = smoothedLastYearHigh;
    if (!lyMax || lyMax.length < 365) return '';
    return buildLinePath(
      lyMax.slice(0, 365).map((v, i) => {
        const n = numOrNull(v);
        return {
          x: PAD_L + (i / 364) * innerW,
          y: n == null ? null : yForVal(n),
        };
      })
    );
  }, [smoothedLastYearHigh, innerW, values.min, values.max]);

  const lastYearLowPath = useMemo(() => {
    const lyMin = smoothedLastYearLow;
    if (!lyMin || lyMin.length < 365) return '';
    return buildLinePath(
      lyMin.slice(0, 365).map((v, i) => {
        const n = numOrNull(v);
        return {
          x: PAD_L + (i / 364) * innerW,
          y: n == null ? null : yForVal(n),
        };
      })
    );
  }, [smoothedLastYearLow, innerW, values.min, values.max]);
  const pathFor = (k: SeriesKey) => {
    const pts = k === 'tminF' ? seriesPts.tmin : k === 'tavgF' ? seriesPts.tavg : seriesPts.tmax;
    return buildPath(pts);
  };

  // ---- Premium motion: markerX eases instead of snapping
  const activeDoy = scrubDoy ?? selectedDoy ?? null;

  const markerXValue = useRef(new Animated.Value(activeDoy ? xForDoy(activeDoy) : PAD_L)).current;
  const markerAlpha = useRef(new Animated.Value(activeDoy ? 1 : 0)).current;

  useEffect(() => {
    if (!activeDoy) {
      Animated.timing(markerAlpha, { toValue: 0, duration: 140, useNativeDriver: true }).start();
      return;
    }

    Animated.parallel([
      Animated.timing(markerAlpha, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.timing(markerXValue, {
        toValue: xForDoy(activeDoy),
        duration: scrubbingRef.current ? 70 : 220,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDoy]);

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
    const lastYearPrecip =
      lastYear?.precipDailyIn && lastYear.precipDailyIn.length > idx
        ? numOrNull(lastYear.precipDailyIn[idx])
        : lastYear?.precipMonthlyIn && lastYear.precipMonthlyIn.length >= 12
          ? lastYear.precipMonthlyIn[m - 1]
          : null;
    const lastYearHigh = lastYear?.tmaxF && lastYear.tmaxF.length > idx ? numOrNull(lastYear.tmaxF[idx]) : null;
    const lastYearLow = lastYear?.tminF && lastYear.tminF.length > idx ? numOrNull(lastYear.tminF[idx]) : null;

    return {
      tmin,
      tavg,
      tmax,
      precip: typeof p === 'number' ? p : null,
      lastYearPrecip: typeof lastYearPrecip === 'number' ? lastYearPrecip : null,
      lastYearHigh,
      lastYearLow,
      month: m,
    };
  }, [activeDoy, daily.tmin, daily.tavg, daily.tmax, precipMonthlyIn, lastYear?.precipDailyIn, lastYear?.precipMonthlyIn, lastYear?.tmaxF, lastYear?.tminF]);

  // ---- Scrub handling
  const panResponder = useMemo(() => {
    if (!onSelectDoy) return null;

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (evt) => {
        if ((evt.nativeEvent.touches?.length ?? 0) >= 2) {
          scrubbingRef.current = false;
          setScrubDoy(null);

          const centerX = midpointLocationX(evt.nativeEvent.touches);
          pinchRef.current = {
            startDistance: Math.max(distanceBetweenTouches(evt.nativeEvent.touches), 1),
            startSpan: visibleSpan,
            centerDoy: centerX == null ? selectedDoy ?? 183 : doyForX(centerX),
          };
          return;
        }

        scrubbingRef.current = true;
        const x = evt.nativeEvent.locationX;
        const doy = doyForX(x);
        setScrubDoy(doy);
        onSelectDoy(doy);
      },

      onPanResponderMove: (evt) => {
        if ((evt.nativeEvent.touches?.length ?? 0) >= 2) {
          scrubbingRef.current = false;
          setScrubDoy(null);

          const pinch = pinchRef.current;
          const distance = distanceBetweenTouches(evt.nativeEvent.touches);
          const centerX = midpointLocationX(evt.nativeEvent.touches);
          if (!pinch || distance <= 0 || centerX == null) return;

          const scale = pinch.startDistance / distance;
          const nextSpan = clamp(Math.round(pinch.startSpan * scale), 20, 365);
          const centerDoy = doyForX(centerX);
          let start = Math.round(centerDoy - nextSpan / 2);
          let end = start + nextSpan;
          if (start < 1) {
            end += 1 - start;
            start = 1;
          }
          if (end > 365) {
            start -= end - 365;
            end = 365;
          }
          setZoomWindow({ start: clamp(start, 1, 345), end: clamp(end, 21, 365) });
          return;
        }

        if (!scrubbingRef.current) return;
        const x = evt.nativeEvent.locationX;
        const doy = doyForX(x);
        setScrubDoy(doy);
        onSelectDoy(doy);
      },

      onPanResponderRelease: () => {
        scrubbingRef.current = false;
        pinchRef.current = null;
        setScrubDoy(null);
      },
      onPanResponderTerminate: () => {
        scrubbingRef.current = false;
        pinchRef.current = null;
        setScrubDoy(null);
      },
    });
  }, [onSelectDoy, selectedDoy, visibleSpan, zoomWindow.start, zoomWindow.end]);

  // ---- Premium polish colors (subtler contrast)
  const C = {
    grid: 'rgba(255,255,255,0.07)',
    tick: 'rgba(255,255,255,0.42)',
    month: 'rgba(255,255,255,0.55)',
    min: 'rgba(170,190,210,0.42)',
    max: 'rgba(210,225,240,0.50)',
    lastYearHigh: 'rgba(255,110,120,0.95)',
    lastYearLow: 'rgba(110,170,255,0.95)',
    precipFill: 'rgba(34, 197, 94, 0.18)',
    precipStroke: 'rgba(34, 197, 94, 0.52)',
    precipLastYearFill: 'rgba(163, 230, 53, 0.14)',
    precipLastYearStroke: 'rgba(190, 242, 100, 0.82)',

    marker: 'rgba(125,210,255,0.55)',
    markerText: 'rgba(170,235,255,0.90)',
  };

  const markerX = activeDoy ? xForDoy(activeDoy) : PAD_L;
  const bubbleWidth = 154;
  const bubbleLeft = clamp(markerX - bubbleWidth / 2, 10, Math.max(10, W - bubbleWidth - 10));

  return (
    <>
    <Card style={[styles.card, expanded ? styles.expandedCard : null]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subTitle} numberOfLines={1}>
            {stationName ? `30-yr normals | ${stationName}` : '30-yr monthly normals (interpolated daily)'}
          </Text>

          {detail && !expanded ? (
            <View style={styles.detailBlock}>
              <Text style={styles.detailLine}>
                Normal {fmtTempPair(detail.tmin, detail.tmax)} | Prior year {fmtTempPair(detail.lastYearLow, detail.lastYearHigh)}
              </Text>
              <Text style={styles.detailLineSecondary}>
                Avg precip {fmtInches(detail.precip)} | Prior year precip {fmtInches(detail.lastYearPrecip)}
              </Text>
            </View>
          ) : null}
        </View>
        {allowExpand ? (
          <Pressable onPress={() => setExpandOpen(true)} style={styles.expandBtn}>
            <Text style={styles.expandBtnText}>Open</Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={styles.chartBox}
        onLayout={(event) => {
          const nextWidth = Math.floor(event.nativeEvent.layout.width);
          if (nextWidth > 0 && Math.abs(nextWidth - chartBoxWidth) > 1) {
            setChartBoxWidth(nextWidth);
          }
        }}
      >
      <View {...(panResponder ? panResponder.panHandlers : {})} style={[styles.chartSurface, { width: W, height: H }]}>
        {/* subtle “glass” rim behind SVG */}
        <View style={[styles.glassFrame, { width: W, height: H }]} />

        <Svg width={W} height={H}>
          <Defs>
            {/* background gradient */}
            <LinearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(255,255,255,0.045)" />
              <Stop offset="1" stopColor="rgba(255,255,255,0.012)" />
            </LinearGradient>

            {/* vignette */}
            <LinearGradient id="vigGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(0,0,0,0.10)" />
              <Stop offset="0.45" stopColor="rgba(0,0,0,0.00)" />
              <Stop offset="1" stopColor="rgba(0,0,0,0.18)" />
            </LinearGradient>

            {/* normals band (temperature range — smoky grey glass) */}
            <LinearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(255,255,255,0.08)" />
              <Stop offset="0.55" stopColor="rgba(255,255,255,0.035)" />
              <Stop offset="1" stopColor="rgba(255,255,255,0.010)" />
            </LinearGradient>
          </Defs>

          <Rect x={0} y={0} width={W} height={H} rx={18} fill="url(#bgGrad)" />
          <Rect x={0} y={0} width={W} height={H} rx={18} fill="url(#vigGrad)" opacity={0.9} />

          {lastYearPrecipShape.area ? (
            <>
              <Path d={lastYearPrecipShape.area} fill={C.precipLastYearFill} stroke="none" />
              <Path d={lastYearPrecipShape.ridge} fill="none" stroke={C.precipLastYearStroke} strokeWidth={1.5} />
            </>
          ) : null}

          {precipShape.area ? (
            <>
              <Path d={precipShape.area} fill={C.precipFill} stroke="none" />
              <Path d={precipShape.ridge} fill="none" stroke={C.precipStroke} strokeWidth={1.75} />
            </>
          ) : null}

          <Path d={bandPath} fill="url(#bandGrad)" opacity={0.62} />

          {ticks.map((t, idx) => {
            const y = yForVal(t);
            return (
              <G key={`tick-${idx}`}>
                <Line x1={PAD_L} y1={y} x2={PAD_L + innerW} y2={y} stroke={C.grid} strokeWidth={1} />
                <SvgText
                  x={PAD_L - 6}
                  y={y + 3}
                  fontSize="9"
                  fill={C.tick}
                  fontWeight="800"
                  textAnchor="end"
                >
                  {Math.round(t)}
                </SvgText>
              </G>
            );
          })}

          {MONTH_START_DOY.filter((doy) => doy >= zoomWindow.start && doy <= zoomWindow.end).map((doy, i) => (
            <SvgText
              key={`ml-${i}`}
              x={xForDoy(doy)}
              y={PAD_T + innerH + 22}
              fontSize="10"
              fill={C.month}
              fontWeight="900"
              textAnchor="middle"
            >
              {monthLabel(monthFromDoy(doy))}
            </SvgText>
          ))}

          <Path d={pathFor('tminF')} stroke={C.min} strokeWidth={1.35} opacity={0.72} fill="none" />
          <Path d={pathFor('tmaxF')} stroke={C.max} strokeWidth={1.35} opacity={0.72} fill="none" />
          {lastYearHighPath ? <Path d={lastYearHighPath} stroke={C.lastYearHigh} strokeWidth={2.2} opacity={0.96} fill="none" /> : null}
          {lastYearLowPath ? <Path d={lastYearLowPath} stroke={C.lastYearLow} strokeWidth={2.2} opacity={0.96} fill="none" /> : null}
        </Svg>

        {expanded && detail ? (
          <View style={[styles.floatingDetail, { left: bubbleLeft, top: 10 }]}>
            <Text style={styles.floatingDetailDate}>{markerText ?? 'Selected'}</Text>
            <Text style={styles.floatingDetailLine}>
              Normal {fmtShortTemp(detail.tmin)} / {fmtShortTemp(detail.tmax)}
            </Text>
            <Text style={styles.floatingDetailLine}>
              Prior {fmtShortTemp(detail.lastYearLow)} / {fmtShortTemp(detail.lastYearHigh)}
            </Text>
            <Text style={styles.floatingDetailLine}>
              Avg {fmtInches(detail.precip)} • Prior {fmtInches(detail.lastYearPrecip)}
            </Text>
          </View>
        ) : null}

        <AView
          pointerEvents="none"
          style={[
            styles.markerOverlay,
            { width: W, height: H },
            {
              opacity: markerAlpha,
              transform: [{ translateX: markerXValue }],
            },
          ]}
        >
          <Svg width={W} height={H}>
            <Line x1={0} y1={PAD_T} x2={0} y2={PAD_T + innerH} stroke={C.marker} strokeWidth={1.5} />

            <Path
              d={`M 0 ${(PAD_T + 18).toFixed(2)} m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0`}
              fill="rgba(170,235,255,0.95)"
              opacity={0.85}
            />
            <Path
              d={`M 0 ${(PAD_T + 18).toFixed(2)} m -7 0 a 7 7 0 1 0 14 0 a 7 7 0 1 0 -14 0`}
              fill="rgba(120,200,255,0.14)"
              opacity={0.85}
            />

            {markerText ? (
              <SvgText x={8} y={PAD_T + 14} fontSize="10" fill={C.markerText} fontWeight="900" textAnchor="start">
                {markerText}
              </SvgText>
            ) : null}
          </Svg>
        </AView>
      </View>
      </View>
      <View style={styles.legendGrid}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBandSwatch, { backgroundColor: 'rgba(255,255,255,0.08)' }]} />
          <Text style={styles.legendText}>Normal temp range</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendLinePair}>
            <View style={[styles.legendLine, { backgroundColor: C.lastYearHigh }]} />
            <View style={[styles.legendLine, { backgroundColor: C.lastYearLow }]} />
          </View>
          <Text style={styles.legendText}>Prior-year high / low</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendAreaSwatch, { backgroundColor: C.precipFill, borderColor: C.precipStroke }]} />
          <Text style={styles.legendText}>Avg monthly precip</Text>
        </View>
        <View style={styles.legendItem}>
          <View
            style={[
              styles.legendAreaSwatch,
              { backgroundColor: C.precipLastYearFill, borderColor: C.precipLastYearStroke },
            ]}
          />
          <Text style={styles.legendText}>Prior-year precip</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendMarkerSwatch, { backgroundColor: C.markerText }]} />
          <Text style={styles.legendText}>Selected day</Text>
        </View>
      </View>
      <Text style={styles.footer}>
        Tip: drag to scrub days. Open the chart for a closer look.
      </Text>
    </Card>
    {allowExpand ? (
      <Modal visible={expandOpen} animationType="slide" onRequestClose={() => setExpandOpen(false)}>
        <View style={[styles.expandScreen, { paddingTop: Math.max(insets.top, 18) }]}>
          <View style={styles.expandHeader}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.expandTitle}>{title}</Text>
              <Text style={styles.expandSubtitle}>
                Drag inside the chart to scrub days. Scroll sideways for a closer look across the annual timeline.
              </Text>
            </View>
            <Pressable onPress={() => setExpandOpen(false)} style={styles.expandCloseBtn}>
              <Text style={styles.expandCloseText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.expandScrollContent}>
            <ClimatologyChart
              title={title}
              normals={normals}
              stationName={stationName}
              selectedDoy={selectedDoy}
              markerLabel={markerLabel}
              onSelectDoy={onSelectDoy}
              precipMonthlyIn={precipMonthlyIn}
              lastYear={lastYear}
              chartWidth={Math.max(windowWidth * 2.2, 920)}
              chartHeight={Math.max(windowHeight * 0.56, 320)}
              allowExpand={false}
              expanded
            />
          </ScrollView>
        </View>
      </Modal>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },
  expandedCard: { marginBottom: 0 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.textPrimary },
  subTitle: {
    marginTop: 2,
    fontSize: 12,
    opacity: 0.7,
    color: theme.colors.textSecondary,
    fontWeight: '700',
  },
  expandBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignSelf: 'flex-start',
  },
  expandBtnText: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
  },

  detailLine: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(235,245,255,0.88)',
  },
  detailBlock: {
    marginTop: 8,
    gap: 2,
  },
  detailLineSecondary: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(235,245,255,0.74)',
  },
  chartBox: {
    width: '100%',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chartSurface: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
  },
  floatingDetail: {
    position: 'absolute',
    minWidth: 154,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(2,6,23,0.90)',
    zIndex: 3,
  },
  floatingDetailDate: {
    color: 'rgba(170,235,255,0.92)',
    fontWeight: '900',
    fontSize: 11,
    marginBottom: 4,
  },
  floatingDetailLine: {
    color: 'rgba(235,245,255,0.88)',
    fontWeight: '800',
    fontSize: 11,
    lineHeight: 15,
  },

  // “glass” rim (gives depth without changing Card)
  glassFrame: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    zIndex: 0,
  },

  markerOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
  },

  legendGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  legendText: {
    color: 'rgba(235,245,255,0.72)',
    fontSize: 10,
    fontWeight: '800',
  },
  legendBandSwatch: {
    width: 18,
    height: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  legendAreaSwatch: {
    width: 18,
    height: 10,
    borderRadius: 4,
    borderWidth: 1,
  },
  legendLinePair: {
    width: 20,
    gap: 3,
  },
  legendLine: {
    height: 2,
    borderRadius: 999,
  },
  legendMarkerSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(125,210,255,0.28)',
  },

  footer: { marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '700' },
  expandScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: 18,
  },
  expandHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  expandTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 22,
  },
  expandSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '700',
  },
  expandCloseBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  expandCloseText: {
    color: 'white',
    fontWeight: '900',
  },
  expandScrollContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
});

export default ClimatologyChart;

