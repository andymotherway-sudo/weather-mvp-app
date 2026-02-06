// components/land/HourlyCharts72h.tsx
// ✅ Simplified: removes Range/Temp/Precip/Wind/Comfort/Sky/Fronts panels + tabs entirely
// ✅ Keeps: midnight padding (no Date(iso) boundaries), Learn modal, Card header
// ✅ Renders: only HourlyRangeChart (the “hourly work we did earlier”)

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ForecastHour } from '../../app/lib/openmeteo/hooks';
import { theme } from '../../styles/theme';
import { LearnMoreModal } from '../common/LearnMoreModal';
import { Card } from '../layout/Card';
import { HourlyRangeChart } from './HourlyRangeChart';

type UnitSystem = 'us' | 'metric';

// Keep props shape compatible with existing callers.
// - initialPanel is ignored now (safe drop-in)
type Props = {
  hours: ForecastHour[];
  maxHours?: number; // default 72
  units?: UnitSystem;
  initialPanel?: any;
};

function dayKeyFromIso(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function parseHourMinute(iso: string): { h: number; m: number } | null {
  if (!iso || iso.length < 16) return null;
  const h = Number(iso.slice(11, 13));
  const m = Number(iso.slice(14, 16));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

function isoAtHour(dayKey: string, hour: number) {
  const hh = `${hour}`.padStart(2, '0');
  return `${dayKey}T${hh}:00`;
}

// Pad so the first displayed day begins at midnight (adds null hours before first data hour)
function padSliceToMidnight(base: ForecastHour[]) {
  if (!base.length) return { padded: base, padCount: 0 };

  const t0 = (base[0] as any).time as string;
  const dk = dayKeyFromIso(t0);
  const hm = parseHourMinute(t0);

  if (!dk || !hm) return { padded: base, padCount: 0 };
  if (hm.h <= 0) return { padded: base, padCount: 0 };

  const padCount = hm.h;
  const pad: ForecastHour[] = [];

  for (let h = 0; h < padCount; h++) {
    pad.push(
      {
        time: isoAtHour(dk, h),

        // Keep the same fields you were padding before, so downstream components
        // don’t crash if they expect them to exist.
        tempF: null,
        dewPointF: null,
        humidityPct: null,
        cloudCoverPct: null,
        precipProbPct: null,
        windMph: null,
        windGustMph: null,

        ...({ __pad: true } as any),
      } as ForecastHour
    );
  }

  return { padded: [...pad, ...base], padCount };
}

export function HourlyCharts72h({ hours, maxHours = 72, units = 'us' }: Props) {
  const [expanded, setExpanded] = useState(false);

  const [learnVisible, setLearnVisible] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

  const openLearn = (topicId?: string) => {
    setLearnTopicId(topicId);
    setLearnVisible(true);
  };

  const slice = useMemo(() => {
    const base = hours.slice(0, Math.min(hours.length, maxHours));
    const { padded } = padSliceToMidnight(base);
    return padded;
  }, [hours, maxHours]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Hourly</Text>
          <Text style={styles.subtitle}>Temp + Dew + RH + POP + Wind/Gust</Text>
        </View>

        <Pressable onPress={() => openLearn('data-availability')} style={styles.learnBtn}>
          <Text style={styles.learnText}>Learn</Text>
        </Pressable>

        {/* Keeping Expand because your UI already expects it.
            If HourlyRangeChart ignores it, that’s fine.
            If you later want it to actually change layout, we can wire it in. */}
        <Pressable onPress={() => setExpanded((v) => !v)} style={styles.expandBtn}>
          <Text style={styles.expandText}>{expanded ? 'Collapse' : 'Expand'}</Text>
        </Pressable>
      </View>

      {/* ✅ Only chart we keep */}
      <HourlyRangeChart hours={slice} maxHours={maxHours} units={units} />

      <LearnMoreModal visible={learnVisible} onClose={() => setLearnVisible(false)} initialTopicId={learnTopicId} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: theme.spacing.lg },

  header: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '900', color: theme.colors.textPrimary },
  subtitle: { marginTop: 2, fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary },

  learnBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  learnText: { fontSize: 12, fontWeight: '900', color: theme.colors.textPrimary },

  expandBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  expandText: { fontSize: 12, fontWeight: '900', color: theme.colors.textPrimary },
});

export default HourlyCharts72h;
