import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { ForecastHour } from '../../../app/lib/openmeteo/hooks';
import { SERIES_COLOR } from '../../../app/lib/ui/semanticSeriesColors';
import { theme } from '../../../styles/theme';
import { Card } from '../../layout/Card';

type PanelId = 'temp' | 'precip' | 'wind' | 'comfort' | 'sky' | 'fronts';
type UnitSystem = 'us' | 'metric';

type Props = {
  hours: ForecastHour[];
  maxHours?: number; // default 72
  units?: UnitSystem;
  initialPanel?: PanelId;
};

type Pt = { x: number; y: number; v: number; t: string };

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
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
    case 'feelsF':
      return safeNum((h as any).feelsLikeF ?? (h as any).apparentTempF ?? (h as any).apparentTemperatureF);
    case 'dewF':
      return safeNum((h as any).dewPointF ?? (h as any).dewpointF ?? (h as any).dew);
    case 'popPct':
      return clampPct((h as any).precipProbPct ?? (h as any).precipProbabilityPct ?? (h as any).popPct);
    case 'humidityPct':
      return clampPct((h as any).humidityPct ?? (h as any).relativeHumidityPct ?? (h as any).rhPct);
    case 'cloudPct':
      return clampPct((h as any).cloudCoverPct ?? (h as any).cloudPct ?? (h as any).cloudsPct);
    case 'windMph':
      return safeNum((h as any).windMph ?? (h as any).windSpeedMph ?? (h as any).windSpeed);
    case 'gustMph':
      return safeNum((h as any).gustMph ?? (h as any).windGustMph ?? (h as any).gust);
    case 'windDirDeg':
      return safeNum((h as any).windDirDeg ?? (h as any).windDirectionDeg ?? (h as any).windDirection);
    case 'pressureHpa':
      return safeNum((h as any).pressureHpa ?? (h as any).mslPressureHpa ?? (h as any).pressure);
    case 'shortwaveWm2':
      return safeNum((h as any).shortwaveRadiationWm2 ?? (h as any).shortwaveWm2 ?? (h as any).solarWm2);
    case 'uv':
      return safeNum((h as any).uvIndex ?? (h as any).uv);
    default:
      return safeNum((h as any)[key]);
  }
}

function dayKeyFromIso(iso: string): string {
  return iso ? iso.slice(0, 10) : '';
}

function parseHourMinute(iso: string): { h: number; m: number } | null {
  if (!iso || iso.length < 16) return null;
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function hourLabel(iso: string) {
  const hm = parseHourMinute(iso);
  if (!hm) return '—';
  const hour12 = ((hm.h + 11) % 12) + 1;
  const ampm = hm.h >= 12 ? 'PM' : 'AM';
  return `${hour12}${ampm}`;
}

function timeLabel(iso: string) {
  const hm = parseHourMinute(iso);
  if (!hm) return '—';
  const hour12 = ((hm.h + 11) % 12) + 1;
  const ampm = hm.h >= 12 ? 'PM' : 'AM';
  const mm = `${hm.m}`.padStart(2, '0');
  return `${hour12}:${mm} ${ampm}`;
}

function dayLabelFromKey(dayKey: string) {
  if (!dayKey) return '';
  const d = new Date(`${dayKey}T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' }).format(d);
}

function buildPath(points: Pt[]) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

function buildArea(points: Pt[], baselineY: number) {
  if (!points.length) return '';
  const line = buildPath(points);
  const last = points[points.length - 1];
  const first = points[0];
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

function norm(v: number, min: number, max: number) {
  if (max === min) return 0.5;
  return (v - min) / (max - min);
}

function fmt(v: number | null, suffix = '', digits = 0) {
  if (v == null) return '—';
  return digits > 0 ? `${v.toFixed(digits)}${suffix}` : `${Math.round(v)}${suffix}`;
}

type SeriesKind = 'line' | 'area' | 'bars' | 'arrows';

type SeriesDef = {
  key: string;
  label: string;
  kind: SeriesKind;
  axis?: 'left' | 'right';
  pct?: boolean;
};

type PanelDef = {
  id: PanelId;
  title: string;
  subtitle?: string;
  yLabelLeft?: string;
  yLabelRight?: string;
  showDailyShading?: boolean;
  comfortBands?: boolean;
  series: SeriesDef[];
};

const PANELS: PanelDef[] = [
  {
    id: 'temp',
    title: 'Temp',
    subtitle: 'Temp + Feels · daily mean band',
    yLabelLeft: '°F',
    showDailyShading: true,
    series: [
      { key: 'tempF', label: 'Temp', kind: 'line' },
      { key: 'feelsF', label: 'Feels', kind: 'line' },
    ],
  },
  {
    id: 'precip',
    title: 'Precip',
    subtitle: 'Precip % + Humidity + Dew',
    yLabelLeft: '%',
    yLabelRight: '°F',
    series: [
      { key: 'popPct', label: 'Precip %', kind: 'bars', axis: 'left', pct: true },
      { key: 'humidityPct', label: 'Humidity', kind: 'line', axis: 'left', pct: true },
      { key: 'dewF', label: 'Dew', kind: 'line', axis: 'right' },
    ],
  },
  {
    id: 'wind',
    title: 'Wind',
    subtitle: 'Wind + Gust + Dir',
    yLabelLeft: 'mph',
    series: [
      { key: 'windMph', label: 'Wind', kind: 'line' },
      { key: 'gustMph', label: 'Gust', kind: 'line' },
      { key: 'windDirDeg', label: 'Dir', kind: 'arrows' },
    ],
  },
  {
    id: 'comfort',
    title: 'Comfort',
    subtitle: 'Feels + Dew · comfort bands',
    yLabelLeft: '°F',
    comfortBands: true,
    series: [
      { key: 'feelsF', label: 'Feels', kind: 'line' },
      { key: 'dewF', label: 'Dew', kind: 'line' },
    ],
  },
  {
    id: 'sky',
    title: 'Sky/Solar',
    subtitle: 'Clouds + Solar + UV (if present)',
    yLabelLeft: '%',
    yLabelRight: 'W/m²',
    series: [
      { key: 'cloudPct', label: 'Clouds', kind: 'area', axis: 'left', pct: true },
      { key: 'shortwaveWm2', label: 'Shortwave', kind: 'line', axis: 'right' },
      { key: 'uv', label: 'UV', kind: 'line', axis: 'left' },
    ],
  },
  {
    id: 'fronts',
    title: 'Fronts',
    subtitle: 'Pressure + tendency',
    yLabelLeft: 'hPa',
    series: [{ key: 'pressureHpa', label: 'Pressure', kind: 'line' }],
  },
];

function primarySecondaryForPanel(panelId: PanelId) {
  switch (panelId) {
    case 'temp':
      return { main: 'tempF', mainFmt: (v: number | null) => fmt(v, '°'), sub: 'feelsF', subFmt: (v: number | null) => `Feels ${fmt(v, '°')}` };
    case 'precip':
      return { main: 'popPct', mainFmt: (v: number | null) => fmt(v, '%'), sub: 'dewF', subFmt: (v: number | null) => `Dew ${fmt(v, '°')}` };
    case 'wind':
      return { main: 'windMph', mainFmt: (v: number | null) => fmt(v, ''), sub: 'gustMph', subFmt: (v: number | null) => `G ${fmt(v, '')}` };
    case 'comfort':
      return { main: 'feelsF', mainFmt: (v: number | null) => fmt(v, '°'), sub: 'dewF', subFmt: (v: number | null) => `DP ${fmt(v, '°')}` };
    case 'sky':
      return { main: 'cloudPct', mainFmt: (v: number | null) => fmt(v, '%'), sub: 'uv', subFmt: (v: number | null) => (v == null ? '' : `UV ${fmt(v, '', 1)}`) };
    case 'fronts':
      return {
        main: 'pressureHpa',
        mainFmt: (v: number | null) => fmt(v, ''),
        sub: '__tendency__',
        subFmt: (v: number | null) => (v == null ? '' : v >= 0 ? `↗ ${v.toFixed(2)}` : `↘ ${Math.abs(v).toFixed(2)}`),
      };
  }
}

function withAlpha(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function seriesColorForKey(key: string) {
  switch (key) {
    case 'tempF': return SERIES_COLOR.temp;
    case 'feelsF': return SERIES_COLOR.feels;
    case 'popPct': return SERIES_COLOR.pop;
    case 'humidityPct': return SERIES_COLOR.humidity;
    case 'dewF': return SERIES_COLOR.dew;
    case 'windMph': return SERIES_COLOR.wind;
    case 'gustMph': return SERIES_COLOR.gust;
    case 'windDirDeg': return SERIES_COLOR.dir;
    case 'cloudPct': return SERIES_COLOR.clouds;
    case 'shortwaveWm2': return SERIES_COLOR.shortwave;
    case 'uv': return SERIES_COLOR.uv;
    case 'pressureHpa': return SERIES_COLOR.pressure;
    case '__tendency__': return SERIES_COLOR.tendency;
    default: return 'rgba(255,255,255,0.50)';
  }
}

function niceStep(raw: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const f = raw / Math.pow(10, exp);
  let nf = 1;
  if (f < 1.5) nf = 1;
  else if (f < 3) nf = 2;
  else if (f < 7) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

function buildNiceTicks(min: number, max: number, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const span = max - min;
  const step = niceStep(span / Math.max(1, count - 1));
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(v);
  return ticks;
}

function yForValue(v: number, axis: { min: number; max: number }, top: number, height: number) {
  const t = norm(v, axis.min, axis.max);
  return top + (1 - t) * height;
}

/**
 * Day blocks use the date key, while labels prefer the midnight sample when it exists.
 * That prevents a day label from “starting” at noon visually if your slice begins mid-day.
 */
function buildDayBlocks(hours: ForecastHour[]) {
  if (!hours.length) return [];
  const blocks: Array<{ dayKey: string; startIdx: number; endIdx: number; labelIdx: number; label: string }> = [];

  let cur = dayKeyFromIso((hours[0] as any).time);
  let start = 0;

  for (let i = 0; i < hours.length; i++) {
    const key = dayKeyFromIso((hours[i] as any).time);
    if (key !== cur) {
      blocks.push(makeBlock(hours, cur, start, i - 1));
      cur = key;
      start = i;
    }
  }
  blocks.push(makeBlock(hours, cur, start, hours.length - 1));
  return blocks;
}

function makeBlock(hours: ForecastHour[], dayKey: string, startIdx: number, endIdx: number) {
  let labelIdx = startIdx;
  // prefer the midnight datapoint if present inside this day
  for (let i = startIdx; i <= endIdx; i++) {
    const t = (hours[i] as any).time as string;
    const hm = parseHourMinute(t);
    if (hm && hm.h === 0 && hm.m === 0) {
      labelIdx = i;
      break;
    }
  }
  return { dayKey, startIdx, endIdx, labelIdx, label: dayLabelFromKey(dayKey) };
}

export function HourlyChart({ hours, maxHours = 72, units = 'us', initialPanel = 'temp' }: Props) {
  const [panelId, setPanelId] = useState<PanelId>(initialPanel);
  const [expanded, setExpanded] = useState(false);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [cursorOn, setCursorOn] = useState(false);

  const slice = useMemo(() => hours.slice(0, Math.min(hours.length, maxHours)), [hours, maxHours]);
  const panel = useMemo(() => PANELS.find((p) => p.id === panelId) ?? PANELS[0], [panelId]);

  const H = expanded ? 320 : 240;
  const PAD_L = 44;
  const PAD_R = 36;
  const PAD_T = 14;
  const PAD_B = 18;

  const hourPx = expanded ? 20 : 18;
  const W = Math.max(360, PAD_L + PAD_R + slice.length * hourPx);

  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xs = useMemo(() => {
    return slice.map((h, i) => {
      const x = PAD_L + (i / Math.max(1, slice.length - 1)) * innerW;
      return { t: (h as any).time as string, x };
    });
  }, [slice, innerW]);

  const dayBlocks = useMemo(() => buildDayBlocks(slice), [slice]);

  const computed = useMemo(() => {
    let leftMin = Number.POSITIVE_INFINITY;
    let leftMax = Number.NEGATIVE_INFINITY;
    let rightMin = Number.POSITIVE_INFINITY;
    let rightMax = Number.NEGATIVE_INFINITY;

    const seriesPts: Record<string, Pt[]> = {};

    for (const s of panel.series) {
      const pts: Pt[] = [];
      for (let i = 0; i < slice.length; i++) {
        const h = slice[i];
        const t = (h as any).time as string;
        const x = xs[i]?.x ?? (PAD_L + (i / Math.max(1, slice.length - 1)) * innerW);

        const v = pick(h, s.key);
        if (v == null) continue;

        if (s.pct) {
          leftMin = Math.min(leftMin, 0);
          leftMax = Math.max(leftMax, 100);
        } else if (s.axis === 'right') {
          rightMin = Math.min(rightMin, v);
          rightMax = Math.max(rightMax, v);
        } else {
          leftMin = Math.min(leftMin, v);
          leftMax = Math.max(leftMax, v);
        }

        pts.push({ x, y: 0, v, t });
      }
      seriesPts[s.key] = pts;
    }

    if (!Number.isFinite(leftMin) || !Number.isFinite(leftMax)) { leftMin = 0; leftMax = 1; }
    if (!Number.isFinite(rightMin) || !Number.isFinite(rightMax)) { rightMin = 0; rightMax = 1; }

    const padRange = (min: number, max: number) => {
      if (max === min) return { min: min - 1, max: max + 1 };
      const r = max - min;
      return { min: min - r * 0.08, max: max + r * 0.08 };
    };

    const left = panel.series.some((s) => s.pct) ? { min: 0, max: 100 } : padRange(leftMin, leftMax);
    const right = padRange(rightMin, rightMax);

    for (const s of panel.series) {
      const pts = seriesPts[s.key] ?? [];
      const axis = s.axis === 'right' ? right : left;
      const pct = s.pct;

      for (const p of pts) {
        const tt = pct ? norm(p.v, 0, 100) : norm(p.v, axis.min, axis.max);
        p.y = PAD_T + (1 - tt) * innerH;
      }
    }

    return { seriesPts, left, right };
  }, [panel, slice, xs, innerW, innerH, PAD_L, PAD_T]);

  const colSpec = useMemo(() => primarySecondaryForPanel(panelId), [panelId]);
  const usesRightAxis = useMemo(() => panel.series.some((s) => s.axis === 'right'), [panel.series]);

  const leftTicks = useMemo(() => {
    if (panel.series.some((s) => s.pct)) return [0, 25, 50, 75, 100];
    const ticks = buildNiceTicks(computed.left.min, computed.left.max, 4);
    return ticks.length ? ticks : [computed.left.min, computed.left.max];
  }, [panel.series, computed.left.min, computed.left.max]);

  const rightTicks = useMemo(() => {
    if (!usesRightAxis) return [];
    const ticks = buildNiceTicks(computed.right.min, computed.right.max, 4);
    return ticks.length ? ticks : [computed.right.min, computed.right.max];
  }, [usesRightAxis, computed.right.min, computed.right.max]);

  const cursorTime = cursorIdx != null ? ((slice[cursorIdx] as any)?.time as string) : null;

  const tooltipRows = useMemo(() => {
    if (cursorIdx == null || !cursorTime) return [];
    const h = slice[cursorIdx];
    const rows: Array<{ label: string; value: string; color: string }> = [];
    for (const s of panel.series) {
      if (s.kind === 'arrows') continue;
      const v = pick(h, s.key);
      if (v == null) continue;
      const suffix = s.pct ? '%' : s.key.includes('temp') || s.key.includes('feels') || s.key.includes('dew') ? '°' : '';
      rows.push({ label: s.label, value: suffix ? `${Math.round(v)}${suffix}` : `${Math.round(v)}`, color: seriesColorForKey(s.key) });
    }
    return rows.slice(0, 4);
  }, [cursorIdx, cursorTime, panel, slice]);

  const inPlotArea = (evt: any) => {
    const y = evt?.nativeEvent?.locationY as number | undefined;
    if (y == null) return false;
    return y >= PAD_T && y <= PAD_T + innerH;
  };

  const onStart = (evt: any) => {
    const x = evt?.nativeEvent?.locationX as number | undefined;
    if (x == null || !slice.length) return;
    if (!inPlotArea(evt)) return;

    const clamped = Math.max(PAD_L, Math.min(PAD_L + innerW, x));
    const frac = (clamped - PAD_L) / innerW;
    const idx = Math.round(frac * Math.max(0, slice.length - 1));
    setCursorIdx(Math.max(0, Math.min(slice.length - 1, idx)));
    setCursorOn(true);
  };

  const onMove = (evt: any) => {
    if (!cursorOn) return;
    onStart(evt);
  };

  const onEnd = () => setCursorOn(false);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Hourly</Text>
          <Text style={styles.subtitle}>{panel.subtitle ?? 'Trends'}</Text>
        </View>

        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.expandBtn}>
          <Text style={styles.expandText}>{expanded ? 'Collapse' : 'Expand'}</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {PANELS.map((p) => (
          <Tab key={p.id} label={p.title} active={p.id === panelId} onPress={() => setPanelId(p.id)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={{ width: W }}>
          <Pressable
            onPress={() => {
              if (!cursorOn) setCursorIdx(null);
            }}
          >
            <View
              onStartShouldSetResponder={inPlotArea}
              onMoveShouldSetResponder={inPlotArea}
              onResponderGrant={onStart}
              onResponderMove={onMove}
              onResponderRelease={onEnd}
              onResponderTerminate={onEnd}
            >
              <Svg width={W} height={H}>
                <Rect x={0} y={0} width={W} height={H} fill="rgba(255,255,255,0.02)" rx={18} />

                {/* Day shading blocks + label anchored to midnight if present */}
                {dayBlocks.map((b, idx) => {
                  const x1 = xs[b.startIdx]?.x ?? PAD_L;
                  const x2 = xs[b.endIdx]?.x ?? (PAD_L + innerW);
                  const w = Math.max(1, x2 - x1);
                  const shade = idx % 2 === 0 ? 0.06 : 0.03;

                  const lx = xs[b.labelIdx]?.x ?? x1;

                  return (
                    <G key={`${b.dayKey}-${idx}`}>
                      <Rect x={x1} y={PAD_T} width={w} height={innerH} fill={`rgba(255,255,255,${shade})`} />
                      <SvgText x={lx + 6} y={PAD_T + 12} fontSize="10" fill="rgba(255,255,255,0.55)" fontWeight="700">
                        {b.label}
                      </SvgText>

                      {/* midnight marker (if labelIdx is midnight) */}
                      {b.labelIdx !== b.startIdx ? (
                        <Line x1={lx} y1={PAD_T} x2={lx} y2={PAD_T + innerH} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />
                      ) : null}
                    </G>
                  );
                })}

                {renderGridWithTicks({
                  xLeft: PAD_L,
                  xRight: PAD_L + innerW,
                  top: PAD_T,
                  height: innerH,
                  leftAxis: computed.left,
                  rightAxis: computed.right,
                  leftTicks,
                  rightTicks,
                  leftLabel: panel.yLabelLeft ?? '',
                  rightLabel: usesRightAxis ? panel.yLabelRight ?? '' : '',
                  showRight: usesRightAxis,
                })}

                {/* Series */}
                {panel.series.map((s) => {
                  const pts = computed.seriesPts[s.key] ?? [];
                  if (!pts.length) return null;
                  const c = seriesColorForKey(s.key);

                  if (s.kind === 'area') {
                    const baselineY = PAD_T + innerH;
                    return (
                      <G key={s.key}>
                        <Path d={buildArea(pts, baselineY)} fill={withAlpha(c, 0.18)} />
                        <Path d={buildPath(pts)} stroke={withAlpha(c, 0.75)} strokeWidth={2} fill="none" />
                      </G>
                    );
                  }

                  if (s.kind === 'bars') {
                    const barW = 10;
                    const baseY = PAD_T + innerH;
                    return (
                      <G key={s.key}>
                        {pts.map((p, idx) => {
                          const axis = s.axis === 'right' ? computed.right : computed.left;
                          const tt = s.pct ? norm(p.v, 0, 100) : norm(p.v, axis.min, axis.max);
                          const y = PAD_T + (1 - tt) * innerH;
                          const h = baseY - y;
                          return (
                            <Rect key={`${s.key}-${idx}`} x={p.x - barW / 2} y={y} width={barW} height={Math.max(0, h)} rx={4} fill={withAlpha(c, 0.22)} />
                          );
                        })}
                      </G>
                    );
                  }

                  if (s.kind === 'arrows') {
                    const midY = PAD_T + innerH * 0.82;
                    return (
                      <G key={s.key}>
                        {pts.map((p, idx) => {
                          const ang = (p.v * Math.PI) / 180;
                          const len = 10;
                          const x2 = p.x + Math.sin(ang) * len;
                          const y2 = midY - Math.cos(ang) * len;
                          return (
                            <G key={`${s.key}-${idx}`}>
                              <Line x1={p.x} y1={midY} x2={x2} y2={y2} stroke={withAlpha(c, 0.55)} strokeWidth={1.5} />
                              <Circle cx={p.x} cy={midY} r={1.6} fill={withAlpha(c, 0.55)} />
                            </G>
                          );
                        })}
                      </G>
                    );
                  }

                  return <Path key={s.key} d={buildPath(pts)} stroke={withAlpha(c, 0.85)} strokeWidth={2.25} fill="none" />;
                })}

                {/* Crosshair + tooltip */}
                {cursorIdx != null ? (
                  <G>
                    <Line
                      x1={xs[cursorIdx]?.x ?? PAD_L}
                      y1={PAD_T}
                      x2={xs[cursorIdx]?.x ?? PAD_L}
                      y2={PAD_T + innerH}
                      stroke="rgba(255,255,255,0.18)"
                      strokeWidth={1}
                    />

                    {tooltipRows.length ? (
                      <G>
                        <Rect
                          x={Math.min(W - 160, (xs[cursorIdx]?.x ?? PAD_L) + 10)}
                          y={PAD_T + 16}
                          width={150}
                          height={18 + tooltipRows.length * 16}
                          rx={12}
                          fill="rgba(0,0,0,0.55)"
                        />
                        <SvgText
                          x={Math.min(W - 160, (xs[cursorIdx]?.x ?? PAD_L) + 10) + 10}
                          y={PAD_T + 30}
                          fontSize="10"
                          fill="rgba(255,255,255,0.85)"
                          fontWeight="900"
                        >
                          {cursorTime ? timeLabel(cursorTime) : ''}
                        </SvgText>

                        {tooltipRows.map((r, i) => (
                          <G key={`tt-${r.label}`}>
                            <Rect
                              x={Math.min(W - 160, (xs[cursorIdx]?.x ?? PAD_L) + 10) + 10}
                              y={PAD_T + 38 + i * 16}
                              width={6}
                              height={6}
                              rx={2}
                              fill={withAlpha(r.color, 0.9)}
                            />
                            <SvgText
                              x={Math.min(W - 160, (xs[cursorIdx]?.x ?? PAD_L) + 10) + 22}
                              y={PAD_T + 44 + i * 16}
                              fontSize="10"
                              fill="rgba(255,255,255,0.75)"
                              fontWeight="800"
                            >
                              {r.label} {r.value}
                            </SvgText>
                          </G>
                        ))}
                      </G>
                    ) : null}
                  </G>
                ) : null}
              </Svg>
            </View>
          </Pressable>

          <HourColumnsRow
            hours={slice}
            panelId={panelId}
            units={units}
            mainKey={colSpec.main}
            subKey={colSpec.sub}
            mainFmt={colSpec.mainFmt}
            subFmt={colSpec.subFmt}
          />
        </View>
      </ScrollView>
    </Card>
  );
}

function HourColumnsRow({
  hours,
  panelId,
  units,
  mainKey,
  subKey,
  mainFmt,
  subFmt,
}: {
  hours: ForecastHour[];
  panelId: PanelId;
  units: UnitSystem;
  mainKey: string;
  subKey: string;
  mainFmt: (v: number | null) => string;
  subFmt: (v: number | null) => string;
}) {
  return (
    <View style={styles.colsRow}>
      {hours.map((h: any, i) => {
        const t = h.time as string;
        const mainV = pick(h, mainKey);
        const subV = pick(h, subKey);
        const show = i % 2 === 0;

        return (
          <View key={t ?? i} style={[styles.col, !show && styles.colMuted]}>
            <Text style={styles.colTime}>{hourLabel(t)}</Text>
            <Text style={styles.colIcon}>•</Text>
            <Text style={styles.colValue}>{panelId === 'wind' ? `${mainFmt(mainV)}` : mainFmt(mainV)}</Text>
            <Text style={styles.colSub}>{subFmt(subV)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function renderGridWithTicks(args: {
  xLeft: number;
  xRight: number;
  top: number;
  height: number;
  leftAxis: { min: number; max: number };
  rightAxis: { min: number; max: number };
  leftTicks: number[];
  rightTicks: number[];
  leftLabel: string;
  rightLabel: string;
  showRight: boolean;
}) {
  const { xLeft, xRight, top, height, leftAxis, rightAxis, leftTicks, rightTicks, leftLabel, rightLabel, showRight } = args;
  const elements: React.ReactElement[] = [];

  if (leftLabel) {
    elements.push(<SvgText key="ylabL" x={8} y={top + 10} fontSize="9" fill="rgba(255,255,255,0.35)" fontWeight="800">{leftLabel}</SvgText>);
  }
  if (showRight && rightLabel) {
    elements.push(<SvgText key="ylabR" x={xRight + 10} y={top + 10} fontSize="9" fill="rgba(255,255,255,0.35)" fontWeight="800">{rightLabel}</SvgText>);
  }

  leftTicks.forEach((v, idx) => {
    const yy = yForValue(v, leftAxis, top, height);
    const isEdge = idx === 0 || idx === leftTicks.length - 1;

    elements.push(<Line key={`gridL-${idx}`} x1={xLeft} y1={yy} x2={xRight} y2={yy} stroke={isEdge ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.07)'} strokeWidth={1} />);
    elements.push(
      <SvgText key={`tickL-${idx}`} x={xLeft - 6} y={yy + 3} fontSize="9" fill="rgba(255,255,255,0.40)" fontWeight="800" textAnchor="end">
        {Math.round(v)}
      </SvgText>
    );
  });

  if (showRight) {
    rightTicks.forEach((v, idx) => {
      const yy = yForValue(v, rightAxis, top, height);
      elements.push(
        <SvgText key={`tickR-${idx}`} x={xRight + 10} y={yy + 3} fontSize="9" fill="rgba(255,255,255,0.35)" fontWeight="800">
          {Math.round(v)}
        </SvgText>
      );
    });
  }

  elements.push(<Line key="axisL" x1={xLeft} y1={top} x2={xLeft} y2={top + height} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />);
  elements.push(<Line key="axisB" x1={xLeft} y1={top + height} x2={xRight} y2={top + height} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />);
  if (showRight) {
    elements.push(<Line key="axisR" x1={xRight} y1={top} x2={xRight} y2={top + height} stroke="rgba(255,255,255,0.10)" strokeWidth={1} />);
  }

  return <G>{elements}</G>;
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },

  header: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.textPrimary },
  subtitle: { marginTop: 2, fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary },

  expandBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  expandText: { fontSize: 12, fontWeight: '900', color: theme.colors.textPrimary },

  tabs: { gap: 8, paddingLeft: 2, paddingRight: 2, alignItems: 'center', marginBottom: 8 },
  tab: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.06)' },
  tabActive: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.22)' },
  tabText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },
  tabTextActive: { color: theme.colors.textPrimary },

  colsRow: { flexDirection: 'row', paddingTop: 10, paddingBottom: 10, paddingHorizontal: 6 },
  col: { width: 58, alignItems: 'center' },
  colMuted: { opacity: 0.55 },
  colTime: { fontSize: 11, fontWeight: '900', color: 'rgba(255,255,255,0.72)' },
  colIcon: { marginTop: 6, fontSize: 16, opacity: 0.75 },
  colValue: { marginTop: 6, fontSize: 18, fontWeight: '900', color: 'white' },
  colSub: { marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: '800' },
});
