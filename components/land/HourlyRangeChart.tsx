// components/land/HourlyRangeChart.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { ForecastHour } from '../../app/lib/openmeteo/hooks';

type UnitSystem = 'us' | 'metric';

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function clampInt(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, Math.round(n)));
}
function clampPct(v?: number | null): number | null {
  const n = safeNum(v);
  if (n == null) return null;
  return Math.max(0, Math.min(100, n));
}

function pick(h: ForecastHour, key: string): number | null {
  switch (key) {
    case 'tempF':
      return safeNum((h as any).tempF ?? (h as any).temperatureF ?? (h as any).temp);
    case 'dewF':
      return safeNum((h as any).dewPointF ?? (h as any).dewpointF ?? (h as any).dew);
    case 'popPct':
      return clampPct((h as any).precipProbPct ?? (h as any).precipProbabilityPct ?? (h as any).popPct);
    case 'humidityPct':
      return clampPct((h as any).humidityPct ?? (h as any).relativeHumidityPct ?? (h as any).rhPct);
    case 'windMph':
      return safeNum((h as any).windMph ?? (h as any).windSpeedMph ?? (h as any).windSpeed);
    case 'gustMph':
      return safeNum((h as any).gustMph ?? (h as any).windGustMph ?? (h as any).gust);
    case 'windDirDeg':
      return safeNum((h as any).windDirDeg ?? (h as any).windDirectionDeg ?? (h as any).windDirection);
    default:
      return safeNum((h as any)[key]);
  }
}

function dayKeyFromIso(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}
function parseHourMinute(iso: string): { h: number; m: number } | null {
  if (!iso) return null;
  // works for "YYYY-MM-DDTHH:MM", "YYYY-MM-DD HH:MM", with optional seconds/offset
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { h: hh, m: mm };
}
function hourLabel(iso: string) {
  const hm = parseHourMinute(iso);
  if (!hm) return '—';
  const hour12 = ((hm.h + 11) % 12) + 1;
  const ampm = hm.h >= 12 ? 'PM' : 'AM';
  return `${hour12}${ampm}`;
}
function dayLabelFromKey(dayKey: string) {
  if (!dayKey) return '';
  const d = new Date(`${dayKey}T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(d);
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function fmtInt(v: number | null, suffix = '') {
  return v == null ? '—' : `${Math.round(v)}${suffix}`;
}

/**
 * Parse Open-Meteo "YYYY-MM-DDTHH:MM..." into LOCAL milliseconds safely across engines.
 * We intentionally ignore any timezone suffix and treat the hour/minute as local clock time.
 * (Good enough for picking "closest hour" and anchoring the 72h window.)
 */
function parseLocalMsStrict(iso: string): number | null {
  if (!iso) return null;
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);

  if (![y, mo, d, hh, mm].every(Number.isFinite)) return null;

  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  const t = dt.getTime();
  return Number.isFinite(t) ? t : null;
}

export function HourlyRangeChart({
  hours,
  maxHours = 72,
  units = 'us',
}: {
  hours: ForecastHour[];
  maxHours?: number;
  units?: UnitSystem;
}) {
  const all = useMemo(() => hours ?? [], [hours]);

  // bump once per minute so "NOW" stays correct without reload
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Find the forecast index closest to current time
  const nowIdx = useMemo(() => {
    if (!all.length) return 0;

    const now = Date.now();
    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;

    for (let i = 0; i < all.length; i++) {
      const t = (all[i] as any).time as string;
      const ms = parseLocalMsStrict(t);
      if (ms == null) continue;
      const d = Math.abs(ms - now);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return bestI;
  }, [all, nowTick]);

  // ✅ The key fix: show the 72h window starting at "now"
  const data = useMemo(() => {
    if (!all.length) return [];
    const start = clampInt(nowIdx, 0, Math.max(0, all.length - 1));
    return all.slice(start, start + maxHours);
  }, [all, nowIdx, maxHours]);

  const [selIdx, setSelIdx] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const lastSelIdxRef = useRef(0);
  const selFromTapRef = useRef(false);

  // Reset selection to NOW when the window changes (unless user tapped)
  useEffect(() => {
    if (selFromTapRef.current) return;
    lastSelIdxRef.current = 0;
    setSelIdx(0);
  }, [nowIdx, data.length]);

  // bump on tap
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
    temp: 'rgba(255,255,255,0.95)',
    dew: 'rgba(80,220,140,0.90)',
    rh: 'rgba(190,120,255,0.80)',
    precipFill: 'rgba(90,200,250,0.18)',
    precipStroke: 'rgba(90,200,250,0.45)',
    wind: 'rgba(255,255,255,0.30)',
    gust: 'rgba(255,255,255,0.70)',
    cursor: 'rgba(255,255,255,0.22)',
    grid: 'rgba(255,255,255,0.08)',
    tickTemp: 'rgba(255,255,255,0.48)',
    tickPct: 'rgba(255,255,255,0.28)',
  };

  const TILE_W = 92;
  const GAP = 10;
  const padX = 14;
  const step = TILE_W + GAP;

  const n = Math.max(1, data.length);
  const contentW = padX * 2 + n * TILE_W + (n - 1) * GAP;

  const W = contentW;
  const H = 240;

  const axisL = 28;
  
  const padL = padX + axisL;
  const padR = padX;

  const padT = 18;
  const padB = 78;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const windBandH = 22;
  const windBandTop = padT + plotH + 10;
  const windBandBot = windBandTop + windBandH;

  const xForIdx = (i: number) => padL + i * step + TILE_W / 2;

  const tempKey = units === 'metric' ? 'tempC' : 'tempF';
  const dewKey = units === 'metric' ? 'dewC' : 'dewF';

  const tempStats = useMemo(() => {
    const ts = data.map((h) => pick(h, tempKey)).filter((x): x is number => typeof x === 'number');
    const ds = data.map((h) => pick(h, dewKey)).filter((x): x is number => typeof x === 'number');

    const allVals = [...ts, ...ds];
    const minV = allVals.length ? Math.min(...allVals) : 0;
    const maxV = allVals.length ? Math.max(...allVals) : 10;

    const span = Math.max(1, maxV - minV);
    const pad = Math.max(2, Math.round(span * 0.18));
    return { yMin: minV - pad, yMax: maxV + pad };
  }, [data, tempKey, dewKey]);

  const yForTemp = (t: number) => {
    const span = Math.max(1, tempStats.yMax - tempStats.yMin);
    const p = (t - tempStats.yMin) / span;
    return padT + (1 - p) * plotH;
  };

  const yForPct = (pct: number) => {
    const p = clamp(pct, 0, 100) / 100;
    return padT + (1 - p) * plotH;
  };

  const ptsT = data
    .map((h, i) => {
      const v = pick(h, tempKey);
      return typeof v === 'number' ? { x: xForIdx(i), y: yForTemp(v), v } : null;
    })
    .filter(Boolean) as Array<{ x: number; y: number; v: number }>;

  const ptsD = data
    .map((h, i) => {
      const v = pick(h, dewKey);
      return typeof v === 'number' ? { x: xForIdx(i), y: yForTemp(v), v } : null;
    })
    .filter(Boolean) as Array<{ x: number; y: number; v: number }>;

  const ptsRh = data
    .map((h, i) => {
      const v = pick(h, 'humidityPct');
      return typeof v === 'number' ? { x: xForIdx(i), y: yForPct(v), v } : null;
    })
    .filter(Boolean) as Array<{ x: number; y: number; v: number }>;

  const pathT = buildPath(ptsT);
  const pathD = buildPath(ptsD);
  const pathRh = buildPath(ptsRh);

  const precipPts = useMemo(() => {
    return data.map((h, i) => {
      const pop = pick(h, 'popPct');
      const p = typeof pop === 'number' ? clamp(pop, 0, 100) : 0;
      const ampPct = p * 0.55;
      return { x: xForIdx(i), y: yForPct(ampPct) };
    });
  }, [data]);

  const precipTop = buildPath(precipPts);
  const precipBaseY = padT + plotH;
  const precipArea =
    precipPts.length >= 2
      ? `${precipTop} L ${precipPts[precipPts.length - 1].x.toFixed(2)} ${precipBaseY.toFixed(2)} L ${precipPts[0].x.toFixed(
          2
        )} ${precipBaseY.toFixed(2)} Z`
      : '';

  const yTicks = 4;
  const tempTickTemps = Array.from({ length: yTicks + 1 }).map((_, k) => {
    const t = tempStats.yMin + ((tempStats.yMax - tempStats.yMin) * k) / yTicks;
    return { t: Math.round(t), y: yForTemp(t) };
  });
  const pctTicks = [0, 25, 50, 75, 100].map((p) => ({ p, y: yForPct(p) }));
  const pctAxisX = padL + 6;

  const windStats = useMemo(() => {
    const ws = data.map((h) => pick(h, 'windMph')).filter((x): x is number => typeof x === 'number');
    const gs = data.map((h) => pick(h, 'gustMph')).filter((x): x is number => typeof x === 'number');
    const max = Math.max(1, ...(ws.length ? ws : [1]), ...(gs.length ? gs : [1]));
    return { max };
  }, [data]);

  const idxFromScroll = useCallback(
    (scrollX: number) => {
      if (!viewportW) return 0;
      const centerX = scrollX + viewportW / 2;
      const firstCenter = padX + TILE_W / 2;
      const raw = (centerX - firstCenter) / step;
      return clampInt(raw, 0, n - 1);
    },
    [viewportW, padX, TILE_W, step, n]
  );

  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    if (!selFromTapRef.current) return;
    if (!viewportW) return;
    const targetX = Math.max(0, padX + selIdx * step + TILE_W / 2 - viewportW / 2);
    scrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [selIdx, viewportW, padX, step, TILE_W]);

  const selX = xForIdx(selIdx);

  const selTemp = pick(data[selIdx] as any, tempKey);
  const windTextX = padL + 14;
  const windTextY =
  typeof selTemp === 'number'
    ? clamp(yForTemp(selTemp) + 18, padT + 14, padT + plotH - 14)
    : padT + plotH * 0.7;

  const selScale = bump.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const bottomLabelMask = useMemo(() => {
    const mask: boolean[] = [];
    for (let i = 0; i < data.length; i++) {
      const t = (data[i] as any).time as string;
      const hm = parseHourMinute(t);
      const dk = dayKeyFromIso(t);

      const prevT = i > 0 ? ((data[i - 1] as any).time as string) : '';
      const prevDk = prevT ? dayKeyFromIso(prevT) : '';
      const dayChanged = !!prevDk && !!dk && prevDk !== dk;

      const isMidnight = hm?.h === 0;
      const show = i % 3 === 0 || !!isMidnight || dayChanged;
      mask.push(!!show);
    }
    return mask;
  }, [data]);

  const unitsLabel = units === 'metric' ? '°C' : '°F';
  const windLabel = units === 'metric' ? 'kph' : 'mph';

  return (
    <View style={s.wrap}>
      <View style={s.headerRow}>
        <Text style={s.title}>HOURLY RANGE</Text>

        <View style={s.legendRow}>
          <LegendPill label={`Temp (${unitsLabel})`} kind="line" color={C.temp} />
          <LegendPill label="Dew pt" kind="dashed" color={C.dew} />
          <LegendPill label="RH" kind="dot" color={C.rh} />
          <LegendPill label="Precip" kind="mountain" color={C.precipStroke} />
          <LegendPill label={`Wind/Gust (${windLabel})`} kind="bars2" color={C.gust} />
        </View>
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
          {/* tiles */}
          <View style={[s.strip, { width: contentW - padX * 2 }]}>
            {data.map((h: any, i) => {
              const t = h.time as string;
              const dk = dayKeyFromIso(t);
              const prevT = i > 0 ? ((data[i - 1] as any).time as string) : '';
              const prevDk = prevT ? dayKeyFromIso(prevT) : '';
              const dayChanged = !!prevDk && !!dk && prevDk !== dk;

              const isSel = i === selIdx;
              const isNow = i === 0; // ✅ window starts at NOW
              const isPad = !!h.__pad;

              const tempV = pick(h, tempKey);
              const dewV = pick(h, dewKey);
              const rhV = pick(h, 'humidityPct');
              const popV = pick(h, 'popPct');
              const wV = pick(h, 'windMph');
              const gV = pick(h, 'gustMph');

              return (
                <Pressable
                  key={`${t}-${i}`}
                  onPress={() => {
                    selFromTapRef.current = true;
                    lastSelIdxRef.current = i;
                    setSelIdx(i);
                  }}
                >
                  <Animated.View
                    style={[
                      s.hourTile,
                      isSel && s.hourTileActive,
                      isSel && { transform: [{ scale: selScale }] },
                      isPad && { opacity: 0.35 },
                    ]}
                  >
                    <Text style={s.hourTop}>
                      {isNow ? 'NOW' : dayChanged ? dayLabelFromKey(dk).toUpperCase() : hourLabel(t)}
                    </Text>

                    <Text style={s.hilo}>{fmtInt(tempV, '°')}</Text>

                    <View style={s.tileMeta}>
                      <Text style={s.tileLine}>DP {dewV == null ? '—' : `${Math.round(dewV)}°`}</Text>
                      <Text style={s.tileLine}>RH {rhV == null ? '—' : `${Math.round(rhV)}%`}</Text>
                    </View>

                    <Text style={s.sub}>💧 {fmtInt(popV, '%')}</Text>

                    <View style={s.tileMeta}>
                      <Text style={s.tileLine}>
                        Wind {wV == null ? '—' : `${Math.round(wV)}`} {windLabel}
                      </Text>
                      <Text style={s.tileLine}>
                        Gust {gV == null ? '—' : `${Math.round(gV)}`} {windLabel}
                      </Text>
                    </View>
                  </Animated.View>
                </Pressable>
              );
            })}
          </View>

          {/* chart */}
          <View style={{ marginTop: 10 }}>
            <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
              {tempTickTemps.map((tk, idx) => (
                <G key={`t-yt-${idx}`}>
                  <Line x1={padL} x2={W - padR} y1={tk.y} y2={tk.y} stroke={C.grid} strokeWidth={1} />
                  <SvgText x={padL - 10} y={tk.y + 4} fontSize="10" fill={C.tickTemp} fontWeight="900" textAnchor="end">
                    {String(tk.t)}
                  </SvgText>
                </G>
              ))}

              {pctTicks.map((tk, idx) => (
                <SvgText
                  key={`p-yt-${idx}`}
                  x={pctAxisX}
                  y={tk.y + 3}
                  fontSize="9"
                  fill={C.tickPct}
                  fontWeight="900"
                  textAnchor="start"
                >
                  {`${tk.p}%`}
                </SvgText>
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

              <SvgText x={padL - 10} y={padT - 6} fontSize="10" fill="rgba(255,255,255,0.30)" fontWeight="800" textAnchor="end">
                {unitsLabel}
              </SvgText>
              <SvgText x={pctAxisX} y={padT - 6} fontSize="10" fill="rgba(255,255,255,0.22)" fontWeight="800" textAnchor="start">
                %
              </SvgText>

              <Line x1={selX} x2={selX} y1={padT} y2={windBandBot} stroke={C.cursor} strokeWidth={2} />
              

              {precipArea ? (
                <>
                  <Path d={precipArea} fill={C.precipFill} stroke="none" />
                  <Path d={precipTop} fill="none" stroke={C.precipStroke} strokeWidth={2} />
                </>
              ) : null}

              {pathT ? <Path d={pathT} stroke={C.temp} strokeWidth={3.2} fill="none" /> : null}
              {pathD ? <Path d={pathD} stroke={C.dew} strokeWidth={2.4} strokeDasharray="4 6" fill="none" /> : null}
              {pathRh ? <Path d={pathRh} stroke={C.rh} strokeWidth={2.2} strokeDasharray="1 6" fill="none" /> : null}

              {data.map((h: any, i) => {
                const x = xForIdx(i);
                const tV = pick(h, tempKey);
                const dV = pick(h, dewKey);
                const rhV = pick(h, 'humidityPct');

                const yT = typeof tV === 'number' ? yForTemp(tV) : null;
                const yD = typeof dV === 'number' ? yForTemp(dV) : null;
                const yRh = typeof rhV === 'number' ? yForPct(rhV) : null;

                return (
                  <G key={`pt-${h.time}-${i}`}>
                    {yT != null ? <Circle cx={x} cy={yT} r={5.0} fill="white" opacity={0.92} /> : null}
                    {yD != null ? <Circle cx={x} cy={yD} r={3.6} fill={C.dew} opacity={0.85} /> : null}
                    {yRh != null ? <Circle cx={x} cy={yRh} r={3.2} fill={C.rh} opacity={0.75} /> : null}
                  </G>
                );
              })}

              <Rect x={padL} y={windBandTop} width={plotW} height={windBandH} rx={10} fill="rgba(255,255,255,0.03)" />

              {data.map((h: any, i) => {
                const x = xForIdx(i);
                const wv = pick(h, 'windMph');
                const gv = pick(h, 'gustMph');

                const barW = 10;
                const gap = 4;

                const wH = wv != null ? clamp((wv / windStats.max) * windBandH, 0, windBandH) : 0;
                const gH = gv != null ? clamp((gv / windStats.max) * windBandH, 0, windBandH) : 0;

                const wX = x - (barW + gap / 2);
                const gX = x + gap / 2;

                const wY = windBandBot - wH;
                const gY = windBandBot - gH;

                const dir = pick(h, 'windDirDeg');

                return (
                  <G key={`wb-${h.time}-${i}`}>
                    {wv != null ? <Rect x={wX} y={wY} width={barW} height={wH} rx={4} fill={C.wind} /> : null}
                    {gv != null ? <Rect x={gX} y={gY} width={barW} height={gH} rx={4} fill={C.gust} /> : null}

                    {wv != null && typeof dir === 'number' ? (
                      <G rotation={dir} origin={`${x} ${windBandTop - 2}`}>
                        <Path d={`M ${x} ${windBandTop - 8} L ${x + 6} ${windBandTop - 2} L ${x} ${windBandTop + 4} Z`} fill="rgba(160,220,255,0.55)" />
                      </G>
                    ) : null}
                  </G>
                );
              })}

              <SvgText x={windTextX} y={windTextY} fontSize="10" fill="rgba(255,255,255,0.40)" fontWeight="800">
                Wind / Gust
              </SvgText>
              <SvgText x={W - padR} y={windBandTop - 4} fontSize="10" fill="rgba(255,255,255,0.40)" fontWeight="800" textAnchor="end">
                max {String(Math.round(windStats.max))}
              </SvgText>

              {data.map((h: any, i) => {
                if (!bottomLabelMask[i]) return null;

                const t = h.time as string;
                const hm = parseHourMinute(t);
                const dk = dayKeyFromIso(t);

                const isMidnight = hm?.h === 0;
                const txt = isMidnight ? dayLabelFromKey(dk) : hourLabel(t);
                const isSel = i === selIdx;

                return (
                  <SvgText
                    key={`lbl-${t}-${i}`}
                    x={xForIdx(i)}
                    y={H - 14}
                    fontSize="10"
                    fill={isSel ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)'}
                    fontWeight={isSel ? '900' : '800'}
                    textAnchor="middle"
                  >
                    {txt}
                  </SvgText>
                );
              })}
            </Svg>
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
  kind: 'line' | 'dashed' | 'dot' | 'bars2' | 'mountain';
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
  title: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },

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
  hourTile: {
    width: 92,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    minHeight: 148,
  },
  hourTileActive: {
    borderColor: 'rgba(200,240,255,0.28)',
    backgroundColor: 'rgba(160,220,255,0.08)',
  },
  hourTop: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  hilo: { marginTop: 8, color: 'white', fontWeight: '900', fontSize: 18 },

  sub: { marginTop: 6, color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 11 },

  swLine: { height: 3, borderRadius: 2 },
  swDashRow: { width: 18, height: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swDash: { width: 4, height: 2, borderRadius: 2, opacity: 0.95 },
  swDot: { width: 6, height: 6, borderRadius: 999, opacity: 0.9 },

  swBars2Wrap: { width: 18, height: 10, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  swBar2: { width: 6, borderRadius: 3 },
  swBar2Left: { height: 7, opacity: 0.75 },
  swBar2Right: { height: 10, opacity: 0.95 },

  swMountainWrap: { width: 18, height: 10, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)', justifyContent: 'flex-end' },
  swMountainFill: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 7, opacity: 0.18, borderTopLeftRadius: 10, borderTopRightRadius: 6, transform: [{ skewX: '-10deg' }] },
  swMountainRidge: { position: 'absolute', left: -2, right: -2, bottom: 2, height: 6, borderTopWidth: 2, opacity: 0.55, transform: [{ skewX: '-10deg' }] },

  tileMeta: { marginTop: 6, alignItems: 'flex-start' },
  tileLine: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 15,
  },
});

export default HourlyRangeChart;