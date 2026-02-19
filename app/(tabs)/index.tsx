// app/(tabs)/index.tsx
// Land Wx – Rich + Nerdy (Branded + Alpha polish)
// ✅ Drop-in replacement: bigger Omni logo, remove "Land Wx", embed 72h hourly chart on Land,
// ✅ keep /hourly route as “Full” fallback, and normalize pressure for hourly series.
// ✅ UPDATE: Replace Skia AnimatedWeatherBackground with condition video animations (clear/partly/overcast/rain/storm/snow)

import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlace } from '../context/PlaceContext';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useCurrentWeather } from '../lib/weather/hooks';
import { DEFAULT_LOCATION } from '../lib/weather/locations';

import type { FavoriteLocation } from '../lib/locations/favorites';
import { geocodePlaces } from '../lib/locations/geocode';
import { useLocations } from '../lib/locations/useLocations';

import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { NerdyExplainModal, type ExplainPayload } from '../../components/common/NerdyExplainModal';
import { NerdyInsightsCard } from '../../components/land/NerdyInsightsCard';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

import { buildNerdyInsights, type NerdyInsight } from '../lib/land/nerdyInsights';
import { dewPointBandF, gustFactor, heatIndexF, windChillF } from '../lib/land/nerdyMath';

import { AlertBanner } from '../../components/alerts/AlertBanner';
import { useNwsAlerts } from '../lib/alerts/useNwsAlerts';

import { DailyRangeChart } from '../../components/land/DailyRangeChart';
import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';

// ✅ Condition video background (your new animations)
import WeatherVideoBackground from '../../components/background/WeatherVideoBackground';

// ✅ Wx Lab toggle replaces Simple/Nerdy mode
import { useWxLab } from '../context/WxLabContext';

type UnitSystem = 'us' | 'metric';

type SavedLocation = {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  lat: number;
  lon: number;
  tz?: string;
};

function safeNum(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function fmt(v: number | null, digits = 0) {
  if (v == null) return '—';
  return digits > 0 ? v.toFixed(digits) : `${Math.round(v)}`;
}

function near(a: number, b: number, eps = 0.0005) {
  return Math.abs(a - b) < eps;
}

function dirToCompass(deg: number | null) {
  if (deg == null) return null;
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return dirs[idx];
}

function formatLocLabel(loc: { name: string; admin1?: string; country?: string }) {
  return [loc.name, loc.admin1, loc.country].filter(Boolean).join(', ');
}

/** ExplainPayload expects: 'low' | 'medium' | 'high' | undefined */
function normalizeConfidence(v: any): 'low' | 'medium' | 'high' | undefined {
  if (!v) return undefined;
  if (typeof v !== 'string') return undefined;
  const s = v.toLowerCase();
  if (s.includes('high')) return 'high';
  if (s.includes('medium')) return 'medium';
  if (s.includes('low')) return 'low';
  return undefined;
}

function formatUpdatedTime(observationTime: string | null) {
  if (!observationTime) return '—';
  const d = new Date(observationTime);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function LocationPickerModal({
  visible,
  onClose,
  onPick,
  onPickCurrent,
  favorites,
  activeLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (loc: SavedLocation) => void;
  onPickCurrent: () => void;
  favorites: FavoriteLocation[];
  activeLabel: string;
}) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SavedLocation[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (!visible) return;
    setQ('');
    setResults([]);
    setErr(null);
    setBusy(false);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = q.trim();
    if (!query) {
      setResults([]);
      setErr(null);
      setBusy(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        setBusy(true);
        setErr(null);
        const r = await geocodePlaces(query);
        setResults(
          (r ?? []).map((x: any) => ({
            id: x.id ?? `geo:${x.lat.toFixed(4)},${x.lon.toFixed(4)}`,
            name: x.name,
            admin1: x.admin1,
            country: x.country,
            lat: x.lat,
            lon: x.lon,
            tz: x.tz,
          }))
        );
      } catch {
        setErr('Search failed.');
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, visible]);

  const favRows: Array<{ key: string; title: string; sub: string; onPress: () => void }> = (favorites ?? []).map(
    (item) => ({
      key: item.id,
      title: item.name,
      sub: `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
      onPress: () =>
        onPick({
          id: item.id,
          name: item.name,
          lat: item.lat,
          lon: item.lon,
        }),
    })
  );

  const resRows: Array<{ key: string; title: string; sub: string; onPress: () => void }> = (results ?? []).map(
    (item) => ({
      key: item.id,
      title: formatLocLabel(item),
      sub: `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
      onPress: () => onPick(item),
    })
  );

  const sections = useMemo(() => {
    const out: any[] = [];
    out.push({
      title: 'Favorites',
      data: favRows.length
        ? favRows
        : [{ key: 'nofavs', title: 'No favorites yet', sub: 'Star a place to save it.', onPress: () => {} }],
    });
    out.push({
      title: 'Search results',
      data: q.trim()
        ? resRows.length
          ? resRows
          : [{ key: 'nomatch', title: 'No matches', sub: 'Try a different query.', onPress: () => {} }]
        : [{ key: 'type', title: 'Start typing to search', sub: 'City, state, country…', onPress: () => {} }],
    });
    return out;
  }, [favRows.length, resRows.length, q]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Location</Text>
          <Pressable onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={styles.modalCloseText}>Done</Text>
          </Pressable>
        </View>

        <Text style={styles.modalActive} numberOfLines={1}>
          Current view: <Text style={{ fontWeight: '900' }}>{activeLabel}</Text>
        </Text>

        <Pressable onPress={onPickCurrent} style={styles.currentBtn}>
          <Text style={styles.currentBtnText}>Use current location</Text>
        </Pressable>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search city, state, country…"
          placeholderTextColor="rgba(255,255,255,0.35)"
          autoCorrect={false}
          autoCapitalize="none"
          style={styles.searchInput}
        />

        {busy ? (
          <View style={{ paddingVertical: 10 }}>
            <ActivityIndicator />
          </View>
        ) : null}

        {err ? <Text style={styles.modalError}>{err}</Text> : null}

        <SectionList
          sections={sections}
          keyExtractor={(it: any) => it.key}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }: any) => <Text style={styles.modalSection}>{section.title}</Text>}
          renderItem={({ item }: any) => (
            <Pressable
              onPress={item.onPress}
              style={[
                styles.pickRow,
                (item.key === 'nofavs' || item.key === 'nomatch' || item.key === 'type') && { opacity: 0.75 },
              ]}
              disabled={item.key === 'nofavs' || item.key === 'nomatch' || item.key === 'type'}
            >
              <Text style={styles.pickTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.pickSub} numberOfLines={1}>
                {item.sub}
              </Text>
            </Pressable>
          )}
          style={{ flex: 1, marginTop: 8 }}
        />
      </View>
    </Modal>
  );
}

function StatTile({
  label,
  value,
  onPress,
  valueHint,
  style,
}: {
  label: string;
  value: string;
  valueHint?: string;
  onPress?: () => void;
  style?: any;
}) {
  const body = (
    <View style={[styles.statTile, style]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1}>
        {value}
      </Text>
      {valueHint ? <Text style={styles.tileHint}>{valueHint}</Text> : null}
    </View>
  );

  if (!onPress) return body;

  return (
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      {body}
    </Pressable>
  );
}

function WxLabToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={[styles.labToggle, enabled && styles.labToggleOn]}>
      <Text style={[styles.labIcon, enabled && styles.labIconOn]}>🧪</Text>
      <Text style={[styles.labText, enabled && styles.labTextOn]}>WX Lab</Text>
    </Pressable>
  );
}

function SimpleSummary({
  dewpointF,
  humidityPct,
  windMph,
  gustMph,
  windDirDeg,
  cloudCoverPct,
  uvIndex,
  precipChancePct,
  visibilityMi,
  pressureHpa,
  narrative,
  hideWind,
}: {
  dewpointF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
  cloudCoverPct: number | null;
  uvIndex: number | null;
  precipChancePct: number | null;
  visibilityMi: number | null;
  pressureHpa: number | null;
  narrative?: string;
  hideWind?: boolean;
}) {
  const hasMoisture = dewpointF != null || humidityPct != null;
  const hasWind = !hideWind && (windMph != null || gustMph != null || windDirDeg != null);
  const hasPrecipVis = precipChancePct != null || visibilityMi != null || pressureHpa != null;

  const dirToCompassLocal = (deg: number | null) => {
    if (deg == null) return null;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((deg % 360) / 22.5)) % 16;
    return dirs[idx];
  };

  const windDirText = windDirDeg != null ? `${dirToCompassLocal(windDirDeg) ?? ''}`.trim() : '—';
  const fmt0 = (v: number | null, suffix = '') => (v == null ? '—' : `${Math.round(v)}${suffix}`);
  const fmt1 = (v: number | null, suffix = '') => (v == null ? '—' : `${v.toFixed(1)}${suffix}`);

  return (
    <View style={ss.wrap}>
      {hasMoisture ? (
        <View style={ss.section}>
          <Text style={ss.sectionTitle}>Comfort</Text>

          <View style={ss.grid2}>
            <View style={ss.cell}>
              <Text style={ss.k}>Dew Point</Text>
              <Text style={ss.v}>{dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>RH</Text>
              <Text style={ss.v}>{humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}</Text>
            </View>
          </View>

          {narrative ? (
            <Text style={ss.note} numberOfLines={2}>
              {narrative}
            </Text>
          ) : null}
        </View>
      ) : null}

      {hasWind ? (
        <View style={ss.section}>
          <Text style={ss.sectionTitle}>Wind</Text>

          <View style={ss.grid2}>
            <View style={ss.cell}>
              <Text style={ss.k}>Speed</Text>
              <Text style={ss.v}>
                {windMph != null ? `${Math.round(windMph)} mph` : '—'} <Text style={{ opacity: 0.7 }}> {windDirText}</Text>
              </Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Gusts</Text>
              <Text style={ss.v}>{gustMph != null ? `${Math.round(gustMph)} mph` : '—'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {hasPrecipVis ? (
        <View style={ss.section}>
          <Text style={ss.sectionTitle}>Extras</Text>

          <View style={ss.grid3}>
            <View style={ss.cell}>
              <Text style={ss.k}>POP</Text>
              <Text style={ss.v}>{precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Vis</Text>
              <Text style={ss.v}>{visibilityMi != null ? fmt1(visibilityMi, ' mi') : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Pressure</Text>
              <Text style={ss.v}>{pressureHpa != null ? fmt0(pressureHpa, ' hPa') : '—'}</Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const ss = StyleSheet.create({
  wrap: { marginTop: 10, gap: 10 },

  section: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '900',
    marginBottom: 10,
  },

  grid2: { flexDirection: 'row', gap: 10 },
  grid3: { flexDirection: 'row', gap: 10 },

  cell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  k: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '900',
  },

  v: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '900',
    color: 'white',
  },

  note: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
});

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={nd.section}>
      <Text style={nd.sectionTitle}>{title}</Text>
      <View style={nd.sectionBody}>{children}</View>
    </View>
  );
}

function NerdyDeepDive({
  dewpointF,
  humidityPct,
  dpBand,
  spreadF,
  tempF,

  windMph,
  gustMph,
  windDirDeg,
  gf,

  cloudCoverPct,
  uvIndex,

  precipChancePct,
  visibilityMi,
  pressureHpa,
  pressureInHg,

  feelsDriverLabel,
  feelsDriverValue,

  onExplain,
}: {
  dewpointF: number | null;
  humidityPct: number | null;
  dpBand: string | null;
  spreadF: number | null;
  tempF: number | null;

  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
  gf: number | null;

  cloudCoverPct: number | null;
  uvIndex: number | null;

  precipChancePct: number | null;
  visibilityMi: number | null;
  pressureHpa: number | null;
  pressureInHg: number | null;

  feelsDriverLabel: string;
  feelsDriverValue: string;

  onExplain: (p: ExplainPayload) => void;
}) {
  const dir = dirToCompass(windDirDeg);
  const dirText = windDirDeg != null ? `${dir ?? ''} ${Math.round(windDirDeg)}°`.trim() : '—';

  return (
    <View style={nd.wrap}>
      <SectionCard title="Comfort">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Dew point"
              value={dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'}
              onPress={() =>
                onExplain({
                  title: 'Dew point',
                  summary: 'Dew point is the absolute moisture content of the air.',
                  whyItMatters: 'It tracks comfort, fog potential, and overnight lows better than RH.',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: dewpointF != null ? 'high' : undefined,
                  learnTopicId: 'dewpoint',
                })
              }
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="RH"
              value={humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}
              onPress={() =>
                onExplain({
                  title: 'Relative humidity',
                  summary: 'RH is moisture relative to temperature (not absolute moisture).',
                  whyItMatters: 'Good for comfort, but can swing with temperature even if moisture stays the same.',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: humidityPct != null ? 'medium' : undefined,
                  learnTopicId: 'humidity',
                })
              }
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Dew band"
              value={dpBand ?? '—'}
              onPress={() =>
                onExplain({
                  title: 'Dew point band',
                  summary: 'A quick qualitative label based on dew point ranges.',
                  whyItMatters: 'Fast “feel” of the air—dry vs sticky—without thinking in numbers.',
                  howComputed: 'Derived from dew point thresholds.',
                  confidence: dewpointF != null ? 'high' : undefined,
                  learnTopicId: 'dewpoint',
                })
              }
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Spread (T−Td)"
              value={spreadF != null ? `${Math.round(spreadF)}°F` : '—'}
              onPress={() =>
                onExplain({
                  title: 'Temperature–dew point spread',
                  summary: 'Difference between air temperature and dew point.',
                  whyItMatters: 'Smaller spread can mean higher fog/low cloud potential (context dependent).',
                  howComputed: 'Computed as temperature minus dew point.',
                  confidence: tempF != null && dewpointF != null ? 'high' : undefined,
                  learnTopicId: 'dewpoint',
                })
              }
            />
          </View>
        </View>

        <StatTile
          label={feelsDriverLabel}
          value={feelsDriverValue}
          onPress={() =>
            onExplain({
              title: feelsDriverLabel,
              summary: 'A “feels” metric that’s most relevant given current conditions.',
              whyItMatters: 'Often aligns better with comfort / hazard thresholds than air temp alone.',
              howComputed: 'Heat Index uses T+RH; Wind Chill uses T+wind; otherwise a source “feels-like”.',
              confidence: 'medium',
              learnTopicId: 'apparent-temp',
            })
          }
        />
      </SectionCard>

      <SectionCard title="Wind">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Speed"
              value={windMph != null ? `${Math.round(windMph)} mph` : '—'}
              onPress={() =>
                onExplain({
                  title: 'Wind speed',
                  summary: 'Sustained wind speed at the station.',
                  whyItMatters: 'Drives comfort, evaporation, fire spread, and turbulence near terrain.',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: windMph != null ? 'medium' : undefined,
                  learnTopicId: 'wind',
                })
              }
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Gusts"
              value={gustMph != null ? `${Math.round(gustMph)} mph` : '—'}
              onPress={() =>
                onExplain({
                  title: 'Wind gusts',
                  summary: 'Peak wind bursts over a short interval.',
                  whyItMatters: 'Gusts are what break branches, kick up dust, and cause choppy driving.',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: gustMph != null ? 'medium' : undefined,
                  learnTopicId: 'wind',
                })
              }
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Direction"
              value={dirText}
              onPress={() =>
                onExplain({
                  title: 'Wind direction',
                  summary: 'Direction the wind is coming from, in degrees/compass.',
                  whyItMatters: 'Shifts can indicate fronts, terrain effects, or local drainage/upslope flows.',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: windDirDeg != null ? 'medium' : undefined,
                  learnTopicId: 'wind',
                })
              }
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Gust factor"
              value={gf != null ? gf.toFixed(2) : '—'}
              onPress={() =>
                onExplain({
                  title: 'Gust factor',
                  summary: 'A ratio that reflects how “gusty” it is compared to sustained wind.',
                  whyItMatters: 'Higher values can mean more turbulent/mixed conditions.',
                  howComputed: 'Derived from sustained wind and gust (defensive math).',
                  confidence: windMph != null && gustMph != null ? 'medium' : undefined,
                  learnTopicId: 'wind',
                })
              }
            />
          </View>
        </View>
      </SectionCard>

      {/* SKY */}
      {(() => {
        const hasSky = cloudCoverPct != null || uvIndex != null;

        if (!hasSky) {
          return (
            <SectionCard title="Sky">
              <Text style={nd.mutedLine}>Sky details not available from this station.</Text>
            </SectionCard>
          );
        }

        return (
          <SectionCard title="Sky">
            <View style={nd.grid2}>
              <View style={nd.gridItem}>
                <StatTile
                  label="Cloud cover"
                  value={cloudCoverPct != null ? `${Math.round(cloudCoverPct)}%` : '—'}
                  onPress={() =>
                    onExplain({
                      title: 'Cloud cover',
                      summary: 'Estimated sky coverage by clouds.',
                      whyItMatters: 'Controls heating/cooling rates and astronomical viewing quality.',
                      howComputed: 'From the current conditions provider when available.',
                      confidence: cloudCoverPct != null ? 'medium' : undefined,
                      learnTopicId: 'clouds',
                    })
                  }
                />
              </View>

              <View style={nd.gridItem}>
                <StatTile
                  label="UV index"
                  value={uvIndex != null ? fmt(uvIndex, 1) : '—'}
                  onPress={() =>
                    onExplain({
                      title: 'UV Index',
                      summary: 'A standardized measure of sunburn risk.',
                      whyItMatters: 'Useful even in cooler temps; clouds can reduce it but not eliminate it.',
                      howComputed: 'From the current conditions provider when available.',
                      confidence: uvIndex != null ? 'medium' : undefined,
                      learnTopicId: 'uv',
                    })
                  }
                />
              </View>
            </View>
          </SectionCard>
        );
      })()}

      <SectionCard title="Extras">
        <View style={nd.grid3}>
          <View style={nd.gridItem}>
            <StatTile
              label="POP"
              value={precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}
              onPress={() =>
                onExplain({
                  title: 'POP (Probability of Precip)',
                  summary: 'Chance of measurable precipitation at a point.',
                  whyItMatters: 'Planning signal; does not imply intensity.',
                  howComputed: 'From the current conditions source when available.',
                  confidence: precipChancePct != null ? 'medium' : undefined,
                  learnTopicId: 'pop',
                })
              }
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Vis"
              value={visibilityMi != null ? `${visibilityMi.toFixed(1)} mi` : '—'}
              onPress={() =>
                onExplain({
                  title: 'Visibility',
                  summary: 'How far you can see horizontally under current conditions.',
                  whyItMatters: 'Key for driving, aviation, and smoke/fog/dust impacts.',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: visibilityMi != null ? 'medium' : undefined,
                  learnTopicId: 'visibility',
                })
              }
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Pressure"
              value={pressureHpa != null ? `${fmt(pressureHpa)} hPa` : '—'}
              valueHint={pressureInHg != null ? `${pressureInHg.toFixed(2)} inHg` : undefined}
              onPress={() =>
                onExplain({
                  title: 'Pressure',
                  summary: 'Atmospheric pressure (often station or sea-level adjusted).',
                  whyItMatters: 'Trends can hint at larger-scale changes (fronts, lows/highs).',
                  howComputed: 'From the current conditions provider when available.',
                  confidence: pressureHpa != null ? 'medium' : undefined,
                  learnTopicId: 'pressure',
                })
              }
            />
          </View>
        </View>
      </SectionCard>
    </View>
  );
}

const nd = StyleSheet.create({
  wrap: { marginTop: 10, gap: 8 },
  gridItem: { flex: 1 },
  section: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  sectionTitle: {
    fontSize: 11,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '900',
    marginBottom: 10,
  },
  sectionBody: { gap: 8 },
  grid2: { flexDirection: 'row', gap: 8 },
  grid3: { flexDirection: 'row', gap: 8 },

  mutedLine: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
});

export default function LandWeatherScreen() {
  // ✅ WxLab context drives "simple vs nerdy"
  const wxLabCtx = useWxLab() as any;
  const wxLab = !!wxLabCtx?.wxLab;

  const placeCtx = usePlace() as any;

  const placeSetActive =
    (typeof placeCtx?.setActive === 'function' && placeCtx.setActive) ||
    (typeof placeCtx?.setActivePlace === 'function' && placeCtx.setActivePlace) ||
    (typeof placeCtx?.setPlace === 'function' && placeCtx.setPlace) ||
    null;

  const placeSetCurrent =
    (typeof placeCtx?.setActiveCurrent === 'function' && placeCtx.setActiveCurrent) ||
    (typeof placeCtx?.setCurrent === 'function' && placeCtx.setCurrent) ||
    null;

  const placeRefreshCurrent =
    (typeof placeCtx?.refreshCurrentLocation === 'function' && placeCtx.refreshCurrentLocation) ||
    (typeof placeCtx?.refreshCurrent === 'function' && placeCtx.refreshCurrent) ||
    null;

  const pushPlaceToContext = (name: string, lat: number, lon: number) => {
    if (!placeSetActive) return;
    placeSetActive({
      name,
      lat,
      lon,
      source: 'land',
      kind: 'saved',
      id: `geo:${lat.toFixed(4)},${lon.toFixed(4)}`,
    });
  };

  const setWxLab =
    (typeof wxLabCtx?.setWxLab === 'function' && wxLabCtx.setWxLab) ||
    (typeof wxLabCtx?.setEnabled === 'function' && wxLabCtx.setEnabled) ||
    (typeof wxLabCtx?.setWxLabEnabled === 'function' && wxLabCtx.setWxLabEnabled) ||
    null;

  const toggleWxLab =
    (typeof wxLabCtx?.toggleWxLab === 'function' && wxLabCtx.toggleWxLab) ||
    (typeof wxLabCtx?.toggle === 'function' && wxLabCtx.toggle) ||
    null;

  const [pickerOpen, setPickerOpen] = useState(false);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const units: UnitSystem = 'us';

  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 6000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0, duration: 6000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  const hour = new Date().getHours();
  const isNight = hour < 6 || hour >= 19;
  const isSunrise = hour >= 6 && hour < 8;
  const isSunset = hour >= 17 && hour < 19;

  const { activeCoords, activeLabel, state: locState, refreshCurrentLocation, addOrActivateFavorite, setActiveCurrent } =
    useLocations();

  useEffect(() => {
    if (locState.active?.kind === 'current') refreshCurrentLocation();
  }, [refreshCurrentLocation, locState.active?.kind]);

  const coords = useMemo(() => {
    if (activeCoords) return activeCoords;
    return { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon };
  }, [activeCoords]);

  const locationLabel = useMemo(() => {
    if (activeCoords) return activeLabel;
    return `${DEFAULT_LOCATION.name}${DEFAULT_LOCATION.region ? `, ${DEFAULT_LOCATION.region}` : ''}`;
  }, [activeCoords, activeLabel]);

  // ✅ Keep PlaceContext synced with whatever Land is currently showing
  useEffect(() => {
    if (!activeCoords) return;
    pushPlaceToContext(activeLabel, activeCoords.lat, activeCoords.lon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCoords?.lat, activeCoords?.lon, activeLabel]);

  const { primary, alerts } = useNwsAlerts({
    lat: coords.lat,
    lon: coords.lon,
    enabled: true,
  });

  const isFavorited = useMemo(() => {
    const favs = locState.favorites ?? [];
    return favs.some((f) => near(f.lat, coords.lat) && near(f.lon, coords.lon));
  }, [locState.favorites, coords.lat, coords.lon]);

  const {
    data: currentData,
    loading: currentLoading,
    error: currentError,
    refreshing: currentRefreshing,
    refresh: currentRefresh,
  } = useCurrentWeather({
    lat: coords.lat,
    lon: coords.lon,
    units: 'imperial',
  } as any);

  const {
    data: forecastData,
    loading: forecastLoading,
    error: forecastError,
    refreshing: forecastRefreshing,
    refresh: forecastRefresh,
  } = useOpenMeteoForecast({
    lat: coords.lat,
    lon: coords.lon,
    days: 15,
  });

  const loading = currentLoading || (wxLab && forecastLoading);
  const refreshing = currentRefreshing || forecastRefreshing;

  const onRefresh = () => {
    currentRefresh?.();
    forecastRefresh?.();
  };

  const wx: any = currentData ?? {};

  const tempF = safeNum(wx.temperatureF ?? wx.temp_f ?? wx.temperature ?? wx.temp);
  const feelsLikeF = safeNum(wx.apparentTemperatureF ?? wx.feels_like_f ?? wx.feels_like);

  const dewpointF = safeNum(wx.dewpointF ?? wx.dewpoint_f ?? wx.dew_point);
  const humidityPct = safeNum(wx.humidity ?? wx.relativeHumidity ?? wx.relative_humidity ?? wx.rh);

  const windMph = safeNum(wx.windSpeedMph ?? wx.wind_speed_mph ?? wx.windSpeed);
  const gustMph = safeNum(wx.windGustMph ?? wx.wind_gust_mph ?? wx.windGust ?? wx.gust);
  const windDirDeg = safeNum(wx.windDirection ?? wx.wind_dir ?? wx.wind_direction);

  const cloudCoverPct = safeNum(wx.cloudCoverPct ?? wx.cloud_cover ?? wx.cloudCover);
  const visibilityMi = safeNum(wx.visibilityMi ?? wx.visibility_mi ?? wx.visibility);
  const uvIndex = safeNum(wx.uvIndex ?? wx.uv_index ?? wx.uv);

  const popFromHourly = (() => {
    const hrs: any[] = forecastData?.hourly ?? [];
    if (!hrs.length) return null;

    const now = Date.now();
    let best: any = null;
    let bestDt = Infinity;

    for (const h of hrs) {
      const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        best = h;
      }
    }

    return safeNum(best?.precipitation_probability ?? best?.precipProbPct ?? best?.precipChancePct ?? best?.pop);
  })();

  const popTodayPeak = safeNum(forecastData?.daily?.[0]?.precipProbMaxPct);
  const popFromCurrent = safeNum(wx.precipChancePct ?? wx.precip_probability ?? wx.precipProb ?? wx.pop);
  const precipChancePct = popTodayPeak ?? popFromCurrent ?? popFromHourly;

  const pressureHpa = safeNum(wx.pressureHpa ?? wx.pressure_hpa ?? wx.pressure);
  const pressureInHg =
    safeNum(wx.pressureInHg ?? wx.pressure_inhg) ?? (pressureHpa != null ? pressureHpa * 0.029529983071445 : null);

  // ✅ Resolve weatherCode for video selection (current → fallback to nearest hourly)
  const weatherCodeFromCurrent =
    safeNum(
      wx.weatherCode ??
        wx.weathercode ??
        wx.weather_code ??
        wx.code ??
        wx.iconCode ??
        wx.icon_code ??
        null
    ) ?? null;

  const weatherCodeFromHourly = (() => {
    const hrs: any[] = forecastData?.hourly ?? [];
    if (!hrs.length) return null;

    const now = Date.now();
    let best: any = null;
    let bestDt = Infinity;

    for (const h of hrs) {
      const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        best = h;
      }
    }

    return (
      safeNum(
        best?.weather_code ??
          best?.weatherCode ??
          best?.weathercode ??
          best?.condition_code ??
          null
      ) ?? null
    );
  })();

  const weatherCode = weatherCodeFromCurrent ?? weatherCodeFromHourly;

  const condition = wx.shortForecast ?? wx.condition ?? wx.textDescription ?? wx.weather ?? '—';
  const observationTime: string | null = wx.observedAt ?? wx.timestamp ?? wx.datetime ?? null;

  const dpBand = dewpointF == null ? null : dewPointBandF(dewpointF);
  const hi = tempF != null && humidityPct != null ? heatIndexF(tempF, humidityPct) : null;
  const wc = tempF != null && windMph != null ? windChillF(tempF, windMph) : null;
  const gf = gustFactor(windMph, gustMph);
  const spreadF = tempF != null && dewpointF != null ? tempF - dewpointF : null;

  const dewLine = dewpointF != null ? `${Math.round(dewpointF)}°F${dpBand ? ` • ${dpBand}` : ''}` : null;

  const daily = (forecastData?.daily ?? []).slice(0, 15);
  const hourlyRaw: any[] = forecastData?.hourly ?? [];

  // ✅ Normalize pressure for hourly so HourlyCharts72h can show it (if it supports it)
  const hourly = useMemo(() => {
    return (hourlyRaw ?? []).map((h: any) => {
      const pressureHpaLocal =
        safeNum(h.pressure_msl) ??
        safeNum(h.pressureMslHpa) ??
        safeNum(h.surface_pressure) ??
        safeNum(h.pressureSurfaceHpa) ??
        safeNum(h.pressure_hpa) ??
        safeNum(h.pressureHpa) ??
        null;

      return {
        ...h,
        pressureHpa: pressureHpaLocal,
      };
    });
  }, [hourlyRaw]);

  const insights: NerdyInsight[] = useMemo(() => {
    return buildNerdyInsights({ tempF, dewpointF, humidityPct, windMph, gustMph, hourly });
  }, [tempF, dewpointF, humidityPct, windMph, gustMph, hourly]);

  const onToggleFavorite = () => {
    if (isFavorited) return;
    addOrActivateFavorite(locationLabel, coords.lat, coords.lon);
  };

  const onPickLocation = (loc: SavedLocation) => {
    const label = formatLocLabel(loc);
    addOrActivateFavorite(label, loc.lat, loc.lon);
    pushPlaceToContext(label, loc.lat, loc.lon);
    setPickerOpen(false);
  };

  const onPickCurrent = () => {
    setActiveCurrent();
    refreshCurrentLocation();
    if (placeSetCurrent) placeSetCurrent();
    if (placeRefreshCurrent) placeRefreshCurrent();
    setPickerOpen(false);
  };

  const onPressInsight = (it: NerdyInsight) => {
    setExplainPayload({
      title: it.title,
      summary: it.explain.summary,
      whyItMatters: it.explain.whyItMatters,
      howComputed: it.explain.howComputed,
      confidence: normalizeConfidence((it.explain as any).confidence),
      learnTopicId: (it.explain as any).learnTopicId ?? undefined,
    });
    setExplainOpen(true);
  };

  const openQuickExplain = (payload: ExplainPayload) => {
    setExplainPayload(payload);
    setExplainOpen(true);
  };

  const favorites = locState.favorites ?? [];

  const feelsDriver = useMemo(() => {
    if (hi != null) return { label: 'Heat Index', value: `${Math.round(hi)}°F`, conf: 'high' as const };
    if (wc != null) return { label: 'Wind Chill', value: `${Math.round(wc)}°F`, conf: 'high' as const };
    if (feelsLikeF != null) return { label: 'Feels Like', value: `${Math.round(feelsLikeF)}°F`, conf: 'medium' as const };
    return { label: 'Feels', value: '—', conf: undefined };
  }, [hi, wc, feelsLikeF]);

  const updatedText = `Updated ${formatUpdatedTime(observationTime)}`;

  const onPressAlert = () => {
    setExplainPayload({
      title: primary?.event ?? 'Weather Alert',
      summary: primary?.headline ?? 'Active alert in this area.',
      whyItMatters: 'Weather alerts indicate hazards and recommended actions.',
      howComputed: 'Provided by NWS alerts feed for the selected coordinates.',
      confidence: 'high',
      learnTopicId: 'nws-alerts',
    });
    setExplainOpen(true);
  };

  const moistureHint =
    dewpointF != null
      ? dewpointF < 30
        ? 'Very dry air • rapid cooling after sunset'
        : dewpointF < 50
          ? 'Comfortable moisture levels'
          : 'Humid air • clouds linger'
      : null;

  const heroSummary =
    dewpointF != null && windMph != null
      ? `${dewpointF < 45 ? 'Dry air' : 'Moist air'} • ${windMph < 5 ? 'calm' : windMph < 15 ? 'breezy' : 'windy'}`
      : '—';

  return (
    <View style={styles.root}>
      {/* ✅ NEW: condition-based animated video background behind everything */}
      <WeatherVideoBackground weatherCode={weatherCode ?? undefined} />

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingTop: Math.max(theme.spacing.md, insets.top * 0.15) }]}
          refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />}
        >
          {/* =========================
              HEADER (Hero surface)
          ========================= */}
          <View style={styles.headerHeroWrap}>
            <View style={styles.headerHeroSurface}>
              <View style={styles.headerHeroTopRow}>
                <View style={styles.headerHeroBrand}>
                  <Image
                    source={require('../../assets/brand/omniwx-mark-word.png')}
                    style={styles.headerHeroLogo}
                    resizeMode="contain"
                  />
                </View>

                <Pressable onPress={() => setPickerOpen(true)} style={styles.headerHeroLocation}>
                  <Text style={styles.locationPrimary} numberOfLines={1}>
                    {locationLabel}
                  </Text>
                  <Text style={styles.locationSecondary} numberOfLines={1}>
                    📍 Change location
                  </Text>
                </Pressable>

                <View style={styles.headerHeroActions}>
                  <Pressable
                    onPress={onToggleFavorite}
                    disabled={isFavorited}
                    style={[
                      styles.favoriteChip,
                      isFavorited && styles.favoriteChipActive,
                      isFavorited && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.favoriteChipText, isFavorited && { color: 'white' }]}>
                      {isFavorited ? '★ Saved' : '☆ Save'}
                    </Text>
                  </Pressable>

                  <WxLabToggle
                    enabled={wxLab}
                    onToggle={() => {
                      if (toggleWxLab) return toggleWxLab();
                      if (setWxLab) return setWxLab(!wxLab);
                    }}
                  />
                </View>
              </View>

              <View style={styles.headerHeroBottomRow}>
                {/* Keep Hourly as a link for now, even if you hide the Hourly tab later */}
                <Pressable onPress={() => router.push('/hourly')} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Hourly</Text>
                </Pressable>

                <Pressable onPress={() => router.push('/climo')} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Climo</Text>
                </Pressable>

                {wxLab ? (
                  <View style={styles.headerHeroLabHint}>
                    <Text style={styles.headerHeroLabHintText}>WX Lab</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {primary ? (
            <View style={{ marginTop: -6, marginBottom: theme.spacing.md }}>
              <AlertBanner primary={primary} count={alerts.length} onPress={onPressAlert} />
            </View>
          ) : null}

          {loading && !currentData ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={styles.smallText}>Loading weather…</Text>
            </View>
          ) : null}

          {currentError || forecastError ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorText}>{currentError || forecastError}</Text>
            </Card>
          ) : null}

          <Card style={styles.heroCard}>
            <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
              <Animated.View
                style={[
                  styles.heroBgSoftGlow,
                  {
                    backgroundColor: isNight
                      ? 'rgba(120,160,255,0.10)'
                      : isSunrise || isSunset
                        ? 'rgba(255,180,120,0.14)'
                        : 'rgba(160,220,255,0.10)',
                    opacity: glowAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.55, 0.85],
                    }),
                  },
                ]}
              />
              <View
                style={[
                  styles.heroBgHorizon,
                  {
                    backgroundColor: isNight ? 'rgba(80,120,200,0.08)' : 'rgba(255,190,120,0.05)',
                  },
                ]}
              />
            </View>

            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTemp}>{tempF != null ? `${Math.round(tempF)}°` : '—'}</Text>
                <Text style={styles.heroCondition}>{condition}</Text>
                <Text style={styles.heroSummary} numberOfLines={1}>
                  {heroSummary}
                </Text>
              </View>

              <View style={styles.heroRight}>
                <Text style={styles.heroMiniLabel}>Feels</Text>
                <Text style={styles.heroMiniValue}>{feelsLikeF != null ? `${Math.round(feelsLikeF)}°` : '—'}</Text>
              </View>
            </View>

            {!wxLab ? (
              <SimpleSummary
                dewpointF={dewpointF}
                humidityPct={humidityPct}
                windMph={windMph}
                gustMph={gustMph}
                windDirDeg={windDirDeg}
                cloudCoverPct={cloudCoverPct}
                uvIndex={uvIndex}
                precipChancePct={precipChancePct}
                visibilityMi={visibilityMi}
                pressureHpa={pressureHpa}
                narrative={moistureHint ?? undefined}
                hideWind
              />
            ) : (
              <NerdyDeepDive
                dewpointF={dewpointF}
                humidityPct={humidityPct}
                dpBand={dpBand}
                spreadF={spreadF}
                tempF={tempF}
                windMph={windMph}
                gustMph={gustMph}
                windDirDeg={windDirDeg}
                gf={gf}
                cloudCoverPct={cloudCoverPct}
                uvIndex={uvIndex}
                precipChancePct={precipChancePct}
                visibilityMi={visibilityMi}
                pressureHpa={pressureHpa}
                pressureInHg={pressureInHg}
                feelsDriverLabel={feelsDriver.label}
                feelsDriverValue={feelsDriver.value}
                onExplain={openQuickExplain}
              />
            )}

            <Text style={styles.updatedText}>{updatedText}</Text>
          </Card>

          {/* ✅ Hourly on Land (72h) */}
          {hourly.length ? (
            <Card style={styles.hourlyCard}>
              <View style={styles.hourlyHeaderRow}>
                <Text style={styles.cardTitle}>Next 72 hours</Text>
                <Pressable onPress={() => router.push('/hourly')} style={styles.hourlyFullBtn}>
                  <Text style={styles.hourlyFullText}>Full</Text>
                </Pressable>
              </View>

              <HourlyCharts72h hours={hourly} maxHours={72} units={units} initialPanel="range" />

              <Text style={styles.updatedText}>Source: Open-Meteo (hourly)</Text>
            </Card>
          ) : null}

          {daily.length > 0 ? (
            <Card style={styles.forecastCard}>
              <Text style={styles.cardTitle}>{wxLab ? 'Daily (Model Blend)' : '15-Day Forecast'}</Text>

              <DailyRangeChart daily={daily} />

              {wxLab ? (
                <NerdyInsightsCard
                  title="Insights"
                  dewpointLine={dewLine}
                  insights={insights}
                  onPressInsight={onPressInsight}
                  onPressLearn={() => {
                    setLearnTopicId(undefined);
                    setLearnOpen(true);
                  }}
                />
              ) : null}

              <Text style={styles.updatedText}>Source: Open-Meteo (multi-model blend)</Text>
            </Card>
          ) : null}

          <View style={{ height: 26 }} />
        </ScrollView>
      </SafeAreaView>

      <LocationPickerModal
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={onPickLocation}
        onPickCurrent={onPickCurrent}
        favorites={favorites}
        activeLabel={locationLabel}
      />

      <NerdyExplainModal
        visible={explainOpen}
        onClose={() => setExplainOpen(false)}
        payload={explainPayload}
        onLearnMore={(topicId) => {
          setExplainOpen(false);
          setLearnTopicId(topicId ?? undefined);
          setLearnOpen(true);
        }}
      />

      <LearnMoreModal visible={learnOpen} onClose={() => setLearnOpen(false)} initialTopicId={learnTopicId} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },

  // ✅ transparent so background video shows through
  safe: { flex: 1, backgroundColor: 'transparent' },
  container: { flex: 1, backgroundColor: 'transparent' },

  content: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  locationPrimary: { fontSize: 14, fontWeight: '900', color: 'white' },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  favoriteChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  favoriteChipActive: {
    borderColor: 'rgba(200,240,255,0.28)',
    backgroundColor: 'rgba(160,220,255,0.10)',
  },
  favoriteChipText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 12 },

  labToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  labToggleOn: {
    borderColor: 'rgba(200, 240, 255, 0.26)',
    backgroundColor: 'rgba(160, 220, 255, 0.10)',
  },
  labIcon: { fontSize: 14, opacity: 0.75 },
  labIconOn: { opacity: 1 },
  labText: { color: 'rgba(255,255,255,0.80)', fontWeight: '900', fontSize: 12 },
  labTextOn: { color: 'white' },

  quickNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  quickNavText: { color: 'white', fontWeight: '900', fontSize: 12 },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  smallText: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBg, marginBottom: theme.spacing.lg },
  errorTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.errorText, marginBottom: 4 },
  errorText: { fontSize: 13, color: theme.colors.errorText },

  heroCard: { marginBottom: theme.spacing.lg, overflow: 'hidden' },
  heroBgSoftGlow: {
    position: 'absolute',
    left: -80,
    top: -80,
    width: 220,
    height: 220,
    borderRadius: 999,
    backgroundColor: 'rgba(160,220,255,0.10)',
  },
  heroBgHorizon: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -20,
    height: 120,
    backgroundColor: 'rgba(255, 190, 120, 0.05)',
  },

  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTemp: { fontSize: 64, fontWeight: '900', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, marginTop: 4 },
  heroSummary: { marginTop: 8, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  heroRight: { alignItems: 'flex-end' },
  heroMiniLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  heroMiniValue: { fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary },

  // ===== Header hero surface =====
  headerHeroWrap: {
    marginBottom: theme.spacing.lg,
    position: 'relative',
  },

  headerHeroSurface: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },

  headerHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  headerHeroBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },

  // ✅ Bigger Omni logo
  headerHeroLogo: {
    width: 92,
    height: 92,
    backgroundColor: 'transparent',
  },

  headerHeroLocation: {
    flex: 1,
    minWidth: 0,
  },

  headerHeroActions: {
    alignItems: 'flex-end',
    gap: 10,
    flexShrink: 0,
  },

  headerHeroBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },

  headerHeroLabHint: {
    marginLeft: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(160, 220, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200, 240, 255, 0.18)',
  },

  headerHeroLabHintText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
  },

  statTile: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tileLabel: {
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '900',
  },
  tileValue: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '900',
    color: 'white',
  },
  tileHint: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.38)',
  },

  updatedText: { ...typography.small, marginTop: theme.spacing.md, opacity: 0.8 },

  forecastCard: { marginBottom: theme.spacing.lg },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 10 },

  // ✅ Hourly card on Land
  hourlyCard: { marginBottom: theme.spacing.lg },
  hourlyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  hourlyFullBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  hourlyFullText: { color: 'rgba(255,255,255,0.75)', fontWeight: '900', fontSize: 12 },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 80,
    bottom: 40,
    borderRadius: 22,
    backgroundColor: 'rgba(18, 22, 35, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    padding: 14,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: 'white', fontSize: 16, fontWeight: '900' },
  modalCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  modalCloseText: { color: 'white', fontWeight: '900', fontSize: 12 },
  modalActive: { marginTop: 10, color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  currentBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  currentBtnText: { color: 'white', fontWeight: '900' },

  searchInput: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    color: 'white',
  },

  modalSection: { marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.85)' },
  modalError: { marginTop: 8, fontSize: 12, color: '#FFB4B4', fontWeight: '800' },

  pickRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
  },
  pickTitle: { color: 'white', fontWeight: '900' },
  pickSub: { marginTop: 2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
});