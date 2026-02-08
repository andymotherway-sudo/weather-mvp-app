// components/land/DailyRangeChart.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useWxLab } from '../../app/context/WxLabContext'; // adjust relative path if needed
import { getTypography } from '../../styles/typography';

type DailyDatum = {
  date: string; // ISO yyyy-mm-dd
  tempMaxF: number | null;
  tempMinF: number | null;

  precipProbMaxPct: number | null; // 0-100
  dewPointMaxF: number | null;

  humidityMaxPct: number | null;

  windMaxMph: number | null; // sustained (daily max or avg)
  windGustMaxMph: number | null;
  windDirDominantDeg: number | null; // 0..360

  cloudCoverAvgPct: number | null;
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

function pickWxIcon(pop?: number | null, cloud?: number | null) {
  const p = typeof pop === 'number' ? pop : 0;
  const c = typeof cloud === 'number' ? cloud : 0;

  if (p >= 70) return '🌧️';
  if (p >= 35) return '🌦️';
  if (c >= 85) return '☁️';
  if (c >= 45) return '⛅';
  return '☀️';
}

export function DailyRangeChart({
  daily,
  unitsLabel = '°F',
  showDewPoint,
  showHumidity,
  showCloudBand,
}: Props) {
  const { wxLab } = useWxLab();
  const T = useMemo(() => getTypography({ wxLab }), [wxLab]);

  const data = useMemo(() => (daily ?? []).filter((d) => d?.date).slice(0, 10), [daily]);

  const [selIdx, setSelIdx] = useState(0);
  const [viewportW, setViewportW] = useState(0);

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
  };

  // Geometry
  const TILE_W = 132;
  const GAP = 10;
  const padX = 14;

  const n = Math.max(1, data.length);
  const contentW = padX * 2 + n * TILE_W + (n - 1) * GAP;

  const W = contentW;
  const H = 260;

  const axisL = 28; // left margin for °F ticks
  const padL = padX + axisL;
  const padR = padX;

  const padT = 18;
  const padB = 98;

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
    .map((d, i) =>
      typeof d.humidityMaxPct === 'number' ? { x: xForIdx(i), y: yForPct(d.humidityMaxPct) } : null
    )
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
    const targetX = Math.max(0, xForIdx(selIdx) - 180);
    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [selIdx]);

  const selX = xForIdx(selIdx);

  const selScale = bump.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const selCloudPct =
    typeof data[selIdx]?.cloudCoverAvgPct === 'number' ? clamp(data[selIdx]!.cloudCoverAvgPct!, 0, 100) : null;

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={[s.title, T.label]}>DAILY FORECAST</Text>

        {wxLab ? (
          <View style={s.legendRow}>
            <LegendPill label="High" kind="line" color={C.high} />
            <LegendPill label="Low" kind="line" color={C.low} />
            <LegendPill label="Dew pt" kind="dashed" color={C.dew} />
            <LegendPill label="RH" kind="dot" color={C.rh} />
            <LegendPill label="Precip" kind="mountain" color={C.precipStroke} />
            <LegendPill label="Wind/Gust" kind="bars2" color={C.gust} />
            <LegendPill label="Clouds" kind="area" color={C.cloudOn} />
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ width: contentW, paddingHorizontal: padX, paddingBottom: 12 }}
        scrollEventThrottle={16}
        onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
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
        <View style={{ width: contentW - padX * 2 }}>
          {/* Tiles */}
          <View style={[s.strip, { width: contentW - padX * 2 }]}>
            {data.map((d, i) => {
              const { day, md } = niceDayLabel(d.date);
              const isSel = i === selIdx;
              const todayISO = todayISODateLocal();
              const isToday = d.date === todayISO;

              return (
                <Pressable
                  key={d.date}
                  onPress={() => {
                    selFromTapRef.current = true;
                    lastSelIdxRef.current = i;
                    setSelIdx(i);
                  }}
                >
                  <Animated.View
                    style={[
                      s.dayTile,
                      isSel && s.dayTileActive,
                      isSel && { transform: [{ scale: selScale }] },
                    ]}
                  >
                    <Text style={[s.dayTop, T.body]}>{isToday ? 'TODAY' : `${day} ${md.split(' ')[1]}`}</Text>
                    <Text style={s.icon}>{pickWxIcon(d.precipProbMaxPct, d.cloudCoverAvgPct)}</Text>

                    {/* ✅ avoid Typography.primaryNumber dependency */}
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

                    <Text style={[s.sub, T.metric]}>💧 {fmtInt(d.precipProbMaxPct, '%')}</Text>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>

          {/* Chart */}
          <View style={{ marginTop: 10 }}>
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
                fontSize="10"
                fill="rgba(255,255,255,0.30)"
                fontWeight={wxLab ? '700' : '900'}
                textAnchor="end"
              >
                {unitsLabel}
              </SvgText>
              <SvgText
                x={pctAxisX}
                y={padT - 6}
                fontSize="10"
                fill="rgba(255,255,255,0.22)"
                fontWeight={wxLab ? '700' : '900'}
                textAnchor="start"
              >
                %
              </SvgText>

              {/* Cursor */}
              <Line x1={selX} x2={selX} y1={padT} y2={cloudBandBot} stroke={C.cursor} strokeWidth={2} />

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
                    {yMax != null ? <Circle cx={x} cy={yMax} r={5.5} fill="white" opacity={0.95} /> : null}
                    {yMin != null ? <Circle cx={x} cy={yMin} r={4.8} fill="white" opacity={0.45} /> : null}
                    {yDp != null ? <Circle cx={x} cy={yDp} r={3.6} fill={C.dew} opacity={0.85} /> : null}
                    {yRh != null ? <Circle cx={x} cy={yRh} r={3.2} fill={C.rh} opacity={0.75} /> : null}
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

                    {w != null && typeof d.windDirDominantDeg === 'number' ? (
                      <G rotation={d.windDirDominantDeg} origin={`${x} ${windBandTop - 2}`}>
                        <Path
                          d={`M ${x} ${windBandTop - 8} L ${x + 6} ${windBandTop - 2} L ${x} ${windBandTop + 4} Z`}
                          fill="rgba(160,220,255,0.55)"
                        />
                      </G>
                    ) : null}
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

              {/* Cloud band (under wind) */}
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

                  {/* Clouds label in left gutter */}
                  <G>
                    <SvgText
                      x={padX}
                      y={cloudBandTop + cloudBandH / 2 + 4}
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="start"
                      fill="rgba(255,255,255,0.40)"
                    >
                      Clouds
                    </SvgText>
                  </G>
                </>
              ) : null}

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
                    y={H - 14}
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

            {/* ✅ Clouds % moved BELOW chart (no crowding) */}
            {showCloud ? (
              <View style={s.cloudReadoutRow}>
                <Text style={s.cloudReadoutLabel}>Clouds</Text>
                <Text style={s.cloudReadoutValue}>{selCloudPct == null ? '—' : `${Math.round(selCloudPct)}%`}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
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
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
  },
  headerRow: { paddingHorizontal: 12, gap: 8 },
  title: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
  },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  legPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  legText: { color: 'rgba(255,255,255,0.75)', fontWeight: '900', fontSize: 11 },
  legSwatchWrap: { width: 18, height: 10, justifyContent: 'center' },

  strip: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  dayTile: {
    width: 132,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dayTileActive: {
    borderColor: 'rgba(200,240,255,0.28)',
    backgroundColor: 'rgba(160,220,255,0.08)',
  },
  dayTop: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 14, letterSpacing: 0.4 },
  icon: { marginTop: 10, fontSize: 26, opacity: 0.9 },
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