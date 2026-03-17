import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { LocationAstroForecast } from '../../app/lib/astro/locationAstro';
import { toLocalLabel } from '../../app/lib/astro/locationAstro';

type Props = {
  forecast: LocationAstroForecast;
};

function InfoBox({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value?: string | null;
  tone?: 'default' | 'accent';
}) {
  return (
    <View style={[styles.infoBox, tone === 'accent' && styles.infoBoxAccent]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value || '—'}</Text>
    </View>
  );
}

function moonGlyph(label?: string | null) {
  switch (label) {
    case 'New Moon':
      return '🌑';
    case 'Waxing Crescent':
      return '🌒';
    case 'First Quarter':
      return '🌓';
    case 'Waxing Gibbous':
      return '🌔';
    case 'Full Moon':
      return '🌕';
    case 'Waning Gibbous':
      return '🌖';
    case 'Last Quarter':
      return '🌗';
    case 'Waning Crescent':
      return '🌘';
    default:
      return '🌙';
  }
}

function parseIso(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameMinute(a?: string | null, b?: string | null) {
  const da = parseIso(a);
  const db = parseIso(b);
  if (!da || !db) return false;

  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate() &&
    da.getHours() === db.getHours() &&
    da.getMinutes() === db.getMinutes()
  );
}

function formatWindow(start?: string | null, end?: string | null) {
  if (!start) return '—';
  if (!end || sameMinute(start, end)) return toLocalLabel(start);
  return `${toLocalLabel(start)}–${toLocalLabel(end)}`;
}

function safeMoonPhaseLabel(forecast: LocationAstroForecast) {
  const raw = forecast.moonPhaseLabel?.trim();
  if (!raw || raw === '—') return 'Moon data pending';
  return raw;
}

function safeMoonIlluminationText(forecast: LocationAstroForecast) {
  if (typeof forecast.moonIlluminationPct === 'number') {
    return `${Math.round(forecast.moonIlluminationPct)}% illuminated`;
  }
  return 'Illumination pending';
}

function formatBortle(forecast: LocationAstroForecast) {
  const cls = forecast.site?.bortleClass;
  const label = forecast.site?.bortleLabel;

  if (cls == null && !label) return 'Pending';
  if (cls != null && label) return `Bortle ${cls} • ${label}`;
  if (cls != null) return `Bortle ${cls}`;
  return label ?? 'Pending';
}

function formatSkyBrightness(forecast: LocationAstroForecast) {
  const value = forecast.site?.skyBrightness;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Pending';
  return `${value.toFixed(2)} mcd/m²`;
}

function formatElevation(forecast: LocationAstroForecast) {
  const value = forecast.site?.elevationM;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Pending';
  const ft = Math.round(value * 3.28084);
  return `${Math.round(value).toLocaleString()} m • ${ft.toLocaleString()} ft`;
}

function formatAerosols(forecast: LocationAstroForecast) {
  const idx = forecast.aerosols?.index;
  const label = forecast.aerosols?.label;

  if (typeof idx === 'number' && Number.isFinite(idx) && label) {
    return `${label} • ${idx.toFixed(2)}`;
  }
  if (typeof idx === 'number' && Number.isFinite(idx)) {
    return idx.toFixed(2);
  }
  if (label) return label;
  return 'Pending';
}

function getCurrentLightState(forecast: LocationAstroForecast) {
  const now = Date.now();

  const sunset = parseIso(forecast.sunset)?.getTime() ?? NaN;
  const civilDusk = parseIso(forecast.civilDusk)?.getTime() ?? NaN;
  const nauticalDusk = parseIso(forecast.nauticalDusk)?.getTime() ?? NaN;
  const astroDusk = parseIso(forecast.astronomicalDusk)?.getTime() ?? NaN;

  const astroDawn = parseIso(forecast.astronomicalDawn)?.getTime() ?? NaN;
  const nauticalDawn = parseIso(forecast.nauticalDawn)?.getTime() ?? NaN;
  const civilDawn = parseIso(forecast.civilDawn)?.getTime() ?? NaN;
  const sunrise = parseIso(forecast.sunrise)?.getTime() ?? NaN;

  const hasEvening =
    Number.isFinite(sunset) &&
    Number.isFinite(civilDusk) &&
    Number.isFinite(nauticalDusk) &&
    Number.isFinite(astroDusk);

  const hasMorning =
    Number.isFinite(astroDawn) &&
    Number.isFinite(nauticalDawn) &&
    Number.isFinite(civilDawn) &&
    Number.isFinite(sunrise);

  if (hasEvening && now >= sunset && now < civilDusk) {
    return { icon: '🌇', label: 'Civil twilight' };
  }
  if (hasEvening && now >= civilDusk && now < nauticalDusk) {
    return { icon: '🌆', label: 'Nautical twilight' };
  }
  if (hasEvening && now >= nauticalDusk && now < astroDusk) {
    return { icon: '🌌', label: 'Astronomical twilight' };
  }

  // astronomicalDusk should be tonight and astronomicalDawn should be tomorrow morning.
  // Treat them as full timestamps, not time-of-day values.
  if (Number.isFinite(astroDusk) && Number.isFinite(astroDawn)) {
    const inTrueDark = now > astroDusk && now < astroDawn;
    if (inTrueDark) {
      return { icon: '✨', label: 'True dark now' };
    }
  }

  if (hasMorning && now >= astroDawn && now < nauticalDawn) {
    return { icon: '🌌', label: 'Astronomical dawn' };
  }
  if (hasMorning && now >= nauticalDawn && now < civilDawn) {
    return { icon: '🌅', label: 'Nautical dawn' };
  }
  if (hasMorning && now >= civilDawn && now < sunrise) {
    return { icon: '🌄', label: 'Civil dawn' };
  }

  return { icon: '☀️', label: 'Sun up' };
}

export function MoonDarknessCard({ forecast }: Props) {
  const lightState = useMemo(() => getCurrentLightState(forecast), [forecast]);
  const phaseLabel = safeMoonPhaseLabel(forecast);
  const moonIcon = moonGlyph(phaseLabel);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Moon & Darkness</Text>
        <View style={styles.statePill}>
          <Text style={styles.stateIcon}>{lightState.icon}</Text>
          <Text style={styles.stateText}>{lightState.label}</Text>
        </View>
      </View>

      <View style={styles.grid2}>
        <View style={styles.col}>
          <Text style={styles.metaLabel}>SUNSET</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.sunset)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>CIVIL DUSK</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.civilDusk)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>NAUTICAL DUSK</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.nauticalDusk)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>ASTRO DUSK</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.astronomicalDusk)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>MOONRISE</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.moonrise)}</Text>
        </View>

        <View style={styles.col}>
          <Text style={styles.metaLabel}>MOONSET</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.moonset)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>ASTRO DAWN</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.astronomicalDawn)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>NAUTICAL DAWN</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.nauticalDawn)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>CIVIL DAWN</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.civilDawn)}</Text>

          <Text style={[styles.metaLabel, styles.metaSpacing]}>SUNRISE</Text>
          <Text style={styles.metaValue}>{toLocalLabel(forecast.sunrise)}</Text>
        </View>
      </View>

      <View style={styles.phaseBox}>
        <Text style={styles.infoLabel}>MOON PHASE</Text>
        <View style={styles.phaseRow}>
          <Text style={styles.phaseIcon}>{moonIcon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.phaseTitle}>{phaseLabel}</Text>
            <Text style={styles.phaseSub}>{safeMoonIlluminationText(forecast)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.miniGrid}>
        <InfoBox label="BORTLE" value={formatBortle(forecast)} tone="accent" />
        <InfoBox label="SKY BRIGHTNESS" value={formatSkyBrightness(forecast)} />
      </View>

      <View style={styles.miniGrid}>
        <InfoBox label="ELEVATION" value={formatElevation(forecast)} />
        <InfoBox label="AEROSOLS" value={formatAerosols(forecast)} />
      </View>

      <InfoBox
        label="NIGHT WINDOW"
        value={formatWindow(forecast.nightStartTime, forecast.nightEndTime)}
      />

      <InfoBox
        label="TRUE DARK"
        value={formatWindow(forecast.trueDarkStartTime, forecast.trueDarkEndTime)}
      />

      <InfoBox
        label="DARKEST WINDOW"
        value={formatWindow(forecast.darkestStartTime, forecast.darkestEndTime)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 16,
  },

  title: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
  },

  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  stateIcon: {
    fontSize: 14,
  },

  stateText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },

  grid2: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 16,
  },

  col: {
    flex: 1,
  },

  metaLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  metaValue: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },

  metaSpacing: {
    marginTop: 14,
  },

  phaseBox: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 12,
  },

  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },

  phaseIcon: {
    fontSize: 34,
  },

  phaseTitle: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
  },

  phaseSub: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 2,
  },

  miniGrid: {
    flexDirection: 'row',
    gap: 12,
  },

  infoBox: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 12,
  },

  infoBoxAccent: {
    borderColor: 'rgba(147,197,253,0.22)',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },

  infoLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  infoValue: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
  },
});