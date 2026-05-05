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
import { PremiumMetricIcon, PremiumWeatherIcon } from '../weather/PremiumWeatherIcon';

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

function formatCompass(deg: number | null): string {
  if (deg == null) return '—';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return `${dirs[idx]} ${Math.round(normalized)}°`;
}

function LearnableWxRow({
  label,
  value,
  helper,
  topicId,
  onExplain,
}: {
  label: string;
  value: string;
  helper?: string;
  topicId?: string;
  onExplain?: (payload: HourlyExplainPayload) => void;
}) {
  const canExplain = !!topicId && !!onExplain;

  if (!canExplain) {
    return (
      <View style={styles.wxRow}>
        <Text style={styles.wxKey}>{label}</Text>
        <View style={styles.wxValWrap}>
          <Text style={styles.wxVal}>{value}</Text>
          {helper ? <Text style={styles.wxSubVal}>{helper}</Text> : null}
        </View>
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
          <Text style={styles.infoBadge}>wxLearn</Text>
        </View>
        <View style={styles.wxValWrap}>
          <Text style={styles.wxVal}>{value}</Text>
          {helper ? <Text style={styles.wxSubVal}>{helper}</Text> : null}
        </View>
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
      const code = safeNum(h.weatherCode ?? h.weather_code ?? h.weathercode ?? h.code);

      return {
        key,
        dayLabel: formatDayLabel(time),
        timeLabel: formatHourLabel(time, timeZone),
        weatherCode: code,
        conditionLabel: (() => {
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
        })(),
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

  useEffect(() => {
    if (!rows.length) {
      setExpandedKey(null);
      return;
    }

    setExpandedKey((current) => {
      if (current && rows.some((row) => row.key === current)) return current;
      return rows[0].key;
    });
  }, [rows]);

  const renderItem = ({ item }: { item: any }) => {
    const isOpen = expandedKey === item.key;
    const arrow = windArrowFromDeg(item.wdir);
    const pressure = formatPressureFromHpa(item.pressureHpa);

    return (
      <Pressable
        onPress={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
        style={styles.itemWrap}
      >
        <View style={styles.card}>
          <View style={styles.rowTop}>
            <View style={styles.left}>
              <Text style={styles.day}>{item.dayLabel}</Text>
              <Text style={styles.time}>{item.timeLabel}</Text>
            </View>

            <View style={styles.iconCol}>
              <PremiumWeatherIcon code={item.weatherCode ?? null} size={30} variant="inline" />
            </View>

            <View style={styles.mid}>
              <Text style={styles.temp}>{chip(item.tF, '°')}</Text>
              <Text style={styles.conditionText}>{item.conditionLabel}</Text>
            </View>

            <View style={styles.centerMeta}>
              <Text style={styles.metaLine}>Feels {chip(item.feelsF, '°')} • Dew {chip(item.dpF, '°')}</Text>
              <Text style={styles.metaLine}>
                Wind {item.wind == null ? '—' : `${item.wind} mph`} • Gust {item.gust == null ? '—' : `${item.gust} mph`}
              </Text>
            </View>

            <View style={styles.right}>
              <Text style={styles.rightVal}>{fmtPct(item.pop)}</Text>
              <Text style={styles.rightLabel}>Precip chance</Text>
              <Text style={styles.chevron}>{isOpen ? '⌃' : '⌄'}</Text>
            </View>
          </View>

          {isOpen ? (
            <>
              <View style={styles.metricStrip}>
                <View style={styles.metricStripItem}>
                  <PremiumMetricIcon kind="dew" size={18} variant="inline" />
                  <Text style={styles.metricStripValue}>{fmtPct(item.rh)}</Text>
                  <Text style={styles.metricStripLabel}>Humidity</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripItem}>
                  <PremiumMetricIcon kind="cloud" size={18} variant="inline" />
                  <Text style={styles.metricStripValue}>{fmtPct(item.cloud)}</Text>
                  <Text style={styles.metricStripLabel}>Cloud cover</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripItem}>
                  <PremiumMetricIcon kind="precip" size={18} variant="inline" />
                  <Text style={styles.metricStripValue}>{fmtPct(item.pop)}</Text>
                  <Text style={styles.metricStripLabel}>Precip chance</Text>
                </View>
                <View style={styles.metricStripDivider} />
                <View style={styles.metricStripItem}>
                  <PremiumMetricIcon kind="wind" size={18} variant="inline" />
                  <Text style={styles.metricStripValue}>{item.wind == null ? '—' : `${item.wind} mph`}</Text>
                  <Text style={styles.metricStripLabel}>Wind</Text>
                  <Text style={styles.metricStripSub}>{item.gust == null ? 'Gust —' : `Gust ${item.gust} mph`}</Text>
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
                    <Text style={styles.simpleStatValue}>{item.gust == null ? '—' : `${item.gust} mph`}</Text>
                  </View>
                  <View style={styles.simpleStatRow}>
                    <Text style={styles.simpleStatLabel}>Wind feel</Text>
                    <Text style={styles.simpleStatValue}>{formatGustBucket(item.gustFactor)}</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.wxlab}>
                  <LearnableWxRow
                    label="Dew point"
                    value={chip(item.dpF, '°')}
                    helper={`RH ${fmtPct(item.rh)}`}
                    topicId="humidity"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Spread (temp - dew)"
                    value={item.spread == null ? '—' : `${item.spread}°F`}
                    helper={formatSpreadBucket(item.spread)}
                    topicId="spread_temp_dew"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Sky regime"
                    value={formatCloudBucket(item.cloud)}
                    helper={`Cloud cover ${fmtPct(item.cloud)}`}
                    topicId="cloud_cover"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Precip chance"
                    value={fmtPct(item.pop)}
                    topicId="precipitation_probability"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Wind"
                    value={item.wind == null ? '—' : `${arrow} ${item.wind} mph`}
                    helper={item.gust == null ? 'Gust —' : `Gust ${item.gust} mph`}
                    topicId="wind"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Wind direction"
                    value={formatCompass(item.wdir)}
                    topicId="wind_direction"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Gust factor"
                    value={item.gustFactor == null ? '—' : `${item.gustFactor}x`}
                    helper={formatGustBucket(item.gustFactor)}
                    topicId="gust_factor"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Pressure"
                    value={item.pressureHpa == null ? '—' : `${item.pressureHpa} hPa`}
                    helper={pressure?.inhgText ?? formatPressureBucket(item.pressureHpa)}
                    topicId="pressure"
                    onExplain={onExplain}
                  />
                  <LearnableWxRow
                    label="Fog risk"
                    value={item.fogRisk == null ? '—' : `${item.fogRisk}/100`}
                    helper={formatPressureBucket(item.pressureHpa)}
                    topicId="fog_risk"
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
        <View>
          <Text style={styles.hTitle}>Hourly details</Text>
          <Text style={styles.hSub}>
            {mode === 'wxlab' ? 'wxLab readout with explainable signals' : 'Simple readout with premium summaries'}
          </Text>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

type Styles = {
  wrap: ViewStyle;
  headerRow: ViewStyle;
  hTitle: TextStyle;
  hSub: TextStyle;
  listContent: ViewStyle;
  itemWrap: ViewStyle;
  card: ViewStyle;
  rowTop: ViewStyle;
  left: ViewStyle;
  day: TextStyle;
  time: TextStyle;
  iconCol: ViewStyle;
  mid: ViewStyle;
  temp: TextStyle;
  conditionText: TextStyle;
  centerMeta: ViewStyle;
  metaLine: TextStyle;
  right: ViewStyle;
  rightVal: TextStyle;
  rightLabel: TextStyle;
  chevron: TextStyle;
  metricStrip: ViewStyle;
  metricStripItem: ViewStyle;
  metricStripDivider: ViewStyle;
  metricStripValue: TextStyle;
  metricStripLabel: TextStyle;
  metricStripSub: TextStyle;
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
  wxValWrap: ViewStyle;
  wxVal: TextStyle;
  wxSubVal: TextStyle;
};

const styles = StyleSheet.create<Styles>({
  wrap: { marginTop: theme.spacing.lg, gap: theme.spacing.sm },
  headerRow: {
    marginBottom: theme.spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(44, 70, 102, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hTitle: { ...(typography.title as TextStyle), fontSize: 18, color: '#F7FBFF' },
  hSub: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: { paddingBottom: theme.spacing.md },
  itemWrap: { marginBottom: theme.spacing.sm },
  card: {
    overflow: 'hidden',
    padding: theme.spacing.md,
    borderRadius: 26,
    backgroundColor: 'rgba(44, 70, 102, 0.76)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center' },
  left: { width: 74 },
  day: {
    color: 'rgba(255,255,255,0.62)',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 2,
  },
  time: { color: 'white', fontWeight: '900', fontSize: 18 },
  iconCol: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mid: { width: 92, paddingLeft: 4, paddingRight: 8 },
  temp: { color: 'white', fontWeight: '900', fontSize: 28, letterSpacing: -0.6 },
  conditionText: { marginTop: 3, color: 'white', fontSize: 13, fontWeight: '800' },
  centerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingRight: 8,
  },
  metaLine: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  right: { width: 74, alignItems: 'flex-end' },
  rightVal: { color: 'rgba(255,255,255,0.96)', fontSize: 16, fontWeight: '900' },
  rightLabel: { color: 'rgba(255,255,255,0.56)', fontSize: 11, fontWeight: '800', marginTop: 2, textAlign: 'right' },
  chevron: { marginTop: 6, color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '900' },
  metricStrip: {
    marginTop: theme.spacing.md,
    paddingTop: 14,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  metricStripItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 3,
  },
  metricStripDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  metricStripValue: {
    color: 'white',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  metricStripLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  metricStripSub: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  simpleExpanded: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 8,
  },
  simpleStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 6,
  },
  wxRowPressable: {
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  wxRowPressableActive: {
    backgroundColor: 'rgba(44, 70, 102, 0.76)',
  },
  wxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  wxLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wxKey: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800' },
  infoBadge: {
    color: 'rgba(255,255,255,0.44)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  wxValWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  wxVal: { color: 'white', fontSize: 12, fontWeight: '900', textAlign: 'right' },
  wxSubVal: { color: 'rgba(255,255,255,0.60)', fontSize: 11, fontWeight: '700', textAlign: 'right' },
});

export default NerdyHourlyTimeline;
