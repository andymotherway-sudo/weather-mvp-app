import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import type { ForecastHour } from '../../app/lib/openmeteo/hooks';
import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

type Metric = 'temp' | 'dew' | 'precip' | 'cloud' | 'wind' | 'gust';

const METRICS: { key: Metric; label: string; unit?: string }[] = [
  { key: 'temp', label: 'Temp', unit: '°' },
  { key: 'dew', label: 'Dew', unit: '°' },
  { key: 'precip', label: 'Precip %', unit: '%' },
  { key: 'cloud', label: 'Clouds', unit: '%' },
  { key: 'wind', label: 'Wind', unit: 'mph' },
  { key: 'gust', label: 'Gust', unit: 'mph' },
];

function pick(m: Metric, h: ForecastHour): number | null {
  switch (m) {
    case 'temp':
      return h.tempF;
    case 'dew':
      return h.dewPointF;
    case 'precip':
      return h.precipProbPct;
    case 'cloud':
      return h.cloudCoverPct;
    case 'wind':
      return h.windMph;
    case 'gust':
      return h.windGustMph;
  }
}

function fmtVal(metric: Metric, v: number | null) {
  if (v == null) return '—';
  if (metric === 'precip' || metric === 'cloud') return `${Math.round(v)}%`;
  return `${Math.round(v)}`;
}

function hourLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric' });
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function buildPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';
  const [p0, ...rest] = points;
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} ` + rest.map(p => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

type Props = {
  hours: ForecastHour[];
  maxHours?: number;
  title?: string;
};

export function HourlyGraphStrip({ hours, maxHours = 48, title = 'Hourly' }: Props) {
  const [metric, setMetric] = useState<Metric>('temp');
  const [expanded, setExpanded] = useState(false);

  const slice = useMemo(
    () => hours.slice(0, Math.min(hours.length, maxHours)),
    [hours, maxHours]
  );

  const series = useMemo(() => {
    const vals = slice.map(h => pick(metric, h));
    const nums = vals.filter((v): v is number => v != null);
    const min = nums.length ? Math.min(...nums) : 0;
    const max = nums.length ? Math.max(...nums) : 1;

    // For % metrics, lock to 0..100 so the graph “feels” consistent
    if (metric === 'precip' || metric === 'cloud') return { vals, min: 0, max: 100 };

    // If flat, pad a bit so the line isn't invisible
    if (max - min < 0.001) return { vals, min: min - 1, max: max + 1 };

    return { vals, min, max };
  }, [slice, metric]);

  return (
    <>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.headerRight}>
            <Pressable onPress={() => setExpanded(true)} style={styles.expandBtn}>
              <Text style={styles.expandText}>Expand</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.chips}>
          {METRICS.map(m => (
            <Chip
              key={m.key}
              label={m.label}
              active={metric === m.key}
              onPress={() => setMetric(m.key)}
            />
          ))}
        </View>

        <MiniGraph hours={slice} metric={metric} min={series.min} max={series.max} />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hourTilesRow}
        >
          {slice.map((h) => {
            const v = pick(metric, h);
            return (
              <View key={`${metric}:${h.time}`} style={styles.hourTile}>
                <Text style={styles.hourTime}>{hourLabel(h.time)}</Text>
                <Text style={styles.hourValue}>{fmtVal(metric, v)}</Text>

                {/* small secondary line (always useful) */}
                <Text style={styles.hourSub}>
                  {metric !== 'precip' ? `Precip ${fmtVal('precip', h.precipProbPct)}` : `Cloud ${fmtVal('cloud', h.cloudCoverPct)}`}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        <Text style={styles.foot}>
          {metric === 'dew'
            ? 'Dew point tracks comfort & “stickiness.”'
            : metric === 'gust'
              ? 'Gusts drive impact more than steady wind.'
              : metric === 'precip'
                ? '“Precip %” is the chance precipitation occurs during the hour.'
                : ''}
        </Text>
      </Card>

      <ExpandedHourlyModal
        open={expanded}
        onClose={() => setExpanded(false)}
        hours={slice}
        metric={metric}
        onMetric={setMetric}
      />
    </>
  );
}

function MiniGraph({
  hours,
  metric,
  min,
  max,
}: {
  hours: ForecastHour[];
  metric: Metric;
  min: number;
  max: number;
}) {
  const colW = 44;              // matches the tile rhythm
  const padX = 10;
  const H = 120;
  const padY = 16;

  const W = Math.max(280, padX * 2 + colW * hours.length);

  const points = useMemo(() => {
    return hours.map((h, i) => {
      const v = pick(metric, h);
      const x = padX + i * colW + colW / 2;
      if (v == null) return { x, y: null as number | null, v: null as number | null };

      const t = (v - min) / (max - min);
      const y = padY + (1 - clamp01(t)) * (H - padY * 2);
      return { x, y, v };
    });
  }, [hours, metric, min, max]);

  const linePts = points.filter(p => p.y != null) as { x: number; y: number; v: number | null }[];
  const d = buildPath(linePts.map(p => ({ x: p.x, y: p.y })));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 6 }}>
      <View style={{ width: W }}>
        <Svg width={W} height={H}>
          {/* grid */}
          {[0.25, 0.5, 0.75].map((t, idx) => {
            const y = padY + t * (H - padY * 2);
            return (
              <Line
                key={idx}
                x1={0}
                y1={y}
                x2={W}
                y2={y}
                stroke="rgba(255,255,255,0.10)"
                strokeWidth={1}
              />
            );
          })}

          {/* path */}
          {d ? (
            <Path d={d} stroke="rgba(255,255,255,0.85)" strokeWidth={2.5} fill="none" />
          ) : null}

          {/* dots */}
          {linePts.map((p, idx) => (
            <Circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="rgba(255,255,255,0.95)"
            />
          ))}
        </Svg>
      </View>
    </ScrollView>
  );
}

function ExpandedHourlyModal({
  open,
  onClose,
  hours,
  metric,
  onMetric,
}: {
  open: boolean;
  onClose: () => void;
  hours: ForecastHour[];
  metric: Metric;
  onMetric: (m: Metric) => void;
}) {
  const { min, max } = useMemo(() => {
    const vals = hours.map(h => pick(metric, h)).filter((v): v is number => v != null);
    if (!vals.length) return { min: 0, max: 1 };
    if (metric === 'precip' || metric === 'cloud') return { min: 0, max: 100 };
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    if (mx - mn < 0.001) return { min: mn - 1, max: mx + 1 };
    return { min: mn, max: mx };
  }, [hours, metric]);

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalWrap}>
        <View style={styles.modalHeader}>
          <Pressable onPress={onClose} style={styles.modalClose}>
            <Text style={styles.modalCloseText}>Back</Text>
          </Pressable>

          <Text style={styles.modalTitle}>Hourly Trends</Text>

          <View style={{ width: 56 }} />
        </View>

        <View style={styles.modalChips}>
          {METRICS.map(m => (
            <Chip
              key={`modal:${m.key}`}
              label={m.label}
              active={metric === m.key}
              onPress={() => onMetric(m.key)}
            />
          ))}
        </View>

        <Card style={styles.modalCard}>
          <Text style={styles.modalSub}>
            {metric === 'precip' ? 'Precip chance per hour' : `${METRICS.find(x => x.key === metric)?.label ?? ''} over time`}
            {'  '}
            <Text style={{ opacity: 0.65 }}>
              ({Math.round(min)}–{Math.round(max)}
              {metric === 'precip' || metric === 'cloud' ? '%' : ''})
            </Text>
          </Text>

          <View style={{ marginTop: 10 }}>
            <BigGraph hours={hours} metric={metric} min={min} max={max} />
          </View>
        </Card>

        <ScrollView contentContainerStyle={styles.modalList}>
          {hours.map((h) => (
            <View key={`row:${h.time}`} style={styles.row}>
              <Text style={styles.rowTime}>{new Date(h.time).toLocaleString(undefined, { weekday: 'short', hour: 'numeric' })}</Text>
              <Text style={styles.rowVal}>{fmtVal(metric, pick(metric, h))}</Text>
              <Text style={styles.rowMeta}>
                Dew {fmtVal('dew', h.dewPointF)} · RH {fmtVal('cloud', h.humidityPct)} · Precip {fmtVal('precip', h.precipProbPct)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function BigGraph({
  hours,
  metric,
  min,
  max,
}: {
  hours: ForecastHour[];
  metric: Metric;
  min: number;
  max: number;
}) {
  const colW = 46;
  const padX = 14;
  const H = 220;
  const padY = 24;
  const W = Math.max(320, padX * 2 + colW * hours.length);

  const points = useMemo(() => {
    return hours.map((h, i) => {
      const v = pick(metric, h);
      const x = padX + i * colW + colW / 2;
      if (v == null) return { x, y: null as number | null, v: null as number | null };
      const t = (v - min) / (max - min);
      const y = padY + (1 - clamp01(t)) * (H - padY * 2);
      return { x, y, v };
    });
  }, [hours, metric, min, max]);

  const linePts = points.filter(p => p.y != null) as { x: number; y: number; v: number | null }[];
  const d = buildPath(linePts.map(p => ({ x: p.x, y: p.y })));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ width: W }}>
        <Svg width={W} height={H}>
          {/* grid + baseline labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((t, idx) => {
            const y = padY + t * (H - padY * 2);
            return (
              <Line
                key={idx}
                x1={0}
                y1={y}
                x2={W}
                y2={y}
                stroke={idx === 2 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.10)'}
                strokeWidth={1}
              />
            );
          })}

          {d ? (
            <Path d={d} stroke="rgba(255,255,255,0.92)" strokeWidth={3} fill="none" />
          ) : null}

          {linePts.map((p, idx) => (
            <Circle key={idx} cx={p.x} cy={p.y} r={4} fill="rgba(255,255,255,0.98)" />
          ))}
        </Svg>

        <View style={styles.bigGraphLabels}>
          {hours.map((h) => (
            <View key={`lbl:${h.time}`} style={[styles.bigGraphLabel, { width: colW }]}>
              <Text style={styles.bigGraphTime}>{hourLabel(h.time)}</Text>
              <Text style={styles.bigGraphVal}>{fmtVal(metric, pick(metric, h))}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '900', color: theme.colors.textPrimary },
  headerRight: { flexDirection: 'row', gap: 10, alignItems: 'center' },

  expandBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  expandText: { fontSize: 12, fontWeight: '800', color: theme.colors.textPrimary },

  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 10 },

  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.24)' },
  chipText: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.textPrimary },

  hourTilesRow: { gap: 10, paddingTop: 4, paddingBottom: 2 },
  hourTile: {
    width: 86,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  hourTime: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.90)' },
  hourValue: { marginTop: 6, fontSize: 20, fontWeight: '900', color: 'rgba(255,255,255,0.98)' },
  hourSub: { marginTop: 6, fontSize: 11, opacity: 0.75, color: theme.colors.textSecondary },

  foot: { marginTop: 10, fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary },

  // Modal
  modalWrap: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.lg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  modalClose: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalCloseText: { fontSize: 12, fontWeight: '900', color: theme.colors.textPrimary },
  modalTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary },

  modalChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: theme.spacing.md },

  modalCard: { marginBottom: theme.spacing.lg },
  modalSub: { fontSize: 12, fontWeight: '800', color: theme.colors.textSecondary },

  modalList: { paddingBottom: theme.spacing['2xl'] },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowTime: { fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.92)' },
  rowVal: { marginTop: 4, fontSize: 16, fontWeight: '900', color: theme.colors.textPrimary },
  rowMeta: { marginTop: 4, fontSize: 11, opacity: 0.72, color: theme.colors.textSecondary },

  bigGraphLabels: { flexDirection: 'row', marginTop: 6 },
  bigGraphLabel: { alignItems: 'center' },
  bigGraphTime: { fontSize: 10, opacity: 0.7, color: theme.colors.textSecondary },
  bigGraphVal: { marginTop: 2, fontSize: 12, fontWeight: '900', color: theme.colors.textPrimary },
});
