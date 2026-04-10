// app/(tabs)/index.tsx
// Land Wx – Rich + Nerdy (Branded + Alpha polish)
// ✅ Drop-in replacement
// ✅ Compresses header so current conditions sit higher
// ✅ Simple mode shows vertical 15-day forecast list
// ✅ Wx Lab shows daily chart + insights + hourly chart
// ✅ Keeps location picker, alerts, video bg, favorites, explain + learn modals
// ✅ Nerdy education taps now go straight to LearnMoreModal

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

import type { FavoriteLocation } from '../lib/locations/favorites';
import { formatCompactLocation } from '../lib/locations/formats';
import { geocodePlaces } from '../lib/locations/geocode';
import { useLocations } from '../lib/locations/useLocations';

import { Ionicons } from '@expo/vector-icons';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { NerdyExplainModal, type ExplainPayload } from '../../components/common/NerdyExplainModal';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

import { dewPointBandF, gustFactor, heatIndexF, windChillF } from '../lib/land/nerdyMath';

import { AlertBanner } from '../../components/alerts/AlertBanner';
import { useNwsAlerts } from '../lib/alerts/useNwsAlerts';

import { DailyRangeChart } from '../../components/land/DailyRangeChart';
import { HourlyCharts72h } from '../../components/land/HourlyCharts72h';

import WeatherVideoBackground from '../../components/background/WeatherVideoBackground';
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

function hpaToInHg(hpa: number) {
  return hpa * 0.029529983071445;
}

function findClosestHour(hours: any[], targetMs: number) {
  let best: any = null;
  let bestDt = Infinity;

  for (const h of hours ?? []) {
    const t = new Date(h.time ?? h.datetime ?? h.date ?? '').getTime();
    if (!Number.isFinite(t)) continue;

    const dt = Math.abs(t - targetMs);
    if (dt < bestDt) {
      bestDt = dt;
      best = h;
    }
  }

  return best;
}

function pressureTrendFromHourly(hours: any[]) {
  const nowMs = Date.now();
  const now = findClosestHour(hours, nowMs);
  const past = findClosestHour(hours, nowMs - 3 * 60 * 60 * 1000);

  const pNow =
    safeNum(now?.pressureHpa ?? now?.pressure_msl ?? now?.pressureMslHpa ?? now?.pressure_hpa ?? now?.pressure) ?? null;
  const pPast =
    safeNum(
      past?.pressureHpa ?? past?.pressure_msl ?? past?.pressureMslHpa ?? past?.pressure_hpa ?? past?.pressure
    ) ?? null;

  if (pNow == null || pPast == null) {
    return { arrow: '→' as const, deltaHpa: null as number | null, label: 'Steady' as const };
  }

  const delta = pNow - pPast;

  if (delta >= 1.5) return { arrow: '↑' as const, deltaHpa: delta, label: 'Rising' as const };
  if (delta <= -1.5) return { arrow: '↓' as const, deltaHpa: delta, label: 'Falling' as const };
  return { arrow: '→' as const, deltaHpa: delta, label: 'Steady' as const };
}

type FavoriteWeatherPreview = {
  emoji: string;
  condition: string;
  hi: number | null;
  lo: number | null;
};

const FAVORITE_PREVIEW_TTL_MS = 10 * 60 * 1000;

const favoritePreviewCache = new Map<
  string,
  {
    expiresAt: number;
    data: FavoriteWeatherPreview;
  }
>();

function favoritePreviewKey(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function weatherCodeToEmoji(code: number | null): string {
  if (code == null) return '🌤️';
  if (code === 0) return '☀️';
  if (code === 1) return '🌤️';
  if (code === 2) return '⛅';
  if (code === 3) return '☁️';
  if (code === 45 || code === 48) return '🌫️';
  if ([51, 53, 55, 56, 57].includes(code)) return '🌦️';
  if ([61, 63, 65, 66, 67].includes(code)) return '🌧️';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '❄️';
  if ([80, 81, 82].includes(code)) return '🌦️';
  if ([95, 96, 99].includes(code)) return '⛈️';
  return '☁️';
}

function weatherCodeToLabel(code: number | null): string {
  if (code == null) return 'Weather';
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Cloudy';
}

function formatDailyLabel(dateValue: any) {
  const raw = typeof dateValue === 'string' ? dateValue : '';
  if (!raw) return 'Day';

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const d = new Date(year, month - 1, day, 12, 0, 0);

    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
    });
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;

  return d.toLocaleDateString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  });
}

async function fetchFavoriteWeatherPreview(lat: number, lon: number): Promise<FavoriteWeatherPreview> {
  const key = favoritePreviewKey(lat, lon);
  const cached = favoritePreviewCache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&current=weather_code` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
    `&forecast_days=1` +
    `&temperature_unit=fahrenheit` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    return {
      emoji: '🌤️',
      condition: 'Weather',
      hi: null,
      lo: null,
    };
  }

  const data = await res.json();

  const currentCode = safeNum(data?.current?.weather_code);
  const dailyCode = safeNum(data?.daily?.weather_code?.[0]);
  const code = currentCode ?? dailyCode ?? null;

  const hi = safeNum(data?.daily?.temperature_2m_max?.[0]);
  const lo = safeNum(data?.daily?.temperature_2m_min?.[0]);

  const preview: FavoriteWeatherPreview = {
    emoji: weatherCodeToEmoji(code),
    condition: weatherCodeToLabel(code),
    hi,
    lo,
  };

  favoritePreviewCache.set(key, {
    expiresAt: Date.now() + FAVORITE_PREVIEW_TTL_MS,
    data: preview,
  });

  return preview;
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
  const [favoriteWeather, setFavoriteWeather] = useState<Record<string, FavoriteWeatherPreview>>({});
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

    let cancelled = false;

    const loadFavoriteWeather = async () => {
      const favs = favorites ?? [];
      if (!favs.length) {
        setFavoriteWeather({});
        return;
      }

      try {
        const entries = await Promise.all(
          favs.map(async (fav) => {
            try {
              const preview = await fetchFavoriteWeatherPreview(fav.lat, fav.lon);
              return [fav.id, preview] as const;
            } catch {
              return [
                fav.id,
                {
                  emoji: '🌤️',
                  condition: 'Weather',
                  hi: null,
                  lo: null,
                } satisfies FavoriteWeatherPreview,
              ] as const;
            }
          })
        );

        if (!cancelled) {
          setFavoriteWeather(Object.fromEntries(entries));
        }
      } catch {
        if (!cancelled) setFavoriteWeather({});
      }
    };

    loadFavoriteWeather();

    return () => {
      cancelled = true;
    };
  }, [visible, favorites]);

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

  const queryActive = q.trim().length > 0;

  const favRows: Array<any> = (favorites ?? []).map((item) => {
    const preview = favoriteWeather[item.id];

    return {
      key: item.id,
      kind: 'favorite',
      title: item.name,
      sub: preview?.condition ?? `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
      emoji: preview?.emoji ?? '🌤️',
      hi: preview?.hi ?? null,
      lo: preview?.lo ?? null,
      onPress: () =>
        onPick({
          id: item.id,
          name: item.name,
          lat: item.lat,
          lon: item.lon,
        }),
    };
  });

  const resRows: Array<any> = (results ?? []).map((item) => ({
    key: item.id,
    kind: 'result',
    title: formatLocLabel(item),
    sub: `${item.lat.toFixed(3)}, ${item.lon.toFixed(3)}`,
    onPress: () => onPick(item),
  }));

  const sections = useMemo(() => {
    const out: Array<{ title: string; data: any[] }> = [];

    if (queryActive) {
      out.push({
        title: 'Search results',
        data: resRows.length
          ? resRows
          : [{ key: 'nomatch', kind: 'empty', title: 'No matches', sub: 'Try a different query.', onPress: () => {} }],
      });

      out.push({
        title: 'Favorites',
        data: favRows.length
          ? favRows
          : [{ key: 'nofavs', kind: 'empty', title: 'No favorites yet', sub: 'Star a place to save it.', onPress: () => {} }],
      });
    } else {
      out.push({
        title: 'Favorites',
        data: favRows.length
          ? favRows
          : [{ key: 'nofavs', kind: 'empty', title: 'No favorites yet', sub: 'Star a place to save it.', onPress: () => {} }],
      });

      out.push({
        title: 'Search',
        data: [{ key: 'type', kind: 'empty', title: 'Start typing to search', sub: 'City, state, country…', onPress: () => {} }],
      });
    }

    return out;
  }, [favRows, resRows, queryActive]);

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
          renderItem={({ item }: any) => {
            const isEmpty = item.kind === 'empty';

            if (item.kind === 'favorite') {
              return (
                <Pressable onPress={item.onPress} style={styles.favoritePickRow}>
                  <View style={styles.favoriteEmojiBadge}>
                    <Text style={styles.favoriteEmoji}>{item.emoji}</Text>
                  </View>

                  <View style={styles.favoriteMain}>
                    <Text style={styles.favoriteTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.favoriteSub} numberOfLines={1}>
                      {item.sub}
                    </Text>
                  </View>

                  <View style={styles.favoriteTempBlock}>
                    <Text style={styles.favoriteHi}>{item.hi != null ? `${Math.round(item.hi)}°` : '—'}</Text>
                    <Text style={styles.favoriteLo}>{item.lo != null ? `${Math.round(item.lo)}°` : '—'}</Text>
                  </View>
                </Pressable>
              );
            }

            return (
              <Pressable
                onPress={item.onPress}
                style={[styles.pickRow, isEmpty && { opacity: 0.75 }]}
                disabled={isEmpty}
              >
                <Text style={styles.pickTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.pickSub} numberOfLines={1}>
                  {item.sub}
                </Text>
              </Pressable>
            );
          }}
          style={{ flex: 1, marginTop: 8 }}
          keyboardShouldPersistTaps="handled"
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

function SimpleSummary({
  dewpointF,
  humidityPct,
  windMph,
  gustMph,
  windDirDeg,
  precipChancePct,
  visibilityMi,
  pressureHpa,
  pressureInHg,
  pressureTrend,
  narrative,
  hideWind,
}: {
  dewpointF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  gustMph: number | null;
  windDirDeg: number | null;
  precipChancePct: number | null;
  visibilityMi: number | null;
  pressureHpa: number | null;
  pressureInHg: number | null;
  pressureTrend: { arrow: '↑' | '↓' | '→'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null };
  narrative?: string;
  hideWind?: boolean;
}) {
  const hasMoisture = dewpointF != null || humidityPct != null;
  const hasWind = !hideWind && (windMph != null || gustMph != null || windDirDeg != null);
  const hasPrecipVis = precipChancePct != null || visibilityMi != null || pressureHpa != null || pressureInHg != null;

  const dirToCompassLocal = (deg: number | null) => {
    if (deg == null) return null;
    const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const idx = Math.round(((deg % 360) / 22.5)) % 16;
    return dirs[idx];
  };

  const windDirText = windDirDeg != null ? `${dirToCompassLocal(windDirDeg) ?? ''}`.trim() : '—';
  const fmt0 = (v: number | null, suffix = '') => (v == null ? '—' : `${Math.round(v)}${suffix}`);
  const fmt1 = (v: number | null, suffix = '') => (v == null ? '—' : `${v.toFixed(1)}${suffix}`);

  const pressurePrimary =
    pressureInHg != null ? `${pressureInHg.toFixed(2)} inHg` : pressureHpa != null ? `${fmt0(pressureHpa)} hPa` : '—';

  const trendLine =
    pressureHpa != null
      ? `${fmt0(pressureHpa)} hPa ${pressureTrend.arrow} ${pressureTrend.label}`
      : pressureTrend.deltaHpa != null
        ? `${pressureTrend.arrow} ${pressureTrend.label}`
        : undefined;

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
                {windMph != null ? `${Math.round(windMph)} mph` : '—'}{' '}
                <Text style={{ opacity: 0.7 }}>{windDirText}</Text>
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
              <Text style={ss.k}>Precip</Text>
              <Text style={ss.v}>{precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Vis</Text>
              <Text style={ss.v}>{visibilityMi != null ? fmt1(visibilityMi, ' mi') : '—'}</Text>
            </View>
            <View style={ss.cell}>
              <Text style={ss.k}>Pressure</Text>
              <Text style={ss.v}>
                {pressurePrimary} <Text style={{ opacity: 0.8 }}>{pressureTrend.arrow}</Text>
              </Text>
              {trendLine ? <Text style={ss.note}>{trendLine}</Text> : null}
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function DailyForecastList({
  daily,
  hourly,
  maxDays = 15,
}: {
  daily: any[];
  hourly?: any[];
  maxDays?: number;
}) {
  const rows = (daily ?? []).slice(0, maxDays);
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null);

  if (!rows.length) return null;

  const toggleRow = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  const fmtWind = (v: number | null) => (v != null ? `${Math.round(v)} mph` : '—');

  const getIsoDateKey = (raw: any) => {
    const s = typeof raw === 'string' ? raw : '';
    if (!s) return '';
    return s.slice(0, 10);
  };

  const getHour = (raw: any) => {
    const s = typeof raw === 'string' ? raw : '';
    if (!s || s.length < 13) return null;
    const h = Number(s.slice(11, 13));
    return Number.isFinite(h) ? h : null;
  };

  const hourConditionLabel = (h: any) => {
    const code =
      safeNum(h?.weatherCode ?? h?.weather_code ?? h?.weathercode ?? h?.condition_code ?? h?.code) ?? null;
    return weatherCodeToLabel(code);
  };

  const hourPop = (h: any) =>
    safeNum(h?.precipitation_probability ?? h?.precipProbPct ?? h?.precipChancePct ?? h?.pop) ?? null;

  const hourWind = (h: any) =>
    safeNum(h?.windMph ?? h?.windSpeedMph ?? h?.wind_speed_mph ?? h?.windSpeed ?? h?.wind) ?? null;

  const hourGust = (h: any) =>
    safeNum(h?.gustMph ?? h?.windGustMph ?? h?.wind_gust_mph ?? h?.gust ?? h?.windGust) ?? null;

  const hourTemp = (h: any) =>
    safeNum(h?.tempF ?? h?.temperatureF ?? h?.temperature_2m ?? h?.temperature ?? h?.temp) ?? null;

  const summarizeBlock = (block: any[], label: 'Day' | 'Night') => {
    if (!block.length) {
      return {
        label,
        condition: '—',
        pop: null as number | null,
        wind: null as number | null,
        gust: null as number | null,
        tempMin: null as number | null,
        tempMax: null as number | null,
        narrative: `${label} details unavailable.`,
      };
    }

    const pops = block.map(hourPop).filter((v): v is number => v != null);
    const winds = block.map(hourWind).filter((v): v is number => v != null);
    const gusts = block.map(hourGust).filter((v): v is number => v != null);
    const temps = block.map(hourTemp).filter((v): v is number => v != null);

    const conditionCounts = new Map<string, number>();
    for (const h of block) {
      const c = hourConditionLabel(h);
      conditionCounts.set(c, (conditionCounts.get(c) ?? 0) + 1);
    }

    let dominantCondition = '—';
    let dominantCount = -1;
    for (const [cond, count] of conditionCounts.entries()) {
      if (count > dominantCount) {
        dominantCondition = cond;
        dominantCount = count;
      }
    }

    const pop = pops.length ? Math.max(...pops) : null;
    const wind = winds.length ? Math.max(...winds) : null;
    const gust = gusts.length ? Math.max(...gusts) : null;
    const tempMin = temps.length ? Math.min(...temps) : null;
    const tempMax = temps.length ? Math.max(...temps) : null;

    const phrases: string[] = [];

    if (dominantCondition !== '—') {
      if (dominantCondition === 'Clear') phrases.push(label === 'Day' ? 'Bright and clear' : 'Clear skies');
      else if (dominantCondition === 'Mostly clear') phrases.push(label === 'Day' ? 'Mostly sunny' : 'Mostly clear');
      else if (dominantCondition === 'Partly cloudy') phrases.push('Partly cloudy');
      else if (dominantCondition === 'Overcast') phrases.push('Cloudy');
      else if (dominantCondition === 'Rain') phrases.push('Rain likely');
      else if (dominantCondition === 'Showers') phrases.push('Showers around');
      else if (dominantCondition === 'Drizzle') phrases.push('Light drizzle possible');
      else if (dominantCondition === 'Snow') phrases.push('Snow possible');
      else if (dominantCondition === 'Thunderstorm') phrases.push('Storms possible');
      else if (dominantCondition === 'Fog') phrases.push('Fog possible');
      else phrases.push(dominantCondition);
    }

    if (pop != null) {
      if (pop >= 70) phrases.push('high precip chance');
      else if (pop >= 40) phrases.push('some precip possible');
      else if (pop <= 10) phrases.push('mainly dry');
    }

    if (wind != null) {
      if (wind >= 25) phrases.push('windy');
      else if (wind >= 15) phrases.push('breezy');
    }

    const narrative = phrases.length
      ? `${phrases[0].charAt(0).toUpperCase()}${phrases[0].slice(1)}${phrases.length > 1 ? ` • ${phrases.slice(1).join(' • ')}` : ''}.`
      : `${label} conditions vary.`;

    return {
      label,
      condition: dominantCondition,
      pop,
      wind,
      gust,
      tempMin,
      tempMax,
      narrative,
    };
  };

  const buildDayNight = (dateRaw: any) => {
    const dayKey = getIsoDateKey(dateRaw);
    const sameDay = (hourly ?? []).filter((h) => getIsoDateKey(h?.time ?? h?.datetime ?? h?.date) === dayKey);

    const dayHours = sameDay.filter((h) => {
      const hour = getHour(h?.time ?? h?.datetime ?? h?.date);
      return hour != null && hour >= 6 && hour < 18;
    });

    const nightHours = sameDay.filter((h) => {
      const hour = getHour(h?.time ?? h?.datetime ?? h?.date);
      return hour != null && (hour < 6 || hour >= 18);
    });

    return {
      day: summarizeBlock(dayHours, 'Day'),
      night: summarizeBlock(nightHours, 'Night'),
    };
  };

  return (
    <View style={styles.dailyList}>
      {rows.map((day: any, idx: number) => {
        const key = String(day?.date ?? day?.time ?? `day-${idx}`);
        const expanded = expandedKey === key;

        const label = formatDailyLabel(day?.date ?? day?.time);

        const hi =
          safeNum(day?.tempMaxF ?? day?.temperatureMaxF ?? day?.temperature_2m_max ?? day?.maxTempF ?? day?.highF) ?? null;
        const lo =
          safeNum(day?.tempMinF ?? day?.temperatureMinF ?? day?.temperature_2m_min ?? day?.minTempF ?? day?.lowF) ?? null;

        const pop =
          safeNum(day?.precipProbMaxPct ?? day?.precipitationProbabilityMax ?? day?.pop ?? day?.precipChancePct) ?? null;

        const code =
          safeNum(day?.weatherCode ?? day?.weather_code ?? day?.weathercode ?? day?.code) ?? null;

        const wind =
          safeNum(day?.windSpeedMaxMph ?? day?.windMaxMph ?? day?.maxWindMph ?? day?.wind_mph ?? day?.windSpeedMph) ?? null;

        const gust =
          safeNum(day?.windGustMaxMph ?? day?.gustMaxMph ?? day?.maxGustMph ?? day?.windGustMph) ?? null;

        const emoji = weatherCodeToEmoji(code);
        const condition = weatherCodeToLabel(code);

        const split = buildDayNight(day?.date ?? day?.time);

        const narrativeParts: string[] = [];
        if (condition === 'Clear') narrativeParts.push('Bright and clear');
        else if (condition === 'Mostly clear') narrativeParts.push('Mostly clear');
        else if (condition === 'Partly cloudy') narrativeParts.push('Partly cloudy');
        else if (condition === 'Overcast') narrativeParts.push('Cloudy');
        else if (condition === 'Rain') narrativeParts.push('Rain likely');
        else if (condition === 'Showers') narrativeParts.push('Showers around');
        else if (condition === 'Drizzle') narrativeParts.push('Light drizzle possible');
        else if (condition === 'Snow') narrativeParts.push('Snow possible');
        else if (condition === 'Thunderstorm') narrativeParts.push('Storms possible');
        else if (condition === 'Fog') narrativeParts.push('Fog possible');
        else narrativeParts.push(condition);

        if (hi != null) {
          if (hi >= 95) narrativeParts.push('very hot');
          else if (hi >= 85) narrativeParts.push('warm');
          else if (hi >= 70) narrativeParts.push('mild');
          else if (hi >= 50) narrativeParts.push('cool');
          else narrativeParts.push('cold');
        }

        if (pop != null) {
          if (pop >= 70) narrativeParts.push('high precip chance');
          else if (pop >= 40) narrativeParts.push('some precip possible');
          else if (pop <= 10) narrativeParts.push('dry overall');
        }

        const narrative = `${narrativeParts.join(' • ')}.`;

        return (
          <Pressable
            key={key}
            onPress={() => toggleRow(key)}
            style={[styles.dailyRow, expanded && styles.dailyRowExpanded]}
          >
            <View style={styles.dailyRowTop}>
              <View style={styles.dailyLeft}>
                <Text style={styles.dailyLabel}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 20 }}>{emoji}</Text> {/* ⬅️ bigger icon */}
                  <Text style={styles.dailyCondition} numberOfLines={1}>
                    {condition}
                  </Text>
                </View>
              </View>

              <View style={styles.dailyRight}>
                <Text style={styles.dailyTemps}>
                  <Text style={styles.dailyHi}>{hi != null ? `${Math.round(hi)}°` : '—'}</Text>
                  <Text style={styles.dailySlash}> / </Text>
                  <Text style={styles.dailyLo}>{lo != null ? `${Math.round(lo)}°` : '—'}</Text>
                </Text>

                <View style={styles.dailyMetaRow}>
                  <Text style={styles.dailyPop}>
                    {pop != null ? `Precip ${Math.round(pop)}%` : 'Precip —'}
                  </Text>
                  <Text style={styles.dailyChevron}>{expanded ? '⌃' : '⌄'}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.dailyNarrative} numberOfLines={expanded ? undefined : 1}>
              {narrative.charAt(0).toUpperCase() + narrative.slice(1)}
            </Text>

            {expanded ? (
              <View style={styles.dailyExpanded}>
                <View style={styles.dayNightBlock}>
                  <Text style={styles.dayNightTitle}>Day</Text>
                  <Text style={styles.dayNightNarrative}>{split.day.narrative}</Text>
                  <View style={styles.dayNightMetaRow}>
                    <Text style={styles.dayNightMetaText}>
                      {split.day.tempMax != null ? `High ${Math.round(split.day.tempMax)}°` : 'High —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      {split.day.pop != null ? `Precip ${Math.round(split.day.pop)}%` : 'Precip —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      Wind {fmtWind(split.day.wind)}
                    </Text>
                  </View>
                </View>

                <View style={styles.dayNightDivider} />

                <View style={styles.dayNightBlock}>
                  <Text style={styles.dayNightTitle}>Night</Text>
                  <Text style={styles.dayNightNarrative}>{split.night.narrative}</Text>
                  <View style={styles.dayNightMetaRow}>
                    <Text style={styles.dayNightMetaText}>
                      {split.night.tempMin != null ? `Low ${Math.round(split.night.tempMin)}°` : 'Low —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      {split.night.pop != null ? `Precip ${Math.round(split.night.pop)}%` : 'Precip —'}
                    </Text>
                    <Text style={styles.dayNightMetaDot}>•</Text>
                    <Text style={styles.dayNightMetaText}>
                      Wind {fmtWind(split.night.wind)}
                    </Text>
                  </View>
                </View>

                <View style={styles.periodStatsWrap}>
                  <View style={styles.periodStatsSection}>
                    <Text style={styles.periodStatsTitle}>Day details</Text>

                    <View style={styles.dailyExpandedGrid}>
                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Condition</Text>
                        <Text style={styles.dailyExpandedValue}>{split.day.condition}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Precip</Text>
                        <Text style={styles.dailyExpandedValue}>
                          {split.day.pop != null ? `${Math.round(split.day.pop)}%` : '—'}
                        </Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Wind</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.day.wind)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Gusts</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.day.gust)}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.periodStatsSection}>
                    <Text style={styles.periodStatsTitle}>Night details</Text>

                    <View style={styles.dailyExpandedGrid}>
                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Condition</Text>
                        <Text style={styles.dailyExpandedValue}>{split.night.condition}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Precip</Text>
                        <Text style={styles.dailyExpandedValue}>
                          {split.night.pop != null ? `${Math.round(split.night.pop)}%` : '—'}
                        </Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Wind</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.night.wind)}</Text>
                      </View>

                      <View style={styles.dailyExpandedCell}>
                        <Text style={styles.dailyExpandedLabel}>Gusts</Text>
                        <Text style={styles.dailyExpandedValue}>{fmtWind(split.night.gust)}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={styles.dailyExpandedSummary}>
                  High {hi != null ? `${Math.round(hi)}°` : '—'} • Low {lo != null ? `${Math.round(lo)}°` : '—'}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function wmoToCondition(code: number | null): string | null {
  if (code == null) return null;

  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';

  if (code === 45 || code === 48) return 'Fog';

  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([80, 81, 82].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';

  return 'Cloudy';
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
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
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

function pressureRegimeLabel(
  pressureTrend: { arrow: '↑' | '↓' | '→'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null }
) {
  return pressureTrend.label;
}

function radiationRegimeLabel(cloudCoverPct: number | null) {
  if (cloudCoverPct == null) return '—';
  if (cloudCoverPct <= 20) return 'Radiational';
  if (cloudCoverPct <= 60) return 'Mixed';
  return 'Cloud-limited';
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
  pressureTrend,
  feelsDriverLabel,
  feelsDriverValue,
  onOpenLearnTopic,
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
  pressureTrend: { arrow: '↑' | '↓' | '→'; label: 'Rising' | 'Falling' | 'Steady'; deltaHpa: number | null };
  feelsDriverLabel: string;
  feelsDriverValue: string;
  onOpenLearnTopic: (topicId?: string) => void;
}) {
  const dir = dirToCompass(windDirDeg);
  const dirText = windDirDeg != null ? `${dir ?? ''} ${Math.round(windDirDeg)}°`.trim() : '—';

  const trendHint =
    pressureTrend.deltaHpa == null
      ? `${pressureTrend.arrow} ${pressureTrend.label}`
      : `${pressureTrend.arrow} ${pressureTrend.label} • ${pressureTrend.deltaHpa >= 0 ? '+' : ''}${pressureTrend.deltaHpa.toFixed(1)} hPa`;

  const pressureRegime = pressureRegimeLabel(pressureTrend);
  const radiationRegime = radiationRegimeLabel(cloudCoverPct);

  return (
    <View style={nd.wrap}>
      <SectionCard title="Comfort">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Dew point"
              value={dewpointF != null ? `${Math.round(dewpointF)}°F` : '—'}
              onPress={() => onOpenLearnTopic('dewpoint')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="RH"
              value={humidityPct != null ? `${Math.round(humidityPct)}%` : '—'}
              onPress={() => onOpenLearnTopic('humidity')}
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Dew band"
              value={dpBand ?? '—'}
              onPress={() => onOpenLearnTopic('dewpoint')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Thermal Spread"
              value={spreadF != null ? `${Math.round(spreadF)}°F` : '—'}
              onPress={() => onOpenLearnTopic('dewpoint')}
            />
          </View>
        </View>

        <StatTile
          label={feelsDriverLabel}
          value={feelsDriverValue}
          onPress={() => onOpenLearnTopic('apparent-temp')}
        />
      </SectionCard>

      <SectionCard title="Wind">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Speed"
              value={windMph != null ? `${Math.round(windMph)} mph` : '—'}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Gusts"
              value={gustMph != null ? `${Math.round(gustMph)} mph` : '—'}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Direction"
              value={dirText}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Gust Factor"
              value={gf != null ? gf.toFixed(2) : '—'}
              onPress={() => onOpenLearnTopic('wind')}
            />
          </View>
        </View>
      </SectionCard>

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
                  onPress={() => onOpenLearnTopic('clouds')}
                />
              </View>

              <View style={nd.gridItem}>
                <StatTile
                  label="UV index"
                  value={uvIndex != null ? fmt(uvIndex, 1) : '—'}
                  onPress={() => onOpenLearnTopic('uv')}
                />
              </View>
            </View>

            <StatTile
              label="Radiation Regime"
              value={radiationRegime}
              onPress={() => onOpenLearnTopic('clouds')}
            />
          </SectionCard>
        );
      })()}

      <SectionCard title="Extras">
        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="POP"
              value={precipChancePct != null ? `${Math.round(precipChancePct)}%` : '—'}
              onPress={() => onOpenLearnTopic('pop')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Vis"
              value={visibilityMi != null ? `${visibilityMi.toFixed(1)} mi` : '—'}
              onPress={() => onOpenLearnTopic('visibility')}
            />
          </View>
        </View>

        <View style={nd.grid2}>
          <View style={nd.gridItem}>
            <StatTile
              label="Pressure"
              value={pressureHpa != null ? `${fmt(pressureHpa)} hPa ${pressureTrend.arrow}` : `— ${pressureTrend.arrow}`}
              valueHint={
                pressureInHg != null
                  ? `${pressureInHg.toFixed(2)} inHg • ${trendHint}`
                  : `${trendHint}${pressureHpa != null ? ` • ${fmt(pressureHpa)} hPa` : ''}`
              }
              onPress={() => onOpenLearnTopic('pressure')}
            />
          </View>

          <View style={nd.gridItem}>
            <StatTile
              label="Pressure Regime"
              value={pressureRegime}
              onPress={() => onOpenLearnTopic('pressure')}
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

function LandWeatherWithCoords({
  coords,
  activeLabel,
  wxLab,
  onPressAlert,
  setLearnOpen,
  setLearnTopicId,
  setExplainPayload,
  setExplainOpen,
  onWeatherCode,
}: {
  coords: { lat: number; lon: number };
  activeLabel: string;
  wxLab: boolean;
  onPressAlert: (primary: any, alerts: any[]) => void;
  setLearnOpen: (v: boolean) => void;
  setLearnTopicId: (v: string | undefined) => void;
  setExplainPayload: (p: ExplainPayload | null) => void;
  setExplainOpen: (v: boolean) => void;
  onWeatherCode: (code: number | null) => void;
}) {
  const units: UnitSystem = 'us';

  const { primary, alerts } = useNwsAlerts({
    lat: coords.lat,
    lon: coords.lon,
    enabled: true,
  });

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
  const feelsLikeF = safeNum(wx.apparentTemperatureF ?? wx.feels_like_f ?? wx.feels_like ?? wx.feels);

  const dewpointF = safeNum(wx.dewpointF ?? wx.dewpoint_f ?? wx.dew_point ?? wx.dewPoint);
  const humidityPct = safeNum(wx.humidity ?? wx.relativeHumidity ?? wx.relative_humidity ?? wx.rh ?? wx.humidityPct);

  const windMph = safeNum(wx.windSpeedMph ?? wx.wind_speed_mph ?? wx.windSpeed ?? wx.wind);
  const gustMph = safeNum(wx.windGustMph ?? wx.wind_gust_mph ?? wx.windGust ?? wx.gust ?? wx.windGust);
  const windDirDeg = safeNum(wx.windDirection ?? wx.wind_dir ?? wx.wind_direction ?? wx.windDir);

  const cloudCoverPct = safeNum(wx.cloudCoverPct ?? wx.cloud_cover ?? wx.cloudCover ?? wx.cloudCoverPct);

  const daily = (forecastData?.daily ?? []).slice(0, 15);
  const hourlyRaw: any[] = forecastData?.hourly ?? [];

  const hourly = useMemo(() => {
    return (hourlyRaw ?? []).map((h: any) => {
      const pressureHpaLocal =
        safeNum(h.pressureHpa) ??
        safeNum(h.pressure_msl) ??
        safeNum(h.pressureMslHpa) ??
        safeNum(h.pressure_hpa) ??
        safeNum(h.pressure) ??
        null;

      return {
        ...h,
        pressureHpa: pressureHpaLocal,
      };
    });
  }, [hourlyRaw]);

  const pressureTrend = useMemo(() => pressureTrendFromHourly(hourly), [hourly]);

  const visibilityMi = (() => {
    const vMi = safeNum(wx.visibilityMi ?? wx.visibility_mi ?? wx.visibility);
    if (vMi != null) return vMi;

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

    const meters = safeNum(best?.visibility ?? best?.visibility_m);
    if (meters == null) return null;

    return meters / 1609.344;
  })();

  const uvIndexFromHourly = (() => {
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

    return safeNum(best?.uvIndex ?? best?.uv_index ?? best?.uv);
  })();

  const uvIndexFromDailyMax = safeNum(forecastData?.daily?.[0]?.uvIndexMax);

  const uvIndex =
    safeNum(wx.uvIndex ?? wx.uv_index ?? wx.uv) ??
    uvIndexFromHourly ??
    uvIndexFromDailyMax ??
    null;

  const pressureHpa =
    safeNum(wx.pressureHpa ?? wx.pressure_hpa ?? wx.pressure) ??
    safeNum(wx.pressureMb) ??
    null;

  const pressureInHg =
    safeNum(wx.pressureInHg ?? wx.pressure_inhg) ??
    (pressureHpa != null ? hpaToInHg(pressureHpa) : null);

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

  const weatherCodeFromCurrent =
    safeNum(wx.weatherCode ?? wx.weathercode ?? wx.weather_code ?? wx.code ?? wx.iconCode ?? wx.icon_code) ?? null;

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
      safeNum(best?.weatherCode ?? best?.weather_code ?? best?.weathercode ?? best?.condition_code ?? best?.code) ?? null
    );
  })();

  const weatherCode = weatherCodeFromCurrent ?? weatherCodeFromHourly;

  const condition =
    wx.shortForecast ??
    wx.condition ??
    wx.textDescription ??
    wx.weather ??
    wmoToCondition(weatherCode) ??
    '—';

  useEffect(() => {
    onWeatherCode(weatherCode);
  }, [weatherCode, onWeatherCode]);

  const observationTime: string | null = wx.observedAt ?? wx.timestamp ?? wx.datetime ?? null;

  const dpBand = dewpointF == null ? null : dewPointBandF(dewpointF);
  const hi = tempF != null && humidityPct != null ? heatIndexF(tempF, humidityPct) : null;
  const wc = tempF != null && windMph != null ? windChillF(tempF, windMph) : null;
  const gf = gustFactor(windMph, gustMph);
  const spreadF = tempF != null && dewpointF != null ? tempF - dewpointF : null;

  const feelsDriver = useMemo(() => {
    if (hi != null) return { label: 'Heat Index', value: `${Math.round(hi)}°F`, conf: 'high' as const };
    if (wc != null) return { label: 'Wind Chill', value: `${Math.round(wc)}°F`, conf: 'high' as const };
    if (feelsLikeF != null) return { label: 'Feels Like', value: `${Math.round(feelsLikeF)}°F`, conf: 'medium' as const };
    return { label: 'Feels', value: '—', conf: undefined };
  }, [hi, wc, feelsLikeF]);

  const updatedText = `Updated ${formatUpdatedTime(observationTime)}`;

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

  const openLearnTopic = React.useCallback(
    (topicId?: string) => {
      setLearnTopicId(topicId ?? undefined);
      setLearnOpen(true);
    },
    [setLearnOpen, setLearnTopicId]
  );

  return (
    <>
      {primary ? (
        <View style={{ marginTop: -6, marginBottom: theme.spacing.md }}>
          <AlertBanner primary={primary} count={alerts.length} onPress={() => onPressAlert(primary, alerts)} />
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
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject} />

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
            precipChancePct={precipChancePct}
            visibilityMi={visibilityMi}
            pressureHpa={pressureHpa}
            pressureInHg={pressureInHg}
            pressureTrend={pressureTrend}
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
            pressureTrend={pressureTrend}
            feelsDriverLabel={feelsDriver.label}
            feelsDriverValue={feelsDriver.value}
            onOpenLearnTopic={openLearnTopic}
          />
        )}

        <Text style={styles.updatedText}>{updatedText}</Text>
      </Card>

      {daily.length > 0 ? (
        <Card style={styles.forecastCard}>
          <Text style={styles.cardTitle}>{wxLab ? 'Daily (Model Blend)' : '15-Day Forecast'}</Text>

          {wxLab ? <DailyRangeChart daily={daily} /> : <DailyForecastList daily={daily} hourly={hourly} maxDays={15} />}

          <Text style={styles.updatedText}>Source: Open-Meteo (multi-model blend)</Text>
        </Card>
      ) : null}

      {wxLab && hourly.length ? (
        <Card style={styles.hourlyCard}>
          <View style={styles.hourlyHeaderRow}>
            <Text style={styles.cardTitle}>Next 72 hours</Text>
          </View>

          <HourlyCharts72h hours={hourly} maxHours={72} units={units} initialPanel="range" />

          <Text style={styles.updatedText}>Source: Open-Meteo (hourly)</Text>
        </Card>
      ) : null}

      <View style={{ display: 'none' }}>
        <Text>{activeLabel}</Text>
        <Text>{String(refreshing)}</Text>
        <Text>{String(onRefresh)}</Text>
        <Text>{String(!!setExplainOpen)}</Text>
        <Text>{String(!!setExplainPayload)}</Text>
      </View>
    </>
  );
}

export default function LandWeatherScreen() {
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

  const pushPlaceToContext = (
  name: string,
  lat: number,
  lon: number,
  meta?: { admin1?: string; country?: string }
) => {
  if (!placeSetActive) return;

  const cleaned = formatCompactLocation({
    name,
    admin1: meta?.admin1,
    country: meta?.country,
  });

  placeSetActive({
    name: cleaned,
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

  const [bgWeatherCode, setBgWeatherCode] = useState<number | null>(null);

  const router = useRouter();
  const insets = useSafeAreaInsets();

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

  const coords = useMemo(() => {
    return activeCoords ?? null;
  }, [activeCoords]);

  const locationLabel = useMemo(() => {
    const raw = (activeLabel ?? '').trim();
    if (raw) return raw;
    return coords ? `Current location (${coords.lat.toFixed(2)}, ${coords.lon.toFixed(2)})` : 'Getting location…';
  }, [activeLabel, coords]);

  useEffect(() => {
    if (!coords) return;
    pushPlaceToContext(locationLabel, coords.lat, coords.lon);
  }, [coords?.lat, coords?.lon, locationLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFavorited = useMemo(() => {
    if (!coords) return false;
    const favs = locState.favorites ?? [];
    return favs.some((f) => near(f.lat, coords.lat) && near(f.lon, coords.lon));
  }, [locState.favorites, coords?.lat, coords?.lon, coords]);

  const onToggleFavorite = () => {
    if (!coords) return;
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

  const openQuickExplain = (payload: ExplainPayload) => {
    setExplainPayload(payload);
    setExplainOpen(true);
  };

  const onPressAlert = (primary: any, alerts: any[]) => {
    const officialText =
      primary?.fullText ??
      [
        primary?.headline,
        primary?.description,
        primary?.instruction ? `Instructions: ${primary.instruction}` : undefined,
        primary?.note ? `Note: ${primary.note}` : undefined,
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();

    setExplainPayload({
      title: primary?.event ?? 'Weather Alert',
      summary: officialText || 'No detailed NWS alert text available.',
      whyItMatters: undefined,
      howComputed: undefined,
      confidence: undefined,
      learnTopicId: undefined,
    });

    setExplainOpen(true);
  };

  const favorites = locState.favorites ?? [];

  const onRefresh = () => {
    refreshCurrentLocation();
  };

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.videoLayer}>
        <WeatherVideoBackground weatherCode={bgWeatherCode ?? undefined} isEvening={isNight || isSunset} />
      </View>

      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: Math.max(theme.spacing.sm, insets.top * 0.1),
              flexGrow: 1,
            },
          ]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} />}
        >
          <View style={styles.headerHeroWrap}>
            <View style={styles.headerHeroSurface}>
              <View style={styles.headerCompactTopRow}>
                <View style={styles.headerCompactLeft}>
                  <Image
                    source={require('../../assets/brand/omniwx-mark-word.png')}
                    style={styles.headerCompactLogo}
                    resizeMode="contain"
                  />

                  {/* Location + Save inline */}
                  <Pressable onPress={() => setPickerOpen(true)} style={styles.headerCompactLocation}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={styles.locationPrimary} numberOfLines={1}>
                        {locationLabel}
                      </Text>

                      {/* ⭐ SAVE INLINE */}
                      <Pressable
                        onPress={onToggleFavorite}
                        disabled={!coords || isFavorited}
                        style={styles.saveInline}
                      >
                        <Text style={styles.saveInlineText}>
                          {isFavorited ? '★' : '☆'}
                        </Text>
                      </Pressable>
                    </View>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => router.push('/profile')}
                  hitSlop={12}
                  style={styles.settingsIconBtn}
                >
                  <Ionicons name="settings-outline" size={18} color="rgba(255,255,255,0.9)" />
                </Pressable>
              </View>

             <View style={styles.headerHeroBottomRow}>
  <Pressable onPress={() => router.push('/hourly')} style={styles.quickNavBtn}>
    <Text style={styles.quickNavText}>Hourly</Text>
  </Pressable>

  <Pressable onPress={() => router.push('/(tabs)/almanac')} style={styles.quickNavBtn}>
    <Text style={styles.quickNavText}>Almanac</Text>
  </Pressable>

  <Pressable
    onPress={() => {
      if (toggleWxLab) return toggleWxLab();
      if (setWxLab) return setWxLab(!wxLab);
    }}
    style={[
      styles.quickNavBtn,
      styles.wxLabNavBtn,
      wxLab && styles.wxLabNavBtnOn,
    ]}
  >
    <Text style={styles.quickNavText}>🧪 Wx Lab</Text>
  </Pressable>
</View>
            </View>
          </View>

          {!coords ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Getting your location…</Text>
              <Text style={styles.errorText}>Enable GPS or pick a place to load weather.</Text>
              <View style={{ marginTop: 12, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <Pressable onPress={refreshCurrentLocation} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Try again</Text>
                </Pressable>
                <Pressable onPress={() => setPickerOpen(true)} style={styles.quickNavBtn}>
                  <Text style={styles.quickNavText}>Choose location</Text>
                </Pressable>
              </View>
            </Card>
          ) : (
            <>
              <View pointerEvents="none" style={{ height: 0 }}>
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
              </View>

              <LandWeatherWithCoords
                coords={coords}
                activeLabel={locationLabel}
                wxLab={wxLab}
                onPressAlert={onPressAlert}
                setLearnOpen={setLearnOpen}
                setLearnTopicId={setLearnTopicId}
                setExplainPayload={setExplainPayload}
                setExplainOpen={setExplainOpen}
                onWeatherCode={(code) => setBgWeatherCode(code)}
              />
            </>
          )}

          <View style={{ height: 120 }} />
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

  videoLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },

  safe: { flex: 1, backgroundColor: 'transparent', zIndex: 10 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing['2xl'] },

  locationPrimary: { fontSize: 13, fontWeight: '900', color: 'white' },
  locationSecondary: { marginTop: 2, fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  settingsIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  headerHeroWrap: {
    marginBottom: theme.spacing.md,
    position: 'relative',
  },

  headerHeroSurface: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },

  headerCompactTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  headerCompactLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  headerCompactLogo: {
    width: 80,
    height: 80,
    opacity: 0.96,
  },

  headerCompactLocation: {
  flex: 1,
  minWidth: 0,
  marginRight: 4,
  paddingVertical: 6,
  paddingHorizontal: 10,
  borderRadius: 16,
  backgroundColor: 'rgba(0,0,0,0.12)',
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.10)',
},

  actionRow: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },

  actionPill: {
    width: '33%',
    height: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },

  actionPillOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },

  actionPillPrimary: {
    backgroundColor: 'rgba(37, 99, 235, 0.72)',
    borderColor: 'rgba(255,255,255,0.16)',
  },

  actionPillPrimaryOn: {
    backgroundColor: 'rgba(37, 99, 235, 0.92)',
  },

  actionPillText: {
    color: 'rgba(255,255,255,0.90)',
    fontWeight: '900',
    fontSize: 12,
  },

  quickNavBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  quickNavText: { color: 'white', fontWeight: '900', fontSize: 12 },

  headerHeroBottomRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },

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

  

  heroTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  heroTemp: { fontSize: 64, fontWeight: '900', color: theme.colors.textPrimary },
  heroCondition: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary, marginTop: 4 },
  heroSummary: { marginTop: 8, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.55)' },

  heroRight: { alignItems: 'flex-end' },
  heroMiniLabel: { fontSize: 12, opacity: 0.7, color: theme.colors.textSecondary, fontWeight: '800' },
  heroMiniValue: { fontSize: 18, fontWeight: '900', color: theme.colors.textPrimary },

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

  updatedText: { ...typography.small, marginTop: theme.spacing.md, opacity: 0.6, fontWeight: '700' },

  dailyList: {
    gap: 6,
    paddingHorizontal: 4,
  },

  dailyLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  dailyLabel: {
    color: 'white',
    fontWeight: '900',
    fontSize: 17,
  },

  dailyCondition: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '800',
  },

  dailyRight: {
    alignItems: 'flex-end',
    minWidth: 88,
  },

  dailyTemps: {
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },

  dailyHi: {
    color: 'white',
  },

  dailySlash: {
    color: 'rgba(255,255,255,0.42)',
  },

  dailyLo: {
    color: 'rgba(255,255,255,0.62)',
  },

  dailyPop: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
  },

  dailyRow: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 24,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  dailyRowExpanded: {
    backgroundColor: 'rgba(160,190,235,0.14)',
     borderRadius: 24,
  },

  dailyRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  wxLabNavBtn: {
  backgroundColor: 'rgba(37, 99, 235, 0.72)',
  borderColor: 'rgba(255,255,255,0.16)',
},

wxLabNavBtnOn: {
  backgroundColor: 'rgba(37, 99, 235, 0.92)',
},
  dailyMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },

  dailyChevron: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '900',
  },

  dailyNarrative: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  dailyExpanded: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  dayNightBlock: {
    paddingVertical: 2,
  },

  dayNightTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '900',
  },

  dayNightNarrative: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.82)', 
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },

  dayNightMetaRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },

  dayNightMetaText: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '800',
  },

  dayNightMetaDot: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '900',
  },

  dayNightDivider: {
    marginVertical: 10,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  dailyExpandedGrid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  dailyExpandedCell: {
    width: '48%',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  dailyExpandedLabel: {
    fontSize: 10,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.46)',
    fontWeight: '900',
  },

  dailyExpandedValue: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '900',
    color: 'white',
  },

  dailyExpandedSummary: {
    marginTop: 10,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '800',
  },


  periodStatsWrap: {
  marginTop: 10,
  gap: 12,
},

periodStatsSection: {
  gap: 8,
},

periodStatsTitle: {
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
  fontWeight: '900',
},
  favoritePickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 8,
    gap: 10,
  },

  favoriteEmojiBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  favoriteEmoji: {
    fontSize: 18,
  },

  favoriteMain: {
    flex: 1,
    minWidth: 0,
  },

  favoriteTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 14,
  },

  favoriteSub: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 12,
    fontWeight: '700',
  },

  favoriteTempBlock: {
    minWidth: 48,
    alignItems: 'flex-end',
  },

  favoriteHi: {
    color: 'white',
    fontWeight: '900',
    fontSize: 16,
    lineHeight: 18,
  },

  favoriteLo: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.56)',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 14,
  },

  saveInline: {
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.08)',
},

saveInlineText: {
  color: 'white',
  fontSize: 13,
  fontWeight: '900',
},

  forecastCard: {
    marginBottom: theme.spacing.lg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 26,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 10 },

  hourlyCard: { marginBottom: theme.spacing.lg },
  hourlyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 6,
  },

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

  modalSection: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.85)',
  },
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
