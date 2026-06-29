// app/(tabs)/extremes.tsx
// OMNIwx Extremes: Marine (global buoys) + Land (local/global) + Space (fun / Mars)
// Keeps ranked rows you liked, but adds mode toggle, hero cards, and refresh.
//
// DROP-IN REPLACEMENT: Land now pulls from your Cloudflare Worker route:
//   https://omniwx-api.omniwx.workers.dev/land-extremes?unit=F|C
// This enables scaling to 250–500+ US sites without device fan-out.

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings } from '../context/SettingsContext';
import { useAllBuoyDetails } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';
import { useLocations, type FavoriteLocation } from '../lib/locations/useLocations';
import { useMarsInsightWeather } from '../lib/spaceweather/hooks';

import { OMNI_MARK_WORD, OMNI_TAB_LOGO_STYLE } from '../lib/brand/assets';

const MAX_ROWS = 10;

// Worker endpoint (land extremes)
const API_BASE = ((process.env.EXPO_PUBLIC_API_BASE as string | undefined) ?? 'https://omniwx-api.omniwx.workers.dev').replace(/\/+$/, '');
const LAND_EXTREMES_WORKER_URL = `${API_BASE}/land-extremes`;

type Severity = 'calm' | 'moderate' | 'rough' | 'extreme';
type Mode = 'marine' | 'land' | 'space';

function pushBuoyToMarineMap(router: ReturnType<typeof useRouter>, b: BuoyDetailData) {
  router.push({
    pathname: '/maps',
    params: {
      view: 'mariner',
      focus: 'once',
      buoyId: b.id,
      lat: String(b.lat),
      lon: String(b.lon),
      label: b.name ?? b.id,
      source: 'extremes',
      targetType: 'marine-buoy',
    },
  });
}

function pushLandExtremeToMap(
  router: ReturnType<typeof useRouter>,
  x: { lat: number; lon: number; name: string },
) {
  router.push({
    pathname: '/maps',
    params: {
      view: 'radar',
      focus: 'once',
      lat: String(x.lat),
      lon: String(x.lon),
      label: x.name,
      source: 'extremes',
      targetType: 'land-extreme',
    },
  });
}

function formatLatLon(lat: number, lon: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}° ${ns}, ${Math.abs(lon).toFixed(1)}° ${ew}`;
}

function formatTemp(valueC: number | null | undefined, unit: 'F' | 'C') {
  if (valueC == null) return '—';
  if (unit === 'C') return `${valueC.toFixed(1)} °C`;
  const f = (valueC * 9) / 5 + 32;
  return `${f.toFixed(1)} °F`;
}

function formatUpdatedAt(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Updated ${d.toLocaleString()}`;
}

// Same severity logic as buoy-map (kept)
function getSeverity(
  waveM: number | null | undefined,
  windKts: number | null | undefined,
): Severity {
  const ft = waveM != null ? waveM * 3.28084 : null;
  const w = windKts ?? 0;

  if ((ft == null || ft < 3) && w < 15) return 'calm';
  if ((ft != null && ft < 6) && w < 25) return 'moderate';
  if ((ft != null && ft < 10) || w < 35) return 'rough';
  return 'extreme';
}

function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'calm':
      return '#22c55e';
    case 'moderate':
      return '#eab308';
    case 'rough':
      return '#f97316';
    case 'extreme':
      return '#ef4444';
    default:
      return '#6b7280';
  }
}

function getSeverityLabel(severity: Severity): string {
  switch (severity) {
    case 'calm':
      return 'Calm';
    case 'moderate':
      return 'Moderate';
    case 'rough':
      return 'Rough';
    case 'extreme':
      return 'Extreme';
    default:
      return 'Unknown';
  }
}

/**
 * LAND + SPACE
 * Land is wired to your Cloudflare Worker /land-extremes route.
 */
type LandExtremeKind = 'hot' | 'cold' | 'wind' | 'rain';

type LandExtreme = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  updatedAt?: string | null;
  valueText: string; // already formatted
  subtitle: string; // e.g. "Hottest (current)"
  badge?: string; // e.g. "US", "Global", "Local"
  kind?: LandExtremeKind;
};

type LandGroup = { title: string; subtitle: string; items: LandExtreme[] };

type SavedPlaceExtreme = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  updatedAt: string | null;
  tempC: number | null;
  windKph: number | null;
  windMph: number | null;
  valueText: string;
  subtitle: string;
  kind: 'hot' | 'cold' | 'wind';
};

type LandHookResult = {
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
  heroes: Partial<Record<LandExtremeKind, LandExtreme | null>>;
  groups: LandGroup[];
  refresh: () => Promise<void>;
};

async function fetchWorkerLandExtremes(unit: 'F' | 'C'): Promise<{
  ok: boolean;
  unit: 'F' | 'C';
  updatedAt: string | null;
  heroes: Partial<Record<LandExtremeKind, LandExtreme | null>>;
  groups: LandGroup[];
}> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8500);

  try {
    const url = `${LAND_EXTREMES_WORKER_URL}?unit=${encodeURIComponent(unit)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`land-extremes worker failed (${res.status})`);

    const json = (await res.json()) as any;
    return {
      ok: !!json?.ok,
      unit: json?.unit === 'C' ? 'C' : 'F',
      updatedAt: typeof json?.updatedAt === 'string' ? json.updatedAt : null,
      heroes: (json?.heroes && typeof json.heroes === 'object' ? json.heroes : {}) as any,
      groups: (Array.isArray(json?.groups) ? json.groups : []) as any,
    };
  } finally {
    clearTimeout(t);
  }
}

function isWettestGroup(g: LandGroup) {
  const title = String(g?.title ?? '').toLowerCase();
  if (title.includes('wettest')) return true;

  const items = Array.isArray(g?.items) ? g.items : [];
  // Treat a group as "wettest" if most items are kind === 'rain'
  const rainCount = items.filter((x) => x?.kind === 'rain').length;
  return items.length > 0 && rainCount / items.length >= 0.6;
}

function stripWettest(groups: LandGroup[]) {
  return (groups ?? []).filter((g) => !isWettestGroup(g));
}

function landExtremeBucket(title: string, items: LandExtreme[]): Extract<LandExtremeKind, 'hot' | 'cold' | 'wind'> | null {
  const raw = String(title || '').toLowerCase();
  const sampleKind = items.find((item) => item?.kind)?.kind;
  if (raw.includes('hot') || sampleKind === 'hot') return 'hot';
  if (raw.includes('cold') || sampleKind === 'cold') return 'cold';
  if (raw.includes('wind') || sampleKind === 'wind') return 'wind';
  return null;
}

function landRankingMeta(kind: Extract<LandExtremeKind, 'hot' | 'cold' | 'wind'>) {
  if (kind === 'hot') {
    return {
      title: 'Top 10 Hottest Places',
      subtitle: 'Current land temperature ranking from available stations',
    };
  }
  if (kind === 'cold') {
    return {
      title: 'Top 10 Coldest Places',
      subtitle: 'Current cold spots from available stations',
    };
  }
  return {
    title: 'Top 10 Windiest Places',
    subtitle: 'Strongest current land winds from available stations',
  };
}

function landExtremeSortValue(item: LandExtreme) {
  const match = String(item.valueText ?? '').match(/-?\d+(?:\.\d+)?/);
  const value = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function mergeLandGroups(
  groups: LandGroup[],
  heroes: Partial<Record<LandExtremeKind, LandExtreme | null>> = {},
) {
  const buckets = new Map<Extract<LandExtremeKind, 'hot' | 'cold' | 'wind'>, LandExtreme[]>();

  for (const group of stripWettest(groups ?? [])) {
    const items = Array.isArray(group.items) ? group.items : [];
    if (!items.length) continue;
    const bucket = landExtremeBucket(group.title, items);
    if (!bucket) continue;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), ...items]);
  }

  (['hot', 'cold', 'wind'] as const).forEach((kind) => {
    const hero = heroes[kind];
    if (hero) buckets.set(kind, [hero, ...(buckets.get(kind) ?? [])]);
  });

  return (['hot', 'cold', 'wind'] as const).map((kind) => {
    const meta = landRankingMeta(kind);
    const seen = new Set<string>();
    const unique = (buckets.get(kind) ?? []).filter((item) => {
      const key = item.id || `${item.name}:${item.lat}:${item.lon}:${item.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const desc = kind === 'cold' ? -1 : 1;
    unique.sort((a, b) => {
      const av = landExtremeSortValue(a);
      const bv = landExtremeSortValue(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return desc * (bv - av);
    });
    return { ...meta, items: unique.slice(0, MAX_ROWS) };
  });
}

function useLandExtremes(tempUnit: 'F' | 'C'): LandHookResult {
  const cacheRef = useRef<{
    fetchedAt: number;
    updatedAt: string | null;
    heroes: Partial<Record<LandExtremeKind, LandExtreme | null>>;
    groups: LandGroup[];
  } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [groups, setGroups] = useState<LandGroup[]>([
    {
      title: 'Land',
      subtitle: 'Loading…',
      items: [],
    },
  ]);
  const [heroes, setHeroes] = useState<Partial<Record<LandExtremeKind, LandExtreme | null>>>({});

  const refresh = useCallback(async () => {
    const TTL_MS = 1000 * 60 * 10; // 10 min (aligns to Worker cache)
    const now = Date.now();

    // Serve from cache fast
    if (cacheRef.current && now - cacheRef.current.fetchedAt < TTL_MS) {
      setGroups(cacheRef.current.groups);
      setHeroes(cacheRef.current.heroes);
      setUpdatedAt(cacheRef.current.updatedAt);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const json = await fetchWorkerLandExtremes(tempUnit);

      const rawGroups: LandGroup[] = Array.isArray(json?.groups) ? json.groups : [];
      const nextGroups = stripWettest(rawGroups);

      const rawHeroes: Partial<Record<LandExtremeKind, LandExtreme | null>> =
        json?.heroes && typeof json.heroes === 'object' ? json.heroes : {};

      // Remove "wettest" hero
      const nextHeroes: Partial<Record<LandExtremeKind, LandExtreme | null>> = {
        hot: rawHeroes.hot ?? null,
        cold: rawHeroes.cold ?? null,
        wind: rawHeroes.wind ?? null,
      };

      const nextUpdatedAt: string | null = typeof json?.updatedAt === 'string' ? json.updatedAt : null;

      setGroups(
        nextGroups.length
          ? nextGroups
          : [
              {
                title: 'Land',
                subtitle: 'No data',
                items: [],
              },
            ],
      );
      setHeroes(nextHeroes);
      setUpdatedAt(nextUpdatedAt);

      cacheRef.current = {
        fetchedAt: now,
        updatedAt: nextUpdatedAt,
        heroes: nextHeroes,
        groups: nextGroups,
      };
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to load land extremes.');
    } finally {
      setLoading(false);
    }
  }, [tempUnit]);

  // Initial build
  const bootRef = useRef(false);
  if (!bootRef.current) {
    bootRef.current = true;
    refresh();
  }

  return { loading, error, updatedAt, heroes, groups, refresh };
}

function safeNum(value: any): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatWindFromKph(kph: number | null, unit: 'F' | 'C') {
  if (kph == null) return '—';
  if (unit === 'C') return `${Math.round(kph)} km/h`;
  return `${Math.round(kph * 0.621371)} mph`;
}

async function fetchSavedPlaceExtreme(place: FavoriteLocation, unit: 'F' | 'C'): Promise<SavedPlaceExtreme | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(place.lat))}` +
    `&longitude=${encodeURIComponent(String(place.lon))}` +
    `&current=temperature_2m,wind_speed_10m` +
    `&temperature_unit=celsius` +
    `&wind_speed_unit=kmh` +
    `&timezone=auto`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6500);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    const current = json?.current ?? {};
    const tempC = safeNum(current.temperature_2m);
    const windKph = safeNum(current.wind_speed_10m);
    const updatedAt = typeof current.time === 'string' ? current.time : null;
    const valueText =
      tempC != null
        ? `${formatTemp(tempC, unit)} • ${formatWindFromKph(windKph, unit)}`
        : formatWindFromKph(windKph, unit);
    return {
      id: place.id,
      name: place.name,
      lat: place.lat,
      lon: place.lon,
      updatedAt,
      tempC,
      windKph,
      windMph: windKph != null ? windKph * 0.621371 : null,
      valueText,
      subtitle: 'Saved place current conditions',
      kind: 'hot',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function useSavedPlaceExtremes(favorites: FavoriteLocation[], unit: 'F' | 'C') {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SavedPlaceExtreme[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const signature = useMemo(() => favorites.map((fav) => `${fav.id}:${fav.lat}:${fav.lon}`).join('|'), [favorites]);

  const refresh = useCallback(async () => {
    if (!favorites.length) {
      setItems([]);
      setUpdatedAt(null);
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(favorites.slice(0, 24).map((fav) => fetchSavedPlaceExtreme(fav, unit)));
      const next = results.filter(Boolean) as SavedPlaceExtreme[];
      setItems(next);
      setUpdatedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, [favorites, unit]);

  useEffect(() => {
    refresh();
  }, [refresh, signature]);

  return { loading, items, updatedAt, refresh };
}

type SpaceExtreme = {
  title: string;
  subtitle: string;
  valueText: string;
  footnote?: string;
};

function useSpaceExtremes(): {
  loading: boolean;
  error: string | null;
  items: SpaceExtreme[];
  refresh: () => Promise<void>;
} {
  // TODO: wire real Mars/space sources later.
  return {
    loading: false,
    error: null,
    items: [
      {
        title: 'Mars',
        subtitle: 'Coldest temp, highest wind, wild dust storms…',
        valueText: 'Coming soon',
        footnote: 'We can source NASA / model feeds once you pick what you want.',
      },
    ],
    refresh: async () => {},
  };
}

function fmtC(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value)} °C`;
}

function fmtPa(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value)} Pa`;
}

function fmtMps(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value.toFixed(1)} m/s`;
}

function Segmented({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const options: Array<{ key: Mode; label: string }> = [
    { key: 'marine', label: 'Marine' },
    { key: 'land', label: 'Land' },
    { key: 'space', label: 'Space' },
  ];

  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={({ pressed }) => [
              styles.segmentBtn,
              active && styles.segmentBtnActive,
              pressed && !active && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const c = getSeverityColor(severity);
  const label = getSeverityLabel(severity);
  return (
    <View style={[styles.severityPill, { borderColor: c }]}>
      <View style={[styles.severityDot, { backgroundColor: c }]} />
      <Text style={styles.severityLabel}>{label}</Text>
    </View>
  );
}

function HeroExtreme({
  title,
  subtitle,
  primaryText,
  metaText,
  onPress,
  rightPill,
}: {
  title: string;
  subtitle: string;
  primaryText: string;
  metaText?: string | null;
  onPress?: () => void;
  rightPill?: React.ReactNode;
}) {
  return (
    <Card style={styles.heroCard}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed }) => [styles.heroInner, pressed && onPress && { backgroundColor: '#061024' }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.heroTitle}>{title}</Text>
          <Text style={styles.heroSubtitle}>{subtitle}</Text>

          <View style={styles.heroRow}>
            <Text style={styles.heroPrimary}>{primaryText}</Text>
            {rightPill ? <View style={{ marginLeft: 10 }}>{rightPill}</View> : null}
          </View>

          {metaText ? <Text style={styles.heroMeta}>{metaText}</Text> : null}
        </View>

        {onPress ? <Text style={styles.heroChevron}>›</Text> : null}
      </Pressable>
    </Card>
  );
}

function MarineSection({
  title,
  subtitle,
  items,
  renderValue,
}: {
  title: string;
  subtitle: string;
  items: BuoyDetailData[];
  renderValue: (b: BuoyDetailData) => string;
}) {
  const router = useRouter();
  if (!items.length) return null;

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <Text style={styles.sectionCount}>Top {items.length}</Text>
      </View>

      {items.map((b, idx) => {
        const waveM = b.waveHeightM ?? null;
        const windKts = b.windSpeedKts ?? null;
        const severity = getSeverity(waveM, windKts);

        return (
          <Pressable
            key={b.id}
            onPress={() => pushBuoyToMarineMap(router, b)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#020617' }]}
          >
            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{idx + 1}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.buoyName}>{b.name ?? b.id}</Text>
              <Text style={styles.buoyMeta}>{formatLatLon(b.lat, b.lon)}</Text>
              {b.updatedAt ? <Text style={styles.buoyMetaSmall}>{new Date(b.updatedAt).toLocaleString()}</Text> : null}
            </View>

            <SeverityPill severity={severity} />

            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.valueText}>
              {renderValue(b)}
            </Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

function LandSection({ title, subtitle, items }: { title: string; subtitle: string; items: LandExtreme[] }) {
  const router = useRouter();

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        {items?.length ? <Text style={styles.sectionCount}>Top {items.length}</Text> : null}
      </View>

      {!items.length ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>No land extremes yet</Text>
          <Text style={styles.emptyText}>If the Worker is offline or blocked, pull-to-refresh later.</Text>
        </View>
      ) : (
        items.map((x, idx) => (
          <Pressable
            key={x.id}
            onPress={() => pushLandExtremeToMap(router, x)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#020617' }]}
          >
            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{idx + 1}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.buoyName}>{x.name}</Text>
              <Text style={styles.buoyMeta}>{formatLatLon(x.lat, x.lon)}</Text>
              {x.updatedAt ? <Text style={styles.buoyMetaSmall}>{new Date(x.updatedAt).toLocaleString()}</Text> : null}
              <Text style={styles.buoyMetaSmall}>{x.subtitle}</Text>
            </View>

            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.valueText}>
              {x.valueText}
            </Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

function SavedPlacesExtremeSection({
  favorites,
  items,
  loading,
  tempUnit,
}: {
  favorites: FavoriteLocation[];
  items: SavedPlaceExtreme[];
  loading: boolean;
  tempUnit: 'F' | 'C';
}) {
  const router = useRouter();
  const hottest = useMemo(
    () => items.filter((item) => item.tempC != null).slice().sort((a, b) => (b.tempC ?? -Infinity) - (a.tempC ?? -Infinity))[0] ?? null,
    [items],
  );
  const coldest = useMemo(
    () => items.filter((item) => item.tempC != null).slice().sort((a, b) => (a.tempC ?? Infinity) - (b.tempC ?? Infinity))[0] ?? null,
    [items],
  );
  const windiest = useMemo(
    () => items.filter((item) => item.windKph != null).slice().sort((a, b) => (b.windKph ?? -Infinity) - (a.windKph ?? -Infinity))[0] ?? null,
    [items],
  );
  const rows = [
    hottest ? { ...hottest, label: 'Hottest saved place', value: formatTemp(hottest.tempC, tempUnit) } : null,
    coldest ? { ...coldest, label: 'Coldest saved place', value: formatTemp(coldest.tempC, tempUnit) } : null,
    windiest ? { ...windiest, label: 'Windiest saved place', value: formatWindFromKph(windiest.windKph, tempUnit) } : null,
  ].filter(Boolean) as Array<SavedPlaceExtreme & { label: string; value: string }>;

  return (
    <Card style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Saved Places</Text>
          <Text style={styles.sectionSubtitle}>
            {favorites.length ? 'Extremes from your saved locations' : 'Save places on Land and they will appear here'}
          </Text>
        </View>
        {loading ? <ActivityIndicator size="small" /> : favorites.length ? <Text style={styles.sectionCount}>{favorites.length} saved</Text> : null}
      </View>

      {!favorites.length ? (
        <Pressable
          onPress={() => router.push('/')}
          style={({ pressed }) => [styles.emptyBox, pressed && { backgroundColor: '#0b1220' }]}
        >
          <Text style={styles.emptyTitle}>Add places to Extremes</Text>
          <Text style={styles.emptyText}>Save locations from the Land tab, then compare your own hot, cold, and windy spots here.</Text>
        </Pressable>
      ) : rows.length ? (
        rows.map((item, idx) => (
          <Pressable
            key={`${item.label}-${item.id}`}
            onPress={() => pushLandExtremeToMap(router, item)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#020617' }]}
          >
            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{idx + 1}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.buoyName}>{item.name}</Text>
              <Text style={styles.buoyMeta}>{item.label}</Text>
              <Text style={styles.buoyMetaSmall}>
                {formatWindFromKph(item.windKph, tempUnit)} wind • {formatLatLon(item.lat, item.lon)}
              </Text>
            </View>

            <View style={styles.badge}>
              <Text style={styles.badgeText}>Saved</Text>
            </View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.valueText}>
              {item.value}
            </Text>
          </Pressable>
        ))
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Saved place weather unavailable</Text>
          <Text style={styles.emptyText}>Pull to refresh and OMNIwx will retry the saved-location scan.</Text>
        </View>
      )}
    </Card>
  );
}

export default function ExtremesScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const router = useRouter();
  const { tempUnit } = useSettings();
  const locations = useLocations();
  const [mode, setMode] = useState<Mode>('marine');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error } = useAllBuoyDetails();
  const buoys: BuoyDetailData[] = data ?? [];

  // Marine rankings
  const withWaves = useMemo(
    () =>
      buoys
        .filter((b) => b.waveHeightM != null)
        .sort((a, b) => (b.waveHeightM ?? 0) - (a.waveHeightM ?? 0))
        .slice(0, MAX_ROWS),
    [buoys],
  );

  const withWind = useMemo(
    () =>
      buoys
        .filter((b) => b.windSpeedKts != null)
        .sort((a, b) => (b.windSpeedKts ?? 0) - (a.windSpeedKts ?? 0))
        .slice(0, MAX_ROWS),
    [buoys],
  );

  const withWarmWater = useMemo(
    () =>
      buoys
        .filter((b) => b.waterTempC != null)
        .sort((a, b) => (b.waterTempC ?? -Infinity) - (a.waterTempC ?? -Infinity))
        .slice(0, MAX_ROWS),
    [buoys],
  );

  const withColdWater = useMemo(
    () =>
      buoys
        .filter((b) => b.waterTempC != null)
        .sort((a, b) => (a.waterTempC ?? Infinity) - (b.waterTempC ?? Infinity))
        .slice(0, MAX_ROWS),
    [buoys],
  );

  const topWave = withWaves[0] ?? null;
  const topWind = withWind[0] ?? null;

  // Land + Space
  const land = useLandExtremes(tempUnit);
  const savedLand = useSavedPlaceExtremes(locations.favorites ?? [], tempUnit);
  const refreshSavedLand = savedLand.refresh;
  const mars = useMarsInsightWeather();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (mode === 'land') await Promise.all([land.refresh(), refreshSavedLand()]);
      if (mode === 'space') await mars.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [land, mars, mode, refreshSavedLand]);

  const headerSubtitle =
    mode === 'marine'
      ? 'Biggest seas, strongest winds, and most extreme water temps'
      : mode === 'land'
        ? 'Hottest, coldest, windiest… across land weather'
        : 'Mars and beyond (because why not)';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: theme.spacing['2xl'] + tabBarHeight + 18 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandLeft}>
            <Image source={OMNI_MARK_WORD} style={styles.brandWordmark} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <View style={styles.domainPill}>
                <Text style={styles.domainPillText}>Extremes</Text>
              </View>
              <Text style={styles.headerTitle}>Extremes</Text>
              <Text style={styles.headerSubtitle}>{headerSubtitle}</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: theme.spacing.md }}>
          <Segmented value={mode} onChange={setMode} />
        </View>
      </View>

      {/* Loading / Error for marine */}
      {mode === 'marine' && loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={typography.small}>Scanning global buoys…</Text>
        </View>
      ) : null}

      {mode === 'marine' && error ? (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      {/* MARINE */}
      {mode === 'marine' && !loading && !error ? (
        <>
          <HeroExtreme
            title="Highest Waves (Right Now)"
            subtitle={topWave ? (topWave.name ?? topWave.id) : '—'}
            primaryText={topWave?.waveHeightM != null ? `${(topWave.waveHeightM * 3.28084).toFixed(1)} ft` : '—'}
            metaText={topWave?.updatedAt ? formatUpdatedAt(topWave.updatedAt) : null}
            onPress={topWave ? () => pushBuoyToMarineMap(router, topWave) : undefined}
            rightPill={
              topWave ? <SeverityPill severity={getSeverity(topWave.waveHeightM ?? null, topWave.windSpeedKts ?? null)} /> : null
            }
          />

          <HeroExtreme
            title="Strongest Winds (Right Now)"
            subtitle={topWind ? (topWind.name ?? topWind.id) : '—'}
            primaryText={topWind?.windSpeedKts != null ? `${topWind.windSpeedKts.toFixed(0)} kt` : '—'}
            metaText={topWind?.updatedAt ? formatUpdatedAt(topWind.updatedAt) : null}
            onPress={topWind ? () => pushBuoyToMarineMap(router, topWind) : undefined}
            rightPill={
              topWind ? <SeverityPill severity={getSeverity(topWind.waveHeightM ?? null, topWind.windSpeedKts ?? null)} /> : null
            }
          />

          <MarineSection title="Highest Waves" subtitle="Significant wave height (Hs)" items={withWaves} renderValue={(b) => (b.waveHeightM != null ? `${(b.waveHeightM * 3.28084).toFixed(1)} ft` : '—')} />
          <MarineSection title="Strongest Winds" subtitle="Sustained wind speed" items={withWind} renderValue={(b) => (b.windSpeedKts != null ? `${b.windSpeedKts.toFixed(0)} kt` : '—')} />
          <MarineSection title="Warmest Water" subtitle="Sea surface temperature" items={withWarmWater} renderValue={(b) => formatTemp(b.waterTempC, tempUnit)} />
          <MarineSection title="Coldest Water" subtitle="Sea surface temperature" items={withColdWater} renderValue={(b) => formatTemp(b.waterTempC, tempUnit)} />

          {!buoys.length ? (
            <View style={styles.center}>
              <Text style={typography.small}>No buoy data available right now.</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {/* LAND */}
      {mode === 'land' ? (
        <>
          {land.error ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorText}>{land.error}</Text>
            </Card>
          ) : null}

          {land.loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={typography.small}>Scanning land extremes...</Text>
            </View>
          ) : null}

          {!land.loading && !land.error ? (
            (() => {
              const mergedGroups = mergeLandGroups(land.groups, land.heroes);
              const hasLandRows = mergedGroups.some((group) => group.items.length > 0);

              return (
                <>
                  {hasLandRows ? (
                    mergedGroups.map((g) => (
                      <LandSection key={`land-${g.title}`} title={g.title} subtitle={g.subtitle} items={g.items} />
                    ))
                  ) : (
                    <Card style={styles.sectionCard}>
                      <View style={styles.emptyBox}>
                        <Text style={styles.emptyTitle}>No land extremes yet</Text>
                        <Text style={styles.emptyText}>Pull to refresh. The Worker may still be warming up.</Text>
                      </View>
                    </Card>
                  )}

                  <SavedPlacesExtremeSection
                    favorites={locations.favorites ?? []}
                    items={savedLand.items}
                    loading={savedLand.loading}
                    tempUnit={tempUnit}
                  />
                </>
              );
            })()
          ) : null}
        </>
      ) : null}

      {/* SPACE */}
      {mode === 'space' ? (
        <>
          {mars.error ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorText}>{mars.error}</Text>
            </Card>
          ) : null}

          {mars.loading && !mars.data ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={typography.small}>Checking Mars conditions…</Text>
            </View>
          ) : null}

          {!mars.loading && mars.data ? (
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Mars Weather Archive</Text>
              <Text style={styles.sectionSubtitle}>NASA InSight lander weather at Elysium Planitia. Archived, not live.</Text>

              <View style={styles.spaceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.spaceTitle}>Air temperature</Text>
                  <Text style={styles.spaceSubtitle}>
                    Sol {mars.data.sol} / {mars.data.terrestrialDate ?? 'archived date'}
                  </Text>
                  <Text style={styles.spaceFootnote}>
                    Range {fmtC(mars.data.tempC.min)} to {fmtC(mars.data.tempC.max)}
                  </Text>
                </View>
                <Text style={styles.valueText}>{fmtC(mars.data.tempC.avg)}</Text>
              </View>

              <View style={styles.spaceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.spaceTitle}>Pressure</Text>
                  <Text style={styles.spaceSubtitle}>{mars.data.season ?? mars.data.source}</Text>
                  <Text style={styles.spaceFootnote}>
                    Range {fmtPa(mars.data.pressurePa.min)} to {fmtPa(mars.data.pressurePa.max)}
                  </Text>
                </View>
                <Text style={styles.valueText}>{fmtPa(mars.data.pressurePa.avg)}</Text>
              </View>

              <View style={styles.spaceRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.spaceTitle}>Wind</Text>
                  <Text style={styles.spaceSubtitle}>Horizontal wind speed from InSight</Text>
                  <Text style={styles.spaceFootnote}>Max {fmtMps(mars.data.windMps.max)}</Text>
                </View>
                <Text style={styles.valueText}>{fmtMps(mars.data.windMps.avg)}</Text>
              </View>

              <Text style={styles.spaceFootnote}>{mars.data.note}</Text>
            </Card>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  center: {
    marginTop: theme.spacing['2xl'],
    alignItems: 'center',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },

  brandWordmark: {
    ...OMNI_TAB_LOGO_STYLE,
  },

  domainPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 6,
  },
  domainPillText: { fontSize: 11, fontWeight: '900', color: 'white' },

  headerTitle: { ...typography.title },
  headerSubtitle: { ...typography.subtitle },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#071226',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: '#0b1f3e',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#0b1f3e',
  },
  segmentText: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  segmentTextActive: {
    color: '#e5e7eb',
  },

  errorCard: {
    backgroundColor: theme.colors.errorBg,
    borderColor: theme.colors.errorBg,
    marginBottom: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.errorText,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.errorText,
  },

  heroCard: {
    marginBottom: theme.spacing.md,
    padding: 0,
    overflow: 'hidden',
  },
  heroInner: {
    padding: theme.spacing.lg,
    borderRadius: 14,
  },
  heroTitle: {
    fontSize: 12,
    color: '#93c5fd',
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroPrimary: {
    fontSize: 28,
    fontWeight: '900',
    color: '#e5e7eb',
    letterSpacing: 0.2,
  },
  heroMeta: {
    marginTop: 8,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  heroChevron: {
    position: 'absolute',
    right: 14,
    top: 14,
    fontSize: 22,
    color: '#60a5fa',
    fontWeight: '900',
  },

  sectionCard: {
    marginBottom: theme.spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  sectionCount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#93c5fd',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#e5e7eb',
  },
  buoyName: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  buoyMeta: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  buoyMetaSmall: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
  valueText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#f97316',
    marginLeft: 8,
    flexShrink: 1,
    maxWidth: 96,
    minWidth: 52,
    textAlign: 'right',
  },

  severityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    marginHorizontal: 6,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  severityLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    fontWeight: '800',
  },

  badge: {
    borderWidth: 1,
    borderColor: '#334155',
    backgroundColor: '#0b1220',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    marginHorizontal: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#cbd5e1',
  },

  emptyBox: {
    marginTop: 6,
    padding: theme.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0b1f3e',
    backgroundColor: '#061024',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#e5e7eb',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },

  spaceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  spaceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  spaceSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  spaceFootnote: {
    fontSize: 11,
    color: '#93c5fd',
    marginTop: 6,
  },
});
