// components/land/NerdyHourlyTimeline.tsx
// ✅ Drop-in replacement
// ✅ Default mode = Simple
// ✅ Simple mode right-side shows Pressure (kPa + inHg) to avoid cloud duplication
// ✅ WxLab press auto-expands a tile (no second tap required)
// ✅ Removes abbreviations → richer labels
// ✅ Fixes precip chance showing "—" when it's actually 0% (we now show 0%)
// ✅ Pressure shown in Simple (right side) + also in WxLab expanded section (hPa)

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { Card } from '../layout/Card';

type Mode = 'simple' | 'wxlab';

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function asPct(v: any): number | null {
  const n = safeNum(v);
  if (n == null) return null;
  if (n <= 1) return Math.round(n * 100);
  return Math.round(n);
}

function round0(v: any): number | null {
  const n = safeNum(v);
  if (n == null) return null;
  return Math.round(n);
}

function fmtHourLabel(t: any): string {
  try {
    const d = typeof t === 'string' ? new Date(t) : new Date(String(t));
    if (Number.isNaN(d.getTime())) return String(t ?? '');
    let h = d.getHours();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h} ${ap}`;
  } catch {
    return String(t ?? '');
  }
}

function windArrowFromDeg(deg: number | null) {
  if (deg == null) return '→';
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return '↑';
  if (d < 67.5) return '↗';
  if (d < 112.5) return '→';
  if (d < 157.5) return '↘';
  if (d < 202.5) return '↓';
  if (d < 247.5) return '↙';
  if (d < 292.5) return '←';
  return '↖';
}

function chip(v: number | null, suffix = '') {
  return v == null ? '—' : `${v}${suffix}`;
}

function barFrac(pct: number | null) {
  if (pct == null) return 0;
  return clamp01(pct / 100);
}

// ✅ show 0% when value is present (do not hide zeros)
function fmtPct(p: number | null) {
  return p == null ? '—' : `${p}%`;
}

function scoreFogRisk(
  tF: number | null,
  dpF: number | null,
  windMph: number | null,
  cloudPct: number | null
) {
  if (tF == null || dpF == null) return null;
  const spread = tF - dpF;
  let s = 0;

  if (spread <= 1) s += 0.55;
  else if (spread <= 3) s += 0.4;
  else if (spread <= 6) s += 0.2;

  if (windMph != null) {
    if (windMph <= 2) s += 0.25;
    else if (windMph <= 5) s += 0.15;
    else if (windMph <= 8) s += 0.05;
  }

  if (cloudPct != null) {
    if (cloudPct >= 80) s += 0.15;
    else if (cloudPct >= 50) s += 0.08;
  }

  return Math.round(clamp01(s) * 100);
}

function formatPressureFromHpa(hpa: number | null): { hpaText: string; inhgText: string } | null {
  if (hpa == null) return null;

  const inHg = hpa * 0.0295299830714;

  return {
    hpaText: `${hpa} hPa`,
    inhgText: `${inHg.toFixed(2)} inHg`,
  };
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <View style={styles.modeWrap}>
      {(['simple', 'wxlab'] as const).map((m) => {
        const active = m === mode;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            style={[styles.modeBtn, active ? styles.modeBtnActive : null]}
          >
            <Text style={[styles.modeText, active ? styles.modeTextActive : null]}>
              {m === 'simple' ? 'Simple' : 'WxLab'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function NerdyHourlyTimeline({
  hours,
  maxHours = 72,
}: {
  hours: any[];
  maxHours?: number;
}) {
  // ✅ Default to Simple (per your request)
  const [mode, setMode] = useState<Mode>('simple');

  // single-expanded tile (cleaner UX + makes WxLab auto-expand easy)
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows = useMemo(() => {
    const sliced = (hours ?? []).slice(0, maxHours);

    return sliced.map((h: any, idx: number) => {
      const time = h.time ?? h.timestamp ?? h.t ?? h.datetime ?? h.dateTime ?? idx;

      const tF = safeNum(h.tempF ?? h.temperatureF ?? h.temperature_2m_f ?? h.temperature_2m);
      const feelsF = safeNum(h.apparentTempF ?? h.apparent_temperature ?? h.apparent_temperature_f);
      const dpF = safeNum(h.dewPointF ?? h.dewpointF ?? h.dew_point_2m ?? h.dew_point_2m_f);

      const rh = asPct(h.humidityPct ?? h.relativeHumidityPct ?? h.relative_humidity_2m);
      const pop = asPct(h.precipProbPct ?? h.precip_probability ?? h.precipProbabilityPct);
      const cloud = asPct(h.cloudCoverPct ?? h.cloud_cover ?? h.cloudcoverPct);

      const wind = safeNum(h.windMph ?? h.windspeedMph ?? h.wind_speed_10m);
      const gust = safeNum(h.windGustMph ?? h.wind_gusts_10m ?? h.windGustsMph);
      const wdir = safeNum(h.windDirDeg ?? h.wind_direction_10m);

      const pressureHpa = safeNum(h.pressureHpa ?? h.pressure_msl ?? h.pressureMslHpa ?? h.surface_pressure);

      const spread = tF != null && dpF != null ? Math.round((tF - dpF) * 10) / 10 : null;
      const gustFactor =
        wind != null && gust != null && wind > 0 ? Math.round((gust / wind) * 100) / 100 : null;
      const fogRisk = scoreFogRisk(tF, dpF, wind, cloud);

      const key = typeof time === 'string' ? time : String(idx);

      return {
        key,
        timeLabel: fmtHourLabel(time),
        tF: round0(tF),
        feelsF: round0(feelsF),
        dpF: round0(dpF),
        rh,
        pop,
        cloud,
        wind: wind != null ? Math.round(wind) : null,
        gust: gust != null ? Math.round(gust) : null,
        wdir,
        pressureHpa: pressureHpa != null ? Math.round(pressureHpa) : null,
        spread,
        gustFactor,
        fogRisk,
      };
    });
  }, [hours, maxHours]);

  const firstRowKey = rows.length ? rows[0].key : null;

  const onChangeMode = (m: Mode) => {
    if (m === mode) return;

    if (m === 'wxlab') {
      // ✅ auto-expand something when entering WxLab
      setExpandedKey((k) => k ?? firstRowKey);
    } else {
      // Simple mode = no expanded tile UI
      setExpandedKey(null);
    }

    setMode(m);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isOpen = mode === 'wxlab' && expandedKey === item.key;
    const arrow = windArrowFromDeg(item.wdir);

    const pressure = formatPressureFromHpa(item.pressureHpa);

    // ✅ Right side:
    // - WxLab: precip chance
    // - Simple: pressure (kPa + inHg) to avoid duplicating cloud cover
    const rightLabel = mode === 'wxlab' ? 'Precip chance' : 'Pressure';
    const rightValueText = mode === 'wxlab' ? fmtPct(item.pop) : pressure?.hpaText ?? '—';
    const rightSubText = mode === 'wxlab' ? null : pressure?.inhgText ?? null;

    return (
      <Pressable
        onPress={() => {
          if (mode !== 'wxlab') return; // simple mode = no expand interaction
          setExpandedKey((k) => (k === item.key ? null : item.key));
        }}
        style={{ marginBottom: theme.spacing.sm }}
      >
        <Card style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.left}>
              <Text style={styles.time}>{item.timeLabel}</Text>
              <Text style={styles.subtle}>Temp</Text>
            </View>

            <View style={styles.mid}>
              <Text style={styles.temp}>{chip(item.tF, '°')}</Text>

              {mode === 'wxlab' ? (
                <Text style={styles.meta}>
                  Feels {chip(item.feelsF, '°')} • Dew point {chip(item.dpF, '°')}
                </Text>
              ) : (
                <Text style={styles.meta}>
                  Wind {chip(item.wind)}
                  {item.wind != null ? ' mph' : ''} {arrow}
                  {item.gust != null ? ` • Gust ${item.gust}` : ''}
                </Text>
              )}
            </View>

            <View style={styles.right}>
              <Text style={styles.wind}>
                {arrow} {chip(item.wind)}
                {item.gust != null ? `→${item.gust}` : ''}
              </Text>

              <View style={styles.rightMeta}>
                <Text style={styles.rightVal}>{rightValueText}</Text>
                {rightSubText ? <Text style={styles.rightSub}>{rightSubText}</Text> : null}
                <Text style={styles.rightLabel}>{rightLabel}</Text>
              </View>
            </View>
          </View>

          {/* Bars: keep these; now POP shows 0% when present */}
          <View style={styles.bars}>
            <View style={styles.barItem}>
              <Text style={styles.barLabel}>Humidity</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${barFrac(item.rh) * 100}%` }]} />
              </View>
              <Text style={styles.barVal}>{fmtPct(item.rh)}</Text>
            </View>

            <View style={styles.barItem}>
              <Text style={styles.barLabel}>Cloud cover</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${barFrac(item.cloud) * 100}%` }]} />
              </View>
              <Text style={styles.barVal}>{fmtPct(item.cloud)}</Text>
            </View>

            <View style={styles.barItem}>
              <Text style={styles.barLabel}>Precip chance</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${barFrac(item.pop) * 100}%` }]} />
              </View>
              <Text style={styles.barVal}>{fmtPct(item.pop)}</Text>
            </View>
          </View>

          {mode === 'wxlab' && isOpen ? (
            <View style={styles.wxlab}>
              <View style={styles.wxRow}>
                <Text style={styles.wxKey}>Spread (Temp − Dew)</Text>
                <Text style={styles.wxVal}>{item.spread == null ? '—' : `${item.spread}°F`}</Text>
              </View>

              <View style={styles.wxRow}>
                <Text style={styles.wxKey}>Gust factor</Text>
                <Text style={styles.wxVal}>{item.gustFactor == null ? '—' : `${item.gustFactor}×`}</Text>
              </View>

              <View style={styles.wxRow}>
                <Text style={styles.wxKey}>Fog risk</Text>
                <Text style={styles.wxVal}>{item.fogRisk == null ? '—' : `${item.fogRisk}/100`}</Text>
              </View>

              <View style={styles.wxRow}>
                <Text style={styles.wxKey}>Pressure</Text>
                <Text style={styles.wxVal}>{item.pressureHpa == null ? '—' : `${item.pressureHpa} hPa`}</Text>
              </View>
            </View>
          ) : null}
        </Card>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.hTitle}>Hourly details</Text>
        <ModeToggle mode={mode} onChange={onChangeMode} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(it) => it.key}
        renderItem={renderItem}
        scrollEnabled={false}
        contentContainerStyle={{ paddingBottom: theme.spacing.md }}
      />
    </View>
  );
}

// ---- Typed StyleSheet to prevent ViewStyle/TextStyle union errors ----
type Styles = {
  wrap: ViewStyle;
  headerRow: ViewStyle;
  hTitle: TextStyle;

  modeWrap: ViewStyle;
  modeBtn: ViewStyle;
  modeBtnActive: ViewStyle;
  modeText: TextStyle;
  modeTextActive: TextStyle;

  card: ViewStyle;

  rowTop: ViewStyle;
  left: ViewStyle;
  time: TextStyle;
  subtle: TextStyle;

  mid: ViewStyle;
  temp: TextStyle;
  meta: TextStyle;

  right: ViewStyle;
  wind: TextStyle;
  rightMeta: ViewStyle;
  rightVal: TextStyle;
  rightSub: TextStyle;
  rightLabel: TextStyle;

  bars: ViewStyle;
  barItem: ViewStyle;
  barLabel: TextStyle;
  barTrack: ViewStyle;
  barFill: ViewStyle;
  barVal: TextStyle;

  wxlab: ViewStyle;
  wxRow: ViewStyle;
  wxKey: TextStyle;
  wxVal: TextStyle;
};

const styles = StyleSheet.create<Styles>({
  wrap: { marginTop: theme.spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  hTitle: { ...(typography.title as TextStyle), fontSize: 18 },

  modeWrap: {
    flexDirection: 'row',
    gap: 8 as any,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  modeBtnActive: { backgroundColor: 'rgba(255,255,255,0.10)' },
  modeText: { color: 'rgba(255,255,255,0.70)', fontWeight: '800', fontSize: 12 },
  modeTextActive: { color: 'white' },

  card: {
    padding: theme.spacing.md,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
  },

  rowTop: { flexDirection: 'row', alignItems: 'center' },
  left: { width: 76 },
  time: { color: 'white', fontWeight: '900', fontSize: 13 },
  subtle: { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },

  mid: { flex: 1, paddingHorizontal: 10 },
  temp: { color: 'white', fontWeight: '900', fontSize: 22, letterSpacing: -0.5 },
  meta: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },

  right: { alignItems: 'flex-end', width: 118 },
  wind: { color: 'white', fontWeight: '900', fontSize: 13 },
  rightMeta: { marginTop: 4, alignItems: 'flex-end' },
  rightVal: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '900' },
  rightSub: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '800', marginTop: 1 },
  rightLabel: { color: 'rgba(255,255,255,0.50)', fontSize: 11, fontWeight: '800', marginTop: 1 },

  bars: { marginTop: theme.spacing.sm, gap: 10 as any },
  barItem: { flexDirection: 'row', alignItems: 'center', gap: 10 as any },
  barLabel: {
    width: 110,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.30)' },
  barVal: {
    width: 48,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  wxlab: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8 as any,
  },
  wxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wxKey: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  wxVal: { color: 'white', fontSize: 12, fontWeight: '900' },
});

export default NerdyHourlyTimeline;