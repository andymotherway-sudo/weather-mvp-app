// app/(tabs)/index.tsx
// Land Wx – Rich + Nerdy
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useCurrentWeather } from '../lib/weather/hooks';
import { DEFAULT_LOCATION } from '../lib/weather/locations';

import type { FavoriteLocation } from '../lib/locations/favorites';
import { geocodePlaces } from '../lib/locations/geocode';
import { useLocations } from '../lib/locations/useLocations';

import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { ModeToggle } from '../../components/common/ModeToggle';
import { NerdyExplainModal, type ExplainPayload } from '../../components/common/NerdyExplainModal';
import { NerdyInsightsCard } from '../../components/land/NerdyInsightsCard';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

import { buildNerdyInsights, type NerdyInsight } from '../lib/land/nerdyInsights';
import { dewPointBandF, gustFactor, heatIndexF, windChillF } from '../lib/land/nerdyMath';

import { AlertBanner } from '../../components/alerts/AlertBanner';
import { useNwsAlerts } from '../lib/alerts/useNwsAlerts';

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

type TopPanelId = 'now' | 'wind' | 'moisture' | 'sky' | 'extras';

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

function WindRow({
  windMph,
  gustMph,
  windDirDeg,
}: {
  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
}) {
  const dir = dirToCompass(windDirDeg);
  const dirText = windDirDeg != null ? `${dir ?? ''} ${Math.round(windDirDeg)}°`.trim() : '—';
  const windText = windMph != null ? `${Math.round(windMph)} mph` : '—';
  const gustText = gustMph != null ? `${Math.round(gustMph)} mph` : '—';

  return (
    <View style={styles.windRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.windLabel}>Wind</Text>
        <Text style={styles.windValue}>
          {windText} <Text style={{ opacity: 0.6 }}>→</Text> Gust {gustText}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.windLabel}>Dir</Text>
        <Text style={styles.windValue}>{dirText}</Text>
      </View>
    </View>
  );
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

  const resRows: Array<{ key: string; title: string; sub: string; onPress: () => void }> = (results ?? []).map((item) => ({
    key: item.id,
    title: formatLocLabel(item),
    sub: `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
    onPress: () => onPick(item),
  }));

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

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function RowKV({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  const body = (
    <View style={styles.rowKV}>
      <Text style={styles.rowKVLabel}>{label}</Text>
      <Text style={styles.rowKVValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={{ width: '100%' }}>
      {body}
    </Pressable>
  );
}

export default function LandWeatherScreen() {
  const [mode, setMode] = useState<'simple' | 'nerdy'>('simple');
  const [topPanel, setTopPanel] = useState<TopPanelId>('now');
  
  const [pickerOpen, setPickerOpen] = useState(false);

  // Explain + Learn system
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const units: UnitSystem = 'us';

  const { activeCoords, activeLabel, state: locState, refreshCurrentLocation, addOrActivateFavorite, setActiveCurrent } =
    useLocations();

  // Only fetch current GPS if we're on "current" (prevents fighting with a selected favorite)
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

  const { primary, alerts } = useNwsAlerts({
  lat: coords.lat,
  lon: coords.lon,
  enabled: true, // or make this conditional if you ever allow coords to be null
  });

  const onPressAlert = () => {
    // Phase 1: quick details route or modal
    // router.push({ pathname: '/alert', params: { id: primary?.id } });
    setExplainPayload(null); // optional; ignore
  };

  const isFavorited = useMemo(() => {
    const favs = locState.favorites ?? [];
    return favs.some((f) => near(f.lat, coords.lat) && near(f.lon, coords.lon));
  }, [locState.favorites, coords.lat, coords.lon]);

  const { data: currentData, loading: currentLoading, error: currentError, refreshing: currentRefreshing, refresh: currentRefresh } =
    useCurrentWeather({
      lat: coords.lat,
      lon: coords.lon,
      units: 'imperial',
    } as any);

  const { data: forecastData, loading: forecastLoading, error: forecastError, refreshing: forecastRefreshing, refresh: forecastRefresh } =
    useOpenMeteoForecast({
      lat: coords.lat,
      lon: coords.lon,
      days: 15,
    });

  const loading = currentLoading || (mode === 'nerdy' && forecastLoading);
  const refreshing = currentRefreshing || forecastRefreshing;

  const onRefresh = () => {
    currentRefresh?.();
    forecastRefresh?.();
  };

  // --- Normalize current (defensive) ---
  const wx: any = currentData ?? {};

  const tempF = safeNum(wx.temperatureF ?? wx.temp_f ?? wx.temperature ?? wx.temp);
  const feelsLikeF = safeNum(wx.apparentTemperatureF ?? wx.feels_like_f ?? wx.feels_like);

  const dewpointF = safeNum(wx.dewpointF ?? wx.dewpoint_f ?? wx.dew_point);
  const humidityPct = safeNum(wx.relativeHumidity ?? wx.humidity);

  const windMph = safeNum(wx.windSpeedMph ?? wx.wind_speed_mph ?? wx.windSpeed);
  const gustMph = safeNum(wx.windGustMph ?? wx.wind_gust_mph ?? wx.windGust ?? wx.gust);
  const windDirDeg = safeNum(wx.windDirection ?? wx.wind_dir ?? wx.wind_direction);

  const precipChancePct = safeNum(wx.precipChancePct ?? wx.precip_probability ?? wx.precipProb ?? wx.pop);
  const cloudCoverPct = safeNum(wx.cloudCoverPct ?? wx.cloud_cover ?? wx.cloudCover);

  const pressureHpa = safeNum(wx.pressureHpa ?? wx.pressure_hpa ?? wx.pressure);
  const visibilityMi = safeNum(wx.visibilityMi ?? wx.visibility_mi ?? wx.visibility);
  const uvIndex = safeNum(wx.uvIndex ?? wx.uv_index ?? wx.uv);

  const condition = wx.shortForecast ?? wx.condition ?? wx.textDescription ?? wx.weather ?? '—';
  const observationTime: string | null = wx.observedAt ?? wx.timestamp ?? wx.datetime ?? null;

  // --- Derived nerdy metrics ---
  const dpBand = dewpointF == null ? null : dewPointBandF(dewpointF);
  const hi = tempF != null && humidityPct != null ? heatIndexF(tempF, humidityPct) : null;
  const wc = tempF != null && windMph != null ? windChillF(tempF, windMph) : null;
  const gf = gustFactor(windMph, gustMph);
  const spreadF = tempF != null && dewpointF != null ? tempF - dewpointF : null;

  const daily = (forecastData?.daily ?? []).slice(0, 15);
  const hourly = forecastData?.hourly ?? []; // still used for nerdy insights only

  const insights: NerdyInsight[] = useMemo(() => {
    return buildNerdyInsights({ tempF, dewpointF, humidityPct, windMph, gustMph, hourly });
  }, [tempF, dewpointF, humidityPct, windMph, gustMph, hourly]);

  const onAddFavorite = () => {
    if (isFavorited) return;
    addOrActivateFavorite(locationLabel, coords.lat, coords.lon);
  };

  // ✅ NEW: selecting a location sets it globally (Hourly/Climo follow)
  const onPickLocation = (loc: SavedLocation) => {
    const label = formatLocLabel(loc);
    addOrActivateFavorite(label, loc.lat, loc.lon);
    setPickerOpen(false);
  };

  const onPickCurrent = () => {
    setActiveCurrent();
    refreshCurrentLocation();
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

  const observedExtrasMissing = pressureHpa == null && visibilityMi == null && uvIndex == null;

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            { paddingTop: Math.max(theme.spacing.md, insets.top * 0.25) },
          ]}
          refreshControl={<RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.appTitle}>Land Wx</Text>

              <View style={styles.locationRow}>
                <Pressable onPress={() => setPickerOpen(true)} style={styles.locationTap}>
                  <Text style={styles.appSubtitle} numberOfLines={1}>
                    {locationLabel}
                  </Text>
                  <Text style={styles.locationHint} numberOfLines={1}>
                    Tap to search • view favorites
                  </Text>
                </Pressable>

                <Pressable onPress={onAddFavorite} disabled={isFavorited} style={[styles.starBtn, isFavorited && { opacity: 0.5 }]}>
                  <Text style={styles.starText}>{isFavorited ? '★' : '☆'}</Text>
                </Pressable>
              </View>

              <View style={styles.quickNavRow}>
                <Pressable onPress={() => router.push('/hourly')} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Hourly</Text>
                </Pressable>

                <Pressable onPress={() => router.push('/climo')} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Climo</Text>
                </Pressable>

                {mode === 'nerdy' ? (
                  <Pressable onPress={() => router.push('/maplibre-test')} style={styles.quickNavBtn}>
                    <Text style={styles.quickNavText}>MapLibre</Text>
                  </Pressable>
                ) : null}
              </View>

              {mode === 'nerdy' ? (
                <View style={styles.nerdyBannerRow}>
                  <View style={styles.nerdyPill}>
                    <Text style={styles.nerdyPillText}>NERDY MODE</Text>
                  </View>
                  <Text style={styles.nerdyBannerHint} numberOfLines={1}>
                    Panels + explainers • no hourly here
                  </Text>
                </View>
              ) : null}
            </View>

            <ModeToggle mode={mode} onChange={(m) => setMode(m)} />
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

          {(currentError || forecastError) ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorText}>{currentError || forecastError}</Text>
            </Card>
          ) : null}

          <Card style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTemp}>{tempF != null ? `${Math.round(tempF)}°` : '—'}</Text>
                <Text style={styles.heroCondition}>{condition}</Text>
              </View>

              <View style={styles.heroRight}>
                <Text style={styles.heroMiniLabel}>Feels</Text>
                <Text style={styles.heroMiniValue}>{feelsLikeF != null ? `${Math.round(feelsLikeF)}°` : '—'}</Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
              <Pill label="Now" active={topPanel === 'now'} onPress={() => setTopPanel('now')} />
              <Pill label="Wind" active={topPanel === 'wind'} onPress={() => setTopPanel('wind')} />
              <Pill label="Moisture" active={topPanel === 'moisture'} onPress={() => setTopPanel('moisture')} />
              <Pill label="Sky" active={topPanel === 'sky'} onPress={() => setTopPanel('sky')} />
              <Pill label="Extras" active={topPanel === 'extras'} onPress={() => setTopPanel('extras')} />
            </ScrollView>

            <View style={{ marginTop: theme.spacing.sm }}>
              {topPanel === 'now' ? (
                <View style={styles.panelBox}>
                  <RowKV
                    label="Dew • RH"
                    value={`${dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'} • ${humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}`}
                    onPress={() =>
                      openQuickExplain({
                        title: 'Dew point (and humidity)',
                        summary: 'Dew point is an absolute measure of moisture. RH is relative to temperature.',
                        whyItMatters: 'Dew point tracks comfort, fog potential, and overnight lows better than RH alone.',
                        howComputed: 'Dew point and RH come from your current conditions source when available.',
                        confidence: dewpointF != null ? 'high' : humidityPct != null ? 'medium' : undefined,
                        learnTopicId: 'dewpoint',
                      })
                    }
                  />
                  <RowKV
                    label={feelsDriver.label}
                    value={feelsDriver.value}
                    onPress={() =>
                      openQuickExplain({
                        title: feelsDriver.label,
                        summary:
                          hi != null
                            ? 'Heat Index estimates perceived heat when humidity reduces evaporative cooling.'
                            : wc != null
                              ? 'Wind Chill estimates perceived cold when wind increases heat loss.'
                              : 'Feels-like is a source apparent temperature estimate.',
                        whyItMatters: '“Feels” metrics often match comfort/hazard thresholds better than air temp alone.',
                        howComputed:
                          hi != null ? 'Heat Index uses temperature and RH.' : wc != null ? 'Wind Chill uses temperature and wind speed.' : 'Provided by your current source.',
                        confidence: feelsDriver.conf,
                        learnTopicId: hi != null ? 'heat-index' : wc != null ? 'wind-chill' : 'apparent-temp',
                      })
                    }
                  />
                  <RowKV
                    label="POP"
                    value={precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}
                    onPress={() =>
                      openQuickExplain({
                        title: 'POP (Probability of Precip)',
                        summary: 'The chance of measurable precipitation at a point.',
                        whyItMatters: 'Great for planning, but it doesn’t mean intensity.',
                        howComputed: 'Provided by the current conditions source when available.',
                        confidence: precipChancePct != null ? 'medium' : undefined,
                        learnTopicId: 'pop',
                      })
                    }
                  />
                </View>
              ) : null}

              {topPanel === 'wind' ? (
                <View style={styles.panelBox}>
                  <WindRow windMph={windMph} gustMph={gustMph} windDirDeg={windDirDeg} />
                  <RowKV label="Gust factor" value={gf != null ? gf.toFixed(2) : '—'} />
                </View>
              ) : null}

              {topPanel === 'moisture' ? (
                <View style={styles.panelBox}>
                  <RowKV label="Dew point band" value={dpBand ?? '—'} />
                  <RowKV label="Spread (T − Td)" value={spreadF != null ? `${Math.round(spreadF)}°F` : '—'} />
                  <RowKV label="RH" value={humidityPct != null ? `${Math.round(humidityPct)}%` : '—'} />
                </View>
              ) : null}

              {topPanel === 'sky' ? (
                <View style={styles.panelBox}>
                  <RowKV label="Cloud cover" value={cloudCoverPct != null ? `${Math.round(cloudCoverPct)}%` : '—'} />
                  <RowKV label="UV Index" value={uvIndex != null ? fmt(uvIndex, 1) : '—'} />
                </View>
              ) : null}

              {topPanel === 'extras' ? (
                <View style={styles.panelBox}>
                  {observedExtrasMissing ? (
                    <View style={styles.availabilityBox}>
                      <Text style={styles.availabilityTitle}>No observed extras from this source</Text>
                      <Text style={styles.availabilitySub}>
                        Pressure / UV / Visibility aren’t included in the current feed right now.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <RowKV label="Pressure" value={pressureHpa != null ? `${fmt(pressureHpa)} hPa` : '—'} />
                      <RowKV label="Visibility" value={visibilityMi != null ? `${fmt(visibilityMi, 1)} mi` : '—'} />
                      <RowKV label="UV Index" value={uvIndex != null ? fmt(uvIndex, 1) : '—'} />
                    </>
                  )}
                </View>
              ) : null}
            </View>

            <Text style={styles.updatedText}>Observed {observationTime ? new Date(observationTime).toLocaleTimeString() : '—'}</Text>
          </Card>

          {mode === 'nerdy' ? (
            <NerdyInsightsCard
              insights={insights}
              onPressInsight={onPressInsight}
              onPressLearn={() => {
                setLearnTopicId(undefined);
                setLearnOpen(true);
              }}
            />
          ) : null}

          {daily.length > 0 ? (
            <Card style={styles.forecastCard}>
              <Text style={styles.cardTitle}>{mode === 'nerdy' ? 'Daily (Model Blend)' : '15-Day Outlook'}</Text>

              {daily.map((d: any) => {
                const date = new Date(d.date);
                const day = date.toLocaleDateString(undefined, { weekday: 'short' });

                if (mode !== 'nerdy') {
                  return (
                    <View style={styles.forecastRow} key={d.date}>
                      <Text style={styles.forecastDay}>{day}</Text>
                      <Text style={styles.forecastTemps}>
                        {d.tempMaxF != null ? Math.round(d.tempMaxF) : '—'}° / {d.tempMinF != null ? Math.round(d.tempMinF) : '—'}°
                      </Text>
                      <Text style={styles.forecastMeta}>{d.precipProbMaxPct != null ? `${Math.round(d.precipProbMaxPct)}%` : '—'}</Text>
                    </View>
                  );
                }

                return (
                  <View style={styles.dailyNerdyRow} key={d.date}>
                    <View style={styles.dailyLeft}>
                      <Text style={styles.forecastDay}>{day}</Text>
                      <Text style={styles.dailySub}>
                        DP max {d.dewPointMaxF != null ? `${Math.round(d.dewPointMaxF)}°` : '—'} · ☁︎ {d.cloudCoverAvgPct != null ? `${Math.round(d.cloudCoverAvgPct)}%` : '—'}
                      </Text>
                    </View>

                    <View style={styles.dailyRight}>
                      <Text style={styles.dailyMain}>
                        {d.tempMaxF != null ? Math.round(d.tempMaxF) : '—'}° / {d.tempMinF != null ? Math.round(d.tempMinF) : '—'}°
                      </Text>
                      <Text style={styles.dailySubRight}>
                        POP {d.precipProbMaxPct != null ? `${Math.round(d.precipProbMaxPct)}%` : '—'} · G {d.windGustMaxMph != null ? `${Math.round(d.windGustMaxMph)}mph` : '—'}
                      </Text>
                    </View>
                  </View>
                );
              })}

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
    </>
  );
}

// (styles unchanged from your file)
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: 12,
  },
  appTitle: { ...typography.title },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationTap: { flex: 1 },
  appSubtitle: { ...typography.subtitle },
  locationHint: { fontSize: 12, opacity: 0.55, marginTop: 2, color: theme.colors.textSecondary },

  quickNavRow: { marginTop: 10, flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  quickNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  quickNavText: { color: 'white', fontWeight: '900', fontSize: 12 },

  nerdyBannerRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  nerdyPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(200, 240, 255, 0.20)',
    backgroundColor: 'rgba(160, 220, 255, 0.08)',
  },
  nerdyPillText: { color: 'white', fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
  nerdyBannerHint: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '700' },

  starBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  starText: { color: 'white', fontWeight: '900', fontSize: 14 },

  center: { marginTop: theme.spacing['2xl'], alignItems: 'center' },
  smallText: { ...typography.small, marginTop: theme.spacing.sm },

  errorCard: { backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBg, marginBottom: theme.spacing.lg },
  errorTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.errorText, marginBottom: 4 },
  errorText: { fontSize: 13, color: theme.colors.errorText },

  heroCard: { marginBottom: theme.spacing.lg },
  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTemp: { fontSize: 64, fontWeight: '800', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 18, fontWeight: '600', color: theme.colors.textPrimary, marginTop: 4 },
  heroRight: { alignItems: 'flex-end' },
  heroMiniLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary },
  heroMiniValue: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary },

  pillRow: { gap: 10, paddingTop: 12, paddingBottom: 6 },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pillActive: { borderColor: 'rgba(200,240,255,0.30)', backgroundColor: 'rgba(160,220,255,0.10)' },
  pillText: { color: 'rgba(255,255,255,0.78)', fontWeight: '900', fontSize: 12 },
  pillTextActive: { color: 'white' },

  panelBox: { paddingTop: 6, gap: 10 },

  rowKV: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowKVLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  rowKVValue: { marginTop: 6, fontSize: 16, fontWeight: '900', color: theme.colors.textPrimary },

  windRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  windLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary },
  windValue: { marginTop: 4, fontSize: 14, fontWeight: '800', color: theme.colors.textPrimary },

  availabilityBox: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  availabilityTitle: { color: 'white', fontWeight: '900', fontSize: 13 },
  availabilitySub: { marginTop: 6, color: 'rgba(255,255,255,0.65)', fontWeight: '700', fontSize: 12, lineHeight: 17 },

  updatedText: { ...typography.small, marginTop: theme.spacing.md },

  forecastCard: { marginBottom: theme.spacing.lg },
  cardTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 10 },

  forecastRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  forecastDay: { fontSize: 12, color: '#CBD5F5', width: 60 },
  forecastTemps: { fontSize: 12, color: theme.colors.textPrimary, flex: 1 },
  forecastMeta: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'right', width: 70 },

  dailyNerdyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  dailyLeft: { flex: 1 },
  dailyRight: { alignItems: 'flex-end' },
  dailyMain: { fontSize: 12, color: theme.colors.textPrimary, fontWeight: '700' },
  dailySub: { marginTop: 2, fontSize: 11, opacity: 0.75, color: theme.colors.textSecondary },
  dailySubRight: { marginTop: 2, fontSize: 11, opacity: 0.75, color: theme.colors.textSecondary },

  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalSheet: { position: 'absolute', left: 12, right: 12, top: 80, bottom: 40, borderRadius: 22, backgroundColor: 'rgba(18, 22, 35, 0.98)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', padding: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { color: 'white', fontSize: 16, fontWeight: '900' },
  modalCloseBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  modalCloseText: { color: 'white', fontWeight: '900', fontSize: 12 },
  modalActive: { marginTop: 10, color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  currentBtn: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  currentBtnText: { color: 'white', fontWeight: '900' },

  searchInput: { marginTop: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', color: 'white' },

  modalSection: { marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: '900', color: 'rgba(255,255,255,0.85)' },
  modalError: { marginTop: 8, fontSize: 12, color: '#FFB4B4', fontWeight: '800' },

  pickRow: { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 8 },
  pickTitle: { color: 'white', fontWeight: '900' },
  pickSub: { marginTop: 2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
});
