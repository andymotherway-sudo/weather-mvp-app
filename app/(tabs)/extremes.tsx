// app/(tabs)/extremes.tsx
// OMNIwx Extremes: Marine (global buoys) + Land (local/global) + Space (fun / Mars)
// Keeps ranked rows you liked, but adds mode toggle, hero cards, and refresh.

import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

const MAX_ROWS = 10;

type Severity = 'calm' | 'moderate' | 'rough' | 'extreme';
type Mode = 'marine' | 'land' | 'space';

function pushBuoyToNauticalMap(router: ReturnType<typeof useRouter>, b: BuoyDetailData) {
  router.push({
    pathname: '/(tabs)/nautical-map',
    params: {
      buoyId: b.id,
      lat: String(b.lat),
      lon: String(b.lon),
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
 * Land is now wired to Open-Meteo "current" for a curated point set.
 * (Fast MVP. Later we can swap to station obs / records / NWS / backend aggregation.)
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

type LandHookResult = {
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
  heroes: Partial<Record<LandExtremeKind, LandExtreme | null>>;
  groups: LandGroup[];
  refresh: () => Promise<void>;
};

type LandPoint = { id: string; name: string; lat: number; lon: number; badge?: string };

// Curated points (MVP). You can grow this list over time or replace with a real aggregation feed.
const LAND_POINTS: LandPoint[] = [
  // Local-ish + big US metros
  { id: 'phx', name: 'Phoenix, AZ', lat: 33.4484, lon: -112.074 },
  { id: 'la', name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437, badge: 'US' },
  { id: 'sf', name: 'San Francisco, CA', lat: 37.7749, lon: -122.4194, badge: 'US' },
  { id: 'sea', name: 'Seattle, WA', lat: 47.6062, lon: -122.3321, badge: 'US' },
  { id: 'den', name: 'Denver, CO', lat: 39.7392, lon: -104.9903, badge: 'US' },
  { id: 'chi', name: 'Chicago, IL', lat: 41.8781, lon: -87.6298, badge: 'US' },
  { id: 'nyc', name: 'New York, NY', lat: 40.7128, lon: -74.006, badge: 'US' },
  { id: 'mia', name: 'Miami, FL', lat: 25.7617, lon: -80.1918, badge: 'US' },
  { id: 'bos', name: 'Boston, MA', lat: 42.3601, lon: -71.0589, badge: 'US' },

  // “Global flavor” points
  { id: 'ldn', name: 'London, UK', lat: 51.5072, lon: -0.1276, badge: 'Global' },
  { id: 'del', name: 'Delhi, IN', lat: 28.6139, lon: 77.209, badge: 'Global' },
  { id: 'tok', name: 'Tokyo, JP', lat: 35.6762, lon: 139.6503, badge: 'Global' },
  { id: 'syd', name: 'Sydney, AU', lat: -33.8688, lon: 151.2093, badge: 'Global' },
  { id: 'cpt', name: 'Cape Town, ZA', lat: -33.9249, lon: 18.4241, badge: 'Global' },

  // Some “extreme-prone” spots for fun
  { id: 'mtw', name: 'Mount Washington, NH', lat: 44.2706, lon: -71.3033, badge: 'US' },
  { id: 'dv', name: 'Death Valley, CA', lat: 36.5054, lon: -116.848, badge: 'US' },
];

type OpenMeteoCurrent = {
  time?: string;
  temperature_2m?: number;
  precipitation?: number;
  wind_speed_10m?: number;
  wind_gusts_10m?: number;
};

async function fetchOpenMeteoCurrent(
  lat: number,
  lon: number,
  unit: 'F' | 'C',
): Promise<{ current: OpenMeteoCurrent | null; updatedAtIso: string | null }> {
  // Use Open-Meteo “current” (fast, no keys).
  // We request mph / inches when in US-style unit mode.
  const temperatureUnit = unit === 'F' ? 'fahrenheit' : 'celsius';
  const windUnit = unit === 'F' ? 'mph' : 'kmh';
  const precipUnit = unit === 'F' ? 'inch' : 'mm';

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m` +
    `&temperature_unit=${encodeURIComponent(temperatureUnit)}` +
    `&wind_speed_unit=${encodeURIComponent(windUnit)}` +
    `&precipitation_unit=${encodeURIComponent(precipUnit)}` +
    `&timezone=UTC`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8500);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { current: null, updatedAtIso: null };
    const json = await res.json();
    const cur: OpenMeteoCurrent | null = json?.current ?? null;
    const updatedAtIso: string | null = cur?.time ? String(cur.time) : null;
    return { current: cur, updatedAtIso };
  } catch {
    return { current: null, updatedAtIso: null };
  } finally {
    clearTimeout(t);
  }
}

function fmtWind(v: number | null | undefined, unit: 'F' | 'C') {
  if (v == null || !Number.isFinite(v)) return '—';
  return unit === 'F' ? `${v.toFixed(0)} mph` : `${v.toFixed(0)} km/h`;
}
function fmtPrecip(v: number | null | undefined, unit: 'F' | 'C') {
  if (v == null || !Number.isFinite(v)) return '—';
  // This is “current precipitation” for the timestep (not a 24h total).
  return unit === 'F' ? `${v.toFixed(2)} in` : `${v.toFixed(1)} mm`;
}
function fmtTempNumber(v: number | null | undefined, unit: 'F' | 'C') {
  if (v == null || !Number.isFinite(v)) return '—';
  return unit === 'F' ? `${v.toFixed(1)} °F` : `${v.toFixed(1)} °C`;
}

function useLandExtremes(tempUnit: 'F' | 'C'): LandHookResult {
  const cacheRef = useRef<{
    fetchedAt: number;
    updatedAt: string | null;
    rows: Array<
      LandPoint & {
        t?: number | null;
        wind?: number | null;
        gust?: number | null;
        precip?: number | null;
        time?: string | null;
      }
    >;
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

  const build = useCallback(
    (rows: NonNullable<typeof cacheRef.current>['rows'], bestUpdated: string | null) => {
      const hotSorted = rows
        .filter((r) => r.t != null && Number.isFinite(r.t as number))
        .sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity))
        .slice(0, MAX_ROWS);

      const coldSorted = rows
        .filter((r) => r.t != null && Number.isFinite(r.t as number))
        .sort((a, b) => (a.t ?? Infinity) - (b.t ?? Infinity))
        .slice(0, MAX_ROWS);

      const windSorted = rows
        .filter((r) => (r.gust ?? r.wind) != null && Number.isFinite((r.gust ?? r.wind) as number))
        .sort((a, b) => ((b.gust ?? b.wind) ?? -Infinity) - ((a.gust ?? a.wind) ?? -Infinity))
        .slice(0, MAX_ROWS);

      const rainSorted = rows
        .filter((r) => r.precip != null && Number.isFinite(r.precip as number))
        .sort((a, b) => (b.precip ?? -Infinity) - (a.precip ?? -Infinity))
        .slice(0, MAX_ROWS);

      const toExtreme = (
        kind: LandExtremeKind,
        r: (typeof rows)[number],
        valueText: string,
        subtitle: string,
      ): LandExtreme => ({
        id: `${kind}:${r.id}`,
        name: r.name,
        lat: r.lat,
        lon: r.lon,
        updatedAt: r.time ?? bestUpdated ?? null,
        valueText,
        subtitle,
        badge: r.badge,
        kind,
      });

      const gHot: LandGroup = {
        title: 'Hottest (Current)',
        subtitle: 'Temperature right now (sampled points)',
        items: hotSorted.map((r) => toExtreme('hot', r, fmtTempNumber(r.t ?? null, tempUnit), 'Hottest (current)')),
      };
      const gCold: LandGroup = {
        title: 'Coldest (Current)',
        subtitle: 'Temperature right now (sampled points)',
        items: coldSorted.map((r) => toExtreme('cold', r, fmtTempNumber(r.t ?? null, tempUnit), 'Coldest (current)')),
      };
      const gWind: LandGroup = {
        title: 'Windiest (Current Gust)',
        subtitle: 'Wind gust right now (sampled points)',
        items: windSorted.map((r) =>
          toExtreme(
            'wind',
            r,
            fmtWind((r.gust ?? r.wind) ?? null, tempUnit),
            r.gust != null ? 'Strongest gust (current)' : 'Strongest wind (current)',
          ),
        ),
      };
      const gRain: LandGroup = {
        title: 'Wettest (Current)',
        subtitle: 'Precipitation right now (sampled points)',
        items: rainSorted.map((r) => toExtreme('rain', r, fmtPrecip(r.precip ?? null, tempUnit), 'Wettest (current)')),
      };

      const heroHot = gHot.items[0] ?? null;
      const heroCold = gCold.items[0] ?? null;
      const heroWind = gWind.items[0] ?? null;
      const heroRain = gRain.items[0] ?? null;

      setGroups([gHot, gCold, gWind, gRain]);
      setHeroes({ hot: heroHot, cold: heroCold, wind: heroWind, rain: heroRain });
      setUpdatedAt(bestUpdated);
    },
    [tempUnit],
  );

  const refresh = useCallback(async () => {
    const TTL_MS = 1000 * 60 * 10; // 10 min
    const now = Date.now();

    // Serve from cache fast
    if (cacheRef.current && now - cacheRef.current.fetchedAt < TTL_MS) {
      build(cacheRef.current.rows, cacheRef.current.updatedAt);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all points in parallel (list is small)
      const results = await Promise.all(
        LAND_POINTS.map(async (p) => {
          const { current, updatedAtIso } = await fetchOpenMeteoCurrent(p.lat, p.lon, tempUnit);
          return {
            ...p,
            t: current?.temperature_2m ?? null,
            wind: current?.wind_speed_10m ?? null,
            gust: current?.wind_gusts_10m ?? null,
            precip: current?.precipitation ?? null,
            time: updatedAtIso,
          };
        }),
      );

      // Find a best “updatedAt” for the screen (most recent parsable time)
      const bestUpdated =
        results
          .map((r) => r.time)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] ?? null;

      cacheRef.current = { fetchedAt: now, updatedAt: bestUpdated, rows: results };
      build(results, bestUpdated);
    } catch (e: any) {
      setError(e?.message ? String(e.message) : 'Failed to load land extremes.');
    } finally {
      setLoading(false);
    }
  }, [build, tempUnit]);

  // Initial build (lazy: first time user taps Land, refresh() is called from onRefresh,
  // but we also want initial content without pull-to-refresh)
  // We’ll trigger a one-time auto refresh when hook is used and cache is empty.
  const bootRef = useRef(false);
  if (!bootRef.current) {
    bootRef.current = true;
    // Fire-and-forget; state updates are handled inside refresh
    // (no async useEffect needed for this screen style)
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    refresh();
  }

  return { loading, error, updatedAt, heroes, groups, refresh };
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

function Segmented({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
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
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {o.label}
            </Text>
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
        style={({ pressed }) => [
          styles.heroInner,
          pressed && onPress && { backgroundColor: '#061024' },
        ]}
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
            onPress={() => pushBuoyToNauticalMap(router, b)}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#020617' }]}
          >
            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{idx + 1}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.buoyName}>{b.name ?? b.id}</Text>
              <Text style={styles.buoyMeta}>{formatLatLon(b.lat, b.lon)}</Text>
              {b.updatedAt ? (
                <Text style={styles.buoyMetaSmall}>
                  {new Date(b.updatedAt).toLocaleString()}
                </Text>
              ) : null}
            </View>

            <SeverityPill severity={severity} />

            <Text style={styles.valueText}>{renderValue(b)}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

function LandSection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: LandExtreme[];
}) {
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
          <Text style={styles.emptyText}>
            If Open-Meteo is blocked or offline, pull-to-refresh later.
          </Text>
        </View>
      ) : (
        items.map((x, idx) => (
          <Pressable
            key={x.id}
            onPress={() =>
              router.push({
                pathname: '/maps',
                params: { lat: String(x.lat), lon: String(x.lon), label: x.name },
              })
            }
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#020617' }]}
          >
            <View style={styles.rankCircle}>
              <Text style={styles.rankText}>{idx + 1}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.buoyName}>{x.name}</Text>
              <Text style={styles.buoyMeta}>{formatLatLon(x.lat, x.lon)}</Text>
              {x.updatedAt ? (
                <Text style={styles.buoyMetaSmall}>
                  {new Date(x.updatedAt).toLocaleString()}
                </Text>
              ) : null}
              <Text style={styles.buoyMetaSmall}>{x.subtitle}</Text>
            </View>

            {x.badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{x.badge}</Text>
              </View>
            ) : null}

            <Text style={styles.valueText}>{x.valueText}</Text>
          </Pressable>
        ))
      )}
    </Card>
  );
}

export default function ExtremesScreen() {
  const router = useRouter();
  const { tempUnit } = useSettings();
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
        // FIX: ascending (coldest first)
        .sort((a, b) => (a.waterTempC ?? Infinity) - (b.waterTempC ?? Infinity))
        .slice(0, MAX_ROWS),
    [buoys],
  );

  const topWave = withWaves[0] ?? null;
  const topWind = withWind[0] ?? null;

  // Land + Space
  const land = useLandExtremes(tempUnit);
  const space = useSpaceExtremes();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Marine: your buoy hook likely refreshes via its own cache/timer.
      // Land/Space: scaffolded refresh calls for later.
      if (mode === 'land') await land.refresh();
      if (mode === 'space') await space.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [land, mode, space]);

  const headerSubtitle =
    mode === 'marine'
      ? 'Biggest seas, strongest winds, and most extreme water temps'
      : mode === 'land'
        ? 'Hottest, coldest, windiest, wettest… across land weather'
        : 'Mars and beyond (because why not)';

  const landHeroMeta = land.updatedAt ? formatUpdatedAt(land.updatedAt) : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Text style={typography.title}>Extremes</Text>
        <Text style={typography.subtitle}>{headerSubtitle}</Text>

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
          {/* Hero cards */}
          <HeroExtreme
            title="Highest Waves (Right Now)"
            subtitle={topWave ? (topWave.name ?? topWave.id) : '—'}
            primaryText={
              topWave?.waveHeightM != null
                ? `${(topWave.waveHeightM * 3.28084).toFixed(1)} ft`
                : '—'
            }
            metaText={topWave?.updatedAt ? formatUpdatedAt(topWave.updatedAt) : null}
            onPress={topWave ? () => pushBuoyToNauticalMap(router, topWave) : undefined}
            rightPill={
              topWave ? (
                <SeverityPill
                  severity={getSeverity(topWave.waveHeightM ?? null, topWave.windSpeedKts ?? null)}
                />
              ) : null
            }
          />

          <HeroExtreme
            title="Strongest Winds (Right Now)"
            subtitle={topWind ? (topWind.name ?? topWind.id) : '—'}
            primaryText={topWind?.windSpeedKts != null ? `${topWind.windSpeedKts.toFixed(0)} kt` : '—'}
            metaText={topWind?.updatedAt ? formatUpdatedAt(topWind.updatedAt) : null}
            onPress={topWind ? () => pushBuoyToNauticalMap(router, topWind) : undefined}
            rightPill={
              topWind ? (
                <SeverityPill
                  severity={getSeverity(topWind.waveHeightM ?? null, topWind.windSpeedKts ?? null)}
                />
              ) : null
            }
          />

          <MarineSection
            title="Highest Waves"
            subtitle="Significant wave height (Hs)"
            items={withWaves}
            renderValue={(b) =>
              b.waveHeightM != null ? `${(b.waveHeightM * 3.28084).toFixed(1)} ft` : '—'
            }
          />

          <MarineSection
            title="Strongest Winds"
            subtitle="Sustained wind speed"
            items={withWind}
            renderValue={(b) => (b.windSpeedKts != null ? `${b.windSpeedKts.toFixed(0)} kt` : '—')}
          />

          <MarineSection
            title="Warmest Water"
            subtitle="Sea surface temperature"
            items={withWarmWater}
            renderValue={(b) => formatTemp(b.waterTempC, tempUnit)}
          />

          <MarineSection
            title="Coldest Water"
            subtitle="Sea surface temperature"
            items={withColdWater}
            renderValue={(b) => formatTemp(b.waterTempC, tempUnit)}
          />

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

          {/* LAND hero cards */}
          {!land.loading && !land.error ? (
            <>
              <HeroExtreme
                title="Hottest (Current)"
                subtitle={land.heroes.hot ? land.heroes.hot.name : '—'}
                primaryText={land.heroes.hot ? land.heroes.hot.valueText : '—'}
                metaText={landHeroMeta}
                onPress={
                  land.heroes.hot
                    ? () =>
                        router.push({
                          pathname: '/maps',
                          params: {
                            lat: String(land.heroes.hot!.lat),
                            lon: String(land.heroes.hot!.lon),
                            label: land.heroes.hot!.name,
                          },
                        })
                    : undefined
                }
                rightPill={
                  land.heroes.hot?.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{land.heroes.hot.badge}</Text>
                    </View>
                  ) : null
                }
              />

              <HeroExtreme
                title="Coldest (Current)"
                subtitle={land.heroes.cold ? land.heroes.cold.name : '—'}
                primaryText={land.heroes.cold ? land.heroes.cold.valueText : '—'}
                metaText={landHeroMeta}
                onPress={
                  land.heroes.cold
                    ? () =>
                        router.push({
                          pathname: '/maps',
                          params: {
                            lat: String(land.heroes.cold!.lat),
                            lon: String(land.heroes.cold!.lon),
                            label: land.heroes.cold!.name,
                          },
                        })
                    : undefined
                }
                rightPill={
                  land.heroes.cold?.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{land.heroes.cold.badge}</Text>
                    </View>
                  ) : null
                }
              />

              <HeroExtreme
                title="Windiest (Current)"
                subtitle={land.heroes.wind ? land.heroes.wind.name : '—'}
                primaryText={land.heroes.wind ? land.heroes.wind.valueText : '—'}
                metaText={landHeroMeta}
                onPress={
                  land.heroes.wind
                    ? () =>
                        router.push({
                          pathname: '/maps',
                          params: {
                            lat: String(land.heroes.wind!.lat),
                            lon: String(land.heroes.wind!.lon),
                            label: land.heroes.wind!.name,
                          },
                        })
                    : undefined
                }
                rightPill={
                  land.heroes.wind?.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{land.heroes.wind.badge}</Text>
                    </View>
                  ) : null
                }
              />

              <HeroExtreme
                title="Wettest (Current)"
                subtitle={land.heroes.rain ? land.heroes.rain.name : '—'}
                primaryText={land.heroes.rain ? land.heroes.rain.valueText : '—'}
                metaText={landHeroMeta}
                onPress={
                  land.heroes.rain
                    ? () =>
                        router.push({
                          pathname: '/maps',
                          params: {
                            lat: String(land.heroes.rain!.lat),
                            lon: String(land.heroes.rain!.lon),
                            label: land.heroes.rain!.name,
                          },
                        })
                    : undefined
                }
                rightPill={
                  land.heroes.rain?.badge ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{land.heroes.rain.badge}</Text>
                    </View>
                  ) : null
                }
              />
            </>
          ) : null}

          {land.loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={typography.small}>Scanning land extremes…</Text>
            </View>
          ) : null}

          {!land.loading
            ? land.groups.map((g) => (
                <LandSection key={g.title} title={g.title} subtitle={g.subtitle} items={g.items} />
              ))
            : null}
        </>
      ) : null}

      {/* SPACE */}
      {mode === 'space' ? (
        <>
          {space.error ? (
            <Card style={styles.errorCard}>
              <Text style={styles.errorTitle}>Error</Text>
              <Text style={styles.errorText}>{space.error}</Text>
            </Card>
          ) : null}

          {space.loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={typography.small}>Checking Mars conditions…</Text>
            </View>
          ) : null}

          {!space.loading ? (
            <Card style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Space</Text>
              <Text style={styles.sectionSubtitle}>Mars extremes, dust storms, and fun comparisons</Text>

              {space.items.map((x, i) => (
                <View key={`${x.title}-${i}`} style={styles.spaceRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.spaceTitle}>{x.title}</Text>
                    <Text style={styles.spaceSubtitle}>{x.subtitle}</Text>
                    {x.footnote ? <Text style={styles.spaceFootnote}>{x.footnote}</Text> : null}
                  </View>
                  <Text style={styles.valueText}>{x.valueText}</Text>
                </View>
              ))}
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