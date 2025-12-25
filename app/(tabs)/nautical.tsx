// app/(tabs)/nautical.tsx
// Nautical Wx – Sea State (waves/wind/SST) + Tides + Marine Forecast
// Driven by a selected marine area (from Buoy Map) + buoy / station search.
// Also supports "zone mode" when launched from polygon world map.

import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Mode, ModeToggle } from '../../components/common/ModeToggle';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings } from '../context/SettingsContext';

import { useAllBuoyDetails, useBuoyDetail } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';

import {
  DEFAULT_MARINE_AREA,
  getMarineAreaById,
  type MarineArea,
} from '../lib/nautical/areas';
import { useNauticalSummary } from '../lib/nautical/hooks';
import { useMarineForecast } from '../lib/nautical/marineForecast';
import {
  DEFAULT_NAUTICAL_STATION,
  NAUTICAL_STATIONS,
  type NauticalStation,
} from '../lib/nautical/stations';

// ✅ nerdy builder (keep this import)
import { buildNerdyData } from '../lib/nautical/buildNerdyData';

// ---- small local types to avoid `any` -----------------------------

type TidePrediction = {
  time: string;
  type: 'H' | 'L';
  height: number;
};

type ForecastPeriod = {
  name: string;
  summary: string;
};

// helpers
function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function degToCompass(deg: number | null | undefined): string {
  if (deg == null || isNaN(deg)) return '—';
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  const idx = Math.round((deg % 360) / 22.5) % 16;
  return dirs[idx];
}

function seaStateLabel(heightM: number | null | undefined): string {
  if (heightM == null) return 'Unknown';
  const ft = heightM * 3.28084;

  if (ft < 0.3) return 'Glass calm (0 ft)';
  if (ft < 1) return 'Calm / ripples';
  if (ft < 3) return 'Smooth / slight chop';
  if (ft < 6) return 'Moderate seas';
  if (ft < 9) return 'Rough seas';
  if (ft < 14) return 'Very rough / heavy';
  return 'High / dangerous';
}

/** Beaufort force + label from sustained wind in knots */
function getBeaufort(
  windKts: number | null | undefined,
): { force: number | null; label: string } {
  if (windKts == null) return { force: null, label: 'Unknown' };

  const v = windKts;

  if (v < 1) return { force: 0, label: 'Calm' };
  if (v < 4) return { force: 1, label: 'Light air' };
  if (v < 7) return { force: 2, label: 'Light breeze' };
  if (v < 11) return { force: 3, label: 'Gentle breeze' };
  if (v < 17) return { force: 4, label: 'Moderate breeze' };
  if (v < 22) return { force: 5, label: 'Fresh breeze' };
  if (v < 28) return { force: 6, label: 'Strong breeze' };
  if (v < 34) return { force: 7, label: 'Near gale' };
  if (v < 41) return { force: 8, label: 'Gale' };
  if (v < 48) return { force: 9, label: 'Strong gale' };
  if (v < 56) return { force: 10, label: 'Storm' };
  if (v < 64) return { force: 11, label: 'Violent storm' };
  return { force: 12, label: 'Hurricane force' };
}

/** Combined risk based on sea state + wind */
function getSeaRisk(
  waveM: number | null | undefined,
  windKts: number | null | undefined,
): {
  level: 'Low' | 'Moderate' | 'High' | 'Extreme';
  text: string;
} {
  const ft = waveM != null ? waveM * 3.28084 : null;
  const w = windKts ?? 0;

  if ((ft == null || ft < 3) && w < 15) {
    return {
      level: 'Low',
      text: 'Generally safe for most small craft, fair weather.',
    };
  }

  if (ft != null && ft < 6 && w < 25) {
    return {
      level: 'Moderate',
      text: 'Choppy / moderate seas. Experience recommended for small craft.',
    };
  }

  if ((ft != null && ft < 10) || w < 35) {
    return {
      level: 'High',
      text: 'Rough conditions. Caution for all but well-prepared vessels.',
    };
  }

  return {
    level: 'Extreme',
    text: 'Very dangerous. Avoid unless absolutely necessary.',
  };
}

function formatTemp(c: number | null | undefined, unit: 'F' | 'C'): string {
  if (c == null) return '—';
  if (unit === 'C') return `${c.toFixed(1)} °C`;
  const f = (c * 9) / 5 + 32;
  return `${f.toFixed(1)} °F`;
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

/**
 * ✅ Smart formatter that prevents "[object Object]"
 * and renders common shapes nicely.
 */
function fmtSmart(v: unknown): string {
  if (v == null) return '—';

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    return String(v);
  }

  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';

  if (Array.isArray(v)) {
    if (v.length === 0) return '—';
    if (v.length === 1) return fmtSmart(v[0]);
    return v.slice(0, 3).map(fmtSmart).join(', ') + (v.length > 3 ? '…' : '');
  }

  if (typeof v === 'object') {
    const o = v as any;

    // 1) Most common: { label, value, unit }
    if (typeof o.label === 'string') {
      const label = o.label;
      const unit = typeof o.unit === 'string' ? ` ${o.unit}` : '';
      if (typeof o.value === 'number' && Number.isFinite(o.value)) {
        return `${label} (${o.value}${unit})`;
      }
      if (typeof o.value === 'string') return `${label} (${o.value})`;
      return label;
    }

    // 2) Common numeric carrier: { value, unit }
    if (typeof o.value === 'number' && Number.isFinite(o.value)) {
      const unit = typeof o.unit === 'string' ? ` ${o.unit}` : '';
      return `${o.value}${unit}`;
    }
    if (typeof o.value === 'string') return o.value;

    // 3) Confidence-ish shapes (handle a bunch of likely key names)
    const level =
      (typeof o.level === 'string' && o.level) ||
      (typeof o.rating === 'string' && o.rating) ||
      (typeof o.confidence === 'string' && o.confidence) ||
      (typeof o.label === 'string' && o.label);

    const pctRaw =
      (typeof o.pct === 'number' && o.pct) ||
      (typeof o.percent === 'number' && o.percent) ||
      (typeof o.percentage === 'number' && o.percentage);

    const scoreRaw =
      (typeof o.score === 'number' && o.score) ||
      (typeof o.value === 'number' && o.value);

    const pct =
      typeof pctRaw === 'number' && Number.isFinite(pctRaw)
        ? pctRaw <= 1
          ? Math.round(pctRaw * 100)
          : Math.round(pctRaw)
        : null;

    if (level && pct != null) return `${level} (${pct}%)`;
    if (level && typeof scoreRaw === 'number' && Number.isFinite(scoreRaw))
      return `${level} (${scoreRaw})`;
    if (level) return level;

    // 4) Useful text fallback
    if (typeof o.text === 'string') return o.text;

    // 5) Compact key/value summary (prevents [data])
    const preferredKeys = [
      'level',
      'label',
      'rating',
      'pct',
      'percent',
      'percentage',
      'score',
      'value',
      'unit',
      'source',
      'stale',
      'reason',
      'missing',
    ];

    const pairs: string[] = [];
    for (const k of preferredKeys) {
      if (o[k] != null) pairs.push(`${k}: ${fmtSmart(o[k])}`);
      if (pairs.length >= 3) break;
    }

    if (pairs.length > 0) return pairs.join(' · ');

    // 6) last resort: short-ish JSON (don’t hide as [data])
    try {
      const s = JSON.stringify(o);
      if (!s) return '[data]';
      return s.length <= 140 ? s : s.slice(0, 140) + '…';
    } catch {
      return '[data]';
    }
  }

  return String(v);
}

// ✅ your Nerdy UI uses fmt(...); wire it to fmtSmart
const fmt = fmtSmart;

// ---------- Nerdy “Explain” content ---------------------------------

type ExplainKey =
  | 'breakingRisk'
  | 'tallestSet'
  | 'windWaveAngle'
  | 'interaction'
  | 'stability'
  | 'riskScore'
  | 'confidence';

function explainFor(key: ExplainKey) {
  switch (key) {
    case 'breakingRisk':
      return {
        title: 'Breaking risk',
        body:
          'A heuristic estimate of whether waves are likely to break (whitecaps / steep faces).\n\n' +
          'Typical inputs:\n' +
          '• Significant wave height (Hs)\n' +
          '• Peak period (Tp)\n' +
          '• Wind speed / gusts\n' +
          '• Wind–wave angle (onshore / opposing wind increases steepness)\n\n' +
          'How it’s usually computed:\n' +
          '• Estimate steepness ~ Hs / L where L ≈ 1.56·Tp² (deep-water wavelength)\n' +
          '• Boost risk when winds oppose dominant wave direction\n' +
          '• Boost risk when wind is strong enough to actively grow/shorten waves\n\n' +
          'Note: this is not a certified marine safety metric — it’s a science-y indicator for situational awareness.',
      };
    case 'tallestSet':
      return {
        title: 'Tallest set',
        body:
          'A “set” is a group of larger-than-average waves. This value estimates what the biggest wave in a set could be.\n\n' +
          'Rule of thumb:\n' +
          '• Tallest set ≈ 1.6× to 2.0× Hs (significant wave height)\n\n' +
          'Why:\n' +
          '• Hs is roughly the average of the highest 1/3 of waves, but occasional larger waves occur due to randomness and wave-grouping.\n\n' +
          'Use:\n' +
          '• Helps visualize “sneaker wave” potential when combined with long periods and opposing wind.',
      };
    case 'windWaveAngle':
      return {
        title: 'Wind–wave angle',
        body:
          'Angle between wind direction and dominant wave direction.\n\n' +
          'Interpretation:\n' +
          '• ~0°: wind aligned with waves (following wind)\n' +
          '• ~180°: wind opposing waves (steeper, rougher seas)\n' +
          '• ~90°: cross sea (confused / uncomfortable)\n\n' +
          'Computed as the absolute smallest angular difference between two bearings (0–180°).',
      };
    case 'interaction':
      return {
        title: 'Interaction',
        body:
          'A qualitative label summarizing how wind direction relates to wave direction.\n\n' +
          'Examples:\n' +
          '• Following: wind roughly aligned with wave direction\n' +
          '• Opposing: wind roughly against the wave direction\n' +
          '• Cross: wind roughly perpendicular to the wave direction\n\n' +
          'This mainly affects perceived sea state and breaking potential.',
      };
    case 'stability':
      return {
        title: 'Stability (air–sea)',
        body:
          'A simple indicator based on ΔT = air temperature − sea surface temperature.\n\n' +
          'Rules of thumb:\n' +
          '• ΔT > 0 (air warmer): more stable near-surface layer, less vertical mixing\n' +
          '• ΔT < 0 (air colder): more unstable, more mixing and gustiness possible\n\n' +
          'This can change how “punchy” winds feel at the surface.',
      };
    case 'riskScore':
      return {
        title: 'Risk score',
        body:
          'A combined, heuristic score derived from wave height, wind speed, gusts, and any hazard flags.\n\n' +
          'Typically:\n' +
          '• Increases with Hs, Tp (especially long-period swell), and wind/gusts\n' +
          '• Increases when wind opposes wave direction\n\n' +
          'It’s intended for quick scanning — always defer to official forecasts and local knowledge.',
      };
    case 'confidence':
      return {
        title: 'Confidence',
        body:
          'A coarse indicator of how complete / consistent the inputs are.\n\n' +
          'Higher when:\n' +
          '• Buoy observations are available (fresh timestamp)\n' +
          '• Multiple fields are populated (Hs, Tp, wind, SST)\n\n' +
          'Lower when:\n' +
          '• Model-only fields are missing\n' +
          '• Data is stale or partial',
      };
  }
}

// -------------------------------------------------------------------

export default function NauticalScreen() {
  const params = useLocalSearchParams<{
    areaId?: string;
    zoneId?: string;
    zoneName?: string; // used in the tab
    name?: string; // used from polygon click
    wfo?: string;
  }>();

  const areaId = asString(params.areaId);
  const zoneId = asString(params.zoneId);
  const wfo = asString(params.wfo);

  // ✅ accept either `zoneName` or `name`
  const zoneName = asString(params.zoneName) ?? asString(params.name);

  const isZoneMode = !!zoneId;

  const [mode, setMode] = useState<Mode>('simple');
  const { tempUnit } = useSettings();

  // ---- Explain modal state
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainKey, setExplainKey] = useState<ExplainKey | null>(null);
  const explain = explainKey ? explainFor(explainKey) : null;

  const openExplain = (key: ExplainKey) => {
    setExplainKey(key);
    setExplainOpen(true);
  };

  // --- AREA + STATION SELECTION -----------------------------------

  const initialArea: MarineArea =
    getMarineAreaById(areaId) ?? DEFAULT_MARINE_AREA;
  const [area] = useState<MarineArea>(initialArea);

  // In zone mode, we do NOT show tides (no single tide station)
  const supportsTides = isZoneMode ? false : area.supportsTides !== false;

  const initialStation: NauticalStation =
    NAUTICAL_STATIONS.find((s) => s.id === area.tideStationId) ??
    DEFAULT_NAUTICAL_STATION;

  const [station, setStation] = useState<NauticalStation>(initialStation);

  // Search + selected buoy for sea state source
  const [search, setSearch] = useState('');
  const [selectedBuoyId, setSelectedBuoyId] = useState<string | null>(null);

  // Data hooks (tides + model summary come from station; in zone mode we keep it,
  // but simply do not render tides)
  const { data, loading, error, refreshing, refresh } =
    useNauticalSummary(station);

  const { data: allBuoyData } = useAllBuoyDetails();
  const allBuoys: BuoyDetailData[] = allBuoyData ?? [];

  // ✅ IMPORTANT FIX:
  // station.id is a tide station id, not a buoy id.
  const stationBuoyId = station.buoyId ?? null;
  const activeBuoyId = selectedBuoyId ?? stationBuoyId;

  const { data: buoyData } = useBuoyDetail(activeBuoyId ?? undefined);

  // ✅ Forecast source:
  // - Zone mode: drive forecast by zoneId (PZZ### etc)
  // - Area mode: drive forecast by area.forecastZoneId
  const forecastZoneId = isZoneMode ? zoneId : area.forecastZoneId;

  const { forecast, loading: forecastLoading, error: forecastError } =
    useMarineForecast(forecastZoneId);

  const activeBuoy =
    allBuoys.find(
      (b) =>
        b.id.toUpperCase() ===
        String(activeBuoyId ?? '').toUpperCase(),
    ) ?? null;

  // --- SEARCH: stations + buoys -----------------------------------

  type SearchRow = {
    key: string;
    label: string;
    onPress: () => void;
  };

  const searchRows: SearchRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const rows: SearchRow[] = [];

    // Stations (curated)
    const matchingStations = NAUTICAL_STATIONS.filter((s) => {
      const name = s.name.toLowerCase();
      const id = s.id.toLowerCase();
      return name.includes(q) || id.includes(q);
    });

    matchingStations.forEach((s) => {
      rows.push({
        key: `station-${s.id}`,
        label: `${s.name} · tide station`,
        onPress: () => {
          setStation(s);
          setSelectedBuoyId(s.buoyId ?? null);
          setSearch(s.name);
        },
      });
    });

    // Buoys (live list)
    const matchingBuoys = allBuoys
      .filter((b) => {
        const display =
          b.name?.trim() ||
          (b as any).stationName?.trim?.() ||
          (b as any).description?.trim?.() ||
          b.id;

        const hay = `${display} ${b.id}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 20);

    matchingBuoys.forEach((b) => {
      const display =
        b.name?.trim() ||
        (b as any).stationName?.trim?.() ||
        (b as any).description?.trim?.() ||
        b.id;

      rows.push({
        key: `buoy-${b.id}`,
        label: `${display} · buoy ${b.id}`,
        onPress: () => {
          setSelectedBuoyId(b.id);
          setSearch(display);
        },
      });
    });

    return rows;
  }, [search, allBuoys]);

  // --- DERIVED CONDITIONS -----------------------------------------

  const conditions = data?.conditions ?? null;

  // Prefer live NOAA buoy obs; fall back to model
  const waveHeightM =
    buoyData?.waveHeightM ?? conditions?.significantWaveHeightM ?? null;
  const waveHeightFt = waveHeightM != null ? waveHeightM * 3.28084 : null;

  const swellPeriod = conditions?.primarySwellPeriodS ?? null;
  const swellDirDeg = conditions?.primarySwellDirectionDeg ?? null;
  const swellDir = degToCompass(swellDirDeg ?? null);

  const windSpeedKts =
    buoyData?.windSpeedKts ?? conditions?.windSpeedKts ?? null;
  const windGustKts =
    buoyData?.windGustKts ?? conditions?.windGustKts ?? null;
  const windDirDeg =
    buoyData?.windDirectionDeg ?? conditions?.windDirectionDeg ?? null;
  const windDir = degToCompass(windDirDeg ?? null);

  const waterTempC =
    buoyData?.waterTempC ?? conditions?.seaSurfaceTempC ?? null;
  const airTempC = buoyData?.airTempC ?? null;

  const visibilityNm = buoyData?.visibilityNm ?? null;
  const pressureHpa = buoyData?.pressureHpa ?? null;

  const seaLabel = seaStateLabel(waveHeightM);
  const beaufort = getBeaufort(windSpeedKts);
  const seaRisk = getSeaRisk(waveHeightM, windSpeedKts);

  const observedTs = buoyData?.updatedAt ?? conditions?.observedAt ?? null;

  const sourceLabel = buoyData
    ? 'NOAA buoy (NDBC)'
    : conditions?.modelSource ?? 'Marine model';

  const riskStyle =
    seaRisk.level === 'Low'
      ? styles.riskLow
      : seaRisk.level === 'Moderate'
        ? styles.riskModerate
        : seaRisk.level === 'High'
          ? styles.riskHigh
          : styles.riskExtreme;

  // ✅ Header lines
  const headerLine = isZoneMode
    ? String(zoneName ?? `Marine Zone ${zoneId}`)
    : supportsTides
      ? station.name
      : area.name;

  const headerSubLine = isZoneMode
    ? `Zone: ${String(zoneId)}${wfo ? ` · WFO ${String(wfo)}` : ''}`
    : supportsTides
      ? `Marine area: ${area.name}`
      : `${area.region} · ${area.ocean}`;

  // typed view of predictions/periods without forcing you to change your hook types
  const predictions = (data?.predictions ?? []) as TidePrediction[];
  const forecastPeriods = (forecast?.periods ?? []) as ForecastPeriod[];

  // ✅ Nerdy model (don’t assume a specific NerdyData shape here)
  const nerdy = buildNerdyData({
    zoneId: forecastZoneId,
    zoneName: isZoneMode ? String(zoneName ?? '') : undefined,
    wfo: isZoneMode ? String(wfo ?? '') : undefined,
    buoy: buoyData
      ? {
          id: buoyData.id,
          name: (buoyData as any).name,
          updatedAt: buoyData.updatedAt,
          waveHeightM: buoyData.waveHeightM,
          dominantPeriodS: (buoyData as any).dominantPeriodS,
          dominantDirectionDeg: (buoyData as any).dominantDirectionDeg,
          windSpeedKts: buoyData.windSpeedKts,
          windGustKts: buoyData.windGustKts,
          windDirectionDeg: buoyData.windDirectionDeg,
          waterTempC: buoyData.waterTempC,
          airTempC: buoyData.airTempC,
          pressureHpa: buoyData.pressureHpa,
          visibilityNm: buoyData.visibilityNm,
        }
      : null,
    conditions: conditions ?? null,
    forecast: forecast
      ? {
          id: forecast.id,
          headline: forecast.headline,
          issuedAt: forecast.issuedAt,
          source: forecast.source,
        }
      : null,
  });

  const nerdyAny = nerdy as any;

  const debugNerdy =
    __DEV__ && nerdyAny
      ? JSON.stringify(
          nerdyAny,
          (k, v) =>
            typeof v === 'number' && Number.isFinite(v)
              ? Number(v.toFixed(3))
              : v,
          2,
        )
      : null;

  // Tappable nerdy row (key/value + chevron)
  const NerdyRow = ({
    k,
    v,
    explainKey,
  }: {
    k: string;
    v: string;
    explainKey?: ExplainKey;
  }) => {
    const tappable = !!explainKey;
    if (!tappable) {
      return (
        <View style={styles.nerdyKVRow}>
          <Text style={styles.nerdyKey}>{k}</Text>
          <Text style={styles.nerdyVal}>{v}</Text>
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => explainKey && openExplain(explainKey)}
        style={({ pressed }) => [
          styles.nerdyKVRow,
          pressed ? { opacity: 0.7 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Explain ${k}`}
      >
        <Text style={styles.nerdyKey}>{k}</Text>
        <View style={styles.nerdyValWrap}>
          <Text style={styles.nerdyVal}>{v}</Text>
          <Text style={styles.nerdyChevron}>›</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <>
      {/* Explain modal */}
      <Modal
        visible={explainOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExplainOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setExplainOpen(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{explain?.title ?? 'Details'}</Text>
            <Text style={styles.modalBody}>{explain?.body ?? '—'}</Text>

            <Pressable
              onPress={() => setExplainOpen(false)}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={!!refreshing} onRefresh={refresh} />
        }
      >
        {/* HEADER */}
        <View style={styles.headerBlock}>
          <Text style={typography.title}>Nautical Wx</Text>
          <Text style={styles.headerLine}>{headerLine}</Text>
          <Text style={styles.headerSubLine}>{headerSubLine}</Text>

          <View style={styles.modeToggleRow}>
            <ModeToggle mode={mode} onChange={setMode} />
          </View>
        </View>

        {/* SEARCH */}
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search buoy or station (e.g., Yaquina, 46050)…"
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {searchRows.length > 0 && (
          <View style={styles.searchResults}>
            {searchRows.map((row) => (
              <Text
                key={row.key}
                style={styles.searchResultRow}
                onPress={row.onPress}
              >
                {row.label}
              </Text>
            ))}
          </View>
        )}

        {/* Loading */}
        {loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={typography.small}>Loading marine data…</Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}

        {/* SEA STATE */}
        {(conditions || buoyData) && (
          <Card style={styles.mainCard}>
            <View style={styles.riskRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionLabel}>Sea State</Text>
                {activeBuoy && (
                  <Text style={styles.simpleMeta}>
                    Buoy source: {activeBuoy.name ?? activeBuoy.id} ({activeBuoy.id})
                  </Text>
                )}
              </View>
              <View style={[styles.riskBadge, riskStyle]}>
                <Text style={styles.riskBadgeText}>{seaRisk.level}</Text>
              </View>
            </View>

            <Text style={styles.simpleWave}>
              {waveHeightFt != null ? `${waveHeightFt.toFixed(1)} ft` : '—'}
            </Text>
            <Text style={styles.simpleCondition}>{seaLabel}</Text>

            <Text style={styles.simpleMeta}>
              Swell {swellPeriod != null ? `${swellPeriod.toFixed(0)} s` : '—'} ·{' '}
              {swellDirDeg != null ? `${swellDir} (${Math.round(swellDirDeg)}°)` : '—'}
            </Text>

            <Text style={styles.simpleMeta}>
              Wind {windSpeedKts != null ? `${windSpeedKts.toFixed(1)} kt` : '—'}
              {windGustKts != null ? ` (gust ${windGustKts.toFixed(1)} kt)` : ''}
              {windDirDeg != null ? ` @ ${windDir} (${Math.round(windDirDeg)}°)` : ''}
            </Text>

            <Text style={styles.simpleMeta}>
              Beaufort {beaufort.force != null ? `F${beaufort.force}` : '—'} · {beaufort.label}
            </Text>

            <Text style={styles.simpleMeta}>
              Sea surface temp {formatTemp(waterTempC, tempUnit)}
            </Text>

            {airTempC != null && (
              <Text style={styles.simpleMeta}>
                Air temp {formatTemp(airTempC, tempUnit)}
              </Text>
            )}

            {visibilityNm != null && (
              <Text style={styles.simpleMeta}>
                Visibility {visibilityNm.toFixed(1)} nm
              </Text>
            )}

            {pressureHpa != null && (
              <Text style={styles.simpleMeta}>
                Pressure {pressureHpa.toFixed(1)} hPa
              </Text>
            )}

            <Text style={styles.updatedText}>
              {observedTs
                ? `Observed ${new Date(observedTs).toLocaleTimeString()}`
                : 'Observation time unknown'}
            </Text>

            <Text style={styles.simpleMeta}>{seaRisk.text}</Text>
            <Text style={styles.updatedText}>Source: {sourceLabel}</Text>
          </Card>
        )}

                {/* ✅ NERDY CARD (science-y) */}
        {mode === 'nerdy' && (conditions || buoyData || forecast) && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>Nerdy</Text>

            {/* Derived indices */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Derived indices</Text>

              {/* You don't currently compute a unified "risk score" in buildNerdyData.
                  So: show a placeholder or reuse seaRisk.level as a simple proxy. */}
              <NerdyRow
                k="Risk score"
                v={fmt(
                  nerdyAny?.riskScore ??
                    nerdyAny?.score ??
                    seaRisk?.level ??
                    '—',
                )}
                explainKey="riskScore"
              />

              <NerdyRow
                k="Confidence"
                v={fmt(
                  nerdyAny?.confidence?.level ??
                    nerdyAny?.confidence?.score01 ??
                    nerdyAny?.confidence ??
                    '—',
                )}
                explainKey="confidence"
              />

              <NerdyRow
                k="Generated"
                v={new Date().toLocaleString()}
              />
            </View>

            {/* Wave (from obs) */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Wave</Text>

              <NerdyRow
                k="Hs (m)"
                v={fmt(nerdyAny?.obs?.significantWaveHeightM)}
              />
              <NerdyRow
                k="Hs (ft)"
                v={fmt(
                  nerdyAny?.obs?.significantWaveHeightM != null
                    ? Number(nerdyAny.obs.significantWaveHeightM) * 3.28084
                    : null,
                )}
              />
              <NerdyRow
                k="Tp (s)"
                v={fmt(nerdyAny?.obs?.dominantPeriodS)}
              />
              <NerdyRow
                k="Dir (°)"
                v={fmt(nerdyAny?.obs?.dominantDirectionDeg)}
              />
              <NerdyRow
                k="Dir"
                v={fmt(
                  nerdyAny?.obs?.dominantDirectionDeg != null
                    ? degToCompass(Number(nerdyAny.obs.dominantDirectionDeg))
                    : '—',
                )}
              />
            </View>

            {/* Wind (from obs) */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Wind</Text>

              <NerdyRow
                k="Speed (kt)"
                v={fmt(nerdyAny?.obs?.windSpeedKts)}
              />
              <NerdyRow
                k="Gust (kt)"
                v={fmt(nerdyAny?.obs?.windGustKts)}
              />
              <NerdyRow
                k="Dir (°)"
                v={fmt(nerdyAny?.obs?.windDirectionDeg)}
              />
              <NerdyRow
                k="Dir"
                v={fmt(
                  nerdyAny?.obs?.windDirectionDeg != null
                    ? degToCompass(Number(nerdyAny.obs.windDirectionDeg))
                    : '—',
                )}
              />
            </View>

            {/* Air–sea physics (from windWave + basic ΔT) */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Air–sea physics</Text>

              <NerdyRow
                k="Wind–wave angle (°)"
                v={fmt(nerdyAny?.windWave?.angleOffsetDeg)}
                explainKey="windWaveAngle"
              />

              {/* Your builder uses `regime`, not `label` */}
              <NerdyRow
                k="Interaction"
                v={fmt(nerdyAny?.windWave?.regime)}
                explainKey="interaction"
              />

              {/* You don't currently compute a stability label. Provide ΔT and a simple label here. */}
              <NerdyRow
                k="Stability"
                v={fmt(
                  nerdyAny?.obs?.airTempC != null && nerdyAny?.obs?.seaSurfaceTempC != null
                    ? (Number(nerdyAny.obs.airTempC) - Number(nerdyAny.obs.seaSurfaceTempC) >= 0
                        ? 'Stable-ish'
                        : 'Unstable-ish')
                    : '—',
                )}
                explainKey="stability"
              />

              <NerdyRow
                k="ΔT air–sea (°C)"
                v={fmt(
                  nerdyAny?.obs?.airTempC != null && nerdyAny?.obs?.seaSurfaceTempC != null
                    ? Number(nerdyAny.obs.airTempC) - Number(nerdyAny.obs.seaSurfaceTempC)
                    : null,
                )}
              />
            </View>

            {/* Hazards (from mechanics) */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Hazards</Text>

              {/* "Primary" hazard isn't computed in buildNerdyData today */}
              <NerdyRow
                k="Primary"
                v={fmt(nerdyAny?.primaryHazard ?? '—')}
              />

              {/* Tallest set isn't computed in buildNerdyData today */}
              <NerdyRow
                k="Tallest set"
                v={fmt(nerdyAny?.tallestSet ?? '—')}
                explainKey="tallestSet"
              />

              {/* Breaking risk DOES exist: mechanics.breakingRisk */}
              <NerdyRow
                k="Breaking risk"
                v={fmt(nerdyAny?.mechanics?.breakingRisk)}
                explainKey="breakingRisk"
              />
            </View>

            {__DEV__ && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
                  NerdyData (debug)
                </Text>
                <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 16 }}>
                  {debugNerdy}
                </Text>
              </View>
            )}
          </Card>
        )}


        {/* TIDES – only where supported */}
        {supportsTides && mode === 'simple' && data && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>Today's Tides</Text>

            {predictions.map((p) => (
              <View key={p.time} style={styles.simpleRow}>
                <Text style={styles.tideType}>
                  {p.type === 'H' ? 'High Tide' : 'Low Tide'}
                </Text>

                <Text style={styles.tideValue}>{p.height.toFixed(1)} ft</Text>
                <Text style={styles.tideTime}>{formatTime(p.time)}</Text>
              </View>
            ))}

            <Text style={styles.updatedText}>Updated {formatTime(data.generatedAt)}</Text>
          </Card>
        )}

        {supportsTides && mode === 'nerdy' && data && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>Tide Predictions (Nerdy)</Text>

            {predictions.map((p) => (
              <View key={p.time} style={styles.nerdyRow}>
                <Text style={styles.nerdyLine}>
                  <Text style={styles.nerdyValue}>
                    {p.type === 'H' ? 'HIGH' : 'LOW'}
                  </Text>
                  {` tide at ${formatTime(p.time)} – `}
                  <Text style={styles.nerdyValue}>{p.height.toFixed(2)} ft</Text>
                </Text>
              </View>
            ))}

            <Text style={styles.updatedText}>
              Generated at {new Date(data.generatedAt).toLocaleString()}
            </Text>
          </Card>
        )}

        {/* COASTAL & OFFSHORE FORECAST – zone-driven OR area-driven */}
        {forecast && (
          <Card style={styles.mainCard}>
            <View style={styles.forecastHeaderRow}>
              <Text style={styles.sectionLabel}>Coastal &amp; Offshore Forecast</Text>
              <Text style={styles.forecastBadge}>{forecast.headline}</Text>
            </View>

            {forecastPeriods.map((p) => (
              <View key={p.name} style={styles.forecastRow}>
                <Text style={styles.forecastPeriod}>{p.name}</Text>
                <Text style={styles.forecastText}>{p.summary}</Text>
              </View>
            ))}

            <Text style={styles.updatedText}>
              Issued {new Date(forecast.issuedAt).toLocaleString()}
            </Text>
            <Text style={styles.simpleMeta}>{forecast.source}</Text>
          </Card>
        )}

        {!forecast && forecastLoading && forecastZoneId && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>Coastal &amp; Offshore Forecast</Text>
            <Text style={styles.simpleMeta}>Loading marine forecast…</Text>
          </Card>
        )}

        {!forecast && forecastError && forecastZoneId && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Marine forecast</Text>
            <Text style={styles.errorText}>{forecastError}</Text>
          </Card>
        )}

        {!forecast && !forecastLoading && !forecastError && !forecastZoneId && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Marine forecast</Text>
            <Text style={styles.errorText}>
              Marine forecast not yet configured for this marine area.
            </Text>
          </Card>
        )}

        {!loading && !error && !data && !buoyData && (
          <View style={styles.center}>
            <Text style={typography.small}>
              No nautical data available for this station.
            </Text>
          </View>
        )}
      </ScrollView>
    </>
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
  headerBlock: {
    marginBottom: theme.spacing.md,
  },
  headerLine: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  headerSubLine: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  modeToggleRow: {
    marginTop: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  searchBox: {
    marginTop: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#020617',
  },
  searchInput: {
    fontSize: 12,
    color: theme.colors.textPrimary,
  },
  searchResults: {
    marginTop: 4,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#020617',
    maxHeight: 220,
  },
  searchResultRow: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: theme.colors.textSecondary,
    borderBottomWidth: 0.5,
    borderBottomColor: '#111827',
  },
  mainCard: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    ...typography.label,
    marginBottom: theme.spacing.md,
  },
  simpleWave: {
    fontSize: 40,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  simpleCondition: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  simpleMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  simpleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  tideType: {
    ...typography.body,
  },
  tideValue: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
  tideTime: {
    color: theme.colors.textSecondary,
  },
  nerdyRow: {
    marginBottom: theme.spacing.sm,
  },
  nerdyLine: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  nerdyValue: {
    fontWeight: '600',
    color: theme.colors.textPrimary,
  },
  updatedText: {
    ...typography.small,
    marginTop: theme.spacing.md,
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
  center: {
    marginTop: theme.spacing['2xl'],
    alignItems: 'center',
  },
  riskRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  riskBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  riskBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F9FAFB',
  },
  riskLow: {
    backgroundColor: '#16a34a33',
    borderColor: '#16a34a',
  },
  riskModerate: {
    backgroundColor: '#facc1533',
    borderColor: '#facc15',
  },
  riskHigh: {
    backgroundColor: '#fb923c33',
    borderColor: '#fb923c',
  },
  riskExtreme: {
    backgroundColor: '#ef444433',
    borderColor: '#ef4444',
  },
  forecastHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  forecastBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#020617',
  },
  forecastRow: {
    marginBottom: theme.spacing.sm,
  },
  forecastPeriod: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  forecastText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },

  // ✅ Nerdy layout styles
  nerdySection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#111827',
  },
  nerdySectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  nerdyKVRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 6,
    alignItems: 'center',
  },
  nerdyKey: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  nerdyValWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nerdyVal: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'right',
  },
  nerdyChevron: {
    fontSize: 18,
    lineHeight: 18,
    color: '#94a3b8',
    marginTop: -1,
  },

  // ✅ Explain modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 18,
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: '#0b1220',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#111827',
    padding: 14,
  },
  modalTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 10,
  },
  modalBody: {
    color: '#cbd5e1',
    fontSize: 12,
    lineHeight: 18,
  },
  modalClose: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  modalCloseText: {
    color: 'white',
    fontWeight: '700',
  },
});
