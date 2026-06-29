// app/(tabs)/nautical.tsx
// Nautical Wx - Sea State (waves/wind/SST) + Tides + Marine Forecast
// Driven by a selected marine area (from Buoy Map) + buoy / station search.
// Also supports "zone mode" when launched from polygon world map.

import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
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
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { AnimatedPageBackground } from '../../components/backgrounds/AnimatedPageBackground';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { usePlace } from '../context/PlaceContext';
import { useSettings } from '../context/SettingsContext';

import { OMNI_MARK_WORD } from '../lib/brand/assets';

import { useAllBuoyDetails, useBuoyDetail } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';

import {
  DEFAULT_MARINE_AREA,
  getMarineAreaById,
  MARINE_AREAS,
  type MarineArea,
} from '../lib/nautical/areas';
import { useNauticalSummary } from '../lib/nautical/hooks';
import { useMarineForecast } from '../lib/nautical/marineForecast';
import {
  DEFAULT_NAUTICAL_STATION,
  NAUTICAL_STATIONS,
  type NauticalStation,
} from '../lib/nautical/stations';
import { geocodePlaces, type GeocodeResult } from '../lib/locations/geocode';

// nerdy builder
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
  if (deg == null || isNaN(deg)) return '-';
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
  if (c == null) return '-';
  if (unit === 'C') return `${c.toFixed(1)} C`;
  const f = (c * 9) / 5 + 32;
  return `${f.toFixed(1)} F`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stationForArea(area: MarineArea): NauticalStation {
  return (
    NAUTICAL_STATIONS.find((s) => s.id === area.tideStationId) ??
    DEFAULT_NAUTICAL_STATION
  );
}

function areaCenter(area: MarineArea) {
  return {
    lat: (area.bounds.minLat + area.bounds.maxLat) / 2,
    lon: (area.bounds.minLon + area.bounds.maxLon) / 2,
  };
}

function areaSpan(area: MarineArea) {
  return (area.bounds.maxLat - area.bounds.minLat) * (area.bounds.maxLon - area.bounds.minLon);
}

function areaContains(area: MarineArea, lat: number, lon: number) {
  return (
    lat >= area.bounds.minLat &&
    lat <= area.bounds.maxLat &&
    lon >= area.bounds.minLon &&
    lon <= area.bounds.maxLon
  );
}

function normalizeCountry(value?: string) {
  const raw = (value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'us' || raw === 'usa' || raw === 'united states' || raw === 'united states of america') {
    return 'United States';
  }
  if (raw === "int'l" || raw === 'intl' || raw === 'international') {
    return 'INTL';
  }
  return raw.toUpperCase();
}

const GREAT_LAKES_ADMIN_KEYS = new Set([
  'IL',
  'ILLINOIS',
  'IN',
  'INDIANA',
  'MI',
  'MICHIGAN',
  'MN',
  'MINNESOTA',
  'NY',
  'NEW YORK',
  'OH',
  'OHIO',
  'ON',
  'ONTARIO',
  'PA',
  'PENNSYLVANIA',
  'WI',
  'WISCONSIN',
]);

function normalizeAdminKey(value?: string | null) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\./g, '');
}

function adminKeyFromPlaceLabel(label?: string | null) {
  const raw = String(label ?? '');
  const commaParts = raw.split(',').map((part) => normalizeAdminKey(part));
  for (const part of commaParts) {
    if (GREAT_LAKES_ADMIN_KEYS.has(part)) return part;
  }

  const words = normalizeAdminKey(raw);
  for (const key of GREAT_LAKES_ADMIN_KEYS) {
    if (key.length > 2 && words.includes(key)) return key;
  }

  return '';
}

function isGreatLakesAdmin(value?: string | null) {
  const key = normalizeAdminKey(value);
  return GREAT_LAKES_ADMIN_KEYS.has(key) || GREAT_LAKES_ADMIN_KEYS.has(adminKeyFromPlaceLabel(value));
}

function isNamedGreatLakeArea(area: MarineArea) {
  return area.kind === 'lake' && area.id.startsWith('GL_LAKE_');
}

function distanceToAreaBoundsKm(area: MarineArea, lat: number, lon: number) {
  const clampedLat = Math.max(area.bounds.minLat, Math.min(lat, area.bounds.maxLat));
  const clampedLon = Math.max(area.bounds.minLon, Math.min(lon, area.bounds.maxLon));
  return haversineKm(lat, lon, clampedLat, clampedLon);
}

function distanceToStationKm(station: NauticalStation, lat: number, lon: number) {
  if (station.latitude == null || station.longitude == null) return Number.POSITIVE_INFINITY;
  return haversineKm(lat, lon, station.latitude, station.longitude);
}

function resolveAreaForPoint(lat: number, lon: number): MarineArea {
  const containing = MARINE_AREAS.filter((candidate) => areaContains(candidate, lat, lon));
  if (containing.length) {
    return containing.sort((a, b) => {
      const kindRank = (candidate: MarineArea) =>
        candidate.kind === 'coastal' ? 0 : candidate.kind === 'lake' ? 1 : candidate.kind === 'offshore' ? 2 : 3;
      const rankDiff = kindRank(a) - kindRank(b);
      if (rankDiff !== 0) return rankDiff;
      return areaSpan(a) - areaSpan(b);
    })[0];
  }

  return (
    MARINE_AREAS
      .map((candidate) => {
        const center = areaCenter(candidate);
        return {
          area: candidate,
          distanceKm: haversineKm(lat, lon, center.lat, center.lon),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm)[0]?.area ?? DEFAULT_MARINE_AREA
  );
}

function resolveNearestMarineAreaForPoint(lat: number, lon: number, country?: string, admin?: string): MarineArea {
  const countryKey = normalizeCountry(country);
  const greatLakesAdmin = isGreatLakesAdmin(admin);
  const candidates = MARINE_AREAS.filter(
    (candidate) => candidate.kind === 'coastal' || candidate.kind === 'lake',
  );
  const pool = candidates.length ? candidates : MARINE_AREAS.filter((candidate) => candidate.kind !== 'high-seas');

  return (
    pool
      .map((candidate) => {
        const distanceKm = distanceToAreaBoundsKm(candidate, lat, lon);
        const contains = areaContains(candidate, lat, lon);
        const sameCountryBoost =
          countryKey && normalizeCountry(candidate.country) === countryKey ? 240 : 0;
        const tideBoost = candidate.tideStationId ? 25 : 0;
        const namedGreatLakeBoost = greatLakesAdmin && isNamedGreatLakeArea(candidate) ? 520 : 0;
        const inlandWaterBoost = candidate.kind === 'lake' ? 35 : 0;
        const genericGreatLakesPenalty = candidate.id === 'GL_LAKES' ? 1200 : 0;
        const score =
          (contains ? 4000 : 0) +
          sameCountryBoost +
          namedGreatLakeBoost +
          tideBoost +
          inlandWaterBoost -
          genericGreatLakesPenalty -
          distanceKm * 5 -
          areaSpan(candidate);
        return { area: candidate, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.area ?? DEFAULT_MARINE_AREA
  );
}

function resolveStationForPoint(lat: number, lon: number, fallbackArea: MarineArea): NauticalStation {
  return (
    NAUTICAL_STATIONS
      .filter((candidate) => candidate.latitude != null && candidate.longitude != null)
      .map((candidate) => {
        const distanceKm = distanceToStationKm(candidate, lat, lon);
        const inFallbackArea =
          candidate.latitude != null &&
          candidate.longitude != null &&
          areaContains(fallbackArea, candidate.latitude, candidate.longitude);
        const score = (inFallbackArea ? 280 : 0) - distanceKm * 3;
        return { station: candidate, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.station ?? stationForArea(fallbackArea)
  );
}

function resolveMarineContextForPlace(place: GeocodeResult) {
  const placeCountry = normalizeCountry(place.country);
  const greatLakesAdmin = isGreatLakesAdmin(place.admin1);

  const areaCandidates = MARINE_AREAS
    .filter((candidate) => candidate.kind !== 'high-seas')
    .map((candidate) => {
      const distanceKm = distanceToAreaBoundsKm(candidate, place.lat, place.lon);
      const contains = areaContains(candidate, place.lat, place.lon);
      const kindBoost =
        candidate.kind === 'coastal' ? 220 : candidate.kind === 'lake' ? 200 : 120;
      const genericGreatLakesPenalty = candidate.id === 'GL_LAKES' ? 1200 : 0;
      const namedGreatLakeBoost = greatLakesAdmin && isNamedGreatLakeArea(candidate) ? 640 : 0;
      const sameCountryBoost =
        placeCountry && normalizeCountry(candidate.country) === placeCountry ? 420 : 0;
      const score =
        (contains ? 4000 : 0) +
        sameCountryBoost +
        namedGreatLakeBoost +
        kindBoost +
        (candidate.tideStationId ? 40 : 0) -
        genericGreatLakesPenalty -
        distanceKm * 5 -
        areaSpan(candidate) * 1.5;

      return { area: candidate, distanceKm, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestArea = areaCandidates[0]?.area;
  const bestAreaDistanceKm = areaCandidates[0]?.distanceKm ?? Number.POSITIVE_INFINITY;
  if (!bestArea) return null;

  const stationCandidates = NAUTICAL_STATIONS.filter(
    (candidate) => candidate.latitude != null && candidate.longitude != null,
  )
    .map((candidate) => {
      const distanceKm = distanceToStationKm(candidate, place.lat, place.lon);
      const inBestArea =
        candidate.latitude != null &&
        candidate.longitude != null &&
        areaContains(bestArea, candidate.latitude, candidate.longitude);
      const score = (inBestArea ? 300 : 0) - distanceKm * 3;
      return { station: candidate, distanceKm, score };
    })
    .sort((a, b) => b.score - a.score);

  const bestStation = stationCandidates[0]?.station ?? stationForArea(bestArea);
  const bestStationDistanceKm =
    stationCandidates[0]?.distanceKm ??
    distanceToStationKm(stationForArea(bestArea), place.lat, place.lon);

  const maxAllowedDistanceKm =
    bestArea.kind === 'lake' && greatLakesAdmin
      ? 650
      : bestArea.kind === 'lake'
        ? 260
        : bestArea.kind === 'coastal'
          ? 300
          : 420;
  const supported =
    bestAreaDistanceKm <= maxAllowedDistanceKm || bestStationDistanceKm <= maxAllowedDistanceKm;

  if (!supported) return null;

  return {
    area: bestArea,
    station: bestStation,
    areaDistanceKm: bestAreaDistanceKm,
    stationDistanceKm: bestStationDistanceKm,
  };
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

/**
 * Smart formatter that prevents "[object Object]"
 * and renders common shapes nicely.
 */
function fmtSmart(v: unknown): string {
  if (v == null) return '-';

  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '-';
    return String(v);
  }

  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';

  if (Array.isArray(v)) {
    if (v.length === 0) return '-';
    if (v.length === 1) return fmtSmart(v[0]);
    return v.slice(0, 3).map(fmtSmart).join(', ') + (v.length > 3 ? '...' : '');
  }

  if (typeof v === 'object') {
    const o = v as any;

    // { label, value, unit }
    if (typeof o.label === 'string') {
      const label = o.label;
      const unit = typeof o.unit === 'string' ? ` ${o.unit}` : '';
      if (typeof o.value === 'number' && Number.isFinite(o.value)) {
        return `${label} (${o.value}${unit})`;
      }
      if (typeof o.value === 'string') return `${label} (${o.value})`;
      return label;
    }

    // { value, unit }
    if (typeof o.value === 'number' && Number.isFinite(o.value)) {
      const unit = typeof o.unit === 'string' ? ` ${o.unit}` : '';
      return `${o.value}${unit}`;
    }
    if (typeof o.value === 'string') return o.value;

    // confidence-ish
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

    if (typeof o.text === 'string') return o.text;

    // short-ish JSON
    try {
      const s = JSON.stringify(o);
      if (!s) return '[data]';
      return s.length <= 140 ? s : s.slice(0, 140) + '...';
    } catch {
      return '[data]';
    }
  }

  return String(v);
}

const fmt = fmtSmart;

function displayNumber(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function displayMetric(value: number | null | undefined, unit: string, digits = 1) {
  const n = displayNumber(value, digits);
  return n === '-' ? '-' : `${n} ${unit}`;
}

function displayCompass(deg: number | null | undefined) {
  const dir = degToCompass(deg);
  return dir === '-' ? '-' : dir;
}

// ---------- Nerdy "Explain" content ---------------------------------

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
          '• Wind-wave angle (onshore / opposing wind increases steepness)\n\n' +
          'How it’s computed here:\n' +
          '• Estimate steepness ~ Hs / L where L ≈ 1.56·Tp² (deep-water wavelength)\n' +
          '• Map steepness into Low/Moderate/Elevated/High\n\n' +
          'Note: this is not a certified marine safety metric - it’s a science-y indicator for situational awareness.',
      };
    case 'tallestSet':
      return {
        title: 'Tallest set',
        body:
          'A "set" is a group of larger-than-average waves. This estimates what the biggest wave in a set could be.\n\n' +
          'Rule of thumb:\n' +
          '• Tallest set ≈ ~1.8× Hs (significant wave height)\n\n' +
          'Why:\n' +
          '• Hs is roughly the average of the highest 1/3 of waves, but occasional larger waves occur due to randomness and wave-grouping.\n\n' +
          'Use:\n' +
          '• Helps visualize "sneaker wave" potential when combined with long periods and opposing wind.',
      };
    case 'windWaveAngle':
      return {
        title: 'Wind-wave angle',
        body:
          'Angle between wind direction and dominant wave direction.\n\n' +
          'Interpretation:\n' +
          '• ~0 deg: wind aligned with waves (following wind)\n' +
          '• ~180 deg: wind opposing waves (steeper, rougher seas)\n' +
          '• ~90 deg: cross sea (confused / uncomfortable)\n\n' +
          'Computed as the absolute smallest angular difference between two bearings (0-180 deg).',
      };
    case 'interaction':
      return {
        title: 'Interaction',
        body:
          'A qualitative label summarizing how wind direction relates to wave direction.\n\n' +
          'Examples:\n' +
          '• Aligned: wind roughly aligned with wave direction\n' +
          '• Opposing: wind roughly against the wave direction\n' +
          '• Cross sea: wind roughly perpendicular to the wave direction\n\n' +
          'This mainly affects perceived sea state and breaking potential.',
      };
    case 'stability':
      return {
        title: 'Stability (air-sea)',
        body:
          'A simple indicator based on Delta T = air temperature − sea surface temperature.\n\n' +
          'Rules of thumb:\n' +
          '• Delta T > 0 (air warmer): more stable near-surface layer, less vertical mixing\n' +
          '• Delta T < 0 (air colder): more unstable, more mixing and gustiness possible\n\n' +
          'This can change how "punchy" winds feel at the surface.',
      };
    case 'riskScore':
      return {
        title: 'Risk score',
        body:
          'A combined, heuristic score derived from wave height, period, wind speed, gusts, and wind-wave interaction.\n\n' +
          'Typically:\n' +
          '• Increases with wave height (Hs)\n' +
          '• Increases with long period swell (Tp)\n' +
          '• Increases with stronger wind/gusts\n' +
          '• Adds a bump for opposing wind and cross seas\n\n' +
          'It’s intended for quick scanning - always defer to official forecasts and local knowledge.',
      };
    case 'confidence':
      return {
        title: 'Confidence',
        body:
          'A coarse indicator of how complete / consistent the inputs are.\n\n' +
          'Higher when:\n' +
          '• Buoy observations are available (fresh timestamp)\n' +
          '• Model agrees with observations\n\n' +
          'Lower when:\n' +
          '• Data is stale or partial\n' +
          '• Cross-sea regime increases uncertainty',
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

  // accept either `zoneName` or `name`
  const zoneName = asString(params.zoneName) ?? asString(params.name);

  const isZoneMode = !!zoneId;

  const [mode, setMode] = useState<Mode>('simple');
  const { active } = usePlace();
  const { tempUnit } = useSettings();
  const lastAutoCoastPlaceKeyRef = useRef<string | null>(null);

  // Explain modal state
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainKey, setExplainKey] = useState<ExplainKey | null>(null);
  const explain = explainKey ? explainFor(explainKey) : null;
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

  const openExplain = (key: ExplainKey) => {
    setExplainKey(key);
    setExplainOpen(true);
  };

  const openLearnTopic = useCallback((topicId?: string) => {
    setLearnTopicId(topicId ?? undefined);
    setLearnOpen(true);
  }, []);

  // --- AREA + STATION SELECTION -----------------------------------

  const initialArea: MarineArea =
    getMarineAreaById(areaId) ?? DEFAULT_MARINE_AREA;
  const [area, setArea] = useState<MarineArea>(initialArea);

  // In zone mode, we do NOT show tides (no single tide station)
  const supportsTides = isZoneMode ? false : area.supportsTides !== false;

  const initialStation: NauticalStation =
    NAUTICAL_STATIONS.find((s) => s.id === area.tideStationId) ??
    DEFAULT_NAUTICAL_STATION;

  const [station, setStation] = useState<NauticalStation>(initialStation);

  // Search + selected buoy for sea state source
  const [search, setSearch] = useState('');
  const [selectedBuoyId, setSelectedBuoyId] = useState<string | null>(null);
  const [selectedPlaceLabel, setSelectedPlaceLabel] = useState<string | null>(null);
  const [placeResults, setPlaceResults] = useState<GeocodeResult[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);

  // Data hooks
  const { data, loading, error, refreshing, refresh } =
    useNauticalSummary(station);

  const { data: allBuoyData } = useAllBuoyDetails();
  const allBuoys: BuoyDetailData[] = allBuoyData ?? [];

  // station.id is a tide station id, not a buoy id.
  const stationBuoyId = station.buoyId ?? null;
  const activeBuoyId = selectedBuoyId ?? stationBuoyId;

  const { data: buoyData } = useBuoyDetail(activeBuoyId ?? undefined);

  useEffect(() => {
    if (isZoneMode || areaId) return;
    if (!active || !Number.isFinite(active.lat) || !Number.isFinite(active.lon)) return;

    const nextKey = `${active.id}:${active.lat.toFixed(3)},${active.lon.toFixed(3)}`;
    if (lastAutoCoastPlaceKeyRef.current === nextKey) return;
    lastAutoCoastPlaceKeyRef.current = nextKey;

    const nearestArea = resolveNearestMarineAreaForPoint(active.lat, active.lon, undefined, active.name);
    const nearestStation = resolveStationForPoint(active.lat, active.lon, nearestArea);

    setArea(nearestArea);
    setStation(nearestStation);
    setSelectedBuoyId(nearestArea.primaryBuoyId ?? nearestStation.buoyId ?? null);
    setSelectedPlaceLabel(active.name);
  }, [active, areaId, isZoneMode]);

  // Forecast source:
  const forecastZoneId = isZoneMode ? zoneId : area.forecastZoneId;

  const { forecast, loading: forecastLoading, error: forecastError } =
    useMarineForecast(forecastZoneId, isZoneMode ? wfo : undefined);

  const activeBuoy =
    allBuoys.find(
      (b) => b.id.toUpperCase() === String(activeBuoyId ?? '').toUpperCase(),
    ) ?? null;

  const clearSearchUi = () => {
    Keyboard.dismiss();
    setSearch('');
    setPlaceResults([]);
    setPlaceSearchLoading(false);
  };

  useEffect(() => {
    const q = search.trim();
    if (q.length < 3) {
      setPlaceResults([]);
      setPlaceSearchLoading(false);
      return;
    }

    let cancelled = false;
    setPlaceSearchLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await geocodePlaces(q);
        if (!cancelled) {
          setPlaceResults(results.slice(0, 8));
        }
      } catch {
        if (!cancelled) setPlaceResults([]);
      } finally {
        if (!cancelled) setPlaceSearchLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  // --- SEARCH: stations + buoys -----------------------------------

  type SearchRow = {
    key: string;
    label: string;
    subtitle?: string;
    onPress: () => void;
  };

  const searchRows: SearchRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    const rows: SearchRow[] = [];
    const seen = new Set<string>();
    const addRow = (row: SearchRow) => {
      if (seen.has(row.key)) return;
      seen.add(row.key);
      rows.push(row);
    };

    const applyArea = (nextArea: MarineArea, _nextLabel: string, nextBuoyId?: string | null) => {
      const nextStation = stationForArea(nextArea);
      setArea(nextArea);
      setStation(nextStation);
      setSelectedBuoyId(nextBuoyId ?? nextArea.primaryBuoyId ?? nextStation.buoyId ?? null);
      setSelectedPlaceLabel(null);
      clearSearchUi();
    };

    const matchingAreas = MARINE_AREAS.filter((marineArea) => {
      const hay = [
        marineArea.name,
        marineArea.region,
        marineArea.ocean,
        marineArea.kind,
        marineArea.country,
        marineArea.id,
        marineArea.forecastZoneId,
        marineArea.primaryBuoyId,
        marineArea.tideStationId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    }).slice(0, 20);

    matchingAreas.forEach((marineArea) => {
      addRow({
        key: `area-${marineArea.id}`,
        label: marineArea.name,
        subtitle: `${marineArea.region} · ${marineArea.kind} area`,
        onPress: () => applyArea(marineArea, marineArea.name),
      });
    });

    // Stations (curated)
    const matchingStations = NAUTICAL_STATIONS.filter((s) => {
      const name = s.name.toLowerCase();
      const id = s.id.toLowerCase();
      return name.includes(q) || id.includes(q);
    }).slice(0, 30);

    matchingStations.forEach((s) => {
      addRow({
        key: `station-${s.id}`,
        subtitle: `Tide station ${s.id}`,
        label: `${s.name} · tide station`,
        onPress: () => {
          const matchingArea =
            MARINE_AREAS.find((candidate) => candidate.tideStationId === s.id) ?? area;
          setArea(matchingArea);
          setStation(s);
          setSelectedBuoyId(s.buoyId ?? matchingArea.primaryBuoyId ?? null);
          setSelectedPlaceLabel(null);
          clearSearchUi();
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
      .slice(0, 60);

    matchingBuoys.forEach((b) => {
      const display =
        b.name?.trim() ||
        (b as any).stationName?.trim?.() ||
        (b as any).description?.trim?.() ||
        b.id;

      addRow({
        key: `buoy-${b.id}`,
        label: `${display} · buoy ${b.id}`,
        subtitle: `Buoy ${b.id}`,
        onPress: () => {
          const nearestArea = resolveAreaForPoint(b.lat, b.lon);
          const nearestStation = resolveStationForPoint(b.lat, b.lon, nearestArea);
          setArea(nearestArea);
          setStation(nearestStation);
          setSelectedBuoyId(b.id);
          setSelectedPlaceLabel(null);
          clearSearchUi();
        },
      });
    });

    placeResults.forEach((place) => {
      const context = resolveMarineContextForPlace(place);
      if (!context) return;

      const nearestArea = context.area;
      const nearestStation = context.station;

      const placeLabel = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
      const subtitleParts = [`Marine area: ${nearestArea.name}`];
      if (nearestStation?.name) {
        subtitleParts.push(`Nearest station: ${nearestStation.name}`);
      }

      addRow({
        key: `place-${place.name}-${place.lat.toFixed(3)}-${place.lon.toFixed(3)}`,
        label: placeLabel,
        subtitle: subtitleParts.join(' · '),
        onPress: () => {
          setArea(nearestArea);
          setStation(nearestStation);
          setSelectedBuoyId(nearestArea.primaryBuoyId ?? nearestStation.buoyId ?? null);
          setSelectedPlaceLabel(placeLabel);
          clearSearchUi();
        },
      });
    });

    return rows.slice(0, 80);
  }, [search, allBuoys, area, placeResults]);
  const searchActive = search.trim().length > 0;
  const showSearchResults = searchRows.length > 0;

  // --- DERIVED CONDITIONS -----------------------------------------

  const conditions = data?.conditions ?? null;

  // Prefer live buoy observations; fall back to model
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
    ? 'Live buoy observation'
    : conditions?.modelSource ?? 'Marine model';
  const forecastSourceLabel = forecast?.source?.includes('Open-Meteo') ? forecast.source : 'Official marine forecast';

  const riskStyle =
    seaRisk.level === 'Low'
      ? styles.riskLow
      : seaRisk.level === 'Moderate'
        ? styles.riskModerate
        : seaRisk.level === 'High'
          ? styles.riskHigh
          : styles.riskExtreme;

  // Header lines
  const headerLine = isZoneMode
    ? String(zoneName ?? `Marine Zone ${zoneId}`)
    : selectedPlaceLabel
      ? selectedPlaceLabel
    : supportsTides
      ? station.name
      : area.name;

  const headerSubLine = isZoneMode
    ? `Zone: ${String(zoneId)}${wfo ? ` · WFO ${String(wfo)}` : ''}`
    : selectedPlaceLabel
      ? `Marine area: ${area.name}`
    : supportsTides
      ? `Marine area: ${area.name}`
      : `${area.region} · ${area.ocean}`;

  // typed view of predictions/periods without forcing you to change your hook types
  const predictions = (data?.predictions ?? []) as TidePrediction[];
  const forecastPeriods = (forecast?.periods ?? []) as ForecastPeriod[];

  // Nerdy model (typed)
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

  const debugNerdy =
    __DEV__ && nerdy
      ? JSON.stringify(
          nerdy,
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
    learnTopicId,
    hint,
  }: {
    k: string;
    v: string;
    explainKey?: ExplainKey;
    learnTopicId?: string;
    hint?: string;
  }) => {
    const tappable = !!explainKey || !!learnTopicId;
    if (!tappable) {
      return (
        <View style={styles.nerdyKVRow}>
          <View style={styles.nerdyKeyBlock}>
            <Text style={styles.nerdyKey}>{k}</Text>
            {hint ? <Text style={styles.nerdyHint}>{hint}</Text> : null}
          </View>
          <Text style={styles.nerdyVal}>{v}</Text>
        </View>
      );
    }

    return (
      <Pressable
        onPress={() => {
          if (learnTopicId) openLearnTopic(learnTopicId);
          else if (explainKey) openExplain(explainKey);
        }}
        style={({ pressed }) => [
          styles.nerdyKVRow,
          styles.nerdyKVRowPressable,
          pressed ? { opacity: 0.7 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Explain ${k}`}
      >
        <View style={styles.nerdyKeyBlock}>
          <Text style={styles.nerdyKey}>{k}</Text>
          {hint ? <Text style={styles.nerdyHint}>{hint}</Text> : null}
        </View>
        <View style={styles.nerdyValWrap}>
          <Text style={styles.nerdyVal}>{v}</Text>
          <Text style={styles.nerdyChevron}>{'>'}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.screenRoot}>
      <AnimatedPageBackground variant="nautical" />
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
            <Text style={styles.modalBody}>{explain?.body ?? '-'}</Text>

            <Pressable
              onPress={() => setExplainOpen(false)}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <LearnMoreModal
        visible={learnOpen}
        onClose={() => setLearnOpen(false)}
        initialTopicId={learnTopicId}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl refreshing={!!refreshing} onRefresh={refresh} />
        }
      >
        {/* HEADER (standard OMNI) */}
        <View style={styles.headerBlock}>
          <View style={styles.headerTopRow}>
            <Image source={OMNI_MARK_WORD} style={styles.brandWordmark} resizeMode="contain" />
            <View style={styles.headerControls}>
              <View style={styles.domainPill}>
                <Text style={styles.domainPillText}>Nautical</Text>
              </View>
              <ModeToggle mode={mode} onChange={setMode} />
            </View>
          </View>

          <Text style={styles.headerTitle} numberOfLines={2}>
            {headerLine}
          </Text>
          <Text style={styles.headerLine} numberOfLines={2}>
            {headerSubLine}
          </Text>
        </View>

        {/* SEARCH */}
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search buoy or station (e.g., Yaquina, 46050)..."
            placeholderTextColor={theme.colors.textSecondary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {search.trim().length >= 3 && placeSearchLoading && (
          <Text style={styles.searchHint}>Looking up coastal places...</Text>
        )}

        {search.trim().length > 0 && (
          <Text style={styles.searchHint}>
            {searchRows.length} result{searchRows.length === 1 ? '' : 's'} across marine areas, tide stations, buoys, and nearby places
          </Text>
        )}

        {showSearchResults && (
          <View style={styles.searchResults}>
            {searchRows.map((row) => (
              <Pressable
                key={row.key}
                style={styles.searchResultRow}
                onPress={row.onPress}
              >
                <Text style={styles.searchResultLabel}>{row.label}</Text>
                {row.subtitle ? (
                  <Text style={styles.searchResultMeta}>{row.subtitle}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}

        {/* Loading */}
        {!searchActive && loading && !data && (
          <View style={styles.center}>
            <ActivityIndicator size="large" />
            <Text style={typography.small}>Loading marine data...</Text>
          </View>
        )}

        {/* Error */}
        {!searchActive && error && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        )}

        {/* SEA STATE */}
        {!searchActive && (conditions || buoyData) && (
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
              {waveHeightFt != null ? `${waveHeightFt.toFixed(1)} ft` : '-'}
            </Text>
            <Text style={styles.simpleCondition}>{seaLabel}</Text>

            <Text style={styles.simpleMeta}>
              Swell {swellPeriod != null ? `${swellPeriod.toFixed(0)} s` : '-'} ·{' '}
              {swellDirDeg != null
                ? `${swellDir} (${Math.round(swellDirDeg)} deg)`
                : '-'}
            </Text>

            <Text style={styles.simpleMeta}>
              Wind {windSpeedKts != null ? `${windSpeedKts.toFixed(1)} kt` : '-'}
              {windGustKts != null ? ` (gust ${windGustKts.toFixed(1)} kt)` : ''}
              {windDirDeg != null ? ` @ ${windDir} (${Math.round(windDirDeg)} deg)` : ''}
            </Text>

            <Text style={styles.simpleMeta}>
              Beaufort {beaufort.force != null ? `F${beaufort.force}` : '-'} ·{' '}
              {beaufort.label}
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

        {/* NERDY CARD */}
        {!searchActive && mode === 'nerdy' && (conditions || buoyData || forecast) && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>wxLab</Text>

            <View style={styles.nerdySummaryGrid}>
              <Pressable style={styles.nerdySummaryTile} onPress={() => openLearnTopic('marine-risk-score')}>
                <Text style={styles.nerdySummaryLabel}>Risk</Text>
                <Text style={styles.nerdySummaryValue}>
                  {nerdy.riskScore != null ? `${nerdy.riskScore}/100` : seaRisk.level}
                </Text>
                <Text style={styles.nerdySummaryMeta}>{nerdy.riskLevel ?? seaRisk.level}</Text>
              </Pressable>
              <Pressable style={styles.nerdySummaryTile} onPress={() => openLearnTopic('significant-wave-height')}>
                <Text style={styles.nerdySummaryLabel}>Seas</Text>
                <Text style={styles.nerdySummaryValue}>
                  {displayMetric(
                    nerdy.obs?.significantWaveHeightM != null
                      ? Number(nerdy.obs.significantWaveHeightM) * 3.28084
                      : null,
                    'ft',
                    1,
                  )}
                </Text>
                <Text style={styles.nerdySummaryMeta}>Hs</Text>
              </Pressable>
              <Pressable style={styles.nerdySummaryTile} onPress={() => openLearnTopic('marine-confidence')}>
                <Text style={styles.nerdySummaryLabel}>Confidence</Text>
                <Text style={styles.nerdySummaryValue}>{fmt(nerdy.confidence?.level ?? '-')}</Text>
                <Text style={styles.nerdySummaryMeta}>source quality</Text>
              </Pressable>
            </View>

            {/* Derived indices */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Derived indices</Text>

              <NerdyRow
                k="Risk score"
                v={fmt(
                  nerdy.riskScore != null
                    ? `${nerdy.riskScore}/100 · ${nerdy.riskLevel ?? '-'}`
                    : (seaRisk.level ?? '-'),
                )}
                explainKey="riskScore"
                learnTopicId="marine-risk-score"
                hint="heuristic scan, not a safety rating"
              />

              <NerdyRow
                k="Confidence"
                v={fmt(nerdy.confidence?.level ?? nerdy.confidence?.score01 ?? '-')}
                explainKey="confidence"
                learnTopicId="marine-confidence"
                hint="freshness and source completeness"
              />

              <NerdyRow k="Generated" v={new Date().toLocaleString()} />
            </View>

            {/* Wave */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Wave</Text>

              <NerdyRow
                k="Significant wave height"
                v={displayMetric(nerdy.obs?.significantWaveHeightM, 'm', 2)}
                hint="Hs, average of highest one-third waves"
                learnTopicId="significant-wave-height"
              />
              <NerdyRow
                k="Significant wave height"
                v={displayMetric(
                  nerdy.obs?.significantWaveHeightM != null
                    ? Number(nerdy.obs.significantWaveHeightM) * 3.28084
                    : null,
                  'ft',
                  1,
                )}
                hint="same Hs in user-friendly feet"
                learnTopicId="significant-wave-height"
              />
              <NerdyRow
                k="Dominant period"
                v={displayMetric(nerdy.obs?.dominantPeriodS, 's', 0)}
                hint="Tp, seconds between dominant waves"
                learnTopicId="wave-period"
              />
              <NerdyRow
                k="Wave direction degrees"
                v={displayMetric(nerdy.obs?.dominantDirectionDeg, 'deg', 0)}
                learnTopicId="wave-direction"
              />
              <NerdyRow
                k="Dir"
                v={fmt(
                  nerdy.obs?.dominantDirectionDeg != null
                    ? degToCompass(Number(nerdy.obs.dominantDirectionDeg))
                    : '-',
                )}
              />

              <NerdyRow
                k="Wavelength (m)"
                v={fmt(nerdy.mechanics?.wavelengthM)}
              />
              <NerdyRow
                k="Steepness (H/L)"
                v={fmt(nerdy.mechanics?.steepnessRatio)}
              />
              <NerdyRow
                k="Steepness label"
                v={fmt(nerdy.mechanics?.steepnessLabel)}
              />
            </View>

            {/* Wind */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Wind</Text>

              <NerdyRow
                k="Sustained wind"
                v={displayMetric(nerdy.obs?.windSpeedKts, 'kt', 1)}
                hint="knots"
                learnTopicId="marine-wind"
              />
              <NerdyRow
                k="Gust"
                v={displayMetric(nerdy.obs?.windGustKts, 'kt', 1)}
                hint="short bursts above sustained wind"
                learnTopicId="marine-wind"
              />
              <NerdyRow
                k="Wind direction degrees"
                v={displayMetric(nerdy.obs?.windDirectionDeg, 'deg', 0)}
                learnTopicId="marine-wind"
              />
              <NerdyRow
                k="Dir"
                v={fmt(
                  nerdy.obs?.windDirectionDeg != null
                    ? degToCompass(Number(nerdy.obs.windDirectionDeg))
                    : '-',
                )}
                hint="direction wind is coming from"
                learnTopicId="marine-wind"
              />
              <NerdyRow
                k="Beaufort"
                v={beaufort.force != null ? `F${beaufort.force} - ${beaufort.label}` : '-'}
                hint="wind force reference scale"
                learnTopicId="beaufort-scale"
              />
            </View>

            {/* Air-sea physics */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Air-sea physics</Text>

              <NerdyRow
                k="Wind-wave angle"
                v={displayMetric(nerdy.windWave?.angleOffsetDeg, 'deg', 0)}
                explainKey="windWaveAngle"
                learnTopicId="wind-wave-interaction"
                hint="wind direction compared with swell direction"
              />

              <NerdyRow
                k="Interaction"
                v={fmt(nerdy.windWave?.regime)}
                explainKey="interaction"
                learnTopicId="wind-wave-interaction"
                hint="aligned, opposing, or cross sea"
              />

              <NerdyRow
                k="Stability"
                v={fmt(nerdy.stability ?? '-')}
                explainKey="stability"
                learnTopicId="air-sea-stability"
                hint="air temperature compared with sea temperature"
              />

              <NerdyRow
                k="Air minus sea temp"
                v={displayMetric(nerdy.deltaTAirSeaC ?? null, 'C', 1)}
                hint="positive means air warmer than water"
                learnTopicId="air-sea-stability"
              />
            </View>

            {/* Hazards */}
            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Hazards</Text>

              <NerdyRow k="Primary" v={fmt(nerdy.primaryHazard ?? '-')} />

              <NerdyRow
                k="Tallest set"
                v={fmt(
                  nerdy.tallestSetM != null
                    ? `${(Number(nerdy.tallestSetM) * 3.28084).toFixed(1)} ft`
                    : '-',
                )}
                explainKey="tallestSet"
                learnTopicId="tallest-set"
                hint="rough estimate from Hs"
              />

              <NerdyRow
                k="Breaking risk"
                v={fmt(nerdy.mechanics?.breakingRisk)}
                explainKey="breakingRisk"
                learnTopicId="wave-steepness-breaking"
                hint="steepness-based whitecap risk"
              />
            </View>

            <View style={styles.nerdySection}>
              <Text style={styles.nerdySectionTitle}>Data Quality & Units</Text>
              <NerdyRow
                k="Marine units"
                v="ft, m, kt, s, deg, C, hPa"
                hint="tap for what each unit means"
                learnTopicId="marine-units"
              />
            </View>

            {__DEV__ && (
              <View style={{ marginTop: 12 }}>
                <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 6 }}>
                  wxLab data (debug)
                </Text>
                <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 16 }}>
                  {debugNerdy}
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* TIDES - only where supported */}
        {supportsTides && mode === 'simple' && data && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>{"Today's Tides"}</Text>

            {predictions.map((p) => (
              <View key={p.time} style={styles.simpleRow}>
                <Text style={styles.tideType}>
                  {p.type === 'H' ? 'High Tide' : 'Low Tide'}
                </Text>

                <Text style={styles.tideValue}>{p.height.toFixed(1)} ft</Text>
                <Text style={styles.tideTime}>{formatTime(p.time)}</Text>
              </View>
            ))}

            <Text style={styles.updatedText}>
              Updated {formatTime(data.generatedAt)}
            </Text>
          </Card>
        )}

        {supportsTides && mode === 'nerdy' && data && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>Tide Predictions (wxLab)</Text>

            {predictions.map((p) => (
              <View key={p.time} style={styles.nerdyRow}>
                <Text style={styles.nerdyLine}>
                  <Text style={styles.nerdyValue}>
                    {p.type === 'H' ? 'HIGH' : 'LOW'}
                  </Text>
                  {` tide at ${formatTime(p.time)} - `}
                  <Text style={styles.nerdyValue}>{p.height.toFixed(2)} ft</Text>
                </Text>
              </View>
            ))}

            <Text style={styles.updatedText}>
              Generated at {new Date(data.generatedAt).toLocaleString()}
            </Text>
          </Card>
        )}

        {/* COASTAL & OFFSHORE FORECAST */}
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
            <Text style={styles.simpleMeta}>{forecastSourceLabel}</Text>
          </Card>
        )}

        {!forecast && forecastLoading && forecastZoneId && (
          <Card style={styles.mainCard}>
            <Text style={styles.sectionLabel}>Coastal &amp; Offshore Forecast</Text>
            <Text style={styles.simpleMeta}>Loading marine forecast...</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#020817',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },
  headerBlock: {
    marginBottom: theme.spacing.md,
  },
  headerLine: {
    ...typography.subtitle,
    marginTop: 4,
  },
  headerTitle: {
    ...typography.title,
    marginTop: theme.spacing.sm,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerControls: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  brandWordmark: { width: 92, height: 108, backgroundColor: 'transparent' },

  domainPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  domainPillText: { fontSize: 11, fontWeight: '900', color: 'white' },
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
  searchHint: {
    marginTop: 6,
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  searchResults: {
    marginTop: 4,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: '#1f2937',
    backgroundColor: '#020617',
    maxHeight: 220,
    overflow: 'hidden',
    zIndex: 20,
    elevation: 6,
  },
  searchResultRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#111827',
  },
  searchResultLabel: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    fontWeight: '700',
  },
  searchResultMeta: {
    marginTop: 2,
    fontSize: 11,
    color: theme.colors.textSecondary,
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

  // Nerdy layout styles
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
  nerdySummaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  nerdySummaryTile: {
    flex: 1,
    minHeight: 84,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.22)',
    backgroundColor: 'rgba(14,165,233,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  nerdySummaryLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  nerdySummaryValue: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
  },
  nerdySummaryMeta: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    fontWeight: '800',
  },
  nerdyKVRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 7,
    alignItems: 'center',
  },
  nerdyKVRowPressable: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    marginHorizontal: -8,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  nerdyKeyBlock: {
    flex: 1,
  },
  nerdyKey: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  nerdyHint: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    color: 'rgba(255,255,255,0.42)',
    fontWeight: '700',
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

  // Explain modal styles
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
