// components/land/DailyRangeChart.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useWxLab } from '../../app/context/WxLabContext'; // adjust relative path if needed
import { getTypography } from '../../styles/typography';
import { PremiumWeatherIcon } from '../weather/PremiumWeatherIcon';

type DailyDatum = {
  date: string; // ISO yyyy-mm-dd
  tempMaxF: number | null;
  tempMinF: number | null;

  precipProbMaxPct: number | null; // 0-100
  dewPointMaxF: number | null;

  humidityMaxPct: number | null;

  windMaxMph: number | null; // sustained (daily max or avg)
  windGustMaxMph: number | null;

  // Meteorological (FROM): 0..360 where 0/360 = North, 90 = East, 180 = South, 270 = West
  windDirDominantDeg: number | null;

  cloudCoverAvgPct: number | null;
  weatherCode?: number | null; 
};

type Props = {
  daily: DailyDatum[];
  unitsLabel?: string;

  /**
   * Optional overrides so you can force-show these overlays even if wxLab=false.
   * If omitted, they follow wxLab.
   */
  showDewPoint?: boolean;
  showHumidity?: boolean;
  showCloudBand?: boolean;
};

const TABLE_LABEL_WIDTH = 42;
const TABLE_HEADER_HEIGHT = 30;
const ROW_HEIGHT = 38;
const CHART_TOP_OFFSET = 8;
const CHART_BOTTOM_OFFSET = 12;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function clampInt(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, Math.round(n)));
}
function fmtInt(v: number | null, suffix = '') {
  return v == null ? '—' : `${Math.round(v)}${suffix}`;
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function todayISODateLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// ✅ IMPORTANT: parse yyyy-mm-dd as LOCAL midnight (not UTC)
function parseISODateLocal(dateISO: string) {
  const y = Number(dateISO.slice(0, 4));
  const m = Number(dateISO.slice(5, 7));
  const d = Number(dateISO.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(dateISO);
  return new Date(y, m - 1, d); // local midnight
}

function niceDayLabel(dateISO: string) {
  const d = parseISODateLocal(dateISO);
  const day = d.toLocaleDateString(undefined, { weekday: 'short' });
  const md = d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
  return { day, md, d };
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function pickWxIconFromCode(code?: number | null) {
  if (code == null) return '🌤️';
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([80, 81, 82].includes(code)) return '🌦️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '☁️';
}

function pickWxLabelFromCode(code?: number | null) {
  if (code == null) return 'Cloudy';
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Storms';
  return 'Cloudy';
}

// 16-point compass for small labels
function degToCompass(degFrom: number) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const d = (((degFrom % 360) + 360) % 360);
  return dirs[Math.round(d / 22.5) % 16];
}

// Normalize to [0..360)
function normDeg(deg: number) {
  return (((deg % 360) + 360) % 360);
}

export function DailyRangeChart({
  daily,
  unitsLabel = '°F',
  showDewPoint,
  showHumidity,
  showCloudBand,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && width >= 640;
  const { wxLab } = useWxLab();
  const T = useMemo(() => getTypography({ wxLab }), [wxLab]);

  const data = useMemo(() => (daily ?? []).filter((d) => d?.date).slice(0, 15), [daily]);

  const [selIdx, setSelIdx] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const [scrollViewTop, setScrollViewTop] = useState(0);
  const [tableTopInScrollContent, setTableTopInScrollContent] = useState(0);

  const lastSelIdxRef = useRef(0);
  const selFromTapRef = useRef(false);

  const showDew = showDewPoint ?? wxLab;
  const showRh = showHumidity ?? wxLab;
  const showCloud = showCloudBand ?? wxLab;

  // Bump animation (only on tap)
  const bump = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!selFromTapRef.current) return;
    bump.setValue(0);
    Animated.sequence([
      Animated.spring(bump, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 8 }),
      Animated.timing(bump, { toValue: 0, duration: 140, useNativeDriver: true }),
    ]).start();
  }, [selIdx, bump]);

  const C = {
    high: 'rgba(255,80,90,0.95)',
    low: 'rgba(90,170,255,0.95)',
    dew: 'rgba(80,220,140,0.90)',
    rh: 'rgba(190,120,255,0.80)',

    precipFill: 'rgba(90,200,250,0.18)',
    precipStroke: 'rgba(90,200,250,0.45)',

    wind: 'rgba(255,255,255,0.30)',
    gust: 'rgba(255,255,255,0.70)',

    cloudFill: 'rgba(255,255,255,0.10)',
    cloudOn: 'rgba(255,255,255,0.55)',

    cursor: 'rgba(255,255,255,0.22)',
    grid: 'rgba(255,255,255,0.08)',
    tickTemp: 'rgba(255,255,255,0.48)',
    tickPct: 'rgba(255,255,255,0.28)',

    // wind marker styling
    wDiscFill: 'rgba(255,255,255,0.04)',
    wDiscStroke: 'rgba(255,255,255,0.14)',
    wArrowFill: 'rgba(255,255,255,0.75)',
    wText: 'rgba(255,255,255,0.45)',
  };

  // Geometry
  const TILE_W = isLandscape ? 124 : 132;
  const GAP = isLandscape ? 8 : 10;
  const padX = isLandscape ? 12 : 14;
  const n = Math.max(1, data.length);
  const contentW = padX * 2 + n * TILE_W + (n - 1) * GAP;

  // ✅ Fix: svg width matches inner content width
  const W = contentW - padX * 2;
  const H = isLandscape ? Math.max(250, Math.min(height - 116, 360)) : 332;

  const axisL = 28; // left margin for °F ticks
  const padL = padX + axisL;
  const padR = padX;

  const padT = isLandscape ? 44 : 56;
  const padB = isLandscape ? 92 : 142;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Wind band
  const windBandH = 22;
  const windBandTop = padT + plotH + 10;
  const windBandBot = windBandTop + windBandH;

  // Cloud band (under wind)
  const cloudBandH = 14;
  const cloudBandTop = windBandBot + 8;
  const cloudBandBot = cloudBandTop + cloudBandH;

  const xForIdx = (i: number) => padL + i * (TILE_W + GAP) + TILE_W / 2;

  // Temp axis stats
  const tempStats = useMemo(() => {
    const mins = data.map((d) => d.tempMinF).filter((x): x is number => typeof x === 'number');
    const maxs = data.map((d) => d.tempMaxF).filter((x): x is number => typeof x === 'number');
    const dps = data.map((d) => d.dewPointMaxF).filter((x): x is number => typeof x === 'number');

    const minF = mins.length ? Math.min(...mins, ...(dps.length ? dps : [])) : 0;
    const maxF = maxs.length ? Math.max(...maxs) : 100;

    const pad = Math.max(5, Math.round((maxF - minF) * 0.12));
    return { yMin: minF - pad, yMax: maxF + pad };
  }, [data]);

  const yForTemp = (t: number) => {
    const span = Math.max(1, tempStats.yMax - tempStats.yMin);
    const p = (t - tempStats.yMin) / span;
    return padT + (1 - p) * plotH;
  };

  // Percent axis 0..100 mapped into same plot
  const yForPct = (pct: number) => {
    const p = clamp(pct, 0, 100) / 100;
    return padT + (1 - p) * plotH;
  };

  // Series points
  const ptsMax = data
    .map((d, i) => (typeof d.tempMaxF === 'number' ? { x: xForIdx(i), y: yForTemp(d.tempMaxF) } : null))
    .filter(Boolean) as Array<{ x: number; y: number }>;

  const ptsMin = data
    .map((d, i) => (typeof d.tempMinF === 'number' ? { x: xForIdx(i), y: yForTemp(d.tempMinF) } : null))
    .filter(Boolean) as Array<{ x: number; y: number }>;

  const ptsDp = data
    .map((d, i) => (typeof d.dewPointMaxF === 'number' ? { x: xForIdx(i), y: yForTemp(d.dewPointMaxF) } : null))
    .filter(Boolean) as Array<{ x: number; y: number }>;

  const ptsRh = data
    .map((d, i) => (typeof d.humidityMaxPct === 'number' ? { x: xForIdx(i), y: yForPct(d.humidityMaxPct) } : null))
    .filter(Boolean) as Array<{ x: number; y: number }>;

  const pathMax = buildPath(ptsMax);
  const pathMin = buildPath(ptsMin);
  const pathDp = buildPath(ptsDp);
  const pathRh = buildPath(ptsRh);

  // Precip area (POP) uses percent axis but reduced amplitude
  const precipPts = useMemo(() => {
    return data.map((d, i) => {
      const pop = typeof d.precipProbMaxPct === 'number' ? clamp(d.precipProbMaxPct, 0, 100) : 0;
      const ampPct = pop * 0.55;
      return { x: xForIdx(i), y: yForPct(ampPct) };
    });
  }, [data]);

  const precipTop = buildPath(precipPts);
  const precipBaseY = padT + plotH;
  const precipArea =
    precipPts.length >= 2
      ? `${precipTop} L ${precipPts[precipPts.length - 1].x.toFixed(2)} ${precipBaseY.toFixed(
          2
        )} L ${precipPts[0].x.toFixed(2)} ${precipBaseY.toFixed(2)} Z`
      : '';

  // Grid ticks
  const yTicks = 4;
  const tempTickTemps = Array.from({ length: yTicks + 1 }).map((_, k) => {
    const t = tempStats.yMin + ((tempStats.yMax - tempStats.yMin) * k) / yTicks;
    return { t: Math.round(t), y: yForTemp(t) };
  });

  const pctTicks = [0, 25, 50, 75, 100].map((p) => ({ p, y: yForPct(p) }));
  const pctAxisX = padL + 6;

  // Wind stats
  const windStats = useMemo(() => {
    const ws = data.map((d) => d.windMaxMph).filter((x): x is number => typeof x === 'number');
    const gs = data.map((d) => d.windGustMaxMph).filter((x): x is number => typeof x === 'number');
    const max = Math.max(1, ...(ws.length ? ws : [1]), ...(gs.length ? gs : [1]));
    return { max };
  }, [data]);

  // Scroll-follow selection: nearest to viewport center
  const idxFromScroll = useCallback(
    (scrollX: number) => {
      if (!viewportW) return 0;
      const centerX = scrollX + viewportW / 2;

      const step = TILE_W + GAP;
      const firstCenter = padL + TILE_W / 2;
      const raw = (centerX - firstCenter) / step;
      return clampInt(raw, 0, n - 1);
    },
    [viewportW, TILE_W, GAP, padL, n]
  );

  const scrollRef = useRef<ScrollView | null>(null);

  // Tap scroll centering
  useEffect(() => {
    if (!selFromTapRef.current) return;
    if (!viewportW) return;
    const targetX = Math.max(0, xForIdx(selIdx) - viewportW / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [selIdx, viewportW]);

  const selX = xForIdx(selIdx);

  const selScale = bump.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });

  const selCloudPct =
    typeof data[selIdx]?.cloudCoverAvgPct === 'number' ? clamp(data[selIdx]!.cloudCoverAvgPct!, 0, 100) : null;

  // Wind marker placement (above bottom day labels)
  const windMarkerY = H - (isLandscape ? 40 : 52); // circle center
  const windMarkerLabelY = windMarkerY + 22; // compass text under circle
  const tableRows = [
    { label: 'High', shortLabel: 'HIGH', values: data.map((d) => fmtInt(d.tempMaxF, unitsLabel)) },
    { label: 'Low', shortLabel: 'LOW', values: data.map((d) => fmtInt(d.tempMinF, unitsLabel)) },
    { label: 'Dew pt', shortLabel: 'DEW', values: data.map((d) => fmtInt(d.dewPointMaxF, unitsLabel)) },
    { label: 'RH', shortLabel: 'RH', values: data.map((d) => fmtInt(d.humidityMaxPct, '%')) },
    { label: 'Wind', shortLabel: 'WIND', values: data.map((d) => fmtInt(d.windMaxMph, ' mph')) },
    { label: 'Gusts', shortLabel: 'GUST', values: data.map((d) => fmtInt(d.windGustMaxMph, ' mph')) },
    { label: 'Clouds', shortLabel: 'CLD', values: data.map((d) => fmtInt(d.cloudCoverAvgPct, '%')) },
    { label: 'Precip', shortLabel: 'PCP', values: data.map((d) => fmtInt(d.precipProbMaxPct, '%')) },
  ];
  const tableLabelTop = scrollViewTop + tableTopInScrollContent;

  return (
    <View style={[s.wrap, isLandscape ? s.wrapLandscape : null]}>
      {!isLandscape ? (
        <View style={s.headerRow}>
          <Text style={[s.title, T.label]}>Detailed view</Text>
        </View>
      ) : null}

      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="normal"
        contentContainerStyle={{ paddingHorizontal: padX, paddingBottom: 12 }}
        scrollEventThrottle={16}
        onLayout={(e) => {
          setViewportW(e.nativeEvent.layout.width);
          setScrollViewTop(e.nativeEvent.layout.y);
        }}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const idx = idxFromScroll(x);
          if (idx !== lastSelIdxRef.current) {
            lastSelIdxRef.current = idx;
            selFromTapRef.current = false;
            setSelIdx(idx);
          }
        }}
      >
        <View style={{ width: W + padL + 24 }}>
          {/* Tiles */}
          <View style={{ width: W, height: 0, marginBottom: 0, overflow: 'hidden' }}>
            {data.map((d, i) => {
              const { day, md } = niceDayLabel(d.date);
              const isSel = i === selIdx;
              const todayISO = todayISODateLocal();
              const isToday = d.date === todayISO;

              const x = xForIdx(i);

              return (
                <Pressable
                  key={d.date}
                  onPress={() => {
                    selFromTapRef.current = true;
                    lastSelIdxRef.current = i;
                    setSelIdx(i);
                  }}
                  style={{
                    position: 'absolute',
                    left: x - TILE_W / 2,
                    width: TILE_W,
                  }}
                >
                  <Animated.View
                    style={[
                      s.dayTile,
                      { width: TILE_W },
                      isSel && s.dayTileActive,
                      isSel && { transform: [{ scale: selScale }] },
                    ]}
                  >
                    <Text style={[s.dayTop, T.body]}>{isToday ? 'TODAY' : `${day} ${md.split(' ')[1]}`}</Text>
                    <PremiumWeatherIcon code={d.weatherCode ?? null} size={28} style={s.iconBadge} />

                    <Text style={[s.hilo, T.title]}>
                      {fmtInt(d.tempMaxF)}
                      <Text style={{ opacity: 0.65 }}> | </Text>
                      {fmtInt(d.tempMinF)}
                    </Text>

                    <Text style={[s.sub, T.metric]}>Wind {fmtInt(d.windMaxMph, ' mph')}</Text>
                    <Text style={[s.sub, T.metric]}>Gust {fmtInt(d.windGustMaxMph, ' mph')}</Text>

                    {wxLab ? <Text style={[s.sub, T.metric]}>Clouds {fmtInt(d.cloudCoverAvgPct, '%')}</Text> : null}

                    {wxLab ? (
                      <View style={s.subRow}>
                        <Text style={[s.sub, T.metric]}>DP {fmtInt(d.dewPointMaxF)}</Text>
                        <Text style={[s.subDot, { fontVariant: ['tabular-nums'] }]}>·</Text>
                        <Text style={[s.sub, T.metric]}>RH {fmtInt(d.humidityMaxPct, '%')}</Text>
                      </View>
                    ) : null}

                    <Text style={[s.sub, T.metric]}>Precip {fmtInt(d.precipProbMaxPct, '%')}</Text>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>

          {/* Chart */}
          <View style={{ marginTop: CHART_TOP_OFFSET, paddingBottom: CHART_BOTTOM_OFFSET }}>
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {/* TEMP axis grid + labels (left) */}
              {tempTickTemps.map((tk, idx) => (
                <G key={`t-yt-${idx}`}>
                  <Line x1={padL} x2={W - padR} y1={tk.y} y2={tk.y} stroke={C.grid} strokeWidth={1} />
                  <SvgText
                    x={padL - 10}
                    y={tk.y + 4}
                    fontSize="10"
                    fill={C.tickTemp}
                    fontWeight={wxLab ? '700' : '900'}
                    textAnchor="end"
                  >
                    {String(tk.t)}
                  </SvgText>
                </G>
              ))}

              {/* Axis divider between °F labels and % labels */}
              <Line
                x1={padL + 2}
                x2={padL + 2}
                y1={padT}
                y2={padT + plotH}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />

              {/* % axis labels (near left) */}
              {pctTicks.map((tk, idx) => (
                <SvgText
                  key={`p-yt-${idx}`}
                  x={pctAxisX}
                  y={tk.y + 3}
                  fontSize="9"
                  fill={C.tickPct}
                  fontWeight={wxLab ? '600' : '800'}
                  textAnchor="start"
                >
                  {`${tk.p}%`}
                </SvgText>
              ))}

              {/* Axis headers */}
              <SvgText
                x={padL - 10}
                y={padT - 6}
                fontSize="12"
                fill="rgba(255,255,255,0.78)"
                fontWeight="900"
                textAnchor="end"
              >
                {unitsLabel}
              </SvgText>
              <SvgText
                x={pctAxisX}
                y={padT - 6}
                fontSize="12"
                fill="rgba(215,180,255,0.88)"
                fontWeight="900"
                textAnchor="start"
              >
                %
              </SvgText>

              {/* Cursor */}
              <Line x1={selX} x2={selX} y1={padT} y2={cloudBandBot} stroke={C.cursor} strokeWidth={2} />

              {data.map((d, i) => {
                const x = xForIdx(i);
                const { day } = niceDayLabel(d.date);
                const isToday = d.date === todayISODateLocal();
                return (
                  <G key={`chart-head-${d.date}`}>
                    <SvgText
                      x={x}
                      y={18}
                      fontSize="11"
                      fill="rgba(255,255,255,0.92)"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {isToday ? 'Today' : day}
                    </SvgText>
                    <SvgText
                      x={x}
                      y={34}
                      fontSize="11"
                      fill="rgba(255,255,255,0.72)"
                      fontWeight="700"
                      textAnchor="middle"
                    >
                      {pickWxLabelFromCode(d.weatherCode)}
                    </SvgText>
                  </G>
                );
              })}

              {/* precip area */}
              {precipArea ? (
                <>
                  <Path d={precipArea} fill={C.precipFill} stroke="none" />
                  <Path d={precipTop} fill="none" stroke={C.precipStroke} strokeWidth={2} />
                </>
              ) : null}

              {/* temp lines */}
              {pathMin ? <Path d={pathMin} stroke={C.low} strokeWidth={3.0} fill="none" /> : null}
              {pathMax ? <Path d={pathMax} stroke={C.high} strokeWidth={3.6} fill="none" /> : null}

              {/* dew point dashed */}
              {showDew && pathDp ? (
                <Path d={pathDp} stroke={C.dew} strokeWidth={2.4} strokeDasharray="4 6" fill="none" />
              ) : null}

              {/* RH dotted */}
              {showRh && pathRh ? (
                <Path d={pathRh} stroke={C.rh} strokeWidth={2.2} strokeDasharray="1 6" fill="none" />
              ) : null}

              {/* points */}
              {data.map((d, i) => {
                const x = xForIdx(i);
                const yMax = typeof d.tempMaxF === 'number' ? yForTemp(d.tempMaxF) : null;
                const yMin = typeof d.tempMinF === 'number' ? yForTemp(d.tempMinF) : null;
                const yDp = showDew && typeof d.dewPointMaxF === 'number' ? yForTemp(d.dewPointMaxF) : null;
                const yRh = showRh && typeof d.humidityMaxPct === 'number' ? yForPct(d.humidityMaxPct) : null;

                return (
                  <G key={`pt-${d.date}`}>
                    {yMax != null ? <Circle cx={x} cy={yMax} r={10} fill={C.high} opacity={0.14} /> : null}
                    {yMin != null ? <Circle cx={x} cy={yMin} r={9} fill={C.low} opacity={0.14} /> : null}
                    {yDp != null ? <Circle cx={x} cy={yDp} r={8} fill={C.dew} opacity={0.16} /> : null}
                    {yRh != null ? <Circle cx={x} cy={yRh} r={7} fill={C.rh} opacity={0.16} /> : null}
                    {yMax != null ? <Circle cx={x} cy={yMax} r={6.8} fill="white" stroke={C.high} strokeWidth={2.6} /> : null}
                    {yMin != null ? <Circle cx={x} cy={yMin} r={6.2} fill="white" stroke={C.low} strokeWidth={2.4} /> : null}
                    {yDp != null ? <Circle cx={x} cy={yDp} r={4.8} fill="white" stroke={C.dew} strokeWidth={2.1} /> : null}
                    {yRh != null ? <Circle cx={x} cy={yRh} r={4.4} fill="white" stroke={C.rh} strokeWidth={2.1} /> : null}
                  </G>
                );
              })}

              {/* Wind band */}
              <Rect x={padL} y={windBandTop} width={plotW} height={windBandH} rx={10} fill="rgba(255,255,255,0.03)" />

              {data.map((d, i) => {
                const x = xForIdx(i);
                const w = typeof d.windMaxMph === 'number' ? d.windMaxMph : null;
                const g = typeof d.windGustMaxMph === 'number' ? d.windGustMaxMph : null;

                const barW = 10;
                const gap = 4;

                const wH = w != null ? clamp((w / windStats.max) * windBandH, 0, windBandH) : 0;
                const gH = g != null ? clamp((g / windStats.max) * windBandH, 0, windBandH) : 0;

                const wX = x - (barW + gap / 2);
                const gX = x + gap / 2;

                const wY = windBandBot - wH;
                const gY = windBandBot - gH;

                return (
                  <G key={`wb-${d.date}`}>
                    {w != null ? <Rect x={wX} y={wY} width={barW} height={wH} rx={4} fill={C.wind} /> : null}
                    {g != null ? <Rect x={gX} y={gY} width={barW} height={gH} rx={4} fill={C.gust} /> : null}
                  </G>
                );
              })}

              {/* Wind/Gust label in the left gutter */}
              <G>
                <SvgText
                  x={padX}
                  y={windBandTop + windBandH / 2 + 4}
                  fontSize="11"
                  fontWeight={wxLab ? '700' : '900'}
                  textAnchor="start"
                  fill="rgba(255, 255, 255, 0.57)"
                >
                  Wind/Gust
                </SvgText>
              </G>

              {/* Cloud band */}
              {showCloud ? (
                <>
                  <Rect
                    x={padL}
                    y={cloudBandTop}
                    width={plotW}
                    height={cloudBandH}
                    rx={8}
                    fill="rgba(255,255,255,0.03)"
                  />
                  <G>
                <SvgText
                  x={padX}
                  y={cloudBandTop + cloudBandH / 2 + 4}
                  fontSize="11"
                  fontWeight={wxLab ? '700' : '900'}
                  textAnchor="start"
                  fill="rgba(255,255,255,0.40)"
                >
                  Clouds
                </SvgText>
              </G>
                  {data.map((d, i) => {
                    const pct = typeof d.cloudCoverAvgPct === 'number' ? clamp(d.cloudCoverAvgPct, 0, 100) : null;

                    const tileLeft = padL + i * (TILE_W + GAP);
                    const innerPad = 10;
                    const barW = TILE_W - innerPad * 2;
                    const barH = 6;
                    const barX = tileLeft + innerPad;
                    const barY = cloudBandTop + (cloudBandH - barH) / 2;

                    const fillW = pct == null ? 0 : (barW * pct) / 100;

                    return (
                      <G key={`cb-${d.date}`}>
                        <Rect x={barX} y={barY} width={barW} height={barH} rx={999} fill={C.cloudFill} />
                        {pct != null ? (
                          <Rect x={barX} y={barY} width={fillW} height={barH} rx={999} fill={C.cloudOn} />
                        ) : null}
                      </G>
                    );
                  })}

                </>
              ) : null}

              {/* ✅ Wind direction markers (meteorological FROM) centered over each day */}
              {data.map((d, i) => {
                const degFrom = d.windDirDominantDeg;
                if (typeof degFrom !== 'number') return null;

                const x = xForIdx(i);
                const y = windMarkerY;

                // Meteorological FROM: keep as-is (0=N, 90=E, 180=S, 270=W)
                // Our base arrow points UP (toward North), so rotate by degFrom.
                const rot = normDeg(degFrom);
                const dirLabel = degToCompass(rot);

                return (
                  <G key={`wdir-${d.date}`}>
                    <Circle
                      cx={x}
                      cy={y}
                      r={10}
                      fill={C.wDiscFill}
                      stroke={C.wDiscStroke}
                      strokeWidth={1}
                    />

                    <G transform={`rotate(${rot} ${x} ${y})`}>
                      {/* Triangle pointing "up" before rotation */}
                      <Path
                        d={`M ${x} ${y - 8} L ${x - 4.6} ${y + 5.2} L ${x + 4.6} ${y + 5.2} Z`}
                        fill={C.wArrowFill}
                      />
                    </G>

                    <SvgText
                      x={x}
                      y={y-14}
                      fontSize="9"
                      fill={C.wText}
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {dirLabel}
                    </SvgText>
                  </G>
                );
              })}

              {/* bottom labels */}
              {data.map((d, i) => {
                const { day } = niceDayLabel(d.date);
                const todayISO = todayISODateLocal();
                const isToday = d.date === todayISO;
                const isSel = i === selIdx;

                return (
                  <SvgText
                    key={`lbl-${d.date}`}
                    x={xForIdx(i)}
                    y={H - 16}
                    fontSize="11"
                    fill={isSel ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)'}
                    fontWeight={isSel ? (wxLab ? '800' : '900') : wxLab ? '600' : '800'}
                    textAnchor="middle"
                  >
                    {isToday ? 'Today' : day}
                  </SvgText>
                );
              })}
            </Svg>

            </View>

          {!isLandscape ? (
          <View
            onLayout={(e) => setTableTopInScrollContent(e.nativeEvent.layout.y)}
            style={[s.tableDataColumns, s.tableInlineData, { paddingLeft: padL }]}
          >
            <View style={s.tableHeaderValuesRow}>
              {data.map((d, idx) => {
                const { day } = niceDayLabel(d.date);
                const isToday = d.date === todayISODateLocal();
                return (
                  <Text
                    key={`th-inline-${d.date}`}
                    style={[s.tableValueCell, s.tableHeaderText, idx === data.length - 1 ? null : s.tableGap]}
                  >
                    {isToday ? 'Today' : day}
                  </Text>
                );
              })}
            </View>

            {tableRows.map((row, rowIdx) => (
              <View key={`inline-${row.label}`} style={[s.tableDataValuesRow, rowIdx % 2 === 1 ? s.tableRowAlt : null]}>
                {row.values.map((value, idx) => (
                  <Text
                    key={`${row.label}-inline-${idx}`}
                    style={[s.tableValueCell, idx === row.values.length - 1 ? null : s.tableGap]}
                  >
                    {value}
                  </Text>
                ))}
              </View>
            ))}
          </View>
          ) : null}

          </View>
      </ScrollView>

      {!isLandscape ? (
        <View
          pointerEvents="none"
          style={[
            s.tableLabelColumn,
            s.tableLabelOverlay,
            {
              left: 0,
              width: TABLE_LABEL_WIDTH,
              top: tableLabelTop,
            },
          ]}
        >
              <View style={s.tableLabelHeader} />
              {tableRows.map((row, idx) => (
                <View key={`label-${row.label}`} style={[s.tableLabelRow, idx % 2 === 1 ? s.tableRowAlt : null]}>
                  <Text style={s.tableLabelText}>{row.shortLabel ?? row.label}</Text>
                </View>
              ))}
        </View>
      ) : null}

      <View style={[s.pillSection, isLandscape ? s.pillSectionLandscape : null]}>
        <View style={s.legendRow}>
          <LegendPill label="High" kind="line" color={C.high} />
          <LegendPill label="Low" kind="line" color={C.low} />
          <LegendPill label="Dew pt" kind="dashed" color={C.dew} />
          <LegendPill label="RH" kind="dot" color={C.rh} />
          <LegendPill label="Wind/Gust" kind="bars2" color={C.gust} />
          <LegendPill label="Clouds" kind="area" color={C.cloudOn} />
        </View>
      </View>
    </View>
  );
}

function LegendPill({
  label,
  kind,
  color,
}: {
  label: string;
  kind: 'line' | 'dashed' | 'dot' | 'area' | 'bar' | 'bars2' | 'mountain';
  color: string;
}) {
  return (
    <View style={s.legPill}>
      <View style={s.legSwatchWrap}>
        {kind === 'line' ? <View style={[s.swLine, { backgroundColor: color }]} /> : null}

        {kind === 'dashed' ? (
          <View style={s.swDashRow}>
            <View style={[s.swDash, { backgroundColor: color }]} />
            <View style={[s.swDash, { backgroundColor: color }]} />
            <View style={[s.swDash, { backgroundColor: color }]} />
          </View>
        ) : null}

        {kind === 'dot' ? <View style={[s.swDot, { backgroundColor: color }]} /> : null}

        {kind === 'bars2' ? (
          <View style={s.swBars2Wrap}>
            <View style={[s.swBar2, s.swBar2Left, { backgroundColor: 'rgba(255,255,255,0.30)' }]} />
            <View style={[s.swBar2, s.swBar2Right, { backgroundColor: color }]} />
          </View>
        ) : null}

        {kind === 'mountain' ? (
          <View style={s.swMountainWrap}>
            <View style={[s.swMountainFill, { backgroundColor: color }]} />
            <View style={[s.swMountainRidge, { borderColor: color }]} />
          </View>
        ) : null}

        {kind === 'area' ? (
          <View style={s.swAreaWrap}>
            <View style={[s.swAreaFill, { backgroundColor: color }]} />
          </View>
        ) : null}
      </View>

      <Text style={s.legText}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderRadius: 24,
    backgroundColor: 'rgba(44, 70, 102, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingTop: 14,
    position: 'relative',
  },
  wrapLandscape: {
    marginTop: 0,
    paddingTop: 0,
  },
  headerRow: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  title: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.2,
  },

  pillSection: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  pillSectionLandscape: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 0,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  legPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 0,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  legText: { color: 'rgba(255,255,255,0.86)', fontWeight: '900', fontSize: 11 },
  legSwatchWrap: { width: 18, height: 10, justifyContent: 'center' },

  strip: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  dayTile: {
    width: 132,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dayTileActive: {
    borderColor: 'rgba(150,210,255,0.26)',
    backgroundColor: 'rgba(70,130,220,0.18)',
  },
  dayTop: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 14, letterSpacing: 0.4 },
  icon: { marginTop: 10, fontSize: 26, opacity: 0.9 },
  iconBadge: { marginTop: 10 },
  hilo: { marginTop: 10, color: 'white', fontWeight: '900', fontSize: 18 },

  sub: { marginTop: 6, color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  subDot: { marginHorizontal: 8, color: 'rgba(255,255,255,0.35)', fontWeight: '900' },

  swLine: { height: 3, borderRadius: 2 },

  swDashRow: { width: 18, height: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swDash: { width: 4, height: 2, borderRadius: 2, opacity: 0.95 },

  swDot: { width: 6, height: 6, borderRadius: 999, opacity: 0.9 },

  swAreaWrap: {
    width: 18,
    height: 10,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  swAreaFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 6,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 2,
    opacity: 0.45,
  },

  swBars2Wrap: {
    width: 18,
    height: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
  },
  swBar2: { width: 6, borderRadius: 3 },
  swBar2Left: { height: 7, opacity: 0.75 },
  swBar2Right: { height: 10, opacity: 0.95 },

  swMountainWrap: {
    width: 18,
    height: 10,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'flex-end',
  },
  swMountainFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 7,
    opacity: 0.18,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 6,
    transform: [{ skewX: '-10deg' }],
  },
  swMountainRidge: {
    position: 'absolute',
    left: -2,
    right: -2,
    bottom: 2,
    height: 6,
    borderTopWidth: 2,
    opacity: 0.55,
    transform: [{ skewX: '-10deg' }],
  },
  tableSection: {
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  tableContainer: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  tableLabelColumn: {
    width: TABLE_LABEL_WIDTH,
    flexShrink: 0,
    backgroundColor: 'rgba(48,82,118,0.74)',
    borderRightWidth: 1,
    borderRightColor: 'rgba(156,205,245,0.16)',
  },
  tableLabelOverlay: {
    position: 'absolute',
    left: 12,
    zIndex: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    overflow: 'hidden',
  },
  tableLabelHeader: {
    height: TABLE_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableLabelRow: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.075)',
  },
  tableLabelText: {
    color: 'rgba(214,232,248,0.82)',
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  tableScrollContent: {
    flexGrow: 0,
  },
  tableDataColumns: {
    backgroundColor: 'rgba(255,255,255,0.014)',
  },
  tableInlineData: {
    marginTop: 8,
    marginLeft: 0,
    marginRight: 12,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  tableHeaderValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TABLE_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableDataValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ROW_HEIGHT,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.075)',
  },
  tableRowAlt: {
    backgroundColor: 'rgba(255,255,255,0.026)',
  },
  tableHeaderText: {
    color: 'rgba(255,255,255,0.62)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableValueCell: {
    width: 132,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  tableGap: {
    marginRight: 10,
  },
  cloudReadoutRow: {
    marginTop: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cloudReadoutLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  cloudReadoutValue: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '900',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
