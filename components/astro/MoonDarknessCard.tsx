import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocationAstroForecast } from '../../app/lib/astro/locationAstro';
import { toLocalLabel } from '../../app/lib/astro/locationAstro';
import { PremiumMoonIcon } from '../weather/PremiumWeatherIcon';

type Props = {
  forecast: LocationAstroForecast;
  onLearnTopic?: (topicId?: string) => void;
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
      <Text style={styles.infoValue}>{value || '--'}</Text>
    </View>
  );
}

function astroLearnTopicId(kind: string) {
  switch (kind) {
    case 'sunrise':
    case 'sunset':
      return 'astro-sunrise-sunset';
    case 'moonrise':
    case 'moonset':
      return 'astro-moonrise-moonset';
    case 'civil':
      return 'astro-civil-twilight';
    case 'nautical':
      return 'astro-nautical-twilight';
    case 'astronomical':
      return 'astro-astronomical-twilight';
    case 'night':
      return 'astro-night-window';
    case 'true-dark':
      return 'astro-true-dark';
    case 'darkest':
      return 'astro-darkest-window';
    case 'baseline-brightness':
      return 'astro-baseline-brightness';
    case 'estimated-brightness':
      return 'astro-estimated-brightness';
    case 'aerosols':
      return 'astro-aerosols';
    default:
      return 'astro-astronomical-twilight';
  }
}

function EventTile({
  label,
  value,
  topicId,
  onLearnTopic,
}: {
  label: string;
  value?: string | null;
  topicId: string;
  onLearnTopic?: (topicId?: string) => void;
}) {
  const body = (
    <View style={styles.eventTile}>
      <Text style={styles.eventLabel}>{label}</Text>
      <Text style={styles.eventValue}>{value || '--'}</Text>
    </View>
  );

  if (!onLearnTopic) return <View style={styles.eventTilePressable}>{body}</View>;

  return (
    <Pressable onPress={() => onLearnTopic(topicId)} style={styles.eventTilePressable}>
      {body}
    </Pressable>
  );
}

function parseIso(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseWallClockParts(value?: string | null) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function wallClockToSortableMs(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function getNowSortableMs(timezone?: string) {
  if (timezone) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
    return wallClockToSortableMs({
      year: pick('year'),
      month: pick('month'),
      day: pick('day'),
      hour: pick('hour'),
      minute: pick('minute'),
    });
  }
  const now = new Date();
  return wallClockToSortableMs({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  });
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
  if (!start) return '--';
  if (!end || sameMinute(start, end)) return toLocalLabel(start);
  return `${toLocalLabel(start)}-${toLocalLabel(end)}`;
}

function formatDuration(start?: string | null, end?: string | null) {
  const a = parseIso(start)?.getTime();
  const b = parseIso(end)?.getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b! <= a!) return '--';

  const totalMinutes = Math.round((b! - a!) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function safeMoonPhaseLabel(forecast: LocationAstroForecast) {
  const raw = forecast.moonPhaseLabel?.trim();
  if (!raw || raw === '--' || raw === '—') return 'Moon data pending';
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
  if (cls != null && label) return `Bortle ${cls} | ${label}`;
  if (cls != null) return `Bortle ${cls}`;
  return label ?? 'Pending';
}

function formatSkyBrightness(forecast: LocationAstroForecast) {
  const value = forecast.site?.skyBrightness;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Pending';
  return `${value.toFixed(2)} mcd/m2`;
}

function moonIsUpNow(forecast: LocationAstroForecast, nowMs: number) {
  const rise = parseWallClockParts(forecast.moonrise);
  const set = parseWallClockParts(forecast.moonset);
  if (!rise && !set) return false;

  const riseMs = rise ? wallClockToSortableMs(rise) : NaN;
  const setMs = set ? wallClockToSortableMs(set) : NaN;

  if (Number.isFinite(riseMs) && Number.isFinite(setMs)) {
    return riseMs <= setMs ? nowMs >= riseMs && nowMs < setMs : nowMs >= riseMs || nowMs < setMs;
  }

  if (Number.isFinite(riseMs)) return nowMs >= riseMs;
  if (Number.isFinite(setMs)) return nowMs < setMs;
  return false;
}

function formatEstimatedSkyBrightness(forecast: LocationAstroForecast, nowMs: number, lightStateLabel: string) {
  const baseline = forecast.site?.skyBrightness;
  if (typeof baseline !== 'number' || !Number.isFinite(baseline)) return 'Pending';

  if (lightStateLabel === 'Sun up') return 'Daylight';
  if (lightStateLabel.includes('Civil')) return 'Civil twilight';
  if (lightStateLabel.includes('Nautical')) return `${(baseline * 6).toFixed(2)} mcd/m2`;
  if (lightStateLabel.includes('Astronomical')) return `${(baseline * 2.2).toFixed(2)} mcd/m2`;

  const illum01 =
    typeof forecast.moonIlluminationPct === 'number' && Number.isFinite(forecast.moonIlluminationPct)
      ? Math.max(0, Math.min(1, forecast.moonIlluminationPct / 100))
      : 0;
  const moonFactor = moonIsUpNow(forecast, nowMs) ? 1 + illum01 * 5 : 1;

  return `${(baseline * moonFactor).toFixed(2)} mcd/m2`;
}

function formatElevation(forecast: LocationAstroForecast) {
  const value = forecast.site?.elevationM;
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'Pending';
  const ft = Math.round(value * 3.28084);
  return `${Math.round(value).toLocaleString()} m | ${ft.toLocaleString()} ft`;
}

function formatAerosols(forecast: LocationAstroForecast) {
  const idx = forecast.aerosols?.index;
  const label = forecast.aerosols?.label;

  if (typeof idx === 'number' && Number.isFinite(idx) && label) {
    return `${label} | ${idx.toFixed(2)}`;
  }
  if (typeof idx === 'number' && Number.isFinite(idx)) return idx.toFixed(2);
  if (label) return label;
  return 'Pending';
}

function formatSiteSource(forecast: LocationAstroForecast) {
  const source = forecast.diagnostics?.siteSource ?? '';
  if (source.includes('wa2016')) return 'World Atlas 2016';
  return source || 'World Atlas derived';
}

function getCurrentLightState(forecast: LocationAstroForecast, nowMs: number) {
  const now = nowMs;

  const sunset = parseWallClockParts(forecast.sunset);
  const civilDusk = parseWallClockParts(forecast.civilDusk);
  const nauticalDusk = parseWallClockParts(forecast.nauticalDusk);
  const astroDusk = parseWallClockParts(forecast.astronomicalDusk);
  const astroDawn = parseWallClockParts(forecast.astronomicalDawn);
  const nauticalDawn = parseWallClockParts(forecast.nauticalDawn);
  const civilDawn = parseWallClockParts(forecast.civilDawn);
  const sunrise = parseWallClockParts(forecast.sunrise);

  const sunsetMs = sunset ? wallClockToSortableMs(sunset) : NaN;
  const civilDuskMs = civilDusk ? wallClockToSortableMs(civilDusk) : NaN;
  const nauticalDuskMs = nauticalDusk ? wallClockToSortableMs(nauticalDusk) : NaN;
  const astroDuskMs = astroDusk ? wallClockToSortableMs(astroDusk) : NaN;
  const astroDawnMs = astroDawn ? wallClockToSortableMs(astroDawn) : NaN;
  const nauticalDawnMs = nauticalDawn ? wallClockToSortableMs(nauticalDawn) : NaN;
  const civilDawnMs = civilDawn ? wallClockToSortableMs(civilDawn) : NaN;
  const sunriseMs = sunrise ? wallClockToSortableMs(sunrise) : NaN;

  if (Number.isFinite(sunsetMs) && Number.isFinite(civilDuskMs) && now >= sunsetMs && now < civilDuskMs) {
    return { icon: 'D', label: 'Civil twilight' };
  }
  if (Number.isFinite(civilDuskMs) && Number.isFinite(nauticalDuskMs) && now >= civilDuskMs && now < nauticalDuskMs) {
    return { icon: 'N', label: 'Nautical twilight' };
  }
  if (Number.isFinite(nauticalDuskMs) && Number.isFinite(astroDuskMs) && now >= nauticalDuskMs && now < astroDuskMs) {
    return { icon: 'A', label: 'Astronomical twilight' };
  }
  if (Number.isFinite(astroDuskMs) && Number.isFinite(astroDawnMs) && now >= astroDuskMs && now < astroDawnMs) {
    return { icon: '*', label: 'True dark now' };
  }
  if (Number.isFinite(astroDawnMs) && Number.isFinite(nauticalDawnMs) && now >= astroDawnMs && now < nauticalDawnMs) {
    return { icon: 'A', label: 'Astronomical dawn' };
  }
  if (Number.isFinite(nauticalDawnMs) && Number.isFinite(civilDawnMs) && now >= nauticalDawnMs && now < civilDawnMs) {
    return { icon: 'N', label: 'Nautical dawn' };
  }
  if (Number.isFinite(civilDawnMs) && Number.isFinite(sunriseMs) && now >= civilDawnMs && now < sunriseMs) {
    return { icon: 'D', label: 'Civil dawn' };
  }

  return { icon: 'SUN', label: 'Sun up' };
}

export function MoonDarknessCard({ forecast, onLearnTopic }: Props) {
  const [nowMs, setNowMs] = useState(() => getNowSortableMs(forecast.timezone));
  useEffect(() => {
    setNowMs(getNowSortableMs(forecast.timezone));
    const id = setInterval(() => setNowMs(getNowSortableMs(forecast.timezone)), 60000);
    return () => clearInterval(id);
  }, [forecast.timezone]);
  const lightState = useMemo(() => getCurrentLightState(forecast, nowMs), [forecast, nowMs]);
  const phaseLabel = safeMoonPhaseLabel(forecast);
  const eventTiles = [
    { label: 'Sunset', value: toLocalLabel(forecast.sunset), topicId: astroLearnTopicId('sunset') },
    { label: 'Sunrise', value: toLocalLabel(forecast.sunrise), topicId: astroLearnTopicId('sunrise') },
    { label: 'Moonrise', value: toLocalLabel(forecast.moonrise), topicId: astroLearnTopicId('moonrise') },
    { label: 'Moonset', value: toLocalLabel(forecast.moonset), topicId: astroLearnTopicId('moonset') },
    { label: 'Civil dusk', value: toLocalLabel(forecast.civilDusk), topicId: astroLearnTopicId('civil') },
    { label: 'Civil dawn', value: toLocalLabel(forecast.civilDawn), topicId: astroLearnTopicId('civil') },
    { label: 'Nautical dusk', value: toLocalLabel(forecast.nauticalDusk), topicId: astroLearnTopicId('nautical') },
    { label: 'Nautical dawn', value: toLocalLabel(forecast.nauticalDawn), topicId: astroLearnTopicId('nautical') },
    { label: 'Astronomical dusk', value: toLocalLabel(forecast.astronomicalDusk), topicId: astroLearnTopicId('astronomical') },
    { label: 'Astronomical dawn', value: toLocalLabel(forecast.astronomicalDawn), topicId: astroLearnTopicId('astronomical') },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Moon & Darkness</Text>
      </View>

      <View style={styles.eventsGrid}>
        {eventTiles.map((item) => (
          <EventTile
            key={item.label}
            label={item.label}
            value={item.value}
            topicId={item.topicId}
            onLearnTopic={onLearnTopic}
          />
        ))}
      </View>

      <View style={styles.phaseBox}>
        <Text style={styles.infoLabel}>MOON PHASE</Text>
        <View style={styles.phaseRow}>
          <View style={styles.phaseBadge}>
            <PremiumMoonIcon
              size={44}
              illuminationPct={forecast.moonIlluminationPct}
              phaseDegrees={forecast.moonPhase}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.phaseTitle}>{phaseLabel}</Text>
            <Text style={styles.phaseSub}>{safeMoonIlluminationText(forecast)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.miniGrid}>
        <InfoBox label="BORTLE" value={formatBortle(forecast)} tone="accent" />
        {onLearnTopic ? (
          <Pressable style={styles.infoBoxPressable} onPress={() => onLearnTopic(astroLearnTopicId('baseline-brightness'))}>
            <InfoBox label="BASELINE BRIGHTNESS" value={formatSkyBrightness(forecast)} />
          </Pressable>
        ) : (
          <InfoBox label="BASELINE BRIGHTNESS" value={formatSkyBrightness(forecast)} />
        )}
      </View>

      <View style={styles.miniGrid}>
        {onLearnTopic ? (
          <Pressable style={styles.infoBoxPressable} onPress={() => onLearnTopic(astroLearnTopicId('estimated-brightness'))}>
            <InfoBox
              label="EST. NOW"
              value={formatEstimatedSkyBrightness(forecast, nowMs, lightState.label)}
              tone="accent"
            />
          </Pressable>
        ) : (
          <InfoBox
            label="EST. NOW"
            value={formatEstimatedSkyBrightness(forecast, nowMs, lightState.label)}
            tone="accent"
          />
        )}
        {onLearnTopic ? (
          <Pressable style={styles.infoBoxPressable} onPress={() => onLearnTopic(astroLearnTopicId('aerosols'))}>
            <InfoBox label="AEROSOLS" value={formatAerosols(forecast)} />
          </Pressable>
        ) : (
          <InfoBox label="AEROSOLS" value={formatAerosols(forecast)} />
        )}
      </View>

      <InfoBox label="ELEVATION" value={formatElevation(forecast)} />
      <Text style={styles.sourceFinePrint}>Source: {formatSiteSource(forecast)}</Text>

      {onLearnTopic ? (
        <Pressable onPress={() => onLearnTopic(astroLearnTopicId('night'))}>
          <InfoBox label="NIGHT WINDOW" value={formatWindow(forecast.nightStartTime, forecast.nightEndTime)} />
        </Pressable>
      ) : (
        <InfoBox label="NIGHT WINDOW" value={formatWindow(forecast.nightStartTime, forecast.nightEndTime)} />
      )}

      <InfoBox label="NIGHT LENGTH" value={formatDuration(forecast.nightStartTime, forecast.nightEndTime)} />

      {onLearnTopic ? (
        <Pressable onPress={() => onLearnTopic(astroLearnTopicId('true-dark'))}>
          <InfoBox label="TRUE DARK" value={formatWindow(forecast.trueDarkStartTime, forecast.trueDarkEndTime)} />
        </Pressable>
      ) : (
        <InfoBox label="TRUE DARK" value={formatWindow(forecast.trueDarkStartTime, forecast.trueDarkEndTime)} />
      )}

      {onLearnTopic ? (
        <Pressable onPress={() => onLearnTopic(astroLearnTopicId('darkest'))}>
          <InfoBox label="DARKEST WINDOW" value={formatWindow(forecast.darkestStartTime, forecast.darkestEndTime)} />
        </Pressable>
      ) : (
        <InfoBox label="DARKEST WINDOW" value={formatWindow(forecast.darkestStartTime, forecast.darkestEndTime)} />
      )}
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
    fontSize: 12,
    color: '#FDE68A',
    fontWeight: '900',
  },
  stateText: {
    color: '#E5E7EB',
    fontSize: 12,
    fontWeight: '800',
  },
  eventsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  eventTilePressable: {
    width: '48%',
  },
  eventTile: {
    width: '100%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eventLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  eventValue: {
    color: '#F9FAFB',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
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
  phaseBadge: {
    width: 54,
    height: 54,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
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
  sourceFinePrint: {
    color: '#9CA3AF',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 8,
  },
  miniGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  infoBoxPressable: {
    flex: 1,
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


