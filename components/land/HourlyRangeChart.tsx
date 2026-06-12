// components/land/HourlyRangeChart.tsx
// ✅ drop-in replacement
// ✅ fixes timezone bug for "now" / hourly slice selection
// ✅ accepts optional timeZone prop from parent
// ✅ keeps Daily-style ring around wind direction + moves it BELOW clouds band
// ✅ removes duplicate Clouds readout row under the chart (keeps tile "Clouds %" + clouds band)

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { ForecastHour } from '../../app/lib/openmeteo/hooks';

type UnitSystem = 'us' | 'metric';

const TABLE_LABEL_WIDTH = 42;
const TABLE_HEADER_HEIGHT = 30;
const ROW_HEIGHT = 38;
const GLASS_CARD = 'rgba(18,28,45,0.56)';
const GLASS_INSET = 'rgba(255,255,255,0.08)';
const GLASS_INSET_SOFT = 'rgba(255,255,255,0.06)';
const GLASS_BORDER = 'rgba(255,255,255,0.10)';
const GLASS_BORDER_SOFT = 'rgba(255,255,255,0.08)';

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
      return clampPct(
        (h as any).precipProbPct ??
          (h as any).precipitation_probability ??
          (h as any).precipProbabilityPct ??
          (h as any).popPct ??
          (h as any).pop
      );
    case 'humidityPct':
      return clampPct(
        (h as any).humidityPct ??
          (h as any).relativeHumidityPct ??
          (h as any).rhPct ??
          (h as any).rh
      );
    case 'cloudCoverPct':
      return clampPct(
        (h as any).cloudCoverPct ??
          (h as any).cloud_cover ??
          (h as any).cloudcover ??
          (h as any).clouds
      );
    case 'windMph':
      return safeNum((h as any).windMph ?? (h as any).windSpeedMph ?? (h as any).windSpeed);
    case 'gustMph':
      return safeNum((h as any).gustMph ?? (h as any).windGustMph ?? (h as any).gust);
    case 'windDirDeg':
      return safeNum(
        (h as any).windDirDeg ??
          (h as any).windDirectionDeg ??
          (h as any).windDirection ??
          (h as any).windDirDominantDeg
      );
    case 'airQualityUsAqi':
      return safeNum(
        (h as any).airQualityUsAqi ??
          (h as any).usAqi ??
          (h as any).us_aqi ??
          (h as any).airQualityIndex ??
          (h as any).aqi
      );
    default:
      return safeNum((h as any)[key]);
  }
}

function extractIsoWallClockParts(iso: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  if (!iso) return null;
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  return { year, month, day, hour, minute };
}

function dayKeyFromIso(iso: string): string {
  const p = extractIsoWallClockParts(iso);
  if (!p) return '';
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(
    p.day
  ).padStart(2, '0')}`;
}

function parseHourMinute(iso: string): { h: number; m: number } | null {
  const p = extractIsoWallClockParts(iso);
  if (!p) return null;
  return { h: p.hour, m: p.minute };
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
  const m = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Noon UTC avoids any weird midnight edge behavior.
  const dt = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(dt);
}

function buildPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function fmtInt(v: number | null, suffix = '') {
  return v == null ? '—' : `${Math.round(v)}${suffix}`;
}

/**
 * Convert wall-clock civil time to a sortable number without using the device timezone.
 * This intentionally treats YYYY-MM-DD HH:mm as a plain local clock for comparison/grouping.
 */
function wallClockToSortableMs(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function parseLocalMsStrict(iso: string): number | null {
  const parts = extractIsoWallClockParts(iso);
  if (!parts) return null;
  return wallClockToSortableMs(parts);
}

function getNowWallClockParts(timeZone?: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  if (timeZone) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = fmt.formatToParts(new Date());
    const pickPart = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

    return {
      year: pickPart('year'),
      month: pickPart('month'),
      day: pickPart('day'),
      hour: pickPart('hour'),
      minute: pickPart('minute'),
    };
  }

  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

function getNowSortableMs(timeZone?: string) {
  return wallClockToSortableMs(getNowWallClockParts(timeZone));
}

function degToCardinal(deg?: number | null) {
  if (deg == null) return '—';
  const d = ((deg % 360) + 360) % 360;
  const idx = Math.round(d / 45) % 8;
  return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][idx];
}

function pickHourConditionLabel(code: number | null) {
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

export function HourlyRangeChart({
  hours,
  maxHours = 72,
  units = 'us',
  timeZone,
  landscape = false,
  chartHeight,
}: {
  hours: ForecastHour[];
  maxHours?: number;
  units?: UnitSystem;
  timeZone?: string;
  landscape?: boolean;
  chartHeight?: number;
}) {
  const all = useMemo(() => hours ?? [], [hours]);

  const [showTemp, setShowTemp] = useState(true);
  const [showDew, setShowDew] = useState(true);
  const [showRh, setShowRh] = useState(true);
  const [showPrecip, setShowPrecip] = useState(true);
  const [showWind, setShowWind] = useState(true);
  const [showClouds, setShowClouds] = useState(true);
  const [showAqi, setShowAqi] = useState(true);

  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((x) => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowIdx = useMemo(() => {
    if (!all.length) return 0;

    const nowSortable = getNowSortableMs(timeZone);
    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;

    for (let i = 0; i < all.length; i++) {
      const t = (all[i] as any).time as string;
      const ms = parseLocalMsStrict(t);
      if (ms == null) continue;
      const d = Math.abs(ms - nowSortable);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return bestI;
  }, [all, nowTick, timeZone]);

  const data = useMemo(() => {
    if (!all.length) return [];
    const start = clampInt(nowIdx, 0, Math.max(0, all.length - 1));
    return all.slice(start, start + maxHours);
  }, [all, nowIdx, maxHours]);

  const [selIdx, setSelIdx] = useState(0);
  const [viewportW, setViewportW] = useState(0);
  const lastSelIdxRef = useRef(0);
  const selFromTapRef = useRef(false);

  useEffect(() => {
    if (selFromTapRef.current) return;
    lastSelIdxRef.current = 0;
    setSelIdx(0);
  }, [nowIdx, data.length]);

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
    cloudFill: 'rgba(255,255,255,0.10)',
    cloudOn: 'rgba(255,255,255,0.55)',
    aqi: 'rgba(250,204,21,0.92)',

    ringStroke: 'rgba(255,255,255,0.22)',
    ringFill: 'rgba(255,255,255,0.02)',
    arrow: 'rgba(160,220,255,0.55)',
    dirText: 'rgba(255,255,255,0.70)',
  };

  const TILE_W = landscape ? 94 : 92;
  const GAP = landscape ? 10 : 10;
  const padX = landscape ? 12 : 14;
  const step = TILE_W + GAP;

  const n = Math.max(1, data.length);
  const contentW = padX * 2 + n * TILE_W + (n - 1) * GAP;

  const W = contentW;
  const H = chartHeight ?? (landscape ? 320 : 270);

  const axisL = 28;
  const padL = padX + axisL;
  const padR = padX;

  const padT = landscape ? 28 : 18;
  const padB = landscape ? 82 : 114;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const windBandH = 22;
  const windBandTop = padT + plotH + 10;
  const windBandBot = windBandTop + windBandH;

  const cloudBandH = 14;
  const cloudBandTop = windBandBot + 8;
  const cloudBandBot = cloudBandTop + cloudBandH;

  const windDirRingR = 12;
  const windDirCenterY = cloudBandBot + (landscape ? 22 : 28);
  const windDirTextY = windDirCenterY - 16;

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

  const yForAqi = (aqi: number) => {
    const p = clamp(aqi, 0, 150) / 150;
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

  const ptsAqi = data
    .map((h, i) => {
      const v = pick(h, 'airQualityUsAqi');
      return typeof v === 'number' ? { x: xForIdx(i), y: yForAqi(v), v } : null;
    })
    .filter(Boolean) as Array<{ x: number; y: number; v: number }>;

  const pathT = buildPath(ptsT);
  const pathD = buildPath(ptsD);
  const pathRh = buildPath(ptsRh);
  const pathAqi = buildPath(ptsAqi);

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
      ? `${precipTop} L ${precipPts[precipPts.length - 1].x.toFixed(2)} ${precipBaseY.toFixed(
          2
        )} L ${precipPts[0].x.toFixed(2)} ${precipBaseY.toFixed(2)} Z`
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
  const tableRows = [
    { label: 'Temp', shortLabel: 'TEMP', values: data.map((h: any) => fmtInt(pick(h, tempKey), unitsLabel)) },
    { label: 'Dew pt', shortLabel: 'DEW', values: data.map((h: any) => fmtInt(pick(h, dewKey), unitsLabel)) },
    { label: 'RH', shortLabel: 'RH', values: data.map((h: any) => fmtInt(pick(h, 'humidityPct'), '%')) },
    { label: 'Wind', shortLabel: 'WIND', values: data.map((h: any) => fmtInt(pick(h, 'windMph'), ` ${windLabel}`)) },
    { label: 'Gusts', shortLabel: 'GUST', values: data.map((h: any) => fmtInt(pick(h, 'gustMph'), ` ${windLabel}`)) },
    { label: 'Clouds', shortLabel: 'CLD', values: data.map((h: any) => fmtInt(pick(h, 'cloudCoverPct'), '%')) },
    { label: 'Precip', shortLabel: 'PCP', values: data.map((h: any) => fmtInt(pick(h, 'popPct'), '%')) },
    { label: 'AQI', shortLabel: 'AQI', values: data.map((h: any) => fmtInt(pick(h, 'airQualityUsAqi'))) },
  ];

  return (
    <View style={[s.wrap, landscape ? s.wrapLandscape : null]}>
      <ScrollView
        ref={(r) => {
          scrollRef.current = r;
        }}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="normal"
        contentContainerStyle={{ paddingHorizontal: padX, paddingBottom: 2 }}
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
        <View style={{ width: W + padL + 24 }}>
          <View style={{ width: contentW - padX * 2, height: 0, overflow: 'hidden' }}>
            {data.map((h: any, i) => {
              const x = xForIdx(i);

              const t = h.time as string;
              const dk = dayKeyFromIso(t);
              const prevT = i > 0 ? ((data[i - 1] as any).time as string) : '';
              const prevDk = prevT ? dayKeyFromIso(prevT) : '';
              const dayChanged = !!prevDk && !!dk && prevDk !== dk;

              const isSel = i === selIdx;
              const isNow = i === 0;
              const isPad = !!h.__pad;

              const tempV = pick(h, tempKey);
              const dewV = pick(h, dewKey);
              const rhV = pick(h, 'humidityPct');
              const popV = pick(h, 'popPct');
              const wV = pick(h, 'windMph');
              const gV = pick(h, 'gustMph');
              const ccV = pick(h, 'cloudCoverPct');

              return (
                <Pressable
                  key={`${t}-${i}`}
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
                      s.hourTile,
                      { width: TILE_W },
                      isSel && s.hourTileActive,
                      isSel && { transform: [{ scale: selScale }] },
                      isPad && { opacity: 0.35 },
                    ]}
                  >
                    <Text style={s.hourTop}>
                      {isNow
                        ? `Now · ${dayLabelFromKey(dk)}`
                        : `${dayLabelFromKey(dk)} ${hourLabel(t)}`}
                    </Text>

                    <Text style={s.hilo}>{fmtInt(tempV, '°')}</Text>

                    <View style={s.tileMeta}>
                      <Text style={s.tileLine}>DP {dewV == null ? '—' : `${Math.round(dewV)}°`}</Text>
                      <Text style={s.tileLine}>RH {rhV == null ? '—' : `${Math.round(rhV)}%`}</Text>
                      <Text style={s.tileLine}>Clouds {ccV == null ? '—' : `${Math.round(ccV)}%`}</Text>
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

          <View style={{ marginTop: 0 }}>
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

              <Line x1={padL + 2} x2={padL + 2} y1={padT} y2={padT + plotH} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />

              <SvgText x={padL - 10} y={padT - 8} fontSize={landscape ? '10' : '12'} fill="rgba(255,255,255,0.78)" fontWeight="900" textAnchor="end">
                {unitsLabel}
              </SvgText>
              <SvgText
                x={pctAxisX}
                y={padT - 8}
                fontSize={landscape ? '9' : '12'}
                fill={landscape ? 'rgba(215,180,255,0.68)' : 'rgba(215,180,255,0.88)'}
                fontWeight={landscape ? '800' : '900'}
                textAnchor="start"
              >
                % / AQI
              </SvgText>

              <Line x1={selX} x2={selX} y1={padT} y2={cloudBandBot} stroke={C.cursor} strokeWidth={2} />

              {data.map((h: any, i) => {
                const x = xForIdx(i);
                const t = h.time as string;
                const dk = dayKeyFromIso(t);
                const hm = parseHourMinute(t);
                const label = hm?.h === 0 ? dayLabelFromKey(dk) : hourLabel(t);
                return (
                  <G key={`chart-top-${t}-${i}`}>
                    <SvgText
                      x={x}
                      y={landscape ? 16 : 18}
                      fontSize="10"
                      fill="rgba(255,255,255,0.92)"
                      fontWeight="800"
                      textAnchor="middle"
                    >
                      {label}
                    </SvgText>
                  </G>
                );
              })}

              {showPrecip && precipArea ? (
                <>
                  <Path d={precipArea} fill={C.precipFill} stroke="none" />
                  <Path d={precipTop} fill="none" stroke={C.precipStroke} strokeWidth={2} />
                </>
              ) : null}

              {showTemp && pathT ? <Path d={pathT} stroke={C.temp} strokeWidth={3.2} fill="none" /> : null}
              {showDew && pathD ? <Path d={pathD} stroke={C.dew} strokeWidth={2.4} strokeDasharray="4 6" fill="none" /> : null}
              {showRh && pathRh ? <Path d={pathRh} stroke={C.rh} strokeWidth={2.2} strokeDasharray="1 6" fill="none" /> : null}
              {showAqi && pathAqi ? <Path d={pathAqi} stroke={C.aqi} strokeWidth={2.4} strokeDasharray="7 5" fill="none" /> : null}

              {data.map((h: any, i) => {
                const x = xForIdx(i);
                const t = h.time as string;
                const dk = dayKeyFromIso(t);
                const prevT = i > 0 ? ((data[i - 1] as any).time as string) : '';
                const prevDk = prevT ? dayKeyFromIso(prevT) : '';
                const dayChanged = !!prevDk && !!dk && prevDk !== dk;

                const tV = pick(h, tempKey);
                const dV = pick(h, dewKey);
                const rhV = pick(h, 'humidityPct');
                const aqiV = pick(h, 'airQualityUsAqi');

                const yT = typeof tV === 'number' ? yForTemp(tV) : null;
                const yD = typeof dV === 'number' ? yForTemp(dV) : null;
                const yRh = typeof rhV === 'number' ? yForPct(rhV) : null;
                const yAqi = typeof aqiV === 'number' ? yForAqi(aqiV) : null;

                return (
                  <G key={`pt-${h.time}-${i}`}>
                    {dayChanged ? (
                      <Line
                        x1={x}
                        x2={x}
                        y1={padT}
                        y2={cloudBandBot}
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth={2}
                      />
                    ) : null}

                    {showTemp && yT != null ? <Circle cx={x} cy={yT} r={9} fill={C.temp} opacity={0.14} /> : null}
                    {showDew && yD != null ? <Circle cx={x} cy={yD} r={7} fill={C.dew} opacity={0.16} /> : null}
                    {showRh && yRh != null ? <Circle cx={x} cy={yRh} r={6.2} fill={C.rh} opacity={0.16} /> : null}
                    {showAqi && yAqi != null ? <Circle cx={x} cy={yAqi} r={6.2} fill={C.aqi} opacity={0.16} /> : null}
                    {showTemp && yT != null ? <Circle cx={x} cy={yT} r={6.2} fill="white" stroke={C.temp} strokeWidth={2.5} /> : null}
                    {showDew && yD != null ? <Circle cx={x} cy={yD} r={4.8} fill="white" stroke={C.dew} strokeWidth={2.1} /> : null}
                    {showRh && yRh != null ? <Circle cx={x} cy={yRh} r={4.4} fill="white" stroke={C.rh} strokeWidth={2.1} /> : null}
                    {showAqi && yAqi != null ? <Circle cx={x} cy={yAqi} r={4.4} fill="white" stroke={C.aqi} strokeWidth={2.1} /> : null}
                  </G>
                );
              })}

              <Rect x={padL} y={windBandTop} width={plotW} height={windBandH} rx={10} fill="rgba(255,255,255,0.05)" />

              {showWind
                ? data.map((h: any, i) => {
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

                    return (
                      <G key={`wb-${h.time}-${i}`}>
                        {wv != null ? <Rect x={wX} y={wY} width={barW} height={wH} rx={4} fill="rgba(255,255,255,0.30)" /> : null}
                        {gv != null ? <Rect x={gX} y={gY} width={barW} height={gH} rx={4} fill="rgba(255,255,255,0.70)" /> : null}
                      </G>
                    );
                  })
                : null}

              <G>
                <SvgText x={padX} y={windBandTop + windBandH / 2 + 4} fontSize="11" fontWeight="900" textAnchor="start" fill="rgba(255, 255, 255, 0.57)">
                  Wind/Gust
                </SvgText>
              </G>

              {showClouds ? (
                <>
                  <Rect x={padL} y={cloudBandTop} width={plotW} height={cloudBandH} rx={8} fill="rgba(255,255,255,0.05)" />

                  {data.map((h: any, i) => {
                    const pct = pick(h, 'cloudCoverPct');
                    const p = typeof pct === 'number' ? clamp(pct, 0, 100) : null;

                    const tileLeft = padL + i * step;
                    const innerPad = 10;
                    const barW = TILE_W - innerPad * 2;
                    const barH = 6;
                    const barX = tileLeft + innerPad;
                    const barY = cloudBandTop + (cloudBandH - barH) / 2;

                    const fillW = p == null ? 0 : (barW * p) / 100;

                    return (
                      <G key={`cb-${h.time}-${i}`}>
                        <Rect x={barX} y={barY} width={barW} height={barH} rx={999} fill={C.cloudFill} />
                        {p != null ? <Rect x={barX} y={barY} width={fillW} height={barH} rx={999} fill={C.cloudOn} /> : null}
                      </G>
                    );
                  })}

                  <G>
                    <SvgText x={padX} y={cloudBandTop + cloudBandH / 2 + 4} fontSize="11" fontWeight="700" textAnchor="start" fill="rgba(255,255,255,0.40)">
                      Clouds
                    </SvgText>
                  </G>
                </>
              ) : null}

              {showWind
                ? data.map((h: any, i) => {
                    const x = xForIdx(i);
                    const wv = pick(h, 'windMph');
                    const dir = pick(h, 'windDirDeg');
                    if (wv == null || typeof dir !== 'number') return null;

                    const cardinal = degToCardinal(dir);

                    return (
                      <G key={`wd-${h.time}-${i}`}>
                        <SvgText x={x} y={windDirTextY} fontSize="10" fontWeight="800" textAnchor="middle" fill={C.dirText}>
                          {cardinal}
                        </SvgText>

                        <Circle
                          cx={x}
                          cy={windDirCenterY}
                          r={windDirRingR}
                          fill={C.ringFill}
                          stroke={C.ringStroke}
                          strokeWidth={1.2}
                        />

                        <G transform={`translate(${x} ${windDirCenterY}) rotate(${dir})`}>
                          <Path d="M 0 -6 L -4 5 L 4 5 Z" fill={C.arrow} />
                        </G>
                      </G>
                    );
                  })
                : null}

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

          {!landscape ? (
          <View style={[s.tableDataColumns, s.tableInlineData, { paddingLeft: padL }]}>
            <View style={s.tableHeaderRow}>
              {data.map((h: any, i) => {
                const t = h.time as string;
                const dk = dayKeyFromIso(t);
                const hm = parseHourMinute(t);
                const label = hm?.h === 0 ? dayLabelFromKey(dk) : hourLabel(t);
                return (
                  <Text
                    key={`th-inline-${t}-${i}`}
                    style={[
                      s.tableValueCell,
                      s.tableHeaderText,
                      { width: TILE_W, marginRight: i === data.length - 1 ? 0 : GAP },
                    ]}
                  >
                    {label}
                  </Text>
                );
              })}
            </View>

            {tableRows.map((row, rowIdx) => (
              <View key={`inline-${row.label}`} style={[s.tableDataRow, rowIdx % 2 === 1 ? s.tableRowAlt : null]}>
                <View style={s.tableValuesRow}>
                  {row.values.map((value, idx) => (
                    <Text
                      key={`${row.label}-inline-${idx}`}
                      style={[
                        s.tableValueCell,
                        { width: TILE_W, marginRight: idx === row.values.length - 1 ? 0 : GAP },
                      ]}
                    >
                      {value}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
          ) : null}
        </View>
        </ScrollView>

      {!landscape ? (
        <View
          pointerEvents="none"
          style={[s.tableLabelColumn, s.tableLabelOverlay, { left: 0, width: TABLE_LABEL_WIDTH, top: 14 + H + 8 }]}
        >
              <View style={s.tableLabelHeader} />
              {tableRows.map((row, idx) => (
                <View key={`label-${row.label}`} style={[s.tableLabelRow, idx % 2 === 1 ? s.tableRowAlt : null]}>
                  <Text style={s.tableLabelText}>{row.shortLabel ?? row.label}</Text>
                </View>
              ))}
        </View>
      ) : null}

      <View style={[s.pillSection, landscape ? s.pillSectionLandscape : null]}>
        <View style={s.legendRow}>
          <ToggleLegendPill
            label={`Temp (${unitsLabel})`}
            kind="line"
            color="rgba(255,255,255,0.95)"
            on={showTemp}
            onPress={() => setShowTemp((v) => !v)}
          />
          <ToggleLegendPill
            label="Dew pt"
            kind="dashed"
            color="rgba(80,220,140,0.90)"
            on={showDew}
            onPress={() => setShowDew((v) => !v)}
          />
          <ToggleLegendPill
            label="RH"
            kind="dot"
            color="rgba(190,120,255,0.80)"
            on={showRh}
            onPress={() => setShowRh((v) => !v)}
          />
          <ToggleLegendPill
            label="AQI"
            kind="dashed"
            color="rgba(250,204,21,0.92)"
            on={showAqi}
            onPress={() => setShowAqi((v) => !v)}
          />
          <ToggleLegendPill
            label="Precip"
            kind="mountain"
            color="rgba(90,200,250,0.45)"
            on={showPrecip}
            onPress={() => setShowPrecip((v) => !v)}
          />
          <ToggleLegendPill
            label={`Wind/Gust (${windLabel})`}
            kind="bars2"
            color="rgba(255,255,255,0.70)"
            on={showWind}
            onPress={() => setShowWind((v) => !v)}
          />
          <ToggleLegendPill
            label="Clouds"
            kind="area"
            color="rgba(255,255,255,0.55)"
            on={showClouds}
            onPress={() => setShowClouds((v) => !v)}
          />
        </View>
      </View>
    </View>
  );
}

function ToggleLegendPill({
  label,
  kind,
  color,
  on,
  onPress,
}: {
  label: string;
  kind: 'line' | 'dashed' | 'dot' | 'area' | 'bars2' | 'mountain';
  color: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.legPill, !on && s.legPillOff]}>
      <View style={s.legSwatchWrap}>
        {kind === 'line' ? <View style={[s.swLine, { backgroundColor: color, opacity: on ? 1 : 0.25 }]} /> : null}

        {kind === 'dashed' ? (
          <View style={s.swDashRow}>
            <View style={[s.swDash, { backgroundColor: color, opacity: on ? 0.95 : 0.25 }]} />
            <View style={[s.swDash, { backgroundColor: color, opacity: on ? 0.95 : 0.25 }]} />
            <View style={[s.swDash, { backgroundColor: color, opacity: on ? 0.95 : 0.25 }]} />
          </View>
        ) : null}

        {kind === 'dot' ? <View style={[s.swDot, { backgroundColor: color, opacity: on ? 0.9 : 0.2 }]} /> : null}

        {kind === 'bars2' ? (
          <View style={s.swBars2Wrap}>
            <View
              style={[
                s.swBar2,
                s.swBar2Left,
                { backgroundColor: 'rgba(255,255,255,0.30)', opacity: on ? 0.75 : 0.2 },
              ]}
            />
            <View style={[s.swBar2, s.swBar2Right, { backgroundColor: color, opacity: on ? 0.95 : 0.2 }]} />
          </View>
        ) : null}

        {kind === 'mountain' ? (
          <View style={s.swMountainWrap}>
            <View style={[s.swMountainFill, { backgroundColor: color, opacity: on ? 0.18 : 0.06 }]} />
            <View style={[s.swMountainRidge, { borderColor: color, opacity: on ? 0.55 : 0.18 }]} />
          </View>
        ) : null}

        {kind === 'area' ? (
          <View style={s.swAreaWrap}>
            <View style={[s.swAreaFill, { backgroundColor: color, opacity: on ? 0.45 : 0.12 }]} />
          </View>
        ) : null}
      </View>

      <Text style={[s.legText, !on && { opacity: 0.55 }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: {
    marginTop: 10,
    borderRadius: 24,
    backgroundColor: GLASS_CARD,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    paddingTop: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  wrapLandscape: {
    flex: 1,
    marginTop: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },

  headerRow: { paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  title: { color: 'rgba(255,255,255,0.92)', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  currentConditionHeader: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    fontWeight: '800',
  },

  strip: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  hourTile: {
    width: 92,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: GLASS_INSET_SOFT,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
    minHeight: 168,
  },
  hourTileActive: {
    backgroundColor: 'rgba(37,99,235,0.22)',
    borderColor: 'rgba(147,197,253,0.36)',
  },
  hourTop: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 12, letterSpacing: 0.4 },
  hilo: { marginTop: 8, color: 'white', fontWeight: '900', fontSize: 18 },

  sub: { marginTop: 6, color: 'rgba(255,255,255,0.55)', fontWeight: '800', fontSize: 11 },

  tileMeta: { marginTop: 6, alignItems: 'flex-start' },
  tileLine: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.70)',
    lineHeight: 15,
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
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  legPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: GLASS_INSET,
    borderWidth: 1,
    borderColor: GLASS_BORDER_SOFT,
  },
  legPillOff: {
    backgroundColor: GLASS_INSET_SOFT,
  },
  legText: { color: 'rgba(255,255,255,0.86)', fontWeight: '900', fontSize: 11 },
  legSwatchWrap: { width: 18, height: 10, justifyContent: 'center' },

  swLine: { height: 3, borderRadius: 2 },

  swDashRow: { width: 18, height: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swDash: { width: 4, height: 2, borderRadius: 2, opacity: 0.95 },

  swDot: { width: 6, height: 6, borderRadius: 999, opacity: 0.9 },

  swAreaWrap: {
    width: 18,
    height: 10,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: GLASS_INSET_SOFT,
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
    backgroundColor: GLASS_INSET_SOFT,
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
    borderColor: GLASS_BORDER,
    backgroundColor: GLASS_INSET_SOFT,
  },
  tableLabelColumn: {
    width: TABLE_LABEL_WIDTH,
    flexShrink: 0,
    backgroundColor: 'rgba(18,28,45,0.50)',
    borderRightWidth: 1,
    borderRightColor: GLASS_BORDER,
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
    borderBottomColor: GLASS_BORDER_SOFT,
  },
  tableLabelRow: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderTopWidth: 1,
    borderTopColor: GLASS_BORDER_SOFT,
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
    backgroundColor: 'transparent',
  },
  tableInlineData: {
    marginTop: 8,
    marginLeft: 0,
    marginRight: 12,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: TABLE_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: GLASS_BORDER_SOFT,
  },
  tableDataRow: {
    height: ROW_HEIGHT,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: GLASS_BORDER_SOFT,
  },
  tableRowAlt: {
    backgroundColor: GLASS_INSET_SOFT,
  },
  tableHeaderText: {
    color: 'rgba(255,255,255,0.62)',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableValueCell: {
    width: 92,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  tableValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});

export default HourlyRangeChart;
