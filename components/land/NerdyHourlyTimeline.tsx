import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useState } from 'react';
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

type Mode = 'simple' | 'wxlab';

export type HourlyExplainPayload = {
  title: string;
  learnTopicId?: string;
};

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

function extractIsoWallClockParts(value: unknown): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} | null {
  if (typeof value !== 'string') return null;

  const s = value.trim();
  if (!s) return null;

  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
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

function formatHourLabel(t: any, timeZone?: string): string {
  try {
    if (typeof t === 'string') {
      const wall = extractIsoWallClockParts(t);

      if (wall) {
        let h = wall.hour;
        const ap = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        return `${h} ${ap}`;
      }
    }

    const d = t instanceof Date ? t : new Date(String(t));
    if (Number.isNaN(d.getTime())) return String(t ?? '');

    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: true,
      timeZone,
    }).format(d);
  } catch {
    return String(t ?? '');
  }
}

function formatDayLabel(t: any): string {
  const wall = extractIsoWallClockParts(t);
  if (!wall) return '';

  // Use a UTC-noon anchor and format in UTC so naive forecast wall dates do not
  // shift backward a day in negative offsets like America/Phoenix.
  const date = new Date(Date.UTC(wall.year, wall.month - 1, wall.day, 12));
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date).toUpperCase();
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

function formatPressureBucket(hpa: number | null): string {
  if (hpa == null) return '—';
  if (hpa <= 1008) return 'Lower';
  if (hpa >= 1022) return 'Higher';
  return 'Near normal';
}

function formatSpreadBucket(spread: number | null): string {
  if (spread == null) return '—';
  if (spread <= 3) return 'Very moist';
  if (spread <= 8) return 'Moist';
  if (spread <= 15) return 'Moderate';
  return 'Dry';
}

function formatHumidityBucket(rh: number | null): string {
  if (rh == null) return '—';
  if (rh >= 85) return 'Very humid';
  if (rh >= 65) return 'Humid';
  if (rh >= 40) return 'Comfortable';
  return 'Dry';
}

function formatCloudBucket(cloud: number | null): string {
  if (cloud == null) return '—';
  if (cloud <= 15) return 'Mostly clear';
  if (cloud <= 45) return 'Partly cloudy';
  if (cloud <= 75) return 'Mostly cloudy';
  return 'Overcast';
}

function formatGustBucket(gustFactor: number | null): string {
  if (gustFactor == null) return '—';
  if (gustFactor >= 1.8) return 'Very gusty';
  if (gustFactor >= 1.4) return 'Gusty';
  if (gustFactor >= 1.15) return 'Some gusts';
  return 'Steady wind';
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
              {m === 'simple' ? 'Simple' : 'wxLab'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function LearnableWxRow({
  label,
  value,
  topicId,
  onExplain,
}: {
  label: string;
  value: string;
  topicId?: string;
  onExplain?: (payload: HourlyExplainPayload) => void;
}) {
  const canExplain = !!topicId && !!onExplain;

  if (!canExplain) {
    return (
      <View style={styles.wxRow}>
        <Text style={styles.wxKey}>{label}</Text>
        <Text style={styles.wxVal}>{value}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={() =>
        onExplain?.({
          title: label,
          learnTopicId: topicId,
        })
      }
      style={({ pressed }) => [styles.wxRowPressable, pressed ? styles.wxRowPressableActive : null]}
    >
      <View style={styles.wxRow}>
        <View style={styles.wxLeft}>
          <Text style={styles.wxKey}>{label}</Text>
          <Text style={styles.infoBadge}>ⓘ wxLearn</Text>
        </View>
        <Text style={styles.wxVal}>{value}</Text>
      </View>
    </Pressable>
  );
}

export function NerdyHourlyTimeline({
  hours,
  maxHours = 72,
  timeZone,
  onExplain,
  defaultMode = 'simple',
}: {
  hours: any[];
  maxHours?: number;
  timeZone?: string;
  onExplain?: (payload: HourlyExplainPayload) => void;
  defaultMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  const rows = useMemo(() => {
    const sliced = (hours ?? []).slice(0, maxHours);

    return sliced.map((h: any, idx: number) => {
      const time = h.time ?? h.timestamp ?? h.t ?? h.datetime ?? h.dateTime ?? idx;

      const tF = safeNum(h.tempF ?? h.temperatureF ?? h.temperature_2m_f ?? h.temperature_2m);
      const feelsF = safeNum(h.apparentTempF ?? h.apparent_temperature ?? h.apparent_temperature_f);
      const dpF = safeNum(h.dewPointF ?? h.dewpointF ?? h.dew_point_2m ?? h.dew_point_2m_f);

      const rh = asPct(h.humidityPct ?? h.relativeHumidityPct ?? h.relative_humidity_2m);
      const pop = asPct(
        h.precipProbPct ??
          h.precip_probability ??
          h.precipitation_probability ??
          h.precipProbabilityPct
      );
      const cloud = asPct(h.cloudCoverPct ?? h.cloud_cover ?? h.cloudcoverPct);

      const wind = safeNum(h.windMph ?? h.windspeedMph ?? h.windspeed_10m ?? h.wind_speed_10m);
      const gust = safeNum(h.windGustMph ?? h.windgusts_10m ?? h.wind_gusts_10m ?? h.windGustsMph);
      const wdir = safeNum(h.windDirDeg ?? h.winddirection_10m ?? h.wind_direction_10m ?? h.windDir);

      const pressureHpa = safeNum(
        h.pressureHpa ?? h.pressure_msl ?? h.pressureMslHpa ?? h.surface_pressure
      );

      const spread = tF != null && dpF != null ? Math.round((tF - dpF) * 10) / 10 : null;
      const gustFactor =
        wind != null && gust != null && wind > 0 ? Math.round((gust / wind) * 100) / 100 : null;
      const fogRisk = scoreFogRisk(tF, dpF, wind, cloud);

      const key = typeof time === 'string' ? time : String(idx);

      return {
        key,
        dayLabel: formatDayLabel(time),
        timeLabel: formatHourLabel(time, timeZone),
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
  }, [hours, maxHours, timeZone]);

  const firstRowKey = rows.length ? rows[0].key : null;

  useEffect(() => {
    if (!rows.length) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey((current) => {
      const exists = rows.some((r) => r.key === current);
      if (exists) return current;
      return rows[0].key;
    });
  }, [rows]);

  const onChangeMode = (m: Mode) => {
    if (m === mode) return;

    setExpandedKey((current) => current ?? firstRowKey);
    setMode(m);
  };

  const renderItem = ({ item }: { item: any }) => {
    const isOpen = expandedKey === item.key;
    const arrow = windArrowFromDeg(item.wdir);
    const pressure = formatPressureFromHpa(item.pressureHpa);

    return (
      <Pressable
        onPress={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
        style={{ marginBottom: theme.spacing.sm }}
      >
        <View style={styles.card}>
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(120, 180, 255, 0.00)',
              'rgba(120, 180, 255, 0.05)',
              'rgba(120, 180, 255, 0.09)',
              'rgba(120, 180, 255, 0.05)',
              'rgba(120, 180, 255, 0.00)',
            ]}
            locations={[0, 0.14, 0.5, 0.86, 1]}
            style={styles.innerPanelFade}
          />

          <View style={styles.rowTop}>
            <View style={styles.left}>
              <Text style={styles.day}>{item.dayLabel}</Text>
              <Text style={styles.time}>{item.timeLabel}</Text>
            </View>

            <View style={styles.mid}>
              <Text style={styles.temp}>{chip(item.tF, '°')}</Text>

              {mode === 'wxlab' ? (
                <Text style={styles.meta}>
                  Feels {chip(item.feelsF, '°')} • Dew point {chip(item.dpF, '°')}
                </Text>
              ) : (
                <Text style={styles.meta}>
                  {fmtPct(item.pop)} precip • {chip(item.wind)}
                  {item.wind != null ? ' mph wind' : ''}
                </Text>
              )}
            </View>

            <View style={styles.right}>
              <Text style={styles.wind}>
                {arrow} {chip(item.wind)}
                {item.wind != null ? ' mph' : ''}
              </Text>

              <View style={styles.rightMeta}>
                {mode === 'wxlab' ? (
                  <>
                    <Text style={styles.rightVal}>{fmtPct(item.pop)}</Text>
                    <Text style={styles.rightLabel}>Precip chance</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.rightVal}>{pressure?.hpaText ?? '—'}</Text>
                    {pressure?.inhgText ? <Text style={styles.rightSub}>{pressure.inhgText}</Text> : null}
                    <Text style={styles.rightLabel}>Pressure</Text>
                  </>
                )}
              </View>
            </View>
          </View>

          {isOpen ? (
            <>
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

              {mode === 'simple' ? (
                <View style={styles.simpleExpanded}>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Feels like</Text>
                    <Text style={styles.simpleStatValue}>{chip(item.feelsF, '°')}</Text>
                  </View>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Dew point</Text>
                    <Text style={styles.simpleStatValue}>{chip(item.dpF, '°')}</Text>
                  </View>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Humidity</Text>
                    <Text style={styles.simpleStatValue}>{formatHumidityBucket(item.rh)}</Text>
                  </View>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Sky</Text>
                    <Text style={styles.simpleStatValue}>{formatCloudBucket(item.cloud)}</Text>
                  </View>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Wind gusts</Text>
                    <Text style={styles.simpleStatValue}>
                      {item.gust == null ? '—' : `${item.gust} mph`}
                    </Text>
                  </View>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Wind feel</Text>
                    <Text style={styles.simpleStatValue}>{formatGustBucket(item.gustFactor)}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.wxlab}>
                  <LearnableWxRow
                    label="Spread (Temp - Dew)"
                    value={item.spread == null ? '—' : `${item.spread}°F`}
                    topicId="spread_temp_dew"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Humidity regime"
                    value={formatHumidityBucket(item.rh)}
                    topicId="humidity"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Sky regime"
                    value={formatCloudBucket(item.cloud)}
                    topicId="cloud_cover"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Wind gusts"
                    value={item.gust == null ? '—' : `${item.gust} mph`}
                    topicId="wind"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Gust factor"
                    value={item.gustFactor == null ? '—' : `${item.gustFactor}×`}
                    topicId="gust_factor"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Pressure"
                    value={
                      item.pressureHpa == null
                        ? '—'
                        : `${item.pressureHpa} hPa • ${formatPressureBucket(item.pressureHpa)}`
                    }
                    topicId="pressure"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Fog risk"
                    value={item.fogRisk == null ? '—' : `${item.fogRisk}/100`}
                    topicId="fog_risk"
                    onExplain={onExplain}
                  />

                  <LearnableWxRow
                    label="Air dryness"
                    value={formatSpreadBucket(item.spread)}
                    topicId="spread_temp_dew"
                    onExplain={onExplain}
                  />
                </View>
              )}
            </>
          ) : null}
        </View>
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
  innerPanelFade: ViewStyle;

  rowTop: ViewStyle;
  left: ViewStyle;
  day: TextStyle;
  time: TextStyle;

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

  simpleExpanded: ViewStyle;
  simpleStatRow: ViewStyle;
  simpleStatLabel: TextStyle;
  simpleStatValue: TextStyle;

  wxlab: ViewStyle;
  wxRowPressable: ViewStyle;
  wxRowPressableActive: ViewStyle;
  wxRow: ViewStyle;
  wxLeft: ViewStyle;
  wxKey: TextStyle;
  infoBadge: TextStyle;
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
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  modeBtnActive: {
    backgroundColor: 'rgba(72, 201, 176, 0.20)',
    borderWidth: 1,
    borderColor: 'rgba(109, 236, 198, 0.34)',
  },
  modeText: { color: 'rgba(255,255,255,0.70)', fontWeight: '800', fontSize: 12 },
  modeTextActive: { color: '#DDFCF4' },

  card: {
    position: 'relative',
    overflow: 'hidden',
    padding: theme.spacing.md,
    borderRadius: 26,
    backgroundColor: 'rgba(21, 35, 60, 0.68)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  innerPanelFade: {
    position: 'absolute',
    top: 12,
    bottom: 12,
    left: 58,
    right: 58,
    borderRadius: 18,
  },

  rowTop: { flexDirection: 'row', alignItems: 'center' },
  left: { width: 76 },
  day: {
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 2,
  },
  time: { color: 'white', fontWeight: '900', fontSize: 18 },

  mid: { flex: 1, paddingHorizontal: 10 },
  temp: { color: 'white', fontWeight: '900', fontSize: 28, letterSpacing: -0.6 },
  meta: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 2 },

  right: { alignItems: 'flex-end', width: 120 },
  wind: { color: 'white', fontWeight: '900', fontSize: 13 },
  rightMeta: { marginTop: 4, alignItems: 'flex-end' },
  rightVal: { color: 'rgba(255,255,255,0.82)', fontSize: 12, fontWeight: '900' },
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
    backgroundColor: 'rgba(255,255,255,0.055)',
    overflow: 'hidden',
  },
  barFill: { height: 10, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.22)' },
  barVal: {
    width: 48,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.70)',
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },

  simpleExpanded: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    gap: 8 as any,
  },
  simpleStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12 as any,
  },
  simpleStatLabel: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '800',
  },
  simpleStatValue: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },

  wxlab: {
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    gap: 8 as any,
  },
  wxRowPressable: {
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 4,
    marginHorizontal: -4,
  },
  wxRowPressableActive: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  wxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12 as any,
  },
  wxLeft: {
    flex: 1,
    minWidth: 0,
  },
  wxKey: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  infoBadge: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  wxVal: { color: 'white', fontSize: 12, fontWeight: '900' },
});

export default NerdyHourlyTimeline;
