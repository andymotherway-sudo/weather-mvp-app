import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type UnitSystem = 'us' | 'metric';

export type AtmosphericCoreValues = {
  precipChancePct?: number | null;  // 0-100
  cloudCoverPct?: number | null;    // 0-100
  dewPointC?: number | null;        // C
  humidityPct?: number | null;      // 0-100
  windSpeedMps?: number | null;     // m/s
  windGustMps?: number | null;      // m/s
};

function clampPct(v?: number | null): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function toF(c: number) {
  return (c * 9) / 5 + 32;
}

function mpsToMph(mps: number) {
  return mps * 2.2369362920544;
}

function mpsToKph(mps: number) {
  return mps * 3.6;
}

function fmtTemp(dewPointC: number, units: UnitSystem) {
  const n = units === 'us' ? toF(dewPointC) : dewPointC;
  return `${Math.round(n)}°`;
}

function fmtSpeed(mps: number, units: UnitSystem) {
  const n = units === 'us' ? mpsToMph(mps) : mpsToKph(mps);
  return `${Math.round(n)}`;
}

function speedUnitLabel(units: UnitSystem) {
  return units === 'us' ? 'mph' : 'km/h';
}

function displayOrDash(v: string | null) {
  return v == null ? '—' : v;
}

type Props = {
  values: AtmosphericCoreValues;
  units?: UnitSystem;
  compact?: boolean;
};

export function AtmosphericCoreRow({ values, units = 'us', compact = false }: Props) {
  const precip = clampPct(values.precipChancePct);
  const clouds = clampPct(values.cloudCoverPct);
  const humid = clampPct(values.humidityPct);

  const dew =
    values.dewPointC == null || Number.isNaN(values.dewPointC)
      ? null
      : fmtTemp(values.dewPointC, units);

  const wind =
    values.windSpeedMps == null || Number.isNaN(values.windSpeedMps)
      ? null
      : fmtSpeed(values.windSpeedMps, units);

  const gust =
    values.windGustMps == null || Number.isNaN(values.windGustMps)
      ? null
      : fmtSpeed(values.windGustMps, units);

  const spdUnit = speedUnitLabel(units);

  return (
    <View style={[styles.grid, compact && styles.gridCompact]}>
      <MetricTile icon="🌧" value={precip == null ? null : `${precip}%`} label="Precip" compact={compact} />
      <MetricTile icon="☁️" value={clouds == null ? null : `${clouds}%`} label="Clouds" compact={compact} />

      {/* Dew point primary, RH secondary (LOCKED) */}
      <StackTile
        icon="💧"
        primary={dew}
        secondary={humid == null ? null : `${humid}%`}
        labelPrimary="Dew"
        labelSecondary="RH"
        compact={compact}
      />

      {/* Wind + Gust always side-by-side (LOCKED) */}
      <WindGustTile wind={wind} gust={gust} unit={spdUnit} compact={compact} />
    </View>
  );
}

function MetricTile({
  icon,
  value,
  label,
  compact,
}: {
  icon: string;
  value: string | null;
  label: string;
  compact: boolean;
}) {
  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      <Text style={[styles.icon, compact && styles.iconCompact]}>{icon}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{displayOrDash(value)}</Text>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
    </View>
  );
}

/**
 * Dew point + humidity tile:
 *  - Primary (dew point) bigger, full opacity
 *  - Secondary (RH) smaller, muted
 */
function StackTile({
  icon,
  primary,
  secondary,
  labelPrimary,
  labelSecondary,
  compact,
}: {
  icon: string;
  primary: string | null;
  secondary: string | null;
  labelPrimary?: string;
  labelSecondary?: string;
  compact: boolean;
}) {
  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      <Text style={[styles.icon, compact && styles.iconCompact]}>{icon}</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{displayOrDash(primary)}</Text>
      <Text style={[styles.subValue, compact && styles.subValueCompact]}>{displayOrDash(secondary)}</Text>
      <Text style={[styles.label, compact && styles.labelCompact]}>
        {labelPrimary}
        {labelSecondary ? ` · ${labelSecondary}` : ''}
      </Text>
    </View>
  );
}

function WindGustTile({
  wind,
  gust,
  unit,
  compact,
}: {
  wind: string | null;
  gust: string | null;
  unit: string;
  compact: boolean;
}) {
  const hasAny = wind != null || gust != null;
  const pair = hasAny ? `${displayOrDash(wind)} → ${displayOrDash(gust)}` : '—';

  return (
    <View style={[styles.tile, compact && styles.tileCompact]}>
      <Text style={[styles.icon, compact && styles.iconCompact]}>🌬️</Text>
      <Text style={[styles.value, compact && styles.valueCompact]}>{pair}</Text>
      <Text style={[styles.label, compact && styles.labelCompact]}>{`Wind → Gust · ${unit}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap', // prevents crushing on narrow screens
  },
  gridCompact: {
    gap: 8,
  },

  tile: {
    flexGrow: 1,
    flexBasis: '22%',        // ~4 tiles per row, wraps if needed
    minWidth: 82,            // keeps readability on small screens
    minHeight: 106,          // stabilizes layout across values
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'flex-start',
  },
  tileCompact: {
    minHeight: 94,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 16,
  },

  icon: {
    fontSize: 18,
    marginBottom: 8,
    opacity: 0.95,
  },
  iconCompact: {
    fontSize: 17,
    marginBottom: 6,
  },

  value: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
    color: 'rgba(255,255,255,0.98)',
  },
  valueCompact: {
    fontSize: 18,
    lineHeight: 22,
  },

  subValue: {
    marginTop: 3,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 18,
    color: 'rgba(255,255,255,0.92)',
    opacity: 0.80,
  },
  subValueCompact: {
    fontSize: 13,
    lineHeight: 16,
    marginTop: 2,
  },

  label: {
    marginTop: 8,
    fontSize: 12,
    color: 'rgba(255,255,255,0.86)',
    opacity: 0.78,
  },
  labelCompact: {
    marginTop: 7,
    fontSize: 11,
    opacity: 0.75,
  },
});
