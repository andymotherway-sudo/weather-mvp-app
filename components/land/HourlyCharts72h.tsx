// components/land/HourlyCharts72h.tsx
// ✅ Keeps: midnight padding (no device-local Date boundary bugs), Learn modal, Card header
// ✅ Renders: HourlyRangeChart (which owns panels/graphs)
// ✅ Adds: timeZone prop compatibility with updated hourly screen
// ✅ Adds: safer ISO wall-clock parsing for padding
// ❌ Removes: Expand button + expanded state + expanded prop spread

import React, { useMemo } from 'react';
import { Modal, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { ForecastHour } from '../../app/lib/openmeteo/hooks';
import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';
import { HourlyRangeChart } from './HourlyRangeChart';

type UnitSystem = 'us' | 'metric';

type Props = {
  hours: ForecastHour[];
  maxHours?: number; // default 72
  units?: UnitSystem;
  initialPanel?: any;
  timeZone?: string;
  landscapePresentation?: 'inline' | 'modal' | 'content';
  chartHeight?: number;
};

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

        tempF: null,
        dewPointF: null,
        humidityPct: null,
        cloudCoverPct: null,
        precipProbPct: null,
        windMph: null,
        windGustMph: null,
        pressureHpa: null,
        windDirDominantDeg: null as any,
        windDirDeg: null as any,

        ...({ __pad: true } as any),
      } as ForecastHour
    );
  }

  return { padded: [...pad, ...base], padCount };
}

export function HourlyCharts72h({
  hours,
  maxHours = 72,
  units = 'us',
  timeZone,
  landscapePresentation = 'inline',
  chartHeight,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height && width >= 640;
  const landscapeChartHeight = chartHeight ?? Math.max(250, Math.min(height - 118, 360));
  const slice = useMemo(() => {
    const base = hours.slice(0, Math.min(hours.length, maxHours));
    const { padded } = padSliceToMidnight(base);
    return padded;
  }, [hours, maxHours]);

  if (isLandscape && landscapePresentation === 'modal') {
    return (
      <>
        <Card style={[styles.card, styles.landscapePlaceholder]}>
          <Text style={styles.landscapePlaceholderText}>Hourly wxLab graph is open full screen</Text>
        </Card>
        <Modal visible transparent animationType="fade" supportedOrientations={['landscape-left', 'landscape-right']}>
          <SafeAreaView style={styles.landscapeOverlay}>
            <View style={styles.landscapeShell}>
              <View style={styles.landscapeHeader}>
                <Text style={styles.landscapeTitle}>Next 72 hours</Text>
                <Text style={styles.landscapeHint}>Scroll sideways for the full forecast</Text>
              </View>
              <HourlyRangeChart
                hours={slice}
                maxHours={maxHours}
                units={units}
                timeZone={timeZone}
                landscape
                chartHeight={landscapeChartHeight}
              />
            </View>
          </SafeAreaView>
        </Modal>
      </>
    );
  }

  if (isLandscape && landscapePresentation === 'content') {
    return (
      <HourlyRangeChart
        hours={slice}
        maxHours={maxHours}
        units={units}
        timeZone={timeZone}
        landscape
        chartHeight={landscapeChartHeight}
      />
    );
  }

  return (
    <Card style={styles.card}>
      <HourlyRangeChart
        hours={slice}
        maxHours={maxHours}
        units={units}
        timeZone={timeZone}
        landscape={isLandscape}
        chartHeight={isLandscape ? landscapeChartHeight : undefined}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.lg,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingVertical: 0,
    paddingHorizontal: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  landscapePlaceholder: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(11,18,32,0.72)',
  },
  landscapePlaceholderText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  landscapeOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.98)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  landscapeShell: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(18,28,45,0.74)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  landscapeHeader: {
    minHeight: 44,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  landscapeTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
  },
  landscapeHint: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '800',
  },

});

export default HourlyCharts72h;
