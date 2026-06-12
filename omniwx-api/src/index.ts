// omniwx-api/src/index.ts
//
// Drop-in replacement
// - Keeps existing radar / current / land-extremes / NASA / NOAA routes
// - Keeps /api/astro/location (and /v1/astro/location)
// - Keeps /api/astro/skyscore-grid (and /v1/astro/skyscore-grid)
// - Adds astro grid query support for:
//     mode=hero|regional
//     density=auto|low|medium|high
//     centerLat / centerLon
// - Returns richer SkyScore point metadata while preserving compatibility
// - App should continue rendering the smooth gradient locally with Skia
//
// Targeted fixes only:
// - Makes SkyScore grid path consistently UTC/GMT
// - Makes density=auto conservative instead of expensive
// - Reduces SkyScore upstream batch size
// - Adds coarser fallback pass instead of immediate 502
// - Accepts sparse usable points instead of failing too aggressively
// - Retains unrelated routes and logic

import { lookupBortle } from "./bortleLookup";
import { LAND_POINTS, LAND_POINTS_VERSION } from "./landPoints.generated";

const LAND_EXTREMES_POINTS_VERSION = `${LAND_POINTS_VERSION}-global-scan-curated-v2-2026-06-09` as const;

export interface Env {
  NOAA_NCEI_TOKEN: string;
  NASA_API_KEY: string;
  NASA_FIRMS_MAP_KEY?: string;
  RADAR_IEM_WMS_BASE?: string;
}

type Unit = "F" | "C";
type Units = "imperial" | "metric";
type LandExtremeKind = "hot" | "cold" | "wind" | "rain";
type SkyGridMode = "hero" | "regional";
type SkyGridDensity = "auto" | "low" | "medium" | "high";

type LandPoint = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  badge?: "US" | "Global";
  group?: "airport" | "notable" | "capital" | "city" | "scan";
};

const EXTRA_LAND_EXTREME_POINTS: LandPoint[] = [
  { id: "us-extreme-death-valley", name: "Death Valley, CA", lat: 36.4623, lon: -116.8666, badge: "US", group: "notable" },
  { id: "us-extreme-lake-havasu-city", name: "Lake Havasu City, AZ", lat: 34.4839, lon: -114.3225, badge: "US", group: "notable" },
  { id: "us-extreme-yuma", name: "Yuma, AZ", lat: 32.6927, lon: -114.6277, badge: "US", group: "notable" },
  { id: "us-extreme-palm-springs", name: "Palm Springs, CA", lat: 33.8303, lon: -116.5453, badge: "US", group: "notable" },
  { id: "us-extreme-imperial", name: "Imperial, CA", lat: 32.8476, lon: -115.5694, badge: "US", group: "notable" },
  { id: "us-extreme-las-vegas", name: "Las Vegas, NV", lat: 36.1716, lon: -115.1391, badge: "US", group: "notable" },
  { id: "us-extreme-laredo", name: "Laredo, TX", lat: 27.5036, lon: -99.5076, badge: "US", group: "notable" },
  { id: "us-extreme-del-rio", name: "Del Rio, TX", lat: 29.3709, lon: -100.8959, badge: "US", group: "notable" },
  { id: "us-extreme-key-west", name: "Key West, FL", lat: 24.5551, lon: -81.78, badge: "US", group: "notable" },
  { id: "us-extreme-international-falls", name: "International Falls, MN", lat: 48.601, lon: -93.4107, badge: "US", group: "notable" },
  { id: "us-extreme-embarrass", name: "Embarrass, MN", lat: 47.6594, lon: -92.2007, badge: "US", group: "notable" },
  { id: "us-extreme-saranac-lake", name: "Saranac Lake, NY", lat: 44.3295, lon: -74.1313, badge: "US", group: "notable" },
  { id: "us-extreme-mount-washington", name: "Mount Washington, NH", lat: 44.2706, lon: -71.3033, badge: "US", group: "notable" },
  { id: "us-extreme-blue-hill", name: "Blue Hill Observatory, MA", lat: 42.2126, lon: -71.1137, badge: "US", group: "notable" },
  { id: "us-extreme-alpine", name: "Alpine, TX", lat: 30.3585, lon: -103.661, badge: "US", group: "notable" },
  { id: "us-extreme-dodge-city", name: "Dodge City, KS", lat: 37.7528, lon: -100.0171, badge: "US", group: "notable" },
  { id: "us-extreme-amarillo", name: "Amarillo, TX", lat: 35.222, lon: -101.8313, badge: "US", group: "notable" },
  { id: "us-extreme-cheyenne", name: "Cheyenne, WY", lat: 41.14, lon: -104.8202, badge: "US", group: "notable" },
  { id: "us-extreme-casper", name: "Casper, WY", lat: 42.8501, lon: -106.3252, badge: "US", group: "notable" },
  { id: "us-extreme-livingston", name: "Livingston, MT", lat: 45.6624, lon: -110.561, badge: "US", group: "notable" },
  { id: "us-extreme-cut-bank", name: "Cut Bank, MT", lat: 48.633, lon: -112.326, badge: "US", group: "notable" },
  { id: "us-extreme-bar-row", name: "Utqiagvik, AK", lat: 71.2906, lon: -156.7886, badge: "US", group: "notable" },
  { id: "us-extreme-deadhorse", name: "Deadhorse, AK", lat: 70.2002, lon: -148.4597, badge: "US", group: "notable" },
  { id: "us-extreme-bethel", name: "Bethel, AK", lat: 60.7922, lon: -161.7558, badge: "US", group: "notable" },
  { id: "us-extreme-adak", name: "Adak, AK", lat: 51.8836, lon: -176.6428, badge: "US", group: "notable" },
  { id: "us-extreme-hilo", name: "Hilo, HI", lat: 19.7074, lon: -155.0885, badge: "US", group: "notable" },
  { id: "us-extreme-mauna-kea", name: "Mauna Kea, HI", lat: 19.8207, lon: -155.4681, badge: "US", group: "notable" },

  { id: "gl-extreme-el-azizia", name: "El Azizia, Libya", lat: 32.531, lon: 13.017, badge: "Global", group: "notable" },
  { id: "gl-extreme-wadi-halfa", name: "Wadi Halfa, Sudan", lat: 21.8, lon: 31.35, badge: "Global", group: "notable" },
  { id: "gl-extreme-bilma", name: "Bilma, Niger", lat: 18.685, lon: 12.916, badge: "Global", group: "notable" },
  { id: "gl-extreme-timbuktu", name: "Timbuktu, Mali", lat: 16.7666, lon: -3.0026, badge: "Global", group: "notable" },
  { id: "gl-extreme-mecca", name: "Mecca, Saudi Arabia", lat: 21.3891, lon: 39.8579, badge: "Global", group: "notable" },
  { id: "gl-extreme-doha", name: "Doha, Qatar", lat: 25.2854, lon: 51.531, badge: "Global", group: "notable" },
  { id: "gl-extreme-abu-dhabi", name: "Abu Dhabi, United Arab Emirates", lat: 24.4539, lon: 54.3773, badge: "Global", group: "notable" },
  { id: "gl-extreme-muscat", name: "Muscat, Oman", lat: 23.588, lon: 58.3829, badge: "Global", group: "notable" },
  { id: "gl-extreme-jaisalmer", name: "Jaisalmer, India", lat: 26.9157, lon: 70.9083, badge: "Global", group: "notable" },
  { id: "gl-extreme-marble-bar", name: "Marble Bar, Australia", lat: -21.172, lon: 119.744, badge: "Global", group: "notable" },
  { id: "gl-extreme-oodnadatta", name: "Oodnadatta, Australia", lat: -27.546, lon: 135.446, badge: "Global", group: "notable" },
  { id: "gl-extreme-birdsville", name: "Birdsville, Australia", lat: -25.8975, lon: 139.351, badge: "Global", group: "notable" },
  { id: "gl-extreme-coober-pedy", name: "Coober Pedy, Australia", lat: -29.013, lon: 134.754, badge: "Global", group: "notable" },
  { id: "gl-extreme-alice-springs", name: "Alice Springs, Australia", lat: -23.698, lon: 133.881, badge: "Global", group: "notable" },
  { id: "gl-extreme-wyndham", name: "Wyndham, Australia", lat: -15.4825, lon: 128.123, badge: "Global", group: "notable" },
  { id: "gl-extreme-furnace-creek-global", name: "Furnace Creek, California", lat: 36.4623, lon: -116.8666, badge: "Global", group: "notable" },

  { id: "gl-extreme-yakutsk", name: "Yakutsk, Russia", lat: 62.0355, lon: 129.6755, badge: "Global", group: "notable" },
  { id: "gl-extreme-dikson", name: "Dikson, Russia", lat: 73.5069, lon: 80.5464, badge: "Global", group: "notable" },
  { id: "gl-extreme-tiksi", name: "Tiksi, Russia", lat: 71.6872, lon: 128.8694, badge: "Global", group: "notable" },
  { id: "gl-extreme-ust-nera", name: "Ust-Nera, Russia", lat: 64.5667, lon: 143.2, badge: "Global", group: "notable" },
  { id: "gl-extreme-grise-fiord", name: "Grise Fiord, Nunavut, Canada", lat: 76.4186, lon: -82.8958, badge: "Global", group: "notable" },
  { id: "gl-extreme-pond-inlet", name: "Pond Inlet, Nunavut, Canada", lat: 72.6992, lon: -77.9596, badge: "Global", group: "notable" },
  { id: "gl-extreme-thule", name: "Pituffik Space Base, Greenland", lat: 76.5312, lon: -68.7032, badge: "Global", group: "notable" },
  { id: "gl-extreme-summit-camp", name: "Summit Camp, Greenland", lat: 72.5796, lon: -38.4592, badge: "Global", group: "notable" },
  { id: "gl-extreme-mcmurdo", name: "McMurdo Station, Antarctica", lat: -77.8419, lon: 166.6863, badge: "Global", group: "notable" },
  { id: "gl-extreme-halley", name: "Halley Research Station, Antarctica", lat: -75.605, lon: -26.209, badge: "Global", group: "notable" },
  { id: "gl-extreme-rothera", name: "Rothera Research Station, Antarctica", lat: -67.568, lon: -68.126, badge: "Global", group: "notable" },

  { id: "gl-extreme-mount-wellington", name: "Mount Wellington, Tasmania", lat: -42.895, lon: 147.236, badge: "Global", group: "notable" },
  { id: "gl-extreme-stanley-falklands", name: "Stanley, Falkland Islands", lat: -51.6977, lon: -57.8517, badge: "Global", group: "notable" },
  { id: "gl-extreme-south-georgia", name: "King Edward Point, South Georgia", lat: -54.283, lon: -36.5, badge: "Global", group: "notable" },
  { id: "gl-extreme-crozet", name: "Crozet Islands", lat: -46.433, lon: 51.85, badge: "Global", group: "notable" },
  { id: "gl-extreme-kerguelen", name: "Kerguelen Islands", lat: -49.35, lon: 70.217, badge: "Global", group: "notable" },
  { id: "gl-extreme-macquarie", name: "Macquarie Island", lat: -54.499, lon: 158.937, badge: "Global", group: "notable" },
  { id: "gl-extreme-cape-horn", name: "Cape Horn, Chile", lat: -55.983, lon: -67.267, badge: "Global", group: "notable" },
  { id: "gl-extreme-faroe", name: "Torshavn, Faroe Islands", lat: 62.0079, lon: -6.7909, badge: "Global", group: "notable" },
  { id: "gl-extreme-st-johns", name: "St. John's, Newfoundland", lat: 47.5615, lon: -52.7126, badge: "Global", group: "notable" },
  { id: "gl-extreme-fortaleza", name: "Fortaleza, Brazil", lat: -3.7319, lon: -38.5267, badge: "Global", group: "notable" },
  { id: "gl-extreme-djibouti", name: "Djibouti City, Djibouti", lat: 11.5721, lon: 43.1456, badge: "Global", group: "notable" },
  { id: "gl-extreme-socotra", name: "Socotra, Yemen", lat: 12.4634, lon: 53.8237, badge: "Global", group: "notable" },
];

type LandScanBox = {
  id: string;
  label: string;
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  latStep: number;
  lonStep: number;
};

const GLOBAL_LAND_SCAN_BOXES: LandScanBox[] = [
  { id: "sahara", label: "Sahara scan", latMin: 15, latMax: 32, lonMin: -16, lonMax: 35, latStep: 4, lonStep: 6 },
  { id: "sahel-horn", label: "Sahel and Horn scan", latMin: 8, latMax: 18, lonMin: -15, lonMax: 50, latStep: 4, lonStep: 7 },
  { id: "arabia", label: "Arabian Peninsula scan", latMin: 16, latMax: 30, lonMin: 36, lonMax: 58, latStep: 3.5, lonStep: 5 },
  { id: "iran-pakistan", label: "Iran and Pakistan scan", latMin: 24, latMax: 36, lonMin: 52, lonMax: 72, latStep: 3, lonStep: 5 },
  { id: "thar-india", label: "Thar and north India scan", latMin: 20, latMax: 31, lonMin: 68, lonMax: 84, latStep: 3, lonStep: 4 },
  { id: "australia-interior", label: "Australia interior scan", latMin: -33, latMax: -16, lonMin: 116, lonMax: 144, latStep: 4, lonStep: 6 },
  { id: "southwest-north-america", label: "Southwest North America scan", latMin: 25, latMax: 39, lonMin: -124, lonMax: -100, latStep: 3.5, lonStep: 5 },
  { id: "mexico-central-america", label: "Mexico and Central America scan", latMin: 8, latMax: 25, lonMin: -116, lonMax: -84, latStep: 4, lonStep: 6 },
  { id: "atacama-andes", label: "Atacama and Andes scan", latMin: -34, latMax: -15, lonMin: -76, lonMax: -64, latStep: 4, lonStep: 4 },
  { id: "patagonia", label: "Patagonia scan", latMin: -55, latMax: -40, lonMin: -75, lonMax: -62, latStep: 3, lonStep: 4 },
  { id: "southern-africa", label: "Southern Africa scan", latMin: -32, latMax: -16, lonMin: 12, lonMax: 34, latStep: 4, lonStep: 5 },
  { id: "east-africa-highlands", label: "East Africa highlands scan", latMin: -8, latMax: 12, lonMin: 28, lonMax: 44, latStep: 4, lonStep: 4 },
  { id: "europe-asia-midlat", label: "Eurasian mid-latitude scan", latMin: 35, latMax: 58, lonMin: -10, lonMax: 120, latStep: 7, lonStep: 12 },
  { id: "siberia", label: "Siberia scan", latMin: 56, latMax: 74, lonMin: 45, lonMax: 160, latStep: 4, lonStep: 10 },
  { id: "arctic-north-america", label: "Arctic North America scan", latMin: 58, latMax: 76, lonMin: -165, lonMax: -55, latStep: 4, lonStep: 10 },
  { id: "greenland", label: "Greenland scan", latMin: 62, latMax: 78, lonMin: -55, lonMax: -20, latStep: 4, lonStep: 7 },
  { id: "antarctica-interior", label: "Antarctica interior scan", latMin: -86, latMax: -70, lonMin: -180, lonMax: 180, latStep: 4, lonStep: 18 },
  { id: "antarctic-coast", label: "Antarctic coast scan", latMin: -72, latMax: -62, lonMin: -180, lonMax: 180, latStep: 4, lonStep: 24 },
  { id: "southern-ocean-islands", label: "Southern island wind scan", latMin: -55, latMax: -44, lonMin: -75, lonMax: 170, latStep: 4, lonStep: 18 },
];

function coordLabel(lat: number, lon: number) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(1)}° ${ns}, ${Math.abs(lon).toFixed(1)}° ${ew}`;
}

function roundScanCoord(value: number) {
  return Math.round(value * 10) / 10;
}

function makeGlobalLandScanPoints() {
  const points: LandPoint[] = [];
  const seen = new Set<string>();
  for (const box of GLOBAL_LAND_SCAN_BOXES) {
    for (let lat = box.latMin; lat <= box.latMax + 0.001; lat += box.latStep) {
      for (let lon = box.lonMin; lon <= box.lonMax + 0.001; lon += box.lonStep) {
        const la = roundScanCoord(lat);
        const lo = roundScanCoord(lon);
        const key = `${la.toFixed(1)},${lo.toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        points.push({
          id: `global-scan-${box.id}-${la.toFixed(1)}-${lo.toFixed(1)}`.replace(/[^a-z0-9.-]+/gi, "-"),
          name: `${box.label} (${coordLabel(la, lo)})`,
          lat: la,
          lon: lo,
          badge: "Global",
          group: "scan",
        });
      }
    }
  }
  return points;
}

function landExtremePoints() {
  const byId = new Map<string, LandPoint>();
  for (const point of [
    ...((LAND_POINTS as unknown as LandPoint[]) ?? []),
    ...EXTRA_LAND_EXTREME_POINTS,
    ...makeGlobalLandScanPoints(),
  ]) {
    byId.set(point.id, point);
  }
  return Array.from(byId.values());
}

type LandExtreme = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  updatedAt?: string | null;
  valueText: string;
  subtitle: string;
  badge?: string;
  kind?: LandExtremeKind;
};

type LandGroup = { title: string; subtitle: string; items: LandExtreme[] };

type LandExtremesResponse = {
  ok: boolean;
  unit: Unit;
  updatedAt: string | null;
  heroes: Partial<Record<LandExtremeKind, LandExtreme | null>>;
  groups: LandGroup[];
  meta: {
    pointsTotal: number;
    pointsUs: number;
    pointsGlobal: number;
    pointsScan: number;
    pointsCurated: number;
    fetchedAtIso: string;
    source: "open-meteo";
    ttlSeconds: number;
    pointsVersion: string;
  };
};

type MarsInsightWeather = {
  ok: boolean;
  source: "NASA InSight Weather API";
  archived: true;
  sol: string;
  terrestrialDate: string | null;
  season: string | null;
  tempC: { avg: number | null; min: number | null; max: number | null };
  pressurePa: { avg: number | null; min: number | null; max: number | null };
  windMps: { avg: number | null; min: number | null; max: number | null };
  fetchedAtIso: string;
  note: string;
};

type OpenMeteoCurrent = {
  time?: string;
  temperature_2m?: number;
  precipitation?: number;
  wind_speed_10m?: number;
  wind_gusts_10m?: number;
};

type OpenMeteoBatchItem = { current?: OpenMeteoCurrent };
type OpenMeteoBatchResponse =
  | OpenMeteoBatchItem[]
  | { results: OpenMeteoBatchItem[] }
  | unknown;

type OpenMeteoCurrentSingle = {
  time?: string;
  temperature_2m?: number;
  apparent_temperature?: number;
  dew_point_2m?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
  cloud_cover?: number;
  wind_speed_10m?: number;
  wind_gusts_10m?: number;
  wind_direction_10m?: number;
  pressure_msl?: number;
};

type OpenMeteoCurrentSingleResponse = {
  current?: OpenMeteoCurrentSingle;
};

type GlobalAlert = {
  id: string;
  event: string;
  headline?: string;
  severity?: string;
  urgency?: string;
  certainty?: string;
  effective?: string | null;
  onset?: string | null;
  ends?: string | null;
  expires?: string | null;
  areaDesc?: string;
  description?: string;
  instruction?: string;
  note?: string;
  fullText?: string;
  sent?: string | null;
  senderName?: string;
  source?: "weather.gov" | "open-meteo";
  derived?: boolean;
};

type GlobalAlertsResponse = {
  ok: true;
  lat: number;
  lon: number;
  alerts: GlobalAlert[];
  primary: GlobalAlert | null;
  officialCount: number;
  derivedCount: number;
  updatedAt: string;
  source: "weather.gov" | "open-meteo" | "mixed";
};

type MarineConditionsResponse = {
  ok: true;
  lat: number;
  lon: number;
  conditions: {
    significantWaveHeightM: number | null;
    primarySwellHeightM: number | null;
    primarySwellPeriodS: number | null;
    primarySwellDirectionDeg: number | null;
    windSpeedKts: number | null;
    windGustKts: number | null;
    windDirectionDeg: number | null;
    seaSurfaceTempC: number | null;
    visibilityNm: number | null;
    pressureHpa: number | null;
    oceanCurrentKts?: number | null;
    oceanCurrentDirectionDeg?: number | null;
    seaLevelHeightMslM?: number | null;
    observedAt: string | null;
    modelSource: string | null;
  } | null;
  generatedAt: string;
};

type MarineAreaKind = "coastal" | "offshore" | "high-seas" | "lake" | "model";

type MarineAreaGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

type MarineAreaSummary = {
  id: string;
  name: string;
  region: string;
  kind: MarineAreaKind;
  center: { lat: number; lon: number };
  bounds: { west: number; south: number; east: number; north: number };
  geometry?: MarineAreaGeometry;
  sourceLabel: string;
  sourceUrl?: string;
  priority: number;
};

type MarineAreasResponse = {
  ok: true;
  updatedAt: string;
  source: "curated-worker-manifest";
  meta: {
    count: number;
    limit: number;
    zoom: number;
    viewport: { west: number; south: number; east: number; north: number };
    ttlSeconds: number;
  };
  areas: Omit<MarineAreaSummary, "priority">[];
};

type MarineExtremeKind = "wave" | "wind" | "warm" | "cold" | "current" | "seaLevel";

type MarineExtremePoint = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
};

type MarineExtreme = MarineExtremePoint & {
  kind: MarineExtremeKind;
  value: number;
  units: string;
  updatedAt: string | null;
  source: string;
  waveHeightM: number | null;
  windSpeedKts: number | null;
  seaSurfaceTempC: number | null;
  oceanCurrentKts: number | null;
  seaLevelHeightMslM: number | null;
};

type MarineExtremeGroup = {
  title: string;
  subtitle: string;
  items: MarineExtreme[];
};

type MarineExtremesResponse = {
  ok: true;
  updatedAt: string | null;
  generatedAt: string;
  source: "open-meteo-marine";
  meta: {
    pointsTotal: number;
    fetchedAtIso: string;
    ttlSeconds: number;
  };
  heroes: Partial<Record<MarineExtremeKind, MarineExtreme | null>>;
  groups: MarineExtremeGroup[];
};

type FireHotspotsResponse = {
  ok: true;
  enabled: boolean;
  source: "NASA FIRMS VIIRS_SNPP_NRT";
  west: number;
  south: number;
  east: number;
  north: number;
  dayRange: number;
  features: any[];
  generatedAt: string;
};

type CurrentResponse = {
  ok: true;
  source: "open-meteo" | "nws" | "met-norway";
  time: string | null;
  units: Units;
  temp: number | null;
  feels: number | null;
  dewPoint: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  wind: number | null;
  windGust: number | null;
  windDir: number | null;
  pressureMb: number | null;
  weatherCode: number | null;
};

type FireContextPayload = {
  ok: true;
  lat: number;
  lon: number;
  fetchedAtIso: string;
  forest: {
    name: string | null;
    region: string | null;
    slug: string | null;
  } | null;
  fireDanger: {
    classValue: number | null;
    classLabel: string | null;
    summary: string | null;
    source: string;
  };
  fireWeather: {
    redFlagWarning: boolean;
    fireWeatherWatch: boolean;
    alertCount: number;
    headlines: string[];
    summary: string | null;
    source: string;
  };
  restrictions: {
    supported: boolean;
    inEffect: boolean | null;
    summary: string | null;
    source: string | null;
    cards?: Array<{
      title: string;
      url: string | null;
      body: string | null;
      startDate: string | null;
      forestOrder: string | null;
    }>;
  };
  diagnostics?: {
    hazardRaw?: string | null;
    alertEvents?: string[];
  };
};

type FireRestrictionStatus = "restrictions" | "closure" | "none" | "unknown";

type FireRestrictionCardRecord = {
  title: string;
  url: string | null;
  body: string | null;
  startDate: string | null;
  forestOrder: string | null;
};

type FireRestrictionAgency = "USFS" | "BLM" | "MN DNR";

type FireRestrictionRecord = {
  id: string;
  agency: FireRestrictionAgency;
  forestName: string;
  region: string | null;
  slug: string;
  forestOrgCode?: string | null;
  forestNumber?: string | null;
  status: FireRestrictionStatus;
  summary: string | null;
  sourceUrl: string | null;
  checkedAt: string;
  cards: FireRestrictionCardRecord[];
};

type AstroLocationPayload = {
  ok: true;
  lat: number;
  lon: number;
  placeName?: string;
  timezone: string;
  fetchedAt: string;
  sun: {
    todaySunrise?: string | null;
    todaySunset?: string | null;
    tomorrowSunrise?: string | null;
    tomorrowSunset?: string | null;
  };
  twilight: {
    todayCivilDusk?: string | null;
    todayNauticalDusk?: string | null;
    todayAstronomicalDusk?: string | null;
    tomorrowCivilDawn?: string | null;
    tomorrowNauticalDawn?: string | null;
    tomorrowAstronomicalDawn?: string | null;
  };
  moonDays: Array<{
    date: string;
    moonrise?: string | null;
    moonset?: string | null;
    moonPhaseDegrees?: number | null;
    moonIlluminationPct?: number | null;
    moonPhaseLabel?: string | null;
  }>;
  sunDays: Array<{
    date: string;
    sunrise?: string | null;
    sunset?: string | null;
    civilDawn?: string | null;
    civilDusk?: string | null;
    nauticalDawn?: string | null;
    nauticalDusk?: string | null;
    astronomicalDawn?: string | null;
    astronomicalDusk?: string | null;
  }>;
  hourly: {
    time: string[];
    temperatureC: Array<number | null>;
    humidityPct: Array<number | null>;
    cloudTotal: Array<number | null>;
    cloudLow: Array<number | null>;
    cloudMid: Array<number | null>;
    cloudHigh: Array<number | null>;
    visibilityM: Array<number | null>;
    windMps: Array<number | null>;
    gustMps: Array<number | null>;
  };
  site: {
    elevationM?: number | null;
    bortleClass?: number | null;
    bortleLabel?: string | null;
    skyBrightness?: number | null;
  };
  aerosols: {
    index?: number | null;
    label?: string | null;
    source?: string | null;
    airQualityIndex?: number | null;
    airQualityLabel?: string | null;
  };
  diagnostics?: {
    moonSource?: string | null;
    siteSource?: string | null;
    aerosolSource?: string | null;
  };
};

type SkyGridPoint = {
  lat: number;
  lon: number;
  score: number;
  weather01: number;
  darkness01: number;
  transparency01?: number;
  seeing01?: number;
  moon01?: number;
  aerosols01?: number;
  siteScore01?: number;
  humidityPct?: number | null;
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;
  bortleClass?: number | null;
  bortleLabel?: string | null;
  elevationM?: number | null;
  skyBrightness?: number | null;
};

type SkyScoreGridPayload = {
  ok: true;
  bounds: {
    west: number;
    south: number;
    east: number;
    north: number;
  };
  zoom: number;
  hourOffset: number;
  sourceStepDeg: number;
  denseStepDeg: number;
  width: number;
  height: number;
  scores: number[];
  points?: SkyGridPoint[];
  fetchedAt: string;
  diagnostics: {
    source: string;
    mode?: SkyGridMode;
    density?: SkyGridDensity;
    sourcePoints?: number;
    heroCenterLat?: number | null;
    heroCenterLon?: number | null;
  };
};

type AstroInspectPayload = {
  ok: true;
  lat: number;
  lon: number;
  hourOffset: number;
  skyScore: number;
  weather01: number;
  darkness01: number;
  transparency01: number;
  seeing01: number;
  moon01: number;
  aerosols01: number;
  siteScore01: number;
  humidityPct?: number | null;
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;
  site: {
    elevationM?: number | null;
    bortleClass?: number | null;
    bortleLabel?: string | null;
    skyBrightness?: number | null;
  };
  aerosols?: {
    index?: number | null;
    label?: string | null;
    source?: string | null;
  };
  fetchedAt: string;
};

/* =============================================================================
 * CORS helpers
 * ============================================================================= */

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function withCors(headers: Record<string, string>) {
  return { ...headers, ...corsHeaders() };
}

/* =============================================================================
 * SWR + stale-if-error cache helpers
 * ============================================================================= */

type SwrMeta = {
  hit: boolean;
  stale?: boolean;
  fallback?: boolean;
  ageSeconds?: number;
  ttlSeconds: number;
  staleSeconds: number;
};

function cloneWithCors(resp: Response) {
  return new Response(resp.body, {
    status: resp.status,
    headers: withCors(Object.fromEntries(resp.headers.entries())),
  });
}

function addOmniCacheHeaders(resp: Response, meta: SwrMeta) {
  const out = new Response(resp.body, resp);
  out.headers.set("X-Omni-Cache-Hit", meta.hit ? "1" : "0");
  out.headers.set("X-Omni-Cache-Stale", meta.stale ? "1" : "0");
  out.headers.set("X-Omni-Cache-Fallback", meta.fallback ? "1" : "0");
  if (typeof meta.ageSeconds === "number") {
    out.headers.set("X-Omni-Cache-Age", String(meta.ageSeconds));
  }
  out.headers.set(
    "Cache-Control",
    `public, max-age=${meta.ttlSeconds}, stale-while-revalidate=${meta.staleSeconds}, stale-if-error=${meta.staleSeconds}`,
  );
  return out;
}

function nowMs() {
  return Date.now();
}

async function storeInCache(
  cache: Cache,
  cacheKey: Request,
  resp: Response,
  ttlSeconds: number,
  staleSeconds: number,
) {
  const body = await resp.clone().arrayBuffer();
  const out = new Response(body, resp);
  out.headers.set("X-Omni-Cached-At", String(nowMs()));
  out.headers.set("Cache-Control", `public, max-age=${ttlSeconds + staleSeconds}`);
  await cache.put(cacheKey, out.clone());
  return out;
}

async function swrFetchJson(
  request: Request,
  ctx: ExecutionContext,
  opts: {
    cacheKey: Request;
    ttlSeconds: number;
    staleSeconds: number;
    fetchUpstream: () => Promise<Response>;
    tag?: string;
  },
): Promise<Response> {
  const cache = (caches as any).default as Cache;
  const cached = await cache.match(opts.cacheKey);

  if (cached) {
    const cachedAt = Number(cached.headers.get("X-Omni-Cached-At") || "0");
    const ageSeconds = cachedAt ? Math.floor((nowMs() - cachedAt) / 1000) : undefined;

    if (ageSeconds != null && ageSeconds <= opts.ttlSeconds) {
      const out = addOmniCacheHeaders(cached, {
        hit: true,
        ageSeconds,
        ttlSeconds: opts.ttlSeconds,
        staleSeconds: opts.staleSeconds,
      });
      return cloneWithCors(out);
    }

    if (ageSeconds != null && ageSeconds <= opts.ttlSeconds + opts.staleSeconds) {
      ctx.waitUntil(
        (async () => {
          try {
            const fresh = await opts.fetchUpstream();
            if (fresh.ok) {
              await storeInCache(cache, opts.cacheKey, fresh, opts.ttlSeconds, opts.staleSeconds);
            }
          } catch {
            // ignore background failure
          }
        })(),
      );

      const out = addOmniCacheHeaders(cached, {
        hit: true,
        stale: true,
        ageSeconds,
        ttlSeconds: opts.ttlSeconds,
        staleSeconds: opts.staleSeconds,
      });
      return cloneWithCors(out);
    }
  }

  let fresh: Response;
  try {
    fresh = await opts.fetchUpstream();
  } catch {
    if (cached) {
      const out = addOmniCacheHeaders(cached, {
        hit: true,
        fallback: true,
        ttlSeconds: opts.ttlSeconds,
        staleSeconds: opts.staleSeconds,
      });
      return cloneWithCors(out);
    }

    return new Response(JSON.stringify({ ok: false, error: "Upstream fetch failed" }), {
      status: 502,
      headers: withCors({ "content-type": "application/json; charset=utf-8" }),
    });
  }

  if (!fresh.ok && cached && (fresh.status === 429 || fresh.status >= 500)) {
    const out = addOmniCacheHeaders(cached, {
      hit: true,
      fallback: true,
      ttlSeconds: opts.ttlSeconds,
      staleSeconds: opts.staleSeconds,
    });
    return cloneWithCors(out);
  }

  if (fresh.ok) {
    const stored = await storeInCache(cache, opts.cacheKey, fresh, opts.ttlSeconds, opts.staleSeconds);
    const out = addOmniCacheHeaders(stored, {
      hit: false,
      ttlSeconds: opts.ttlSeconds,
      staleSeconds: opts.staleSeconds,
      ageSeconds: 0,
    });
    return cloneWithCors(out);
  }

  const txt = await fresh.text().catch(() => "");
  return new Response(
    JSON.stringify({ ok: false, error: "Upstream error", status: fresh.status, body: txt.slice(0, 200) }),
    {
      status: 502,
      headers: withCors({ "content-type": "application/json; charset=utf-8" }),
    },
  );
}

function buildDonkiCacheKey(reqUrl: URL, donkiPath: string) {
  const keyUrl = new URL(reqUrl.toString());
  keyUrl.pathname = `/__cache__/nasa/donki/${donkiPath}`;
  keyUrl.searchParams.sort();
  return new Request(keyUrl.toString(), { method: "GET" });
}

async function fetchDonkiUpstream(upstream: URL) {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), DONKI_TIMEOUT_MS);
    try {
      const res = await fetch(upstream.toString(), {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });

      if ((res.status === 429 || res.status >= 500) && attempt === 0) {
        lastErr = new Error(`DONKI upstream ${res.status}`);
        continue;
      }

      const bodyText = await res.text();
      return new Response(bodyText, {
        status: res.status,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
      });
    } catch (err) {
      lastErr = err;
      if (attempt === 1) break;
    } finally {
      clearTimeout(t);
    }
  }

  throw lastErr ?? new Error("DONKI upstream fetch failed");
}

/* =============================================================================
 * Knobs
 * ============================================================================= */

const LAND_MAX_ROWS = 10;

const LAND_TTL_SECONDS = 15 * 60;
const LAND_STALE_SECONDS = 6 * 3600;

const CURRENT_TTL_SECONDS = 60;
const CURRENT_STALE_SECONDS = 30 * 60;

const OM_HOURLY_TTL_SECONDS = 600;
const OM_HOURLY_STALE_SECONDS = 6 * 3600;
const AIR_QUALITY_TTL_SECONDS = 15 * 60;
const AIR_QUALITY_STALE_SECONDS = 6 * 3600;
const AIR_QUALITY_CACHE_VERSION = "aqi-hourly-v1";
const USGS_IV_TTL_SECONDS = 15 * 60;
const USGS_IV_STALE_SECONDS = 6 * 3600;
const USGS_IV_CACHE_VERSION = "usgs-ogc-iv-v1";
const USGS_WATER_STATIONS_TTL_SECONDS = 15 * 60;
const USGS_WATER_STATIONS_STALE_SECONDS = 6 * 3600;
const USGS_WATER_STATIONS_CACHE_VERSION = "usgs-water-stations-v6";
const USGS_WATER_STATION_MAX_OBS_AGE_MS = 72 * 3600 * 1000;

const ASTRO_TTL_SECONDS = 600;
const ASTRO_STALE_SECONDS = 6 * 3600;

const RADAR_TILE_TTL_SECONDS = 900;
const RADAR_TILE_STALE_SECONDS = 24 * 3600;
const WMS_TTL_SECONDS = 300;
const WMS_STALE_SECONDS = 24 * 3600;
const ALMANAC_TTL_SECONDS = 24 * 3600;
const ALMANAC_STALE_SECONDS = 7 * 24 * 3600;
const DONKI_TTL_SECONDS = 15 * 60;
const DONKI_STALE_SECONDS = 24 * 3600;
const FIRE_CONTEXT_TTL_SECONDS = 30 * 60;
const FIRE_CONTEXT_STALE_SECONDS = 12 * 3600;
const GLOBAL_ALERTS_TTL_SECONDS = 5 * 60;
const GLOBAL_ALERTS_STALE_SECONDS = 6 * 3600;
const MARINE_CONDITIONS_TTL_SECONDS = 15 * 60;
const MARINE_CONDITIONS_STALE_SECONDS = 12 * 3600;
const FIRE_HOTSPOTS_TTL_SECONDS = 20 * 60;
const FIRE_HOTSPOTS_STALE_SECONDS = 12 * 3600;
const FIRE_HOTSPOTS_CACHE_VERSION = "firms-v3";
const FIRE_HOTSPOTS_MAX_FEATURES = 5000;

const OPEN_METEO_TIMEOUT_MS = 8500;
const DONKI_TIMEOUT_MS = 9000;
const FIRE_CONTEXT_TIMEOUT_MS = 9000;
const OPEN_METEO_BATCH_SIZE = 75;
const LAND_OPEN_METEO_CONCURRENCY = 4;
const WEATHER_FALLBACK_USER_AGENT = "omniwx-worker/1.0 (weather fallback; contact: omniwx)";
const MS_TO_KTS = 1.94384;
const MARINE_EXTREMES_TTL_SECONDS = 15 * 60;
const MARINE_EXTREMES_STALE_SECONDS = 6 * 3600;
const MARINE_AREAS_TTL_SECONDS = 15 * 60;
const MARINE_AREAS_STALE_SECONDS = 24 * 3600;
const MARINE_AREAS_VERSION = "official-metareas-geojson-v4";

// Sky grid specific knobs
const OPEN_METEO_SKYGRID_TIMEOUT_MS = 6500;
const SKYGRID_PRIMARY_BATCH_SIZE = 16;
const SKYGRID_FALLBACK_BATCH_SIZE = 8;
const SKYGRID_MIN_USABLE_POINTS = 1;

/* =============================================================================
 * Generic helpers
 * ============================================================================= */

function toOpenMeteoUrlCurrentFallback(lat: number, lon: number, units: Units) {
  const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";

  const hourly = [
    "temperature_2m",
    "apparent_temperature",
    "dew_point_2m",
    "relative_humidity_2m",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "pressure_msl",
  ].join(",");

  return (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&forecast_days=1` +
    `&temperature_unit=${encodeURIComponent(temperatureUnit)}` +
    `&wind_speed_unit=${encodeURIComponent(windUnit)}` +
    `&timezone=auto`
  );
}

type OpenMeteoHourlyFallbackResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    apparent_temperature?: Array<number | null>;
    dew_point_2m?: Array<number | null>;
    relative_humidity_2m?: Array<number | null>;
    weather_code?: Array<number | null>;
    cloud_cover?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    wind_direction_10m?: Array<number | null>;
    pressure_msl?: Array<number | null>;
  };
};

function pickClosestHourlyIndex(times: string[] | undefined) {
  if (!times?.length) return -1;

  const now = Date.now();
  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i++) {
    const ms = new Date(times[i]).getTime();
    if (!Number.isFinite(ms)) continue;
    const diff = Math.abs(ms - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  return bestIdx;
}

function currentJsonResponse(payload: CurrentResponse, provider: CurrentResponse["source"]) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "X-Omni-Weather-Provider": provider,
    },
  });
}

function hasUsableCurrentPayload(payload: CurrentResponse) {
  return (
    payload.temp != null ||
    payload.feels != null ||
    payload.dewPoint != null ||
    payload.humidityPct != null ||
    payload.cloudCoverPct != null ||
    payload.wind != null ||
    payload.windGust != null ||
    payload.pressureMb != null ||
    payload.weatherCode != null
  );
}

function isLikelyNwsCoveredPoint(lat: number, lon: number) {
  return lat >= 14 && lat <= 72 && lon >= -180 && lon <= -64;
}

function nwsValueUnit(value: unknown): number | null {
  if (!value || typeof value !== "object") return null;
  return safeNum((value as { value?: unknown }).value);
}

async function fetchNwsCurrentPayload(lat: number, lon: number, units: Units): Promise<CurrentResponse> {
  if (!isLikelyNwsCoveredPoint(lat, lon)) {
    throw new Error("NWS fallback skipped outside likely coverage");
  }

  const headers = { "User-Agent": WEATHER_FALLBACK_USER_AGENT };
  const pointsUrl = `https://api.weather.gov/points/${encodeURIComponent(String(lat))},${encodeURIComponent(String(lon))}`;
  const points = await fetchJsonWithTimeout(pointsUrl, OPEN_METEO_TIMEOUT_MS, headers);
  const stationsUrl = typeof points?.properties?.observationStations === "string" ? points.properties.observationStations : null;
  if (!stationsUrl) throw new Error("NWS points response missing observation stations");

  const stations = await fetchJsonWithTimeout(stationsUrl, OPEN_METEO_TIMEOUT_MS, headers);
  const stationUrl =
    (Array.isArray(stations?.features) && typeof stations.features[0]?.id === "string" ? stations.features[0].id : null) ??
    (Array.isArray(stations?.observationStations) && typeof stations.observationStations[0] === "string"
      ? stations.observationStations[0]
      : null);
  if (!stationUrl) throw new Error("NWS station list was empty");

  const latest = await fetchJsonWithTimeout(`${stationUrl.replace(/\/+$/, "")}/observations/latest`, OPEN_METEO_TIMEOUT_MS, headers);
  const props = latest?.properties ?? {};

  const tempC = nwsValueUnit(props.temperature);
  const heatIndexC = nwsValueUnit(props.heatIndex);
  const windChillC = nwsValueUnit(props.windChill);
  const dewPointC = nwsValueUnit(props.dewpoint);
  const pressurePa = nwsValueUnit(props.barometricPressure);
  const payload: CurrentResponse = {
    ok: true,
    source: "nws",
    time: typeof props.timestamp === "string" ? props.timestamp : null,
    units,
    temp: tempForUnits(tempC, units),
    feels: tempForUnits(heatIndexC ?? windChillC ?? tempC, units),
    dewPoint: tempForUnits(dewPointC, units),
    humidityPct: roundWeatherValue(nwsValueUnit(props.relativeHumidity)),
    cloudCoverPct: null,
    wind: windForUnits(nwsValueUnit(props.windSpeed), units),
    windGust: windForUnits(nwsValueUnit(props.windGust), units),
    windDir: roundWeatherValue(nwsValueUnit(props.windDirection), 0),
    pressureMb: pressurePa == null ? null : roundWeatherValue(pressurePa / 100),
    weatherCode: null,
  };

  if (!hasUsableCurrentPayload(payload)) throw new Error("NWS returned no usable current weather");
  return payload;
}

function metNorwaySymbolToWmo(symbol: unknown): number | null {
  const s = String(symbol ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("thunder")) return 95;
  if (s.includes("fog")) return 45;
  if (s.includes("heavysnow")) return 75;
  if (s.includes("lightsnow")) return 71;
  if (s.includes("snow")) return 73;
  if (s.includes("heavysleet")) return 67;
  if (s.includes("sleet")) return 66;
  if (s.includes("heavyrainshowers")) return 82;
  if (s.includes("lightrainshowers")) return 80;
  if (s.includes("rainshowers")) return 81;
  if (s.includes("heavyrain")) return 65;
  if (s.includes("lightrain")) return 61;
  if (s.includes("rain")) return 63;
  if (s.includes("cloudy")) return 3;
  if (s.includes("partlycloudy")) return 2;
  if (s.includes("fair")) return 1;
  if (s.includes("clearsky")) return 0;
  return null;
}

async function fetchMetNorwayCurrentPayload(lat: number, lon: number, units: Units): Promise<CurrentResponse> {
  const url =
    `https://api.met.no/weatherapi/locationforecast/2.0/compact` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}`;
  const json = await fetchJsonWithTimeout(url, OPEN_METEO_TIMEOUT_MS, { "User-Agent": WEATHER_FALLBACK_USER_AGENT });
  const series = Array.isArray(json?.properties?.timeseries) ? json.properties.timeseries : [];
  if (!series.length) throw new Error("MET Norway returned no timeseries");

  const now = Date.now();
  let best = series[0];
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const item of series) {
    const t = new Date(String(item?.time ?? "")).getTime();
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - now);
    if (diff < bestDiff) {
      best = item;
      bestDiff = diff;
    }
  }

  const details = best?.data?.instant?.details ?? {};
  const summary =
    best?.data?.next_1_hours?.summary?.symbol_code ??
    best?.data?.next_6_hours?.summary?.symbol_code ??
    best?.data?.next_12_hours?.summary?.symbol_code;
  const tempC = safeNum(details.air_temperature);
  const payload: CurrentResponse = {
    ok: true,
    source: "met-norway",
    time: typeof best?.time === "string" ? best.time : null,
    units,
    temp: tempForUnits(tempC, units),
    feels: tempForUnits(tempC, units),
    dewPoint: tempForUnits(safeNum(details.dew_point_temperature), units),
    humidityPct: roundWeatherValue(safeNum(details.relative_humidity)),
    cloudCoverPct: roundWeatherValue(safeNum(details.cloud_area_fraction)),
    wind: windForUnits(safeNum(details.wind_speed), units),
    windGust: windForUnits(safeNum(details.wind_speed_of_gust), units),
    windDir: roundWeatherValue(safeNum(details.wind_from_direction), 0),
    pressureMb: roundWeatherValue(safeNum(details.air_pressure_at_sea_level)),
    weatherCode: metNorwaySymbolToWmo(summary),
  };

  if (!hasUsableCurrentPayload(payload)) throw new Error("MET Norway returned no usable current weather");
  return payload;
}

function isWeatherGovAlertLikelySupportedPoint(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  const inBox = (minLat: number, maxLat: number, minLon: number, maxLon: number) =>
    lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  return (
    inBox(24, 50, -125, -66) ||
    inBox(51, 72, -170, -129) ||
    inBox(18, 23, -161, -154) ||
    inBox(17, 19, -68, -64) ||
    inBox(13, 21, 144, 146) ||
    inBox(-15, -13, -171, -168)
  );
}

function cleanAlertText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s || undefined;
}

function safeIsoString(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildAlertFullText(parts: Array<string | undefined>) {
  const clean = parts.map(cleanAlertText).filter(Boolean) as string[];
  return clean.length ? clean.join("\n\n") : undefined;
}

function alertSeverityScore(a: GlobalAlert) {
  const sev = String(a.severity ?? "").toLowerCase();
  const event = String(a.event ?? "").toLowerCase();
  if (sev === "extreme" || event.includes("extreme")) return 5;
  if (sev === "severe" || event.includes("warning")) return 4;
  if (sev === "moderate" || event.includes("watch")) return 3;
  if (sev === "minor" || event.includes("advisory")) return 2;
  return 1;
}

function pickPrimaryGlobalAlert(alerts: GlobalAlert[]): GlobalAlert | null {
  if (!alerts.length) return null;
  return [...alerts].sort((a, b) => {
    const s = alertSeverityScore(b) - alertSeverityScore(a);
    if (s !== 0) return s;
    const aEnd = new Date(a.ends ?? a.expires ?? "").getTime();
    const bEnd = new Date(b.ends ?? b.expires ?? "").getTime();
    return (Number.isFinite(aEnd) ? aEnd : Number.POSITIVE_INFINITY) - (Number.isFinite(bEnd) ? bEnd : Number.POSITIVE_INFINITY);
  })[0] ?? null;
}

async function fetchWeatherGovPointAlerts(lat: number, lon: number): Promise<GlobalAlert[]> {
  if (!isWeatherGovAlertLikelySupportedPoint(lat, lon)) return [];
  const u = new URL("https://api.weather.gov/alerts/active");
  u.searchParams.set("point", `${lat},${lon}`);
  const json = await fetchJsonWithTimeout(u.toString(), OPEN_METEO_TIMEOUT_MS, {
    "User-Agent": WEATHER_FALLBACK_USER_AGENT,
    Accept: "application/geo+json",
  });
  const features = Array.isArray(json?.features) ? json.features : [];
  return features
    .map((f: any, idx: number): GlobalAlert | null => {
      const p = f?.properties ?? {};
      const event = cleanAlertText(p.event) ?? "Weather Alert";
      const headline = cleanAlertText(p.headline);
      const description = cleanAlertText(p.description);
      const instruction = cleanAlertText(p.instruction);
      const note = cleanAlertText(p.note);
      return {
        id: String(f?.id ?? p?.id ?? `weather-gov-${event}-${p?.sent ?? idx}`),
        event,
        headline,
        severity: cleanAlertText(p.severity),
        urgency: cleanAlertText(p.urgency),
        certainty: cleanAlertText(p.certainty),
        effective: safeIsoString(p.effective),
        onset: safeIsoString(p.onset),
        ends: safeIsoString(p.ends),
        expires: safeIsoString(p.expires),
        areaDesc: cleanAlertText(p.areaDesc),
        description,
        instruction,
        note,
        fullText: buildAlertFullText([headline, description, instruction ? `Instructions: ${instruction}` : undefined, note ? `Note: ${note}` : undefined]),
        sent: safeIsoString(p.sent),
        senderName: cleanAlertText(p.senderName) ?? "National Weather Service",
        source: "weather.gov",
        derived: false,
      };
    })
    .filter(Boolean) as GlobalAlert[];
}

type OpenMeteoHazardHourlyResponse = {
  hourly?: {
    time?: string[];
    temperature_2m?: Array<number | null>;
    apparent_temperature?: Array<number | null>;
    precipitation?: Array<number | null>;
    rain?: Array<number | null>;
    showers?: Array<number | null>;
    snowfall?: Array<number | null>;
    precipitation_probability?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    wind_gusts_10m?: Array<number | null>;
    weather_code?: Array<number | null>;
  };
};

function toOpenMeteoHazardsUrl(lat: number, lon: number, units: Units) {
  const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";
  const precipUnit = units === "imperial" ? "inch" : "mm";
  const hourly = [
    "temperature_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "showers",
    "snowfall",
    "precipitation_probability",
    "wind_speed_10m",
    "wind_gusts_10m",
    "weather_code",
  ].join(",");
  return (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&forecast_days=2` +
    `&temperature_unit=${encodeURIComponent(temperatureUnit)}` +
    `&wind_speed_unit=${encodeURIComponent(windUnit)}` +
    `&precipitation_unit=${encodeURIComponent(precipUnit)}` +
    `&timezone=auto`
  );
}

function formatHazardValue(value: number, unitText: string, digits = 0) {
  return `${value.toFixed(digits)} ${unitText}`;
}

function maxHourly(values: Array<number | null> | undefined) {
  const nums = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.max(...nums) : null;
}

function minHourly(values: Array<number | null> | undefined) {
  const nums = (values ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.min(...nums) : null;
}

function sumHourly(values: Array<number | null> | undefined): number {
  return (values ?? []).reduce<number>((sum, v) => sum + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
}

function hasThunderCode(values: Array<number | null> | undefined) {
  return (values ?? []).some((v) => typeof v === "number" && v >= 95 && v <= 99);
}

async function fetchOpenMeteoDerivedAlerts(lat: number, lon: number, units: Units): Promise<GlobalAlert[]> {
  const json = (await fetchJsonWithTimeout(toOpenMeteoHazardsUrl(lat, lon, units), OPEN_METEO_TIMEOUT_MS, {
    "User-Agent": WEATHER_FALLBACK_USER_AGENT,
  })) as OpenMeteoHazardHourlyResponse;
  const h = json?.hourly ?? {};
  const times = Array.isArray(h.time) ? h.time : [];
  const starts = times[0] ? safeIsoString(times[0]) : new Date().toISOString();
  const ends = times.length ? safeIsoString(times[times.length - 1]) : null;
  const tempUnit = units === "imperial" ? "F" : "C";
  const windUnit = units === "imperial" ? "mph" : "km/h";
  const precipUnit = units === "imperial" ? "in" : "mm";
  const alerts: GlobalAlert[] = [];
  const push = (id: string, event: string, severity: string, headline: string, description: string) => {
    alerts.push({
      id: `open-meteo-${id}-${lat.toFixed(3)}-${lon.toFixed(3)}`,
      event,
      headline,
      severity,
      urgency: "Expected",
      certainty: "Likely",
      effective: starts,
      onset: starts,
      ends,
      expires: ends,
      areaDesc: "Selected location",
      description,
      fullText: description,
      sent: new Date().toISOString(),
      senderName: "OMNIwx global forecast outlook",
      source: "open-meteo",
      derived: true,
    });
  };

  const maxFeels = maxHourly(h.apparent_temperature ?? h.temperature_2m);
  const minTemp = minHourly(h.temperature_2m);
  const maxGust = maxHourly(h.wind_gusts_10m ?? h.wind_speed_10m);
  const precipTotal = sumHourly(h.precipitation);
  const snowTotal = sumHourly(h.snowfall);
  const maxPrecipProb = maxHourly(h.precipitation_probability);
  const thunder = hasThunderCode(h.weather_code);

  if (maxFeels != null && maxFeels >= (units === "imperial" ? 105 : 40.5)) {
    push(
      "heat",
      "Extreme Heat Outlook",
      maxFeels >= (units === "imperial" ? 115 : 46) ? "Severe" : "Moderate",
      `Forecast heat index near ${formatHazardValue(maxFeels, `°${tempUnit}`)}.`,
      "Global forecast guidance shows potentially dangerous heat near this location over the next 48 hours.",
    );
  }

  if (minTemp != null && minTemp <= (units === "imperial" ? 0 : -18)) {
    push(
      "cold",
      "Extreme Cold Outlook",
      minTemp <= (units === "imperial" ? -20 : -29) ? "Severe" : "Moderate",
      `Forecast temperature near ${formatHazardValue(minTemp, `°${tempUnit}`)}.`,
      "Global forecast guidance shows potentially dangerous cold near this location over the next 48 hours.",
    );
  }

  if (maxGust != null && maxGust >= (units === "imperial" ? 45 : 72)) {
    push(
      "wind",
      "High Wind Outlook",
      maxGust >= (units === "imperial" ? 58 : 93) ? "Severe" : "Moderate",
      `Forecast gusts near ${formatHazardValue(maxGust, windUnit)}.`,
      "Global forecast guidance shows strong wind gust potential near this location over the next 48 hours.",
    );
  }

  if (precipTotal >= (units === "imperial" ? 2 : 50) || (maxPrecipProb ?? 0) >= 85 && precipTotal >= (units === "imperial" ? 1 : 25)) {
    push(
      "rain",
      "Heavy Rain Outlook",
      precipTotal >= (units === "imperial" ? 4 : 100) ? "Severe" : "Moderate",
      `Forecast precipitation near ${formatHazardValue(precipTotal, precipUnit, units === "imperial" ? 2 : 0)}.`,
      "Global forecast guidance shows heavy precipitation potential near this location over the next 48 hours.",
    );
  }

  if (snowTotal >= (units === "imperial" ? 4 : 10)) {
    push(
      "snow",
      "Heavy Snow Outlook",
      snowTotal >= (units === "imperial" ? 10 : 25) ? "Severe" : "Moderate",
      `Forecast snowfall near ${formatHazardValue(snowTotal, precipUnit, units === "imperial" ? 1 : 0)}.`,
      "Global forecast guidance shows accumulating snow potential near this location over the next 48 hours.",
    );
  }

  if (thunder) {
    push(
      "thunder",
      "Thunderstorm Outlook",
      "Minor",
      "Thunderstorms appear in the global forecast.",
      "Global forecast guidance shows thunderstorm potential near this location over the next 48 hours.",
    );
  }

  return alerts;
}

async function buildGlobalAlertsPayload(lat: number, lon: number, units: Units): Promise<GlobalAlertsResponse> {
  const [officialResult, derivedResult] = await Promise.allSettled([
    fetchWeatherGovPointAlerts(lat, lon),
    fetchOpenMeteoDerivedAlerts(lat, lon, units),
  ]);
  const official = officialResult.status === "fulfilled" ? officialResult.value : [];
  const derived = derivedResult.status === "fulfilled" ? derivedResult.value : [];
  const alerts = [...official, ...derived].sort((a, b) => alertSeverityScore(b) - alertSeverityScore(a));
  const officialCount = official.length;
  const derivedCount = derived.length;
  return {
    ok: true,
    lat,
    lon,
    alerts,
    primary: pickPrimaryGlobalAlert(alerts),
    officialCount,
    derivedCount,
    updatedAt: new Date().toISOString(),
    source: officialCount && derivedCount ? "mixed" : officialCount ? "weather.gov" : "open-meteo",
  };
}

function toOpenMeteoMarineUrl(lat: number, lon: number) {
  const hourly = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "sea_surface_temperature",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "ocean_current_velocity",
    "ocean_current_direction",
    "sea_level_height_msl",
  ].join(",");
  return (
    `https://marine-api.open-meteo.com/v1/marine` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&forecast_days=1` +
    `&wind_speed_unit=ms` +
    `&timezone=auto`
  );
}

function toOpenMeteoMarineWindFallbackUrl(lat: number, lon: number) {
  const hourly = ["wind_speed_10m", "wind_gusts_10m", "wind_direction_10m"].join(",");
  return (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&forecast_days=1` +
    `&wind_speed_unit=ms` +
    `&timezone=auto`
  );
}

function pickClosestMarineHourlyIndex(times: unknown): number {
  if (!Array.isArray(times) || !times.length) return -1;
  const now = Date.now();
  let bestIdx = -1;
  let bestDelta = Number.POSITIVE_INFINITY;
  times.forEach((time, idx) => {
    if (typeof time !== "string") return;
    const t = new Date(time).getTime();
    if (!Number.isFinite(t)) return;
    const delta = Math.abs(t - now);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

async function buildMarineConditionsPayload(lat: number, lon: number): Promise<MarineConditionsResponse> {
  const json = await fetchJsonWithTimeout(toOpenMeteoMarineUrl(lat, lon), OPEN_METEO_TIMEOUT_MS, {
    "User-Agent": WEATHER_FALLBACK_USER_AGENT,
  });
  const hourly = json?.hourly ?? {};
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const idx = pickClosestMarineHourlyIndex(times);
  const get = (arr: unknown): number | null => {
    if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) return null;
    if (arr[idx] == null) return null;
    const n = Number(arr[idx]);
    return Number.isFinite(n) ? n : null;
  };
  const waveHeightM = get(hourly.wave_height);
  const wavePeriodS = get(hourly.wave_period);
  const waveDirectionDeg = get(hourly.wave_direction);
  let windSpeedMs = get(hourly.wind_speed_10m);
  let windGustMs = get(hourly.wind_gusts_10m);
  let windDirectionDeg = get(hourly.wind_direction_10m);
  const seaSurfaceTempC = get(hourly.sea_surface_temperature);
  const oceanCurrentKph = get(hourly.ocean_current_velocity);
  const oceanCurrentDirectionDeg = get(hourly.ocean_current_direction);
  const seaLevelHeightMslM = get(hourly.sea_level_height_msl);

  if (windSpeedMs == null) {
    try {
      const windJson = await fetchJsonWithTimeout(toOpenMeteoMarineWindFallbackUrl(lat, lon), OPEN_METEO_TIMEOUT_MS, {
        "User-Agent": WEATHER_FALLBACK_USER_AGENT,
      });
      const windHourly = windJson?.hourly ?? {};
      const windTimes = Array.isArray(windHourly?.time) ? windHourly.time : [];
      const windIdx = pickClosestMarineHourlyIndex(windTimes);
      const getWind = (arr: unknown): number | null => {
        if (!Array.isArray(arr) || windIdx < 0 || windIdx >= arr.length) return null;
        if (arr[windIdx] == null) return null;
        const n = Number(arr[windIdx]);
        return Number.isFinite(n) ? n : null;
      };
      windSpeedMs = getWind(windHourly.wind_speed_10m);
      windGustMs = getWind(windHourly.wind_gusts_10m);
      windDirectionDeg = getWind(windHourly.wind_direction_10m);
    } catch {
      // Wave/SST/current data is still useful if the atmospheric fallback is unavailable.
    }
  }
  const observedAt = idx >= 0 && typeof times[idx] === "string" ? safeIsoString(times[idx]) : null;
  const hasAny =
    waveHeightM != null ||
    wavePeriodS != null ||
    waveDirectionDeg != null ||
    windSpeedMs != null ||
    windGustMs != null ||
    windDirectionDeg != null ||
    seaSurfaceTempC != null ||
    oceanCurrentKph != null ||
    oceanCurrentDirectionDeg != null ||
    seaLevelHeightMslM != null;

  return {
    ok: true,
    lat,
    lon,
    conditions: hasAny
      ? {
          significantWaveHeightM: waveHeightM,
          primarySwellHeightM: waveHeightM,
          primarySwellPeriodS: wavePeriodS,
          primarySwellDirectionDeg: waveDirectionDeg,
          windSpeedKts: windSpeedMs != null ? windSpeedMs * MS_TO_KTS : null,
          windGustKts: windGustMs != null ? windGustMs * MS_TO_KTS : null,
          windDirectionDeg,
          seaSurfaceTempC,
          visibilityNm: null,
          pressureHpa: null,
          oceanCurrentKts: oceanCurrentKph != null ? oceanCurrentKph / 1.852 : null,
          oceanCurrentDirectionDeg,
          seaLevelHeightMslM,
          observedAt,
          modelSource: "Open-Meteo Marine",
        }
      : null,
    generatedAt: new Date().toISOString(),
  };
}

const MARINE_EXTREME_POINTS: MarineExtremePoint[] = [
  { id: "north-atlantic", name: "North Atlantic Open Waters", region: "North Atlantic", lat: 45, lon: -35 },
  { id: "north-sea", name: "North Sea", region: "Northern Europe", lat: 56.8, lon: 2.5 },
  { id: "mediterranean", name: "Mediterranean Sea", region: "Mediterranean", lat: 38, lon: 15 },
  { id: "caribbean", name: "Caribbean Sea", region: "Caribbean", lat: 16.5, lon: -73 },
  { id: "gulf-of-mexico", name: "Gulf of Mexico", region: "Gulf of Mexico", lat: 26.5, lon: -90 },
  { id: "nw-pacific", name: "Northwest Pacific Open Waters", region: "North Pacific", lat: 35, lon: 160 },
  { id: "ne-pacific", name: "Northeast Pacific Open Waters", region: "North Pacific", lat: 42, lon: -150 },
  { id: "coral-tasman", name: "Coral and Tasman Seas", region: "Australia / New Zealand", lat: -28, lon: 160 },
  { id: "south-pacific", name: "South Pacific Open Waters", region: "South Pacific", lat: -30, lon: -125 },
  { id: "south-atlantic", name: "South Atlantic Open Waters", region: "South Atlantic", lat: -30, lon: -25 },
  { id: "indian-ocean", name: "Indian Ocean Open Waters", region: "Indian Ocean", lat: -20, lon: 80 },
  { id: "arabian-sea", name: "Arabian Sea", region: "Indian Ocean", lat: 15, lon: 64 },
  { id: "bay-of-bengal", name: "Bay of Bengal", region: "Indian Ocean", lat: 13, lon: 88 },
  { id: "southern-ocean-atlantic", name: "Southern Ocean Atlantic Sector", region: "Southern Ocean", lat: -58, lon: -20 },
  { id: "southern-ocean-indian", name: "Southern Ocean Indian Sector", region: "Southern Ocean", lat: -58, lon: 80 },
  { id: "southern-ocean-pacific", name: "Southern Ocean Pacific Sector", region: "Southern Ocean", lat: -58, lon: -140 },
];

function metareaPolygon(points: Array<[number, number]>): MarineAreaGeometry {
  const ring = points.length && (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1])
    ? [...points, points[0]]
    : points;
  return { type: "Polygon", coordinates: [ring] };
}

function metareaDatelinePolygon(west: number, south: number, east: number, north: number): MarineAreaGeometry {
  return {
    type: "MultiPolygon",
    coordinates: [
      [[[west, south], [180, south], [180, north], [west, north], [west, south]]],
      [[[-180, south], [east, south], [east, north], [-180, north], [-180, south]]],
    ],
  };
}

function metareaMultiPolygon(polygons: Array<Array<[number, number]>>): MarineAreaGeometry {
  return {
    type: "MultiPolygon",
    coordinates: polygons.map((points) => {
      const ring = points.length && (points[0][0] !== points[points.length - 1][0] || points[0][1] !== points[points.length - 1][1])
        ? [...points, points[0]]
        : points;
      return [ring];
    }),
  };
}

const GLOBAL_MARINE_AREAS: MarineAreaSummary[] = [
  {
    id: "metarea-i",
    name: "METAREA I",
    region: "North Atlantic / Northwest Europe",
    kind: "high-seas",
    center: { lat: 56, lon: -18 },
    bounds: { west: -35, south: 48, east: 20, north: 75 },
    geometry: metareaPolygon([[-35, 48.45], [20, 48.45], [20, 75], [-35, 75]]),
    sourceLabel: "Official WMO/IMO high seas forecast area · UK Met Office",
    sourceUrl: "https://weather.metoffice.gov.uk/specialist-forecasts/coast-and-sea/high-seas-forecast",
    priority: 90,
  },
  {
    id: "metarea-ii",
    name: "METAREA II",
    region: "Eastern Atlantic",
    kind: "high-seas",
    center: { lat: 23, lon: -18 },
    bounds: { west: -35, south: -6, east: 8, north: 48.45 },
    geometry: metareaPolygon([[-35, 7], [-20, 7], [-20, -6], [8, -6], [8, 48.45], [-35, 48.45]]),
    sourceLabel: "Official WMO/IMO high seas forecast area · Meteo-France",
    sourceUrl: "https://wwmiws.wmo.int/index.php/metareas/affiche/2",
    priority: 85,
  },
  {
    id: "metarea-iii",
    name: "METAREA III",
    region: "Mediterranean and Black Sea",
    kind: "high-seas",
    center: { lat: 38, lon: 18 },
    bounds: { west: -6, south: 30, east: 42, north: 47 },
    geometry: metareaPolygon([[-6, 35.8], [5, 30], [20, 30], [42, 36], [42, 47], [-6, 47]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 85,
  },
  {
    id: "metarea-iv",
    name: "METAREA IV",
    region: "Western North Atlantic",
    kind: "high-seas",
    center: { lat: 35, lon: -60 },
    bounds: { west: -98, south: 7, east: -35, north: 67 },
    geometry: metareaPolygon([[-98, 7], [-35, 7], [-35, 67], [-78, 67], [-98, 31]]),
    sourceLabel: "Official WMO/IMO high seas forecast area · United States",
    sourceUrl: "https://www.weather.gov/marine/hsmz",
    priority: 90,
  },
  {
    id: "metarea-v",
    name: "METAREA V",
    region: "Brazil / Western South Atlantic",
    kind: "high-seas",
    center: { lat: -18, lon: -32 },
    bounds: { west: -55, south: -36, east: 20, north: 7 },
    geometry: metareaPolygon([[-52, 7], [-20, 7], [-20, -35.84], [-53.75, -33.75], [-55, 4.5]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 70,
  },
  {
    id: "metarea-vi",
    name: "METAREA VI",
    region: "Southern South Atlantic",
    kind: "high-seas",
    center: { lat: -52, lon: -42 },
    bounds: { west: -70, south: -70, east: 20, north: -36 },
    geometry: metareaPolygon([[-70, -36], [20, -36], [20, -70], [-70, -70]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 65,
  },
  {
    id: "metarea-vii",
    name: "METAREA VII",
    region: "South Africa / Southeast Atlantic",
    kind: "high-seas",
    center: { lat: -35, lon: 28 },
    bounds: { west: 0, south: -55, east: 55, north: -6 },
    geometry: metareaPolygon([[0, -6], [55, -6], [55, -55], [0, -55]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 70,
  },
  {
    id: "metarea-viii-n",
    name: "METAREA VIII North",
    region: "North Indian Ocean",
    kind: "high-seas",
    center: { lat: 12, lon: 82 },
    bounds: { west: 55, south: 0, east: 100, north: 30 },
    geometry: metareaPolygon([[55, 0], [100, 0], [100, 30], [55, 30]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 80,
  },
  {
    id: "metarea-viii-s",
    name: "METAREA VIII South",
    region: "South Indian Ocean",
    kind: "high-seas",
    center: { lat: -28, lon: 80 },
    bounds: { west: 55, south: -55, east: 100, north: 0 },
    geometry: metareaPolygon([[55, -55], [100, -55], [100, 0], [55, 0]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 70,
  },
  {
    id: "metarea-ix",
    name: "METAREA IX",
    region: "Arabian Sea / Persian Gulf",
    kind: "high-seas",
    center: { lat: 18, lon: 58 },
    bounds: { west: 40, south: 5, east: 75, north: 31 },
    geometry: metareaPolygon([[40, 5], [75, 5], [75, 31], [40, 31]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 78,
  },
  {
    id: "metarea-x",
    name: "METAREA X",
    region: "Australia",
    kind: "high-seas",
    center: { lat: -24, lon: 135 },
    bounds: { west: 90, south: -55, east: 170, north: 0 },
    geometry: metareaPolygon([[80, -30], [95, -30], [95, -12], [127, -12], [127, -10], [141, -10], [141, 0], [170, 0], [170, -29], [160, -45], [160, -60], [80, -60]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 80,
  },
  {
    id: "metarea-xi",
    name: "METAREA XI",
    region: "Western North Pacific",
    kind: "high-seas",
    center: { lat: 25, lon: 140 },
    bounds: { west: 100, south: 0, east: 180, north: 60 },
    geometry: metareaPolygon([[100, 0], [180, 0], [180, 45], [138.33, 45], [135, 42.5], [130, 42.5], [120, 25], [100, 0]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 80,
  },
  {
    id: "metarea-xii",
    name: "METAREA XII",
    region: "Eastern North Pacific",
    kind: "high-seas",
    center: { lat: 28, lon: -140 },
    bounds: { west: 180, south: 0, east: -95, north: 67 },
    geometry: metareaMultiPolygon([
      [[-180, 0], [-120, 0], [-120, -3.4], [-95, -3.4], [-95, 67], [-168.97, 67], [-180, 67]],
      [[172, 53], [180, 50], [180, 67], [172, 67]],
    ]),
    sourceLabel: "Official WMO/IMO high seas forecast area · United States",
    sourceUrl: "https://wwmiws.wmo.int/index.php/metareas/display/12",
    priority: 90,
  },
  {
    id: "metarea-xiii",
    name: "METAREA XIII",
    region: "Russian Arctic / Northwest Pacific",
    kind: "high-seas",
    center: { lat: 62, lon: 150 },
    bounds: { west: 120, south: 45, east: 180, north: 82 },
    geometry: metareaPolygon([[130, 42.5], [135, 42.5], [138.33, 45], [180, 45], [180, 50], [172, 53], [180, 67], [130, 67]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 62,
  },
  {
    id: "metarea-xiv",
    name: "METAREA XIV",
    region: "New Zealand / South Pacific",
    kind: "high-seas",
    center: { lat: -35, lon: -175 },
    bounds: { west: 160, south: -60, east: -120, north: 0 },
    geometry: metareaMultiPolygon([
      [[160, -60], [180, -60], [180, 0], [170, 0], [170, -29], [160, -45]],
      [[-180, -60], [-120, -60], [-120, 0], [-180, 0]],
    ]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 70,
  },
  {
    id: "metarea-xv",
    name: "METAREA XV",
    region: "Southeast Pacific / Chile",
    kind: "high-seas",
    center: { lat: -38, lon: -90 },
    bounds: { west: -120, south: -60, east: -70, north: 0 },
    geometry: metareaPolygon([[-120, -60], [-67.27, -60], [-67.27, -55.98], [-70, -18.35], [-120, -18.35]]),
    sourceLabel: "Official WMO/IMO high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 70,
  },
  {
    id: "metarea-xvi",
    name: "METAREA XVI",
    region: "Southeast Pacific / Peru",
    kind: "high-seas",
    center: { lat: -18, lon: -95 },
    bounds: { west: -120, south: -30, east: -75, north: 5 },
    geometry: metareaPolygon([[-120, -18.35], [-70, -18.35], [-78, -3.4], [-120, -3.4]]),
    sourceLabel: "Official WMO/IMO high seas forecast area · United States",
    sourceUrl: "https://www.weather.gov/marine/hsmz",
    priority: 75,
  },
  {
    id: "metarea-xvii",
    name: "METAREA XVII",
    region: "Canadian Arctic West",
    kind: "high-seas",
    center: { lat: 74, lon: -145 },
    bounds: { west: -180, south: 60, east: -120, north: 90 },
    geometry: metareaPolygon([[-168.97, 67], [-120, 67], [-120, 90], [-168.97, 90]]),
    sourceLabel: "Official WMO/IMO Arctic high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 55,
  },
  {
    id: "metarea-xviii",
    name: "METAREA XVIII",
    region: "Canadian Arctic East",
    kind: "high-seas",
    center: { lat: 74, lon: -75 },
    bounds: { west: -120, south: 60, east: -35, north: 90 },
    geometry: metareaPolygon([[-120, 67], [-35, 67], [-35, 90], [-120, 90]]),
    sourceLabel: "Official WMO/IMO Arctic high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 55,
  },
  {
    id: "metarea-xix",
    name: "METAREA XIX",
    region: "Norwegian Arctic",
    kind: "high-seas",
    center: { lat: 74, lon: 10 },
    bounds: { west: -35, south: 60, east: 35, north: 90 },
    geometry: metareaPolygon([[-35, 65], [30, 65], [30, 90], [-35, 90]]),
    sourceLabel: "Official WMO/IMO Arctic high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 55,
  },
  {
    id: "metarea-xx",
    name: "METAREA XX",
    region: "Russian Arctic West",
    kind: "high-seas",
    center: { lat: 76, lon: 70 },
    bounds: { west: 35, south: 60, east: 125, north: 90 },
    geometry: metareaPolygon([[30, 71], [125, 71], [125, 90], [30, 90]]),
    sourceLabel: "Official WMO/IMO Arctic high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 50,
  },
  {
    id: "metarea-xxi",
    name: "METAREA XXI",
    region: "Russian Arctic East",
    kind: "high-seas",
    center: { lat: 76, lon: 155 },
    bounds: { west: 125, south: 60, east: 180, north: 90 },
    geometry: metareaPolygon([[125, 67], [180, 67], [180, 90], [125, 90]]),
    sourceLabel: "Official WMO/IMO Arctic high seas forecast area",
    sourceUrl: "https://wwmiws.wmo.int/",
    priority: 50,
  },
];

function longitudeRanges(west: number, east: number): Array<[number, number]> {
  if (west <= east) return [[west, east]];
  return [
    [west, 180],
    [-180, east],
  ];
}

function marineAreaIntersects(area: MarineAreaSummary, viewport: { west: number; south: number; east: number; north: number }) {
  if (area.bounds.north < viewport.south || area.bounds.south > viewport.north) return false;
  const areaRanges = longitudeRanges(area.bounds.west, area.bounds.east);
  const viewportRanges = longitudeRanges(viewport.west, viewport.east);
  return areaRanges.some(([aw, ae]) => viewportRanges.some(([vw, ve]) => aw <= ve && ae >= vw));
}

function marineAreaDistanceScore(area: MarineAreaSummary, viewport: { west: number; south: number; east: number; north: number }) {
  const centerLat = (viewport.south + viewport.north) / 2;
  const rawCenterLon = viewport.west <= viewport.east ? (viewport.west + viewport.east) / 2 : (viewport.west + viewport.east + 360) / 2;
  const centerLon = rawCenterLon > 180 ? rawCenterLon - 360 : rawCenterLon;
  const dLat = Math.abs(area.center.lat - centerLat);
  const dLon = Math.min(Math.abs(area.center.lon - centerLon), 360 - Math.abs(area.center.lon - centerLon));
  return dLat + dLon * 0.6;
}

function buildMarineAreasPayload(viewport: { west: number; south: number; east: number; north: number }, zoom: number): MarineAreasResponse {
  const limit = zoom < 3 ? 8 : zoom < 5 ? 14 : 24;
  const areas = GLOBAL_MARINE_AREAS.filter((area) => marineAreaIntersects(area, viewport))
    .sort((a, b) => {
      const priorityDelta = b.priority - a.priority;
      if (Math.abs(priorityDelta) > 20) return priorityDelta;
      return marineAreaDistanceScore(a, viewport) - marineAreaDistanceScore(b, viewport);
    })
    .slice(0, limit)
    .map(({ priority: _priority, ...area }) => area);

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    source: "curated-worker-manifest",
    meta: {
      count: areas.length,
      limit,
      zoom,
      viewport,
      ttlSeconds: MARINE_AREAS_TTL_SECONDS,
    },
    areas,
  };
}

function marineExtremeValue(kind: MarineExtremeKind, item: MarineExtreme) {
  if (kind === "wave") return item.waveHeightM;
  if (kind === "wind") return item.windSpeedKts;
  if (kind === "warm" || kind === "cold") return item.seaSurfaceTempC;
  if (kind === "current") return item.oceanCurrentKts;
  return item.seaLevelHeightMslM != null ? Math.abs(item.seaLevelHeightMslM) : null;
}

function marineGroup(kind: MarineExtremeKind, title: string, subtitle: string, rows: MarineExtreme[]) {
  const sorted = rows
    .filter((item) => {
      const value = marineExtremeValue(kind, item);
      return value != null && Number.isFinite(value);
    })
    .sort((a, b) => {
      const av = marineExtremeValue(kind, a) ?? 0;
      const bv = marineExtremeValue(kind, b) ?? 0;
      return kind === "cold" ? av - bv : bv - av;
    })
    .slice(0, LAND_MAX_ROWS)
    .map((item) => ({
      ...item,
      kind,
      value: marineExtremeValue(kind, item) ?? item.value,
      units:
        kind === "wave"
          ? "m"
          : kind === "wind" || kind === "current"
            ? "kt"
            : kind === "warm" || kind === "cold"
              ? "C"
              : "m",
    }));
  return { title, subtitle, items: sorted };
}

async function buildMarineExtremesPayload(): Promise<MarineExtremesResponse> {
  const fetchedAtIso = new Date().toISOString();
  const rows = (
    await mapLimit(MARINE_EXTREME_POINTS, 4, async (point) => {
      try {
        const payload = await buildMarineConditionsPayload(point.lat, point.lon);
        const c = payload.conditions;
        if (!c) return null;
        return {
          ...point,
          kind: "wave" as MarineExtremeKind,
          value: c.significantWaveHeightM ?? 0,
          units: "m",
          updatedAt: c.observedAt,
          source: c.modelSource ?? "Open-Meteo Marine",
          waveHeightM: c.significantWaveHeightM,
          windSpeedKts: c.windSpeedKts,
          seaSurfaceTempC: c.seaSurfaceTempC,
          oceanCurrentKts: c.oceanCurrentKts ?? null,
          seaLevelHeightMslM: c.seaLevelHeightMslM ?? null,
        } satisfies MarineExtreme;
      } catch {
        return null;
      }
    })
  ).filter(Boolean) as MarineExtreme[];

  const groups = [
    marineGroup("wave", "Highest Model Waves", "Curated global ocean sample · significant wave height", rows),
    marineGroup("wind", "Strongest Model Winds", "Global atmospheric fallback over ocean points", rows),
    marineGroup("warm", "Warmest Model SST", "Sea surface temperature", rows),
    marineGroup("cold", "Coldest Model SST", "Sea surface temperature", rows),
    marineGroup("current", "Fastest Model Currents", "Ocean current velocity", rows),
    marineGroup("seaLevel", "Largest Sea-Level Signal", "Absolute sea level height vs mean sea level", rows),
  ];

  const heroes: Partial<Record<MarineExtremeKind, MarineExtreme | null>> = {};
  for (const group of groups) {
    const first = group.items[0] ?? null;
    if (group.title.includes("Waves")) heroes.wave = first;
    else if (group.title.includes("Winds")) heroes.wind = first;
    else if (group.title.includes("Warmest")) heroes.warm = first;
    else if (group.title.includes("Coldest")) heroes.cold = first;
    else if (group.title.includes("Currents")) heroes.current = first;
    else heroes.seaLevel = first;
  }

  const updatedAt = rows.map((row) => row.updatedAt).filter(Boolean).sort().slice(-1)[0] ?? null;

  return {
    ok: true,
    updatedAt,
    generatedAt: fetchedAtIso,
    source: "open-meteo-marine",
    meta: {
      pointsTotal: rows.length,
      fetchedAtIso,
      ttlSeconds: MARINE_EXTREMES_TTL_SECONDS,
    },
    heroes,
    groups,
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function hotspotMarkerMeta(confidence: number | null, frp: number | null) {
  const high = (confidence != null && confidence >= 80) || (frp != null && frp >= 100);
  const moderate = (confidence != null && confidence >= 50) || (frp != null && frp >= 25);
  if (high) {
    return {
      markerRadius: 10,
      markerHaloRadius: 18,
      markerColor: "#ef4444",
      markerHaloColor: "rgba(239,68,68,0.30)",
      markerStrokeColor: "rgba(255,245,245,0.95)",
      markerStrokeWidth: 1.8,
      markerCenterRadius: 3.5,
    };
  }
  if (moderate) {
    return {
      markerRadius: 8,
      markerHaloRadius: 15,
      markerColor: "#f97316",
      markerHaloColor: "rgba(249,115,22,0.26)",
      markerStrokeColor: "rgba(255,247,237,0.92)",
      markerStrokeWidth: 1.6,
      markerCenterRadius: 3,
    };
  }
  return {
    markerRadius: 6,
    markerHaloRadius: 12,
    markerColor: "#fbbf24",
    markerHaloColor: "rgba(251,191,36,0.22)",
    markerStrokeColor: "rgba(255,251,235,0.90)",
    markerStrokeWidth: 1.4,
    markerCenterRadius: 2.6,
  };
}

async function buildFireHotspotsPayload(args: {
  env: Env;
  west: number;
  south: number;
  east: number;
  north: number;
  dayRange: number;
}): Promise<FireHotspotsResponse> {
  const { env, west, south, east, north, dayRange } = args;
  const key = String(env.NASA_FIRMS_MAP_KEY ?? "").trim();
  const source = "NASA FIRMS VIIRS_SNPP_NRT" as const;
  if (!key) {
    return { ok: true, enabled: false, source, west, south, east, north, dayRange, features: [], generatedAt: new Date().toISOString() };
  }

  const bbox = `${west},${south},${east},${north}`;
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/VIIRS_SNPP_NRT/${bbox}/${dayRange}`;
  const res = await fetch(url, {
    headers: { "User-Agent": WEATHER_FALLBACK_USER_AGENT, Accept: "text/csv" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`NASA FIRMS hotspots failed (${res.status}): ${body.slice(0, 160)}`);
  }
  const csv = await res.text();
  const rows = parseCsv(csv);
  const features = rows
    .map((row, idx) => {
      const lat = safeNum(row.latitude);
      const lon = safeNum(row.longitude);
      if (lat == null || lon == null) return null;
      const confidence = safeNum(row.confidence);
      const frp = safeNum(row.frp);
      const brightTi4 = safeNum(row.bright_ti4);
      const brightTi5 = safeNum(row.bright_ti5);
      const acqDate = row.acq_date || null;
      const acqTime = row.acq_time || null;
      const hhmm = acqTime && /^\d{1,4}$/.test(acqTime) ? acqTime.padStart(4, "0") : null;
      const updatedAt = acqDate && hhmm ? `${acqDate}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z` : null;
      return {
        type: "Feature",
        id: row.id || `firms-${row.latitude}-${row.longitude}-${row.acq_date}-${row.acq_time}-${idx}`,
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          incidentName: "Thermal hotspot",
          source,
          geometrySource: source,
          confidence,
          frp,
          brightTi4,
          brightTi5,
          satellite: row.satellite || null,
          instrument: row.instrument || "VIIRS",
          updatedAt,
          acres: null,
          percentContained: null,
          isHotspot: true,
          ...hotspotMarkerMeta(confidence, frp),
        },
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const aFrp = safeNum(a?.properties?.frp) ?? 0;
      const bFrp = safeNum(b?.properties?.frp) ?? 0;
      return bFrp - aFrp;
    })
    .slice(0, FIRE_HOTSPOTS_MAX_FEATURES);

  return { ok: true, enabled: true, source, west, south, east, north, dayRange, features, generatedAt: new Date().toISOString() };
}

function fmtTemp(v: number | null | undefined, unit: Unit) {
  if (v == null || !Number.isFinite(v)) return "—";
  return unit === "F" ? `${v.toFixed(1)} °F` : `${v.toFixed(1)} °C`;
}

function fmtWind(v: number | null | undefined, unit: Unit) {
  if (v == null || !Number.isFinite(v)) return "—";
  return unit === "F" ? `${v.toFixed(0)} mph` : `${v.toFixed(0)} km/h`;
}

function clampInt(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

function clampFloat(v: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const s = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>) {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

function parseUnits(s: string | null): Units {
  const v = (s ?? "").toLowerCase();
  return v === "metric" ? "metric" : "imperial";
}

function normalizeCommaList(s: string | null, max = 40) {
  const raw = String(s ?? "").trim();
  if (!raw) return [];
  const parts = raw.split(",").map((x) => x.trim()).filter(Boolean);
  return parts.slice(0, max);
}

function roundCoordKey(v: number, step = 0.02) {
  return Math.round(v / step) * step;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function pct01Sky(p: number | null | undefined) {
  if (p == null || !Number.isFinite(p)) return null;
  return clamp01(p / 100);
}

function safeNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cToF(v: number | null) {
  return v == null ? null : (v * 9) / 5 + 32;
}

function msToMph(v: number | null) {
  return v == null ? null : v * 2.2369362921;
}

function msToKmh(v: number | null) {
  return v == null ? null : v * 3.6;
}

function roundWeatherValue(v: number | null, digits = 1) {
  if (v == null || !Number.isFinite(v)) return null;
  const scale = 10 ** digits;
  return Math.round(v * scale) / scale;
}

function tempForUnits(c: number | null, units: Units) {
  return roundWeatherValue(units === "imperial" ? cToF(c) : c);
}

function windForUnits(ms: number | null, units: Units) {
  return roundWeatherValue(units === "imperial" ? msToMph(ms) : msToKmh(ms));
}

type AerosolSnapshot = {
  index: number | null;
  label: string | null;
  source: string | null;
  airQualityIndex?: number | null;
  airQualityLabel?: string | null;
};

function normalizeAerosolIndex(args: {
  aerosolOpticalDepth?: number | null;
  pm25?: number | null;
  pm10?: number | null;
  dust?: number | null;
  usAqi?: number | null;
}) {
  const aod01 =
    args.aerosolOpticalDepth == null ? null : clamp01((args.aerosolOpticalDepth - 0.04) / 0.42);
  const pm2501 = args.pm25 == null ? null : clamp01(args.pm25 / 35);
  const pm1001 = args.pm10 == null ? null : clamp01(args.pm10 / 80);
  const dust01 = args.dust == null ? null : clamp01(args.dust / 120);
  const aqi01 = args.usAqi == null ? null : clamp01((args.usAqi - 20) / 130);

  const weighted =
    (aod01 ?? 0) * 0.5 +
    (pm2501 ?? 0) * 0.2 +
    (pm1001 ?? 0) * 0.08 +
    (dust01 ?? 0) * 0.12 +
    (aqi01 ?? 0) * 0.1;

  const sources = [aod01, pm2501, pm1001, dust01, aqi01].filter((v) => v != null);
  if (!sources.length) return null;

  return clamp01(weighted / (sources.length >= 3 ? 1 : 0.8));
}

function aerosolLabelForIndex(index: number | null) {
  if (index == null) return null;
  if (index <= 0.16) return "Excellent transparency";
  if (index <= 0.3) return "Clean sky";
  if (index <= 0.48) return "Light haze";
  if (index <= 0.66) return "Hazy";
  if (index <= 0.82) return "Heavy haze or smoke";
  return "Opaque aerosols";
}

function airQualityLabelForUsAqi(aqi: number | null) {
  if (aqi == null || !Number.isFinite(aqi)) return null;
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Unhealthy for sensitive groups";
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhealthy";
  return "Hazardous";
}

async function fetchAerosolSnapshot(lat: number, lon: number, timezone: string): Promise<AerosolSnapshot> {
  const url =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=aerosol_optical_depth,pm2_5,pm10,dust,us_aqi,ozone` +
    `&forecast_hours=24` +
    `&past_hours=3` +
    `&timezone=${encodeURIComponent(timezone || "auto")}`;

  try {
    const json: any = await fetchJsonWithHeaders(url);
    const hourly = json?.hourly ?? {};
    const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
    if (!times.length) {
      return { index: null, label: null, source: "Open-Meteo air quality", airQualityIndex: null, airQualityLabel: null };
    }

    const now = Date.now();
    let bestIdx = 0;
    let bestDt = Number.POSITIVE_INFINITY;
    for (let i = 0; i < times.length; i++) {
      const t = new Date(times[i]).getTime();
      if (!Number.isFinite(t)) continue;
      const dt = Math.abs(t - now);
      if (dt < bestDt) {
        bestDt = dt;
        bestIdx = i;
      }
    }

    const pick = (name: string) => {
      const arr = hourly?.[name];
      return Array.isArray(arr) ? safeNum(arr[bestIdx]) : null;
    };

    const usAqi = pick("us_aqi");
    const index = normalizeAerosolIndex({
      aerosolOpticalDepth: pick("aerosol_optical_depth"),
      pm25: pick("pm2_5"),
      pm10: pick("pm10"),
      dust: pick("dust"),
      usAqi,
    });

    return {
      index,
      label: aerosolLabelForIndex(index),
      source: "Open-Meteo air quality",
      airQualityIndex: usAqi,
      airQualityLabel: airQualityLabelForUsAqi(usAqi),
    };
  } catch {
    return { index: null, label: null, source: "Open-Meteo air quality", airQualityIndex: null, airQualityLabel: null };
  }
}

function buildAirQualityHourlyCacheKey(url: URL, lat: number, lon: number) {
  const keyUrl = new URL(url.toString());
  keyUrl.pathname = "/__cache__/air-quality/hourly";
  keyUrl.searchParams.set("lat", String(Number(lat.toFixed(3))));
  keyUrl.searchParams.set("lon", String(Number(lon.toFixed(3))));
  keyUrl.searchParams.set("timezone", url.searchParams.get("timezone") || "auto");
  keyUrl.searchParams.set("forecast_hours", url.searchParams.get("forecast_hours") || "96");
  keyUrl.searchParams.set("past_hours", url.searchParams.get("past_hours") || "0");
  keyUrl.searchParams.set("v", AIR_QUALITY_CACHE_VERSION);
  return new Request(keyUrl.toString(), { method: "GET" });
}

function buildAirQualityHourlyUpstream(url: URL) {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false as const, error: "lat and lon are required numbers" };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ok: false as const, error: "lat/lon out of range" };
  }

  const timezone = url.searchParams.get("timezone") || "auto";
  const forecastHoursRaw = Number(url.searchParams.get("forecast_hours") || "96");
  const pastHoursRaw = Number(url.searchParams.get("past_hours") || "0");
  const forecastHours = Math.max(1, Math.min(168, Number.isFinite(forecastHoursRaw) ? Math.round(forecastHoursRaw) : 96));
  const pastHours = Math.max(0, Math.min(24, Number.isFinite(pastHoursRaw) ? Math.round(pastHoursRaw) : 0));
  const hourly = [
    "us_aqi",
    "pm2_5",
    "pm10",
    "ozone",
    "nitrogen_dioxide",
    "carbon_monoxide",
    "sulphur_dioxide",
  ].join(",");

  const upstreamUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&forecast_hours=${forecastHours}` +
    `&past_hours=${pastHours}` +
    `&timezone=${encodeURIComponent(timezone)}`;

  return { ok: true as const, lat, lon, timezone, forecastHours, pastHours, upstreamUrl };
}

async function fetchAirQualityHourlyResponse(built: ReturnType<typeof buildAirQualityHourlyUpstream> & { ok: true }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OPEN_METEO_TIMEOUT_MS);
  try {
    const res = await fetch(built.upstreamUrl, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ ok: false, error: "Air quality upstream error", status: res.status, detail: txt.slice(0, 240) }),
        { status: res.status, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }

    const json: any = await res.json();
    const hourly = json?.hourly ?? {};
    const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
    const pick = (name: string, idx: number) => {
      const arr = hourly?.[name];
      return Array.isArray(arr) ? safeNum(arr[idx]) : null;
    };

    const rows = times.map((time, idx) => {
      const usAqi = pick("us_aqi", idx);
      return {
        time,
        usAqi,
        airQualityIndex: usAqi,
        airQualityLabel: airQualityLabelForUsAqi(usAqi),
        pm25: pick("pm2_5", idx),
        pm10: pick("pm10", idx),
        ozone: pick("ozone", idx),
        nitrogenDioxide: pick("nitrogen_dioxide", idx),
        carbonMonoxide: pick("carbon_monoxide", idx),
        sulphurDioxide: pick("sulphur_dioxide", idx),
      };
    });

    return new Response(
      JSON.stringify({
        ok: true,
        source: "Open-Meteo air quality",
        updatedAt: new Date().toISOString(),
        timezone: json?.timezone ?? built.timezone,
        timezoneAbbreviation: json?.timezone_abbreviation ?? null,
        utcOffsetSeconds: safeNum(json?.utc_offset_seconds),
        hourly: rows,
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  } finally {
    clearTimeout(t);
  }
}

function buildUsgsInstantaneousCacheKey(url: URL) {
  const keyUrl = new URL(url.toString());
  keyUrl.pathname = "/__cache__/usgs/instantaneous";
  keyUrl.searchParams.set("site", url.searchParams.get("site") || url.searchParams.get("sites") || "");
  keyUrl.searchParams.set("parameterCd", url.searchParams.get("parameterCd") || "00010");
  keyUrl.searchParams.set("period", url.searchParams.get("period") || "PT24H");
  keyUrl.searchParams.set("v", USGS_IV_CACHE_VERSION);
  return new Request(keyUrl.toString(), { method: "GET" });
}

function usgsParameterLabel(code: any) {
  switch (String(code ?? "")) {
    case "00010":
      return "Water temperature";
    case "00060":
      return "Discharge";
    case "00065":
      return "Gage height";
    case "00045":
      return "Precipitation";
    case "00300":
      return "Dissolved oxygen";
    case "00400":
      return "pH";
    case "63680":
      return "Turbidity";
    default:
      return String(code ?? "") || null;
  }
}

function normalizeUsgsSiteId(site: string) {
  const trimmed = site.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("USGS-") ? trimmed : `USGS-${trimmed}`;
}

function buildUsgsInstantaneousUpstream(url: URL) {
  const site = (url.searchParams.get("site") || url.searchParams.get("sites") || "").trim();
  const parameterCd = (url.searchParams.get("parameterCd") || "00010").trim();
  const period = (url.searchParams.get("period") || "PT24H").trim();

  if (!/^[A-Za-z0-9:,\-]+$/.test(site)) {
    return { ok: false as const, error: "site is required and must be a USGS site id" };
  }
  if (!/^\d{5}(,\d{5})*$/.test(parameterCd)) {
    return { ok: false as const, error: "parameterCd must be one or more USGS five-digit parameter codes" };
  }
  if (!/^P(T\d+[HMS]|\d+D)$/.test(period)) {
    return { ok: false as const, error: "period must be an ISO-8601 duration such as PT24H or P7D" };
  }

  const siteId = normalizeUsgsSiteId(site);
  const upstreamUrl =
    `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items` +
    `?f=json` +
    `&monitoring_location_id=${encodeURIComponent(siteId)}` +
    `&parameter_code=${encodeURIComponent(parameterCd)}` +
    `&limit=100`;

  return { ok: true as const, site, siteId, parameterCd, period, upstreamUrl };
}

async function fetchUsgsInstantaneousResponse(built: ReturnType<typeof buildUsgsInstantaneousUpstream> & { ok: true }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OPEN_METEO_TIMEOUT_MS);
  try {
    const res = await fetch(built.upstreamUrl, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": WEATHER_FALLBACK_USER_AGENT },
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return new Response(
        JSON.stringify({ ok: false, error: "USGS upstream error", status: res.status, detail: txt.slice(0, 240) }),
        { status: res.status, headers: { "content-type": "application/json; charset=utf-8" } },
      );
    }

    const json: any = await res.json();
    const features = Array.isArray(json?.features) ? json.features : [];
    const observations = features.map((feature: any) => {
      const props = feature?.properties ?? {};
      const coords = feature?.geometry?.coordinates;
      const value = safeNum(props?.value);
      return {
        siteCode: String(props?.monitoring_location_id ?? built.siteId).replace(/^USGS-/, ""),
        siteId: props?.monitoring_location_id ?? built.siteId,
        siteName: null,
        latitude: Array.isArray(coords) ? safeNum(coords[1]) : null,
        longitude: Array.isArray(coords) ? safeNum(coords[0]) : null,
        parameterCode: props?.parameter_code ?? null,
        parameterName: usgsParameterLabel(props?.parameter_code),
        unit: props?.unit_of_measure ?? null,
        latest: {
          value,
          rawValue: props?.value ?? null,
          dateTime: props?.time ?? null,
          qualifiers: props?.qualifier ? [props.qualifier] : [],
          approvalStatus: props?.approval_status ?? null,
        },
        values: [],
      };
    });

    return new Response(
      JSON.stringify({
        ok: true,
        source: "USGS OGC latest-continuous",
        updatedAt: new Date().toISOString(),
        site: built.site,
        parameterCd: built.parameterCd,
        period: built.period,
        observations,
      }),
      { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  } finally {
    clearTimeout(t);
  }
}

function parseBboxFromUrl(url: URL) {
  const west = Number(url.searchParams.get("west"));
  const south = Number(url.searchParams.get("south"));
  const east = Number(url.searchParams.get("east"));
  const north = Number(url.searchParams.get("north"));
  if (![west, south, east, north].every(Number.isFinite)) return null;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  const area = Math.abs(east - west) * Math.abs(north - south);
  if (area > 2500) return null;
  return { west, south, east, north };
}

function buildUsgsWaterStationsCacheKey(url: URL, bbox: { west: number; south: number; east: number; north: number }) {
  const keyUrl = new URL(url.toString());
  keyUrl.pathname = "/__cache__/usgs/water-stations";
  keyUrl.searchParams.set("bbox", [bbox.west, bbox.south, bbox.east, bbox.north].map((v) => v.toFixed(3)).join(","));
  keyUrl.searchParams.set("parameters", url.searchParams.get("parameters") || url.searchParams.get("parameterCd") || "00010");
  keyUrl.searchParams.set("limit", url.searchParams.get("limit") || "250");
  keyUrl.searchParams.set("v", USGS_WATER_STATIONS_CACHE_VERSION);
  return new Request(keyUrl.toString(), { method: "GET" });
}

function parseUsgsParameterList(url: URL) {
  const raw = url.searchParams.get("parameters") || url.searchParams.get("parameterCd") || "00010";
  const codes = raw
    .split(",")
    .map((x) => x.trim())
    .filter((x) => /^\d{5}$/.test(x));
  return Array.from(new Set(codes)).slice(0, 8);
}

async function fetchUsgsWaterStationsResponse(
  url: URL,
  bbox: { west: number; south: number; east: number; north: number },
) {
  const parameters = parseUsgsParameterList(url);
  const limitRaw = Number(url.searchParams.get("limit") || "250");
  const limit = Math.max(10, Math.min(500, Number.isFinite(limitRaw) ? Math.round(limitRaw) : 250));

  const latestUrl =
    `https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items` +
    `?f=json` +
    `&bbox=${encodeURIComponent([bbox.west, bbox.south, bbox.east, bbox.north].join(","))}` +
    `&parameter_code=${encodeURIComponent(parameters.join(","))}` +
    `&limit=${limit}`;

  const latestJson: any = await fetchJsonWithHeaders(latestUrl);
  const features = Array.isArray(latestJson?.features) ? latestJson.features : [];
  const bySite = new Map<string, any>();

  for (const feature of features) {
    const props = feature?.properties ?? {};
    const siteId = String(props?.monitoring_location_id ?? "");
    const coords = feature?.geometry?.coordinates;
    if (!siteId || !Array.isArray(coords)) continue;
    const lon = safeNum(coords[0]);
    const lat = safeNum(coords[1]);
    if (lat == null || lon == null) continue;
    const observedMs = Date.parse(String(props?.time ?? ""));
    if (!Number.isFinite(observedMs) || Date.now() - observedMs > USGS_WATER_STATION_MAX_OBS_AGE_MS) continue;

    const reading = {
      parameterCode: props?.parameter_code ?? null,
      label: usgsParameterLabel(props?.parameter_code),
      value: safeNum(props?.value),
      rawValue: props?.value ?? null,
      unit: props?.unit_of_measure ?? null,
      time: props?.time ?? null,
      approvalStatus: props?.approval_status ?? null,
      qualifier: props?.qualifier ?? null,
    };

    const existing =
      bySite.get(siteId) ??
      {
        siteId,
        siteNumber: siteId.replace(/^USGS-/, ""),
        name: siteId,
        lat,
        lon,
        readings: [] as any[],
      };
    existing.readings.push(reading);
    bySite.set(siteId, existing);
  }

  const stations = Array.from(bySite.values()).slice(0, limit);
  const geojson = {
    type: "FeatureCollection" as const,
    features: stations.map((station) => {
      station.readings.sort((a: any, b: any) => {
        const at = Date.parse(String(a?.time ?? ""));
        const bt = Date.parse(String(b?.time ?? ""));
        return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
      });
      const primary = station.readings.find((r: any) => r.parameterCode === "00010") ?? station.readings[0] ?? null;
      const valueText =
        primary?.value == null
          ? null
          : `${Math.round(primary.value * 10) / 10}${primary.unit ? ` ${primary.unit}` : ""}`;
      return {
        type: "Feature" as const,
        id: station.siteId,
        geometry: { type: "Point" as const, coordinates: [station.lon, station.lat] },
        properties: {
          id: station.siteId,
          siteId: station.siteId,
          siteNumber: station.siteNumber,
          name: station.name,
          label: valueText ?? station.siteNumber,
          primaryParameter: primary?.parameterCode ?? null,
          primaryLabel: primary?.label ?? null,
          primaryValue: primary?.value ?? null,
          primaryUnit: primary?.unit ?? null,
          observedAt: primary?.time ?? null,
          readings: station.readings,
        },
      };
    }),
  };

  return new Response(
    JSON.stringify({
      ok: true,
      source: "USGS OGC latest-continuous",
      updatedAt: new Date().toISOString(),
      parameters,
      bbox,
      maxObservationAgeHours: Math.round(USGS_WATER_STATION_MAX_OBS_AGE_MS / 3600000),
      count: stations.length,
      geojson,
    }),
    { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
  );
}

function midpoint(a: number, b: number) {
  return (a + b) / 2;
}

function parseSkyGridMode(v: string | null): SkyGridMode {
  return v === "hero" ? "hero" : "regional";
}

function parseSkyGridDensity(v: string | null): SkyGridDensity {
  const s = String(v ?? "").toLowerCase();
  if (s === "low" || s === "medium" || s === "high") return s;
  return "auto";
}

function resolveEffectiveSkyGridDensity(args: {
  zoom: number;
  mode: SkyGridMode;
  density: SkyGridDensity;
}): Exclude<SkyGridDensity, "auto"> {
  const { zoom, mode, density } = args;
  if (density !== "auto") return density;

  if (mode === "regional") {
    if (zoom <= 5) return "low";
    if (zoom <= 7) return "medium";
    return "medium";
  }

  if (zoom <= 6) return "low";
  if (zoom <= 8) return "medium";
  return "medium";
}

/* =============================================================================
 * Land extremes helpers
 * ============================================================================= */

function toOpenMeteoUrlBatch(lats: number[], lons: number[], unit: Unit) {
  const temperatureUnit = unit === "F" ? "fahrenheit" : "celsius";
  const windUnit = unit === "F" ? "mph" : "kmh";
  const precipUnit = unit === "F" ? "inch" : "mm";

  return (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lats.join(","))}` +
    `&longitude=${encodeURIComponent(lons.join(","))}` +
    `&current=temperature_2m,precipitation,wind_speed_10m,wind_gusts_10m` +
    `&temperature_unit=${encodeURIComponent(temperatureUnit)}` +
    `&wind_speed_unit=${encodeURIComponent(windUnit)}` +
    `&precipitation_unit=${encodeURIComponent(precipUnit)}` +
    `&timezone=auto`
  );
}

function normalizeBatchList(json: OpenMeteoBatchResponse): OpenMeteoBatchItem[] {
  if (Array.isArray(json)) return json as OpenMeteoBatchItem[];
  if (json && typeof json === "object" && Array.isArray((json as any).results)) {
    return (json as any).results as OpenMeteoBatchItem[];
  }
  return [];
}

async function fetchOpenMeteoCurrentBatch(
  points: LandPoint[],
  unit: Unit,
): Promise<Array<{ current: OpenMeteoCurrent | null; updatedAtIso: string | null }>> {
  if (!points.length) return [];

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const url = toOpenMeteoUrlBatch(lats, lons, unit);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OPEN_METEO_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return points.map(() => ({ current: null, updatedAtIso: null }));

    const json = (await res.json()) as OpenMeteoBatchResponse;
    const list = normalizeBatchList(json);

    return points.map((_, i) => {
      const cur: OpenMeteoCurrent | null = (list?.[i]?.current ?? null) as any;
      const updatedAtIso: string | null = cur?.time ? String(cur.time) : null;
      return { current: cur, updatedAtIso };
    });
  } catch {
    return points.map(() => ({ current: null, updatedAtIso: null }));
  } finally {
    clearTimeout(t);
  }
}

function baseNameKey(name: string) {
  let s = String(name ?? "").trim().toLowerCase();
  s = s.replace(/\s*\(capital\)\s*$/i, "");
  s = s.replace(/\s*\([a-z0-9]{3}\)\s*$/i, "");
  s = s.replace(/[’']/g, "'");
  s = s.replace(/[^a-z0-9]+/g, " ").trim();
  return s;
}

function dedupeByBaseName<T extends { name: string }>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = baseNameKey(it.name);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function buildLandExtremes(
  unit: Unit,
  rows: Array<
    LandPoint & {
      t: number | null;
      wind: number | null;
      gust: number | null;
      precip: number | null;
      time: string | null;
    }
  >,
) {
  const sortDesc = <T>(arr: T[], get: (x: T) => number) => arr.slice().sort((a, b) => get(b) - get(a));
  const sortAsc = <T>(arr: T[], get: (x: T) => number) => arr.slice().sort((a, b) => get(a) - get(b));

  const hotSorted = dedupeByBaseName(
    sortDesc(rows.filter((r) => r.t != null && Number.isFinite(r.t)), (r) => r.t as number),
  ).slice(0, LAND_MAX_ROWS);

  const coldSorted = dedupeByBaseName(
    sortAsc(rows.filter((r) => r.t != null && Number.isFinite(r.t)), (r) => r.t as number),
  ).slice(0, LAND_MAX_ROWS);

  const windSorted = dedupeByBaseName(
    sortDesc(
      rows.filter((r) => (r.gust ?? r.wind) != null && Number.isFinite((r.gust ?? r.wind) as number)),
      (r) => (r.gust ?? r.wind) as number,
    ),
  ).slice(0, LAND_MAX_ROWS);

  const toExtreme = (kind: LandExtremeKind, r: (typeof rows)[number], valueText: string, subtitle: string): LandExtreme => ({
    id: `${kind}:${r.id}`,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    updatedAt: r.time ?? null,
    valueText,
    subtitle,
    badge: r.badge,
    kind,
  });

  const gHot: LandGroup = {
    title: "Top 10 Hottest Places",
    subtitle: "Curated global sample of current land temperatures",
    items: hotSorted.map((r) => toExtreme("hot", r, fmtTemp(r.t, unit), "Curated global hot spot")),
  };

  const gCold: LandGroup = {
    title: "Top 10 Coldest Places",
    subtitle: "Curated global sample of current land temperatures",
    items: coldSorted.map((r) => toExtreme("cold", r, fmtTemp(r.t, unit), "Curated global cold spot")),
  };

  const gWind: LandGroup = {
    title: "Top 10 Windiest Places",
    subtitle: "Curated global sample of current land winds and gusts",
    items: windSorted.map((r) =>
      toExtreme(
        "wind",
        r,
        fmtWind((r.gust ?? r.wind) ?? null, unit),
        r.gust != null ? "Curated global gust spot" : "Curated global wind spot",
      ),
    ),
  };

  const heroes: Partial<Record<LandExtremeKind, LandExtreme | null>> = {
    hot: gHot.items[0] ?? null,
    cold: gCold.items[0] ?? null,
    wind: gWind.items[0] ?? null,
  };

  const updatedAt = rows.map((r) => r.time).filter(Boolean).sort().slice(-1)[0] ?? null;

  return { heroes, groups: [gHot, gCold, gWind], updatedAt };
}

function numOrNull(value: unknown) {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function marsStat(block: any) {
  return {
    avg: numOrNull(block?.av),
    min: numOrNull(block?.mn),
    max: numOrNull(block?.mx),
  };
}

function archivedMarsFallback(fetchedAtIso: string): MarsInsightWeather {
  return {
    ok: true,
    source: "NASA InSight Weather API",
    archived: true,
    sol: "archived",
    terrestrialDate: "2022-12-15",
    season: "northern winter",
    tempC: { avg: -62, min: -96, max: -15 },
    pressurePa: { avg: 735, min: 707, max: 760 },
    windMps: { avg: 7.2, min: null, max: 20 },
    fetchedAtIso,
    note:
      "Archived/stale Mars surface weather. InSight stopped returning weather after the mission ended in December 2022, so this card is intentionally not live.",
  };
}

async function fetchMarsInsightWeather(env: Env): Promise<MarsInsightWeather> {
  const fetchedAtIso = new Date().toISOString();
  const apiKey = env.NASA_API_KEY || "DEMO_KEY";
  const url =
    `https://api.nasa.gov/insight_weather/` +
    `?api_key=${encodeURIComponent(apiKey)}` +
    `&feedtype=json&ver=1.0`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6500);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return archivedMarsFallback(fetchedAtIso);
    const json = (await res.json()) as any;
    const sols = Array.isArray(json?.sol_keys) ? json.sol_keys : [];
    const sol = String(sols[sols.length - 1] ?? "");
    const row = sol ? json?.[sol] : null;
    if (!sol || !row) return archivedMarsFallback(fetchedAtIso);

    return {
      ok: true,
      source: "NASA InSight Weather API",
      archived: true,
      sol,
      terrestrialDate: typeof row?.First_UTC === "string" ? row.First_UTC.slice(0, 10) : null,
      season: typeof row?.Season === "string" ? row.Season : null,
      tempC: marsStat(row?.AT),
      pressurePa: marsStat(row?.PRE),
      windMps: marsStat(row?.HWS),
      fetchedAtIso,
      note:
        "Archived/stale Mars surface weather. InSight stopped returning weather after the mission ended in December 2022, so this card is intentionally not live.",
    };
  } catch {
    return archivedMarsFallback(fetchedAtIso);
  } finally {
    clearTimeout(t);
  }
}

/* =============================================================================
 * Current + hourly proxy helpers
 * ============================================================================= */

function toOpenMeteoUrlCurrentSingle(lat: number, lon: number, units: Units) {
  const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";

  const current = [
    "temperature_2m",
    "apparent_temperature",
    "dew_point_2m",
    "relative_humidity_2m",
    "weather_code",
    "cloud_cover",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "pressure_msl",
  ].join(",");

  return (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&current=${encodeURIComponent(current)}` +
    `&temperature_unit=${encodeURIComponent(temperatureUnit)}` +
    `&wind_speed_unit=${encodeURIComponent(windUnit)}` +
    `&timezone=auto`
  );
}

function buildOmHourlyUpstream(url: URL) {
  const latQ = url.searchParams.get("lat") ?? url.searchParams.get("latitude");
  const lonQ = url.searchParams.get("lon") ?? url.searchParams.get("longitude");

  const lats = normalizeCommaList(latQ, 60);
  const lons = normalizeCommaList(lonQ, 60);

  if (!lats.length || !lons.length || lats.length !== lons.length) {
    return { ok: false as const, error: "latitude and longitude lists must be provided and have equal length" };
  }

  const hourly = url.searchParams.get("hourly") ?? url.searchParams.get("h") ?? "";
  const daily = url.searchParams.get("daily") ?? url.searchParams.get("d") ?? "";
  if (!hourly && !daily) return { ok: false as const, error: "hourly or daily is required" };

  const tz = url.searchParams.get("timezone") ?? url.searchParams.get("tz") ?? "auto";
  const units = parseUnits(url.searchParams.get("units"));
  const requestedModel = (url.searchParams.get("model") ?? "best_match").trim().toLowerCase();

  const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";
  const precipUnit = units === "imperial" ? "inch" : "mm";

  const endpointPath =
    requestedModel === "gfs"
      ? "/v1/gfs"
      : requestedModel === "ecmwf"
        ? "/v1/ecmwf"
        : requestedModel === "dwd_icon"
          ? "/v1/dwd-icon"
          : "/v1/forecast";

  const upstream = new URL(`https://api.open-meteo.com${endpointPath}`);
  upstream.searchParams.set("latitude", lats.join(","));
  upstream.searchParams.set("longitude", lons.join(","));
  if (hourly) upstream.searchParams.set("hourly", hourly);
  if (daily) upstream.searchParams.set("daily", daily);
  upstream.searchParams.set("timezone", tz);
  upstream.searchParams.set("temperature_unit", temperatureUnit);
  upstream.searchParams.set("wind_speed_unit", windUnit);
  upstream.searchParams.set("precipitation_unit", precipUnit);

  const forecastDays = url.searchParams.get("forecast_days");
  if (forecastDays) upstream.searchParams.set("forecast_days", forecastDays);
  const pastDays = url.searchParams.get("past_days");
  if (pastDays) upstream.searchParams.set("past_days", pastDays);

  return { ok: true as const, upstreamUrl: upstream.toString(), lats, lons, units, model: requestedModel };
}

function buildOmHourlyCacheKey(reqUrl: URL, lats: string[], lons: string[], units: Units) {
  const latKeys = lats.map((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? roundCoordKey(n, 0.02).toFixed(2) : "0.00";
  });

  const lonKeys = lons.map((s) => {
    const n = Number(s);
    return Number.isFinite(n) ? roundCoordKey(n, 0.02).toFixed(2) : "0.00";
  });

  const keyUrl = new URL(reqUrl.toString());
  keyUrl.pathname = "/__cache__/openmeteo/hourly";
  keyUrl.searchParams.set("latitude", latKeys.join(","));
  keyUrl.searchParams.set("longitude", lonKeys.join(","));
  keyUrl.searchParams.set("units", units);

  if (keyUrl.searchParams.get("lat")) keyUrl.searchParams.delete("lat");
  if (keyUrl.searchParams.get("lon")) keyUrl.searchParams.delete("lon");
  if (keyUrl.searchParams.get("h")) keyUrl.searchParams.delete("h");
  if (keyUrl.searchParams.get("tz")) keyUrl.searchParams.delete("tz");

  return new Request(keyUrl.toString(), { method: "GET" });
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function buildAlmanacCacheKey(reqUrl: URL, lat: number, lon: number) {
  const keyUrl = new URL(reqUrl.toString());
  keyUrl.pathname = "/__cache__/almanac/climo/v14";
  keyUrl.searchParams.set("lat", String(roundCoordKey(lat, 0.05)));
  keyUrl.searchParams.set("lon", String(roundCoordKey(lon, 0.05)));
  return new Request(keyUrl.toString(), { method: "GET" });
}

function buildFireContextCacheKey(reqUrl: URL, lat: number, lon: number) {
  const keyUrl = new URL(reqUrl.toString());
  keyUrl.pathname = "/__cache__/fire/context/v2";
  keyUrl.searchParams.set("lat", String(roundCoordKey(lat, 0.05)));
  keyUrl.searchParams.set("lon", String(roundCoordKey(lon, 0.05)));
  return new Request(keyUrl.toString(), { method: "GET" });
}

async function fetchNceiJson(
  env: Env,
  path: "/stations" | "/data",
  params: Record<string, string | number>,
) {
  const u = new URL(`https://www.ncei.noaa.gov/cdo-web/api/v2${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue;
    u.searchParams.append(k, String(v));
  }
  const res = await fetch(u.toString(), {
    headers: {
      token: env.NOAA_NCEI_TOKEN,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`NOAA ${path} failed (${res.status})${txt ? ` ${txt.slice(0, 200)}` : ""}`);
  }
  return res.json<any>();
}

async function fetchNceiDataPages(
  env: Env,
  baseParams: Record<string, string | number>,
) {
  const limit = 250;
  let offset = 1;
  const results: any[] = [];
  while (true) {
    const json = await fetchNceiJson(env, "/data", { ...baseParams, limit, offset });
    const rows = Array.isArray(json?.results) ? json.results : [];
    results.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return results;
}

async function fetchNceiDailyChunk(
  env: Env,
  args: {
    stationId: string;
    startdate: string;
    enddate: string;
  },
) {
  const u = new URL("https://www.ncei.noaa.gov/cdo-web/api/v2/data");
  u.searchParams.set("datasetid", "GHCND");
  u.searchParams.set("stationid", args.stationId);
  u.searchParams.set("startdate", args.startdate);
  u.searchParams.set("enddate", args.enddate);
  u.searchParams.append("datatypeid", "TMAX");
  u.searchParams.append("datatypeid", "TMIN");
  u.searchParams.append("datatypeid", "PRCP");
  u.searchParams.set("limit", "1000");

  const res = await fetch(u.toString(), {
    headers: {
      token: env.NOAA_NCEI_TOKEN,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`NOAA daily chunk failed (${res.status})${txt ? ` ${txt.slice(0, 200)}` : ""}`);
  }
  const json = await res.json<any>();
  return Array.isArray(json?.results) ? json.results : [];
}

function parseMonthFromIso(dateStr: string) {
  const m = Number(String(dateStr ?? "").slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? m : null;
}

function normalizeTempToF(valueRaw: number, unitsHint: string) {
  const u = String(unitsHint ?? "").trim().toLowerCase();
  let v = valueRaw;
  if (u.includes("tenth") || u.includes("tenths")) v = v / 10;
  if (u.includes("c")) return (v * 9) / 5 + 32;
  if (u.includes("f")) return v;
  if (Math.abs(valueRaw) > 150) return valueRaw / 10;
  return valueRaw;
}

function normalizeMonthlyNormalPrecipToIn(valueRaw: number, unitsHint: string) {
  const u = String(unitsHint ?? "").trim().toLowerCase();
  let v = valueRaw;
  if (u.includes("tenth") || u.includes("tenths")) v = v / 10;
  if (u.includes("mm") || u.includes("millimeter")) return v / 25.4;
  return v;
}

async function findNearestNormalsStationForWorker(env: Env, lat: number, lon: number) {
  const rings = [1.5, 2.5, 4.0, 6.0];
  for (const d of rings) {
    const extent = `${lat - d},${lon - d},${lat + d},${lon + d}`;
    const json = await fetchNceiJson(env, "/stations", {
      datasetid: "NORMAL_MLY",
      extent,
      limit: 1000,
    });
    const results = Array.isArray(json?.results) ? json.results : [];
    const candidates = results
      .map((r: any) => {
        const la = Number(r?.latitude);
        const lo = Number(r?.longitude);
        if (!Number.isFinite(la) || !Number.isFinite(lo) || typeof r?.id !== "string") return null;
        return {
          id: r.id as string,
          name: typeof r?.name === "string" ? r.name : undefined,
          latitude: la,
          longitude: lo,
          elevation: Number.isFinite(Number(r?.elevation)) ? Number(r.elevation) : undefined,
          km: haversineKm(lat, lon, la, lo),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.km - b.km);

    for (const c of candidates.slice(0, 5) as any[]) {
      try {
        const probe = await fetchNceiJson(env, "/data", {
          datasetid: "NORMAL_MLY",
          stationid: c.id,
          startdate: "2010-01-01",
          enddate: "2010-12-31",
          datatypeid: "MLY-TAVG-NORMAL",
          limit: 5,
        });
        if (Array.isArray(probe?.results) && probe.results.length) return c;
      } catch {
        continue;
      }
    }

    if (candidates.length) return candidates[0] as any;
  }
  throw new Error("No usable normals station found");
}


async function fetchMonthlyNormalsForWorker(env: Env, stationId: string) {
  const [tavg, tmin, tmax, prcp] = await Promise.all([
    fetchNceiJson(env, "/data", {
      datasetid: "NORMAL_MLY",
      stationid: stationId,
      startdate: "2010-01-01",
      enddate: "2010-12-31",
      datatypeid: "MLY-TAVG-NORMAL",
      units: "standard",
      limit: 1000,
    }),
    fetchNceiJson(env, "/data", {
      datasetid: "NORMAL_MLY",
      stationid: stationId,
      startdate: "2010-01-01",
      enddate: "2010-12-31",
      datatypeid: "MLY-TMIN-NORMAL",
      units: "standard",
      limit: 1000,
    }),
    fetchNceiJson(env, "/data", {
      datasetid: "NORMAL_MLY",
      stationid: stationId,
      startdate: "2010-01-01",
      enddate: "2010-12-31",
      datatypeid: "MLY-TMAX-NORMAL",
      units: "standard",
      limit: 1000,
    }),
    fetchNceiJson(env, "/data", {
      datasetid: "NORMAL_MLY",
      stationid: stationId,
      startdate: "2010-01-01",
      enddate: "2010-12-31",
      datatypeid: "MLY-PRCP-NORMAL",
      units: "standard",
      limit: 1000,
    }).catch(() => ({ results: [] })),
  ]);

  const normals = Array.from({ length: 12 }, (_, idx) => ({
    month: idx + 1,
    tavgF: null as number | null,
    tminF: null as number | null,
    tmaxF: null as number | null,
  }));
  const precipMonthlyIn = Array.from({ length: 12 }, () => null as number | null);

  const ingestTemp = (payload: any, kind: "tavgF" | "tminF" | "tmaxF") => {
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    for (const row of rows) {
      const month = parseMonthFromIso(String(row?.date ?? ""));
      const value = Number(row?.value);
      if (!month || !Number.isFinite(value)) continue;
      normals[month - 1][kind] = normalizeTempToF(value, String(row?.units ?? payload?.metadata?.units ?? payload?.units ?? ""));
    }
  };

  ingestTemp(tavg, "tavgF");
  ingestTemp(tmin, "tminF");
  ingestTemp(tmax, "tmaxF");

  const precipRows = Array.isArray(prcp?.results) ? prcp.results : [];
  for (const row of precipRows) {
    const month = parseMonthFromIso(String(row?.date ?? ""));
    const value = Number(row?.value);
    if (!month || !Number.isFinite(value)) continue;
    precipMonthlyIn[month - 1] = normalizeMonthlyNormalPrecipToIn(
      value,
      String(row?.units ?? prcp?.metadata?.units ?? prcp?.units ?? "")
    );
  }

  return { normals, precipMonthlyIn };
}

function hasUsableMonthlyNormalsForWorker(normals: Array<{ tminF: number | null; tmaxF: number | null }>) {
  return normals.filter((m) => Number.isFinite(m.tminF) && Number.isFinite(m.tmaxF)).length >= 10;
}

function openMeteoArchiveValue(value: any) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function fetchMonthlyNormalsFromOpenMeteoArchive(lat: number, lon: number) {
  const currentYear = new Date().getUTCFullYear();
  const endYear = currentYear - 2;
  const startYear = endYear - 9;

  const upstream = new URL("https://archive-api.open-meteo.com/v1/archive");
  upstream.searchParams.set("latitude", String(lat));
  upstream.searchParams.set("longitude", String(lon));
  upstream.searchParams.set("start_date", `${startYear}-01-01`);
  upstream.searchParams.set("end_date", `${endYear}-12-31`);
  upstream.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  upstream.searchParams.set("temperature_unit", "fahrenheit");
  upstream.searchParams.set("precipitation_unit", "inch");
  upstream.searchParams.set("timezone", "auto");

  const res = await fetch(upstream.toString());
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Open-Meteo archive normals failed (${res.status})${txt ? ` ${txt.slice(0, 200)}` : ""}`);
  }

  const json = await res.json<any>();
  const daily = json?.daily ?? {};
  const time = Array.isArray(daily?.time) ? daily.time : [];
  const tmax = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : [];
  const tmin = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min : [];
  const prcp = Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum : [];

  const minSum = new Array<number>(12).fill(0);
  const maxSum = new Array<number>(12).fill(0);
  const avgSum = new Array<number>(12).fill(0);
  const tempCount = new Array<number>(12).fill(0);
  const precipSum = new Array<number>(12).fill(0);
  const precipYearMonths = Array.from({ length: 12 }, () => new Set<string>());

  for (let i = 0; i < time.length; i++) {
    const dateStr = String(time[i] ?? "").slice(0, 10);
    if (!dateStr) continue;
    const month = Number(dateStr.slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    const monthIdx = month - 1;
    const minVal = openMeteoArchiveValue(tmin[i]);
    const maxVal = openMeteoArchiveValue(tmax[i]);
    const precipVal = openMeteoArchiveValue(prcp[i]);

    if (minVal != null && maxVal != null) {
      minSum[monthIdx] += minVal;
      maxSum[monthIdx] += maxVal;
      avgSum[monthIdx] += (minVal + maxVal) / 2;
      tempCount[monthIdx] += 1;
    }

    if (precipVal != null) {
      precipSum[monthIdx] += precipVal;
      precipYearMonths[monthIdx].add(dateStr.slice(0, 7));
    }
  }

  const normals = Array.from({ length: 12 }, (_, idx) => {
    const count = tempCount[idx];
    return {
      month: idx + 1,
      tavgF: count ? avgSum[idx] / count : null,
      tminF: count ? minSum[idx] / count : null,
      tmaxF: count ? maxSum[idx] / count : null,
    };
  });
  const precipMonthlyIn = precipSum.map((sum, idx) => {
    const count = precipYearMonths[idx].size;
    return count ? sum / count : null;
  });

  if (!hasUsableMonthlyNormalsForWorker(normals)) {
    throw new Error("Open-Meteo archive normals did not return enough temperature coverage");
  }

  return {
    station: {
      id: `OPEN-METEO:${roundCoordKey(lat, 0.05)},${roundCoordKey(lon, 0.05)}`,
      name: "Open-Meteo Archive Grid",
      latitude: lat,
      longitude: lon,
      elevation: Number.isFinite(Number(json?.elevation)) ? Number(json.elevation) : undefined,
    },
    normals,
    precipMonthlyIn,
    diagnostics: {
      baselineStartYear: startYear,
      baselineEndYear: endYear,
    },
  };
}

async function resolveRecentGhcndStationForWorker(env: Env, lat: number, lon: number) {
  const today = new Date();
  const recentCutoff = new Date(today.getTime() - 365 * 2 * 86400000).toISOString().slice(0, 10);
  const enddate = today.toISOString().slice(0, 10);
  const extents = [0.75, 1.5, 3.0];

  for (const extentDeg of extents) {
    const south = lat - extentDeg;
    const west = lon - extentDeg;
    const north = lat + extentDeg;
    const east = lon + extentDeg;
    const json = await fetchNceiJson(env, "/stations", {
      datasetid: "GHCND",
      datatypeid: "TMAX",
      extent: `${south},${west},${north},${east}`,
      startdate: "1950-01-01",
      enddate,
      limit: 1000,
      sortfield: "datacoverage",
      sortorder: "desc",
    });
    const rows = Array.isArray(json?.results) ? json.results : [];
    const scored = rows
      .map((r: any) => {
        const la = Number(r?.latitude);
        const lo = Number(r?.longitude);
        if (!Number.isFinite(la) || !Number.isFinite(lo) || typeof r?.id !== "string") return null;
        const maxdate = String(r?.maxdate ?? "").slice(0, 10);
        if (!maxdate || maxdate < recentCutoff) return null;
        const mindate = String(r?.mindate ?? "").slice(0, 10);
        const minY = Number(mindate.slice(0, 4));
        const dc = Number(r?.datacoverage);
        const longRecordBonus = minY <= 1950 ? 1 : minY <= 1970 ? 0.7 : minY <= 1990 ? 0.4 : 0;
        const distPenalty = Math.min(1, haversineKm(lat, lon, la, lo) / 60);
        const score = (Number.isFinite(dc) ? dc : 0) * 3 + longRecordBonus * 1.5 - distPenalty * 0.75;
        return { id: r.id as string, score };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.score - a.score);
    if (scored.length) return scored[0].id as string;
  }
  throw new Error("No recent GHCND station found");
}

async function fetchPriorYearSeriesForWorker(env: Env, stationId: string, year: number) {
  const monthChunks = Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    const startdate = `${year}-${String(month).padStart(2, "0")}-01`;
    const enddate = new Date(year, month, 0).toISOString().slice(0, 10);
    return { startdate, enddate };
  });

  const monthResults = await Promise.allSettled(
    monthChunks.map((chunk) =>
      fetchNceiDailyChunk(env, {
        stationId,
        startdate: chunk.startdate,
        enddate: chunk.enddate,
      }),
    ),
  );

  const all = monthResults.flatMap((result) => (result.status === "fulfilled" ? result.value : []));

  const tminF = new Array<number>(365).fill(NaN);
  const tmaxF = new Array<number>(365).fill(NaN);
  const precipDailyIn = new Array<number | null>(365).fill(null);
  const precipMonthlyIn = new Array<number | null>(12).fill(0);

  for (const row of all) {
    const dateStr = String(row?.date ?? "").slice(0, 10);
    if (!dateStr) continue;
    const date = new Date(`${dateStr}T12:00:00`);
    if (!Number.isFinite(date.getTime())) continue;
    const month = date.getMonth();
    if (month === 1 && date.getDate() === 29) continue;
    const doy = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    const idx = doy > 59 && new Date(date.getFullYear(), 1, 29).getDate() === 29 ? doy - 2 : doy - 1;
    const value = Number(row?.value);
    if (!Number.isFinite(value) || idx < 0 || idx >= 365) continue;
    const datatype = String(row?.datatype ?? "");
    if (datatype === "TMIN") tminF[idx] = (value / 10) * 9 / 5 + 32;
    if (datatype === "TMAX") tmaxF[idx] = (value / 10) * 9 / 5 + 32;
    if (datatype === "PRCP") {
      const inches = (value / 10) / 25.4;
      precipDailyIn[idx] = inches;
      precipMonthlyIn[month] = (precipMonthlyIn[month] ?? 0) + inches;
    }
  }

  return { tminF, tmaxF, precipDailyIn, precipMonthlyIn };
}

async function fetchPriorYearSeriesFromOpenMeteo(lat: number, lon: number, year: number) {
  const upstream = new URL("https://archive-api.open-meteo.com/v1/archive");
  upstream.searchParams.set("latitude", String(lat));
  upstream.searchParams.set("longitude", String(lon));
  upstream.searchParams.set("start_date", `${year}-01-01`);
  upstream.searchParams.set("end_date", `${year}-12-31`);
  upstream.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_sum");
  upstream.searchParams.set("temperature_unit", "fahrenheit");
  upstream.searchParams.set("precipitation_unit", "inch");
  upstream.searchParams.set("timezone", "auto");

  const res = await fetch(upstream.toString());
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Open-Meteo archive failed (${res.status})${txt ? ` ${txt.slice(0, 200)}` : ""}`);
  }

  const json = await res.json<any>();
  const daily = json?.daily ?? {};
  const time = Array.isArray(daily?.time) ? daily.time : [];
  const tmax = Array.isArray(daily?.temperature_2m_max) ? daily.temperature_2m_max : [];
  const tmin = Array.isArray(daily?.temperature_2m_min) ? daily.temperature_2m_min : [];
  const prcp = Array.isArray(daily?.precipitation_sum) ? daily.precipitation_sum : [];

  const tminF = new Array<number>(365).fill(NaN);
  const tmaxF = new Array<number>(365).fill(NaN);
  const precipDailyIn = new Array<number | null>(365).fill(null);
  const precipMonthlyIn = new Array<number | null>(12).fill(0);

  for (let i = 0; i < time.length; i++) {
    const dateStr = String(time[i] ?? "").slice(0, 10);
    if (!dateStr) continue;
    const date = new Date(`${dateStr}T12:00:00`);
    if (!Number.isFinite(date.getTime())) continue;
    const month = date.getMonth();
    if (month === 1 && date.getDate() === 29) continue;
    const doy = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    const idx = doy > 59 && new Date(date.getFullYear(), 1, 29).getDate() === 29 ? doy - 2 : doy - 1;
    if (idx < 0 || idx >= 365) continue;

    const minVal = Number(tmin[i]);
    const maxVal = Number(tmax[i]);
    const precipVal = Number(prcp[i]);
    if (Number.isFinite(minVal)) tminF[idx] = minVal;
    if (Number.isFinite(maxVal)) tmaxF[idx] = maxVal;
    if (Number.isFinite(precipVal)) {
      precipDailyIn[idx] = precipVal;
      precipMonthlyIn[month] = (precipMonthlyIn[month] ?? 0) + precipVal;
    }
  }

  return { tminF, tmaxF, precipDailyIn, precipMonthlyIn };
}

/* =============================================================================
 * Astro helpers
 * ============================================================================= */

function utcOffsetSecondsToIsoOffset(seconds: number) {
  const sign = seconds >= 0 ? "+" : "-";
  const abs = Math.abs(seconds);
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  return `${sign}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function moonPhaseDegreesToIlluminationPct(deg: number | null) {
  if (deg == null || !Number.isFinite(deg)) return null;
  const rad = (deg * Math.PI) / 180;
  const illumination01 = (1 - Math.cos(rad)) / 2;
  return Math.round(Math.max(0, Math.min(1, illumination01)) * 100);
}

function moonPhaseLabelFromDegrees(deg: number | null) {
  if (deg == null || !Number.isFinite(deg)) return "—";
  const p = ((deg % 360) + 360) % 360;
  if (p < 22.5) return "New Moon";
  if (p < 67.5) return "Waxing Crescent";
  if (p < 112.5) return "First Quarter";
  if (p < 157.5) return "Waxing Gibbous";
  if (p < 202.5) return "Full Moon";
  if (p < 247.5) return "Waning Gibbous";
  if (p < 292.5) return "Last Quarter";
  if (p < 337.5) return "Waning Crescent";
  return "New Moon";
}

function extractMoonPhaseDegrees(props: any): number | null {
  const candidates = [
    props?.moonphase?.value,
    props?.moonphase,
    props?.moonposition?.phase,
    props?.moonposition?.value,
    props?.phase?.value,
    props?.phase,
  ];

  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) return c;
    if (typeof c === "string") {
      const n = Number(c);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function buildAstroLocationCacheKey(reqUrl: URL, lat: number, lon: number) {
  const keyUrl = new URL(reqUrl.toString());
  keyUrl.pathname = "/__cache__/astro/location/v5";
  keyUrl.searchParams.set("lat", String(roundCoordKey(lat, 0.02)));
  keyUrl.searchParams.set("lon", String(roundCoordKey(lon, 0.02)));
  const placeName = reqUrl.searchParams.get("placeName");
  if (placeName) keyUrl.searchParams.set("placeName", placeName);
  return new Request(keyUrl.toString(), { method: "GET" });
}

async function fetchJsonWithHeaders(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      ...headers,
    },
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${txt ? ` ${txt.slice(0, 300)}` : ""}`);
  }

  return res.json();
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        accept: "application/json",
        ...headers,
      },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? ` ${txt.slice(0, 300)}` : ""}`);
    }

    return res.json<any>();
  } finally {
    clearTimeout(t);
  }
}

async function fetchTextWithTimeout(url: string, timeoutMs: number, headers?: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}${txt ? ` ${txt.slice(0, 300)}` : ""}`);
    }

    return res.text();
  } finally {
    clearTimeout(t);
  }
}

async function swrFetchObject<T>(
  ctx: ExecutionContext,
  cacheKey: Request,
  ttlSeconds: number,
  staleSeconds: number,
  fetchUpstream: () => Promise<T>,
): Promise<T> {
  const cache = (caches as any).default as Cache;
  const cached = await cache.match(cacheKey);

  if (cached) {
    const cachedAt = Number(cached.headers.get("X-Omni-Cached-At") || "0");
    const ageSeconds = cachedAt ? Math.floor((nowMs() - cachedAt) / 1000) : undefined;
    if (ageSeconds != null && ageSeconds <= ttlSeconds + staleSeconds) {
      const parsed = (await cached.json().catch(() => null)) as T | null;
      if (parsed) {
        if (ageSeconds > ttlSeconds) {
          ctx.waitUntil(
            (async () => {
              try {
                const fresh = await fetchUpstream();
                const out = new Response(JSON.stringify(fresh), {
                  headers: {
                    "content-type": "application/json; charset=utf-8",
                    "X-Omni-Cached-At": String(nowMs()),
                    "Cache-Control": `public, max-age=${ttlSeconds + staleSeconds}`,
                  },
                });
                await cache.put(cacheKey, out);
              } catch {
                // ignore refresh errors
              }
            })(),
          );
        }
        return parsed;
      }
    }
  }

  const fresh = await fetchUpstream();
  const out = new Response(JSON.stringify(fresh), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "X-Omni-Cached-At": String(nowMs()),
      "Cache-Control": `public, max-age=${ttlSeconds + staleSeconds}`,
    },
  });
  await cache.put(cacheKey, out);
  return fresh;
}

function slugifyForestName(name: string) {
  return name
    .toLowerCase()
    .replace(/\b(national forests?|national grasslands?|national grassland|forests?|forest|grasslands?|grassland)\b/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function titleCaseWords(name: string) {
  return String(name)
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())
    .replace(/\bBlm\b/g, "BLM")
    .replace(/\bUsa\b/g, "USA")
    .replace(/\bNca\b/g, "NCA")
    .trim();
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtmlWithLineBreaks(value: string) {
  return value
    .replace(/<(?:br|br\/)\s*>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|dd|dt|li|ul|ol|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<(?:p|div|section|article|dd|dt|li|ul|ol|h1|h2|h3|h4|h5|h6)[^>]*>/gi, "\n")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeBlmUnitName(value: string) {
  return titleCaseWords(value)
    .replace(/\bDistrict Office\b/gi, "")
    .replace(/\bDistrict\b/gi, "")
    .replace(/\bField Office\b/gi, "")
    .replace(/\bOffice\b/gi, "")
    .replace(/\bNw Oregon\b/gi, "Northwest Oregon")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMinnesotaCountyName(value: string) {
  return titleCaseWords(value)
    .replace(/\bCounty\b/gi, "")
    .replace(/\bSaint\b/gi, "St.")
    .replace(/\bSt\.?\s+Louis\b/gi, "St. Louis")
    .replace(/\bBeltrami\s+North\b/gi, "Beltrami")
    .replace(/\bBeltrami\s+South\b/gi, "Beltrami")
    .replace(/\s+/g, " ")
    .trim();
}

function classifyFireRestrictionStatus(cards: FireRestrictionCardRecord[]): FireRestrictionStatus {
  if (!cards.length) return "none";

  const text = cards.map((card) => `${card.title} ${card.body ?? ""}`.toLowerCase()).join(" \n ");

  if (
    text.includes("no fire restrictions") ||
    text.includes("termination order") ||
    text.includes("rescinded") ||
    text.includes("rescission")
  ) {
    return "none";
  }

  if (
    text.includes("closure order") ||
    text.includes("area closure") ||
    text.includes("area closed") ||
    text.includes("forest closure") ||
    text.includes("temporary closure") ||
    text.includes("closed to entry")
  ) {
    return "closure";
  }

  return "restrictions";
}

function summarizeFireRestrictionStatus(status: FireRestrictionStatus, forestName: string) {
  switch (status) {
    case "closure":
      return `Closures are listed for ${forestName}.`;
    case "restrictions":
      return `Fire restrictions are listed for ${forestName}.`;
    case "none":
      return `No active fire restrictions are listed for ${forestName}.`;
    default:
      return `Restriction status is unavailable for ${forestName}.`;
  }
}

function summarizeMinnesotaRestrictionStatus(status: FireRestrictionStatus, countyName: string) {
  switch (status) {
    case "restrictions":
      return `Minnesota DNR burning restrictions are in effect for ${countyName}.`;
    case "closure":
      return `Closures are listed for ${countyName}.`;
    case "none":
      return `No active Minnesota DNR burning restrictions are listed for ${countyName}.`;
    default:
      return `Minnesota DNR restriction status is unavailable for ${countyName}.`;
  }
}

const BLM_AZ_RESTRICTIONS_URL =
  "https://www.blm.gov/programs/public-safety-and-fire/fire/regional-info/arizona/fire-restrictions";
const BLM_ORWA_RESTRICTIONS_URL =
  "https://www.blm.gov/programs/fire/regional-info/oregon-washington/fire-restrictions";
const MINNESOTA_DNR_RESTRICTIONS_URL =
  "https://www.dnr.state.mn.us/forestry/fire/firerating_restrictions.html";
const MINNESOTA_DNR_PLANNING_URL =
  "https://www.dnr.state.mn.us/forestry/fire/planning.html";

const BLM_AZ_DISTRICTS = [
  {
    anchor: "ASD",
    districtName: "Arizona Strip District",
    offices: ["AZA01000"],
  },
  {
    anchor: "CRD",
    districtName: "Colorado River District",
    offices: ["AZC01000", "AZC02000", "AZC03000"],
  },
  {
    anchor: "GID",
    districtName: "Gila District",
    offices: ["AZG01000", "AZG02000"],
  },
  {
    anchor: "PHD",
    districtName: "Phoenix District",
    offices: ["AZP01000", "AZP02000"],
  },
] as const;

const BLM_ORWA_DISTRICT_NAMES = [
  "Burns",
  "Coos Bay",
  "Lakeview",
  "Medford",
  "Northwest Oregon",
  "Prineville",
  "Roseburg",
  "Spokane",
  "Vale",
] as const;

const BLM_AZ_FIELD_OFFICE_META: Record<
  string,
  { name: string; parentName: string; anchor: (typeof BLM_AZ_DISTRICTS)[number]["anchor"] }
> = {
  AZA01000: {
    name: "Arizona Strip Field Office",
    parentName: "Arizona Strip District Office",
    anchor: "ASD",
  },
  AZC01000: {
    name: "Kingman Field Office",
    parentName: "Colorado River District Office",
    anchor: "CRD",
  },
  AZC02000: {
    name: "Yuma Field Office",
    parentName: "Colorado River District Office",
    anchor: "CRD",
  },
  AZC03000: {
    name: "Lake Havasu Field Office",
    parentName: "Colorado River District Office",
    anchor: "CRD",
  },
  AZG01000: {
    name: "Safford Field Office",
    parentName: "Gila District Office",
    anchor: "GID",
  },
  AZG02000: {
    name: "Tucson Field Office",
    parentName: "Gila District Office",
    anchor: "GID",
  },
  AZP01000: {
    name: "Hassayampa Field Office",
    parentName: "Phoenix District Office",
    anchor: "PHD",
  },
  AZP02000: {
    name: "Lower Sonoran Field Office",
    parentName: "Phoenix District Office",
    anchor: "PHD",
  },
};

type GeoJsonGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

function normalizeClosedRing(ring: number[][]) {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function signedAreaLonLat(ring: number[][]) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

function ringBounds(ring: number[][]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 1e-9) return false;

  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;

  const squaredLen = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
  return dot <= squaredLen;
}

function pointInRingInclusive(point: number[], ring: number[][]) {
  const [px, py] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (pointOnSegment(px, py, xi, yi, xj, yj)) return true;

    const intersects =
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-12) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function ringContainsRing(container: number[][], candidate: number[][]) {
  const containerBounds = ringBounds(container);
  const candidateBounds = ringBounds(candidate);
  if (
    candidateBounds.minX < containerBounds.minX ||
    candidateBounds.maxX > containerBounds.maxX ||
    candidateBounds.minY < containerBounds.minY ||
    candidateBounds.maxY > containerBounds.maxY
  ) {
    return false;
  }

  for (let i = 0; i < candidate.length - 1; i += 1) {
    if (pointInRingInclusive(candidate[i], container)) return true;
  }

  return pointInRingInclusive(candidate[0], container);
}

function ringsToGeoJsonGeometry(rings: number[][][]): GeoJsonGeometry | null {
  const cleaned = rings
    .map((ring) => normalizeClosedRing(ring))
    .filter((ring) => Array.isArray(ring) && ring.length >= 4);

  if (!cleaned.length) return null;

  const infos = cleaned.map((ring, index) => ({
    index,
    ring,
    absArea: Math.abs(signedAreaLonLat(ring)),
    parent: -1,
    depth: 0,
    isOuter: true,
  }));

  const sorted = [...infos].sort((a, b) => b.absArea - a.absArea);

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    for (let j = i - 1; j >= 0; j -= 1) {
      const parent = sorted[j];
      if (ringContainsRing(parent.ring, current.ring)) {
        current.parent = parent.index;
        current.depth = parent.depth + 1;
        current.isOuter = current.depth % 2 === 0;
        break;
      }
    }
  }

  const infoByIndex = new Map(infos.map((info) => [info.index, info]));
  const polygonByOuterIndex = new Map<number, number[][][]>();
  const polygons: number[][][][] = [];

  for (const info of infos) {
    if (!info.isOuter) continue;
    const polygon: number[][][] = [info.ring];
    polygonByOuterIndex.set(info.index, polygon);
    polygons.push(polygon);
  }

  for (const info of infos) {
    if (info.isOuter) continue;

    let ownerIndex = info.parent;
    while (ownerIndex >= 0) {
      const owner = infoByIndex.get(ownerIndex);
      if (!owner) break;
      if (owner.isOuter) {
        polygonByOuterIndex.get(owner.index)?.push(info.ring);
        break;
      }
      ownerIndex = owner.parent;
    }
  }

  if (!polygons.length) {
    const [first, ...rest] = cleaned;
    return { type: "Polygon", coordinates: [first, ...rest] };
  }

  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0] };
  }

  return { type: "MultiPolygon", coordinates: polygons };
}

function arcGisGeometryToGeoJson(geometry: any): GeoJsonGeometry | null {
  if (!Array.isArray(geometry?.rings)) return null;
  return ringsToGeoJsonGeometry(geometry.rings);
}

function arcGisGeometryToSimpleGeoJson(geometry: any): GeoJsonGeometry | null {
  if (!Array.isArray(geometry?.rings)) return null;

  const cleaned = geometry.rings
    .map((ring: any) => normalizeClosedRing(Array.isArray(ring) ? ring : []))
    .filter((ring: number[][]) => Array.isArray(ring) && ring.length >= 4);

  if (!cleaned.length) return null;
  if (cleaned.length === 1) return { type: "Polygon", coordinates: [cleaned[0]] };
  return { type: "MultiPolygon", coordinates: cleaned.map((ring: number[][]) => [ring]) };
}

function normalizeFireDangerLabel(raw: string | null | undefined) {
  const s = String(raw ?? "").trim();
  if (!s) return { classValue: null, classLabel: null, summary: null };

  const lower = s.toLowerCase();
  const known: Array<{ match: string; value: number; label: string; summary: string }> = [
    { match: "very high", value: 4, label: "Very High", summary: "Fire danger is elevated nearby." },
    { match: "high", value: 3, label: "High", summary: "Dry and windy starts deserve extra caution." },
    { match: "moderate", value: 2, label: "Moderate", summary: "Basic campfire caution makes sense." },
    { match: "low", value: 1, label: "Low", summary: "Broader fire danger looks limited nearby." },
    { match: "very low", value: 0, label: "Very Low", summary: "Broader fire danger is low nearby." },
    { match: "non-burnable", value: 0, label: "Non-burnable", summary: "Fuel-driven fire danger is minimal here." },
  ];

  for (const item of known) {
    if (lower.includes(item.match)) {
      return { classValue: item.value, classLabel: item.label, summary: item.summary };
    }
  }

  return {
    classValue: null,
    classLabel: s,
    summary: `${s} fire danger nearby.`,
  };
}

async function fetchFireDangerPoint(lat: number, lon: number) {
  const identifyUrl =
    "https://imagery.geoplatform.gov/iipp/rest/services/Fire_Aviation/USFS_EDW_RMRS_WildfireHazardPotentialClassified/ImageServer/identify" +
    `?geometry=${encodeURIComponent(`${lon},${lat}`)}` +
    "&geometryType=esriGeometryPoint" +
    "&sr=4326" +
    "&returnGeometry=false" +
    "&returnCatalogItems=false" +
    "&f=pjson";

  const json = await fetchJsonWithTimeout(identifyUrl, FIRE_CONTEXT_TIMEOUT_MS, {
    "User-Agent": "omniwx-worker/1.0",
  });

  const rawLabel =
    (typeof json?.value === "string" ? json.value : null) ??
    (typeof json?.name === "string" ? json.name : null);

  const normalized = normalizeFireDangerLabel(rawLabel === "NoData" ? null : rawLabel);
  return {
    ...normalized,
    rawLabel: rawLabel ?? null,
  };
}

async function fetchFireDangerContext(lat: number, lon: number) {
  const candidates = [
    { lat, lon, distanceDeg: 0 },
    { lat: lat + 0.1, lon, distanceDeg: 0.1 },
    { lat: lat - 0.1, lon, distanceDeg: 0.1 },
    { lat, lon: lon + 0.1, distanceDeg: 0.1 },
    { lat, lon: lon - 0.1, distanceDeg: 0.1 },
  ];

  const settled = await Promise.allSettled(
    candidates.map(async (candidate) => ({
      ...candidate,
      result: await fetchFireDangerPoint(candidate.lat, candidate.lon),
    }))
  );

  const usable = settled
    .filter((item) => item.status === "fulfilled")
    .map((item) => (item as PromiseFulfilledResult<{ lat: number; lon: number; distanceDeg: number; result: { classValue: number | null; classLabel: string | null; summary: string | null; rawLabel: string | null } }>).value)
    .filter((item) => item.result.classLabel);

  const best = usable.sort((a, b) => a.distanceDeg - b.distanceDeg)[0];
  const normalized = best?.result ?? { classValue: null, classLabel: null, summary: null, rawLabel: null };

  return {
    classValue: normalized.classValue,
    classLabel: normalized.classLabel,
    summary: normalized.summary,
    rawLabel: normalized.rawLabel,
    source: "USDA Forest Service Wildfire Hazard Potential",
  };
}

async function fetchFireWeatherContext(lat: number, lon: number) {
  const alertsUrl =
    "https://api.weather.gov/alerts/active" +
    `?point=${encodeURIComponent(`${lat},${lon}`)}`;

  const json = await fetchJsonWithTimeout(alertsUrl, FIRE_CONTEXT_TIMEOUT_MS, {
    "User-Agent": "omniwx-worker/1.0",
  });
  const features = Array.isArray(json?.features) ? json.features : [];
  const relevant = features
    .map((feature: any) => feature?.properties ?? null)
    .filter(Boolean)
    .filter((props: any) => {
      const event = String(props?.event ?? "").toLowerCase();
      return event.includes("red flag") || event.includes("fire weather");
    });

  const redFlagWarning = relevant.some((props: any) =>
    String(props?.event ?? "").toLowerCase().includes("red flag warning")
  );
  const fireWeatherWatch = relevant.some((props: any) =>
    String(props?.event ?? "").toLowerCase().includes("fire weather watch")
  );
  const headlines = relevant
    .map((props: any) => {
      const event = typeof props?.event === "string" ? props.event.trim() : "";
      const area = typeof props?.areaDesc === "string" ? props.areaDesc.trim() : "";
      return [event, area].filter(Boolean).join(" • ");
    })
    .filter((line: string) => !!line)
    .slice(0, 3);

  const summary = redFlagWarning
    ? "Red Flag Warning is active nearby."
    : fireWeatherWatch
      ? "Fire Weather Watch is active nearby."
      : relevant.length
        ? "Fire-weather alerts are active nearby."
        : "No active fire-weather alerts nearby.";

  return {
    redFlagWarning,
    fireWeatherWatch,
    alertCount: relevant.length,
    headlines,
    summary,
    source: "NOAA / NWS Alerts API",
    alertEvents: relevant
      .map((props: any) => (typeof props?.event === "string" ? props.event : null))
      .filter(Boolean) as string[],
  };
}

async function resolveNearbyForest(lat: number, lon: number) {
  const radii = [0, 0.45, 0.9, 1.25];

  const geometryCenter = (geometry: any) => {
    const rings = Array.isArray(geometry?.rings) ? geometry.rings : [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const ring of rings) {
      for (const point of ring ?? []) {
        const x = Array.isArray(point) ? Number(point[0]) : NaN;
        const y = Array.isArray(point) ? Number(point[1]) : NaN;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
    return {
      lon: (minX + maxX) / 2,
      lat: (minY + maxY) / 2,
    };
  };

  for (const radius of radii) {
    const geometry =
      radius <= 0
        ? `${lon},${lat}`
        : `${lon - radius},${lat - radius},${lon + radius},${lat + radius}`;
    const geometryType = radius <= 0 ? "esriGeometryPoint" : "esriGeometryEnvelope";
    const url =
      "https://apps.fs.usda.gov/fsgisx05/rest/services/wo_nfs_gtac/EDW_ForestSystemBoundaries_01/MapServer/0/query" +
      `?where=1%3D1&geometry=${encodeURIComponent(geometry)}` +
      `&geometryType=${geometryType}` +
      "&inSR=4326" +
      "&spatialRel=esriSpatialRelIntersects" +
      `&returnGeometry=${radius <= 0 ? "false" : "true"}` +
      "&outFields=FORESTNAME,FORESTORGCODE,REGION,FORESTNUMBER" +
      "&f=pjson";

    const json = await fetchJsonWithTimeout(url, FIRE_CONTEXT_TIMEOUT_MS, {
      "User-Agent": "omniwx-worker/1.0",
    });
    const features = Array.isArray(json?.features) ? json.features : [];
    if (!features.length) continue;

    const chosen =
      radius <= 0
        ? features[0]
        : features
            .map((feature: any) => {
              const center = geometryCenter(feature?.geometry);
              const distanceKm = center ? haversineKm(lat, lon, center.lat, center.lon) : Number.POSITIVE_INFINITY;
              return { feature, distanceKm };
            })
            .sort((a: any, b: any) => a.distanceKm - b.distanceKm)[0]?.feature;

    const attrs = chosen?.attributes ?? null;
    if (!attrs?.FORESTNAME) continue;

    return {
      name: String(attrs.FORESTNAME),
      region: typeof attrs.REGION === "string" ? attrs.REGION : null,
      forestOrgCode: typeof attrs.FORESTORGCODE === "string" ? attrs.FORESTORGCODE : null,
      forestNumber: typeof attrs.FORESTNUMBER === "string" ? attrs.FORESTNUMBER : null,
      slug: slugifyForestName(String(attrs.FORESTNAME)),
    };
  }

  return null;
}

async function fetchForestRestrictionRecordCached(
  ctx: ExecutionContext,
  forest: {
    name: string;
    region: string | null;
    slug: string;
    forestOrgCode?: string | null;
    forestNumber?: string | null;
  },
) {
  const regionCode = String(forest.region ?? "").padStart(2, "0");
  const keyUrl = new URL("https://omniwx-api-cache.local/__cache__/fire/restrictions/unit");
  keyUrl.searchParams.set("region", regionCode);
  keyUrl.searchParams.set("slug", forest.slug);
  const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

  return swrFetchObject<FireRestrictionRecord>(
    ctx,
    cacheKey,
    FIRE_CONTEXT_TTL_SECONDS,
    FIRE_CONTEXT_STALE_SECONDS,
    async () => {
      const sourceUrl = `https://www.fs.usda.gov/r${regionCode}/${forest.slug}/alerts?field_alert_type_target_id=56&forest_order=1`;
      const html = await fetchTextWithTimeout(sourceUrl, FIRE_CONTEXT_TIMEOUT_MS, {
        "User-Agent": "omniwx-worker/1.0",
      });

      const cardMatches = [...html.matchAll(/<li class="usa-card usa-card--flag wfs-alert-flag fire-restriction">([\s\S]*?)<\/li>/gi)];
      const cards: FireRestrictionCardRecord[] = cardMatches
        .map((match) => {
          const block = match[1] ?? "";
          const hrefMatch = block.match(/<a[^>]+href="([^"]+)"/i);
          const titleMatch = block.match(/<span>([\s\S]*?)<\/span>/i);
          const bodyMatch = block.match(/<div class="usa-card__body">\s*([\s\S]*?)\s*<\/div>/i);
          const startMatch = block.match(/Alert Start Date:<\/strong>\s*([^<\n]+)/i);
          const orderMatch = block.match(/Forest Order:<\/strong>\s*([^<\n]+)/i);

          return {
            title: stripHtml(titleMatch?.[1] ?? ""),
            url: hrefMatch?.[1] ? `https://www.fs.usda.gov${hrefMatch[1]}` : null,
            body: bodyMatch?.[1] ? stripHtml(bodyMatch[1]) : null,
            startDate: startMatch?.[1] ? stripHtml(startMatch[1]) : null,
            forestOrder: orderMatch?.[1] ? stripHtml(orderMatch[1]) : null,
          };
        })
        .filter((card) => !!card.title)
        .slice(0, 5);

      const status = classifyFireRestrictionStatus(cards);

      return {
        id: `usfs:${regionCode}:${forest.slug}`,
        agency: "USFS",
        forestName: forest.name,
        region: forest.region,
        slug: forest.slug,
        forestOrgCode: forest.forestOrgCode ?? null,
        forestNumber: forest.forestNumber ?? null,
        status,
        summary: summarizeFireRestrictionStatus(status, forest.name),
        sourceUrl,
        checkedAt: new Date().toISOString(),
        cards,
      };
    },
  );
}

async function fetchForestRestrictionsCached(
  ctx: ExecutionContext,
  forest: {
    name: string;
    region: string | null;
    slug: string;
    forestOrgCode?: string | null;
    forestNumber?: string | null;
  },
) {
  const record = await fetchForestRestrictionRecordCached(ctx, forest);
  return {
    supported: true as const,
    inEffect: record.status === "restrictions" || record.status === "closure" ? true : record.status === "none" ? false : null,
    summary: record.summary,
    source: record.sourceUrl,
    cards: record.cards,
  };
}

async function fetchForestBoundaryFeaturesForBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  simplifyDegrees: number,
) {
  const idUrl =
    "https://apps.fs.usda.gov/fsgisx05/rest/services/wo_nfs_gtac/EDW_ForestSystemBoundaries_01/MapServer/0/query" +
    "?where=1%3D1" +
    `&geometry=${encodeURIComponent(`${west},${south},${east},${north}`)}` +
    "&geometryType=esriGeometryEnvelope" +
    "&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects" +
    "&returnGeometry=false" +
    "&returnIdsOnly=true" +
    "&f=pjson";

  const idJson = await fetchJsonWithTimeout(idUrl, 15000, {
    "User-Agent": "omniwx-worker/1.0",
  });
  const objectIds = Array.isArray(idJson?.objectIds)
    ? idJson.objectIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  if (!objectIds.length) return [];

  const chunkSize = 40;
  const chunks = chunk(objectIds, chunkSize);
  const allFeatures: any[] = [];

  for (const ids of chunks) {
    const url =
      "https://apps.fs.usda.gov/fsgisx05/rest/services/wo_nfs_gtac/EDW_ForestSystemBoundaries_01/MapServer/0/query" +
      `?objectIds=${encodeURIComponent(ids.join(","))}` +
      "&inSR=4326" +
      "&returnGeometry=true" +
      "&outFields=OBJECTID,FORESTNAME,FORESTORGCODE,REGION,FORESTNUMBER" +
      "&outSR=4326" +
      `&maxAllowableOffset=${encodeURIComponent(String(simplifyDegrees))}` +
      "&f=pjson";

    const json = await fetchJsonWithTimeout(url, 15000, {
      "User-Agent": "omniwx-worker/1.0",
    });

    if (Array.isArray(json?.features)) {
      allFeatures.push(...json.features);
    }
  }

  return allFeatures;
}

function classifyBlmRestrictionStatus(text: string): FireRestrictionStatus {
  const lower = text.toLowerCase();

  if (
    lower.includes("closure") ||
    lower.includes("closed to entry") ||
    lower.includes("area closed")
  ) {
    return "closure";
  }

  if (
    lower.includes("year-round fire restrictions are in effect") ||
    lower.includes("seasonal fire restrictions are in effect")
  ) {
    return "restrictions";
  }

  if (lower.includes("fire restrictions are not in effect")) {
    return "none";
  }

  return "unknown";
}

function summarizeBlmRestrictionStatus(status: FireRestrictionStatus, unitName: string, rawText: string) {
  const lower = rawText.toLowerCase();

  if (
    status === "restrictions" &&
    lower.includes("seasonal fire restrictions are not in effect") &&
    lower.includes("year-round fire restrictions are in effect")
  ) {
    return `Year-round fire restrictions are in effect for ${unitName}; seasonal restrictions are not.`;
  }

  switch (status) {
    case "closure":
      return `Closures are listed for ${unitName}.`;
    case "restrictions":
      return `Fire restrictions are listed for ${unitName}.`;
    case "none":
      return `No active fire restrictions are listed for ${unitName}.`;
    default:
      return `Restriction status is unavailable for ${unitName}.`;
  }
}

async function fetchBlmArizonaRestrictionRecordsCached(ctx: ExecutionContext) {
  const cacheKey = new Request("https://omniwx-api-cache.local/__cache__/fire/restrictions/blm/az", {
    method: "GET",
  });

  return swrFetchObject<Record<string, FireRestrictionRecord>>(
    ctx,
    cacheKey,
    FIRE_CONTEXT_TTL_SECONDS,
    FIRE_CONTEXT_STALE_SECONDS,
    async () => {
      const html = await fetchTextWithTimeout(BLM_AZ_RESTRICTIONS_URL, FIRE_CONTEXT_TIMEOUT_MS, {
        "User-Agent": "omniwx-worker/1.0",
      });

      const orderBlockMatch = html.match(/<dt>Year-Round Statewide Fire Prevention Order<\/dt><dd>([\s\S]*?)<\/dd>/i);
      const statewideOrderText = stripHtml(orderBlockMatch?.[1] ?? "");
      const statewideOrderNumber =
        statewideOrderText.match(/Order No\.\s*([A-Z0-9-]+)/i)?.[1]?.trim() ?? "AZ910-2022-001";
      const statewideOrderStart =
        statewideOrderText.match(/on ([A-Za-z]+ \d{1,2}, \d{4}) through/i)?.[1]?.trim() ?? "May 8, 2022";

      const districtRecordByAnchor = new Map<string, FireRestrictionRecord>();
      const districtRegex =
        /<h2><a class="ck-anchor" id="(ASD|CRD|GID|PHD)"><\/a>([^<]+)<\/h2>([\s\S]*?)(?=<h2><a class="ck-anchor" id="(?:ASD|CRD|GID|PHD)\b|<h2>BLM Arizona Map<\/h2>)/gi;

      for (const match of html.matchAll(districtRegex)) {
        const anchor = String(match[1] ?? "").trim();
        const districtName = stripHtml(match[2] ?? "");
        const block = match[3] ?? "";
        const restrictionsMatch = block.match(/<dt>Fire Restrictions<\/dt><dd>([\s\S]*?)<\/dd>/i);
        const restrictionsHtml = restrictionsMatch?.[1] ?? "";
        const restrictionsText = stripHtml(restrictionsHtml);
        const status = classifyBlmRestrictionStatus(restrictionsText);
        const sourceUrl = `${BLM_AZ_RESTRICTIONS_URL}#${anchor}`;

        districtRecordByAnchor.set(anchor, {
          id: `blm:az:${slugifyForestName(districtName)}`,
          agency: "BLM",
          forestName: districtName,
          region: "AZ",
          slug: slugifyForestName(districtName),
          status,
          summary: summarizeBlmRestrictionStatus(status, districtName, restrictionsText),
          sourceUrl,
          checkedAt: new Date().toISOString(),
          cards: [
            {
              title: `${districtName} fire restrictions`,
              url: sourceUrl,
              body: restrictionsText || null,
              startDate: statewideOrderStart,
              forestOrder: statewideOrderNumber,
            },
          ],
        });
      }

      const out: Record<string, FireRestrictionRecord> = {};

      for (const [officeCode, meta] of Object.entries(BLM_AZ_FIELD_OFFICE_META)) {
        const districtRecord = districtRecordByAnchor.get(meta.anchor);

        out[officeCode] = districtRecord
          ? {
              ...districtRecord,
              id: `blm:az:${officeCode.toLowerCase()}`,
              forestName: meta.name,
              slug: slugifyForestName(meta.name),
            }
          : {
              id: `blm:az:${officeCode.toLowerCase()}`,
              agency: "BLM",
              forestName: meta.name,
              region: "AZ",
              slug: slugifyForestName(meta.name),
              status: "unknown",
              summary: `Restriction status is unavailable for ${meta.name}.`,
              sourceUrl: `${BLM_AZ_RESTRICTIONS_URL}#${meta.anchor}`,
              checkedAt: new Date().toISOString(),
              cards: [],
            };
      }

      return out;
    },
  );
}

async function fetchBlmArizonaFieldBoundaryFeaturesForBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  simplifyDegrees: number,
) {
  const where = "ADMIN_ST='AZ' AND BLM_ORG_TYPE='Field'";
  const idUrl =
    "https://gis.blm.gov/arcgis/rest/services/admin_boundaries/BLM_Natl_AdminUnit/MapServer/3/query" +
    `?where=${encodeURIComponent(where)}` +
    `&geometry=${encodeURIComponent(`${west},${south},${east},${north}`)}` +
    "&geometryType=esriGeometryEnvelope" +
    "&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects" +
    "&returnGeometry=false" +
    "&returnIdsOnly=true" +
    "&f=pjson";

  const idJson = await fetchJsonWithTimeout(idUrl, 15000, {
    "User-Agent": "omniwx-worker/1.0",
  });
  const objectIds = Array.isArray(idJson?.objectIds)
    ? idJson.objectIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  if (!objectIds.length) return [];

  const chunks = chunk(objectIds, 40);
  const allFeatures: any[] = [];

  for (const ids of chunks) {
    const url =
      "https://gis.blm.gov/arcgis/rest/services/admin_boundaries/BLM_Natl_AdminUnit/MapServer/3/query" +
      `?objectIds=${encodeURIComponent(ids.join(","))}` +
      "&inSR=4326" +
      "&returnGeometry=true" +
      "&outFields=OBJECTID,ADM_UNIT_CD,ADMU_NAME,PARENT_NAME,ADMIN_ST,BLM_ORG_TYPE" +
      "&outSR=4326" +
      `&maxAllowableOffset=${encodeURIComponent(String(simplifyDegrees))}` +
      "&f=pjson";

    const json = await fetchJsonWithTimeout(url, 15000, {
      "User-Agent": "omniwx-worker/1.0",
    });

    if (Array.isArray(json?.features)) allFeatures.push(...json.features);
  }

  return allFeatures;
}

function classifyBlmOrWaDistrictBlock(unitName: string, blockLines: string[]) {
  let section: "general" | "closures" | "restrictions" = "general";
  let hasActiveClosure = false;
  let hasActiveRestriction = false;
  const cards: FireRestrictionCardRecord[] = [];

  const pushCard = (title: string, body: string | null, statusHint: "closure" | "restrictions") => {
    if (cards.length >= 5) return;
    cards.push({
      title,
      url: BLM_ORWA_RESTRICTIONS_URL,
      body,
      startDate: null,
      forestOrder: null,
    });
    if (statusHint === "closure") hasActiveClosure = true;
    if (statusHint === "restrictions") hasActiveRestriction = true;
  };

  for (const rawLine of blockLines) {
    const line = rawLine.trim().replace(/^[•*-]\s*/, "");
    if (!line) continue;

    const lower = line.toLowerCase();
    if (lower === unitName.toLowerCase()) continue;
    if (lower === "closures") {
      section = "closures";
      continue;
    }
    if (lower === "restrictions") {
      section = "restrictions";
      continue;
    }
    if (lower.includes("no current closures or restrictions")) {
      continue;
    }

    const isRescissionLike =
      lower.includes("rescission") ||
      lower.includes("recission") ||
      lower.includes("reopens") ||
      lower.includes("reopened") ||
      lower.includes("closure lifted") ||
      lower.includes("reducing fire restrictions");

    if (section === "closures") {
      if (!isRescissionLike) {
        pushCard(`${unitName} closure`, line, "closure");
      }
      continue;
    }

    if (section === "restrictions") {
      if (
        !isRescissionLike ||
        lower.includes("annual fire prevention order") ||
        lower.includes("amended fire prevention order") ||
        lower.includes("implements seasonal campfire restrictions") ||
        lower.includes("stage 2") ||
        lower.includes("high fire danger")
      ) {
        pushCard(`${unitName} fire restrictions`, line, "restrictions");
      }
      continue;
    }
  }

  const status: FireRestrictionStatus = hasActiveRestriction ? "restrictions" : hasActiveClosure ? "closure" : "none";
  return { status, cards };
}

async function fetchBlmOregonWashingtonRestrictionRecordsCached(ctx: ExecutionContext) {
  const cacheKey = new Request("https://omniwx-api-cache.local/__cache__/fire/restrictions/blm/orwa", {
    method: "GET",
  });

  return swrFetchObject<Record<string, FireRestrictionRecord>>(
    ctx,
    cacheKey,
    FIRE_CONTEXT_TTL_SECONDS,
    FIRE_CONTEXT_STALE_SECONDS,
    async () => {
      const html = await fetchTextWithTimeout(BLM_ORWA_RESTRICTIONS_URL, FIRE_CONTEXT_TIMEOUT_MS, {
        "User-Agent": "omniwx-worker/1.0",
      });

      const text = stripHtmlWithLineBreaks(html);
      const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      const out: Record<string, FireRestrictionRecord> = {};

      for (let idx = 0; idx < BLM_ORWA_DISTRICT_NAMES.length; idx++) {
        const districtName = BLM_ORWA_DISTRICT_NAMES[idx];
        const nextName = BLM_ORWA_DISTRICT_NAMES[idx + 1] ?? null;
        const startIdx = lines.findIndex((line) => line === districtName);
        const endIdx = nextName ? lines.findIndex((line, lineIdx) => lineIdx > startIdx && line === nextName) : -1;
        const blockLines = startIdx >= 0 ? lines.slice(startIdx, endIdx >= 0 ? endIdx : undefined) : [];
        const parsed = classifyBlmOrWaDistrictBlock(districtName, blockLines);
        const status = startIdx >= 0 ? parsed.status : "unknown";
        const cards = startIdx >= 0 ? parsed.cards : [];
        const normalizedName = normalizeBlmUnitName(districtName);

        out[normalizedName] = {
          id: `blm:orwa:${slugifyForestName(normalizedName)}`,
          agency: "BLM",
          forestName: districtName,
          region: "ORWA",
          slug: slugifyForestName(districtName),
          status,
          summary: summarizeBlmRestrictionStatus(status, districtName, cards.map((card) => card.body ?? card.title).join(" ")),
          sourceUrl: BLM_ORWA_RESTRICTIONS_URL,
          checkedAt: new Date().toISOString(),
          cards,
        };
      }

      return out;
    },
  );
}

async function fetchBlmOregonWashingtonDistrictBoundaryFeaturesForBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  simplifyDegrees: number,
) {
  const where = "(ADMIN_ST='OR' OR ADMIN_ST='WA') AND BLM_ORG_TYPE='Field'";
  const idUrl =
    "https://gis.blm.gov/arcgis/rest/services/admin_boundaries/BLM_Natl_AdminUnit/MapServer/3/query" +
    `?where=${encodeURIComponent(where)}` +
    `&geometry=${encodeURIComponent(`${west},${south},${east},${north}`)}` +
    "&geometryType=esriGeometryEnvelope" +
    "&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects" +
    "&returnGeometry=false" +
    "&returnIdsOnly=true" +
    "&f=pjson";

  const idJson = await fetchJsonWithTimeout(idUrl, 15000, {
    "User-Agent": "omniwx-worker/1.0",
  });
  const objectIds = Array.isArray(idJson?.objectIds)
    ? idJson.objectIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  if (!objectIds.length) return [];

  const chunks = chunk(objectIds, 40);
  const allFeatures: any[] = [];

  for (const ids of chunks) {
    const url =
      "https://gis.blm.gov/arcgis/rest/services/admin_boundaries/BLM_Natl_AdminUnit/MapServer/3/query" +
      `?objectIds=${encodeURIComponent(ids.join(","))}` +
      "&inSR=4326" +
      "&returnGeometry=true" +
      "&outFields=OBJECTID,ADM_UNIT_CD,ADMU_NAME,PARENT_NAME,ADMIN_ST,BLM_ORG_TYPE" +
      "&outSR=4326" +
      `&maxAllowableOffset=${encodeURIComponent(String(simplifyDegrees))}` +
      "&f=pjson";

    const json = await fetchJsonWithTimeout(url, 15000, {
      "User-Agent": "omniwx-worker/1.0",
    });

    if (Array.isArray(json?.features)) allFeatures.push(...json.features);
  }

  return allFeatures;
}

async function fetchMinnesotaDnrRestrictionRecordsCached(ctx: ExecutionContext) {
  const cacheKey = new Request("https://omniwx-api-cache.local/__cache__/fire/restrictions/mn/dnr", {
    method: "GET",
  });

  return swrFetchObject<Record<string, FireRestrictionRecord>>(
    ctx,
    cacheKey,
    FIRE_CONTEXT_TTL_SECONDS,
    FIRE_CONTEXT_STALE_SECONDS,
    async () => {
      const html = await fetchTextWithTimeout(MINNESOTA_DNR_PLANNING_URL, FIRE_CONTEXT_TIMEOUT_MS, {
        "User-Agent": "omniwx-worker/1.0",
      });

      const text = stripHtmlWithLineBreaks(html);
      const countyMatch =
        text.match(/Burning restrictions are in effect today for the following counties:\s*([^\n.]+)\./i) ??
        text.match(/Burning restrictions are in effect today for the following counties:\s*([^\n]+)/i);
      const lastModifiedMatch = text.match(/Last Modified\s+([0-9/:\sAPMapm]+)/i);
      const countyListRaw = countyMatch?.[1] ?? "";
      const countyNames = countyListRaw
        .replace(/\band\b/gi, ",")
        .split(",")
        .map((value) => normalizeMinnesotaCountyName(value))
        .filter(Boolean);
      const countySet = new Set(countyNames);
      const out: Record<string, FireRestrictionRecord> = {};
      const checkedAtIso = new Date().toISOString();
      const startDate = lastModifiedMatch?.[1]?.trim() ?? null;

      for (const countyName of countySet) {
        const displayName = countyName.endsWith("County") ? countyName : `${countyName} County`;

        out[countyName] = {
          id: `mndnr:${slugifyForestName(displayName)}`,
          agency: "MN DNR",
          forestName: displayName,
          region: "MN",
          slug: slugifyForestName(displayName),
          status: "restrictions",
          summary: summarizeMinnesotaRestrictionStatus("restrictions", displayName),
          sourceUrl: MINNESOTA_DNR_RESTRICTIONS_URL,
          checkedAt: checkedAtIso,
          cards: [
            {
              title: `${displayName} burning restrictions`,
              url: MINNESOTA_DNR_RESTRICTIONS_URL,
              body: `Minnesota DNR lists active county burning restrictions for ${displayName}.`,
              startDate,
              forestOrder: null,
            },
          ],
        };
      }

      return out;
    },
  );
}

async function fetchMinnesotaCountyBoundaryFeaturesForBbox(
  west: number,
  south: number,
  east: number,
  north: number,
  simplifyDegrees: number,
) {
  const where = "STATE='27'";
  const idUrl =
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/3/query" +
    `?where=${encodeURIComponent(where)}` +
    `&geometry=${encodeURIComponent(`${west},${south},${east},${north}`)}` +
    "&geometryType=esriGeometryEnvelope" +
    "&inSR=4326" +
    "&spatialRel=esriSpatialRelIntersects" +
    "&returnGeometry=false" +
    "&returnIdsOnly=true" +
    "&f=pjson";

  const idJson = await fetchJsonWithTimeout(idUrl, 15000, {
    "User-Agent": "omniwx-worker/1.0",
  });
  const objectIds = Array.isArray(idJson?.objectIds)
    ? idJson.objectIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
    : [];

  if (!objectIds.length) return [];

  const chunks = chunk(objectIds, 40);
  const allFeatures: any[] = [];

  for (const ids of chunks) {
    const url =
      "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/3/query" +
      `?objectIds=${encodeURIComponent(ids.join(","))}` +
      "&inSR=4326" +
      "&returnGeometry=true" +
      "&outFields=OBJECTID,GEOID,STATE,COUNTY,NAME,BASENAME" +
      "&outSR=4326" +
      `&maxAllowableOffset=${encodeURIComponent(String(simplifyDegrees))}` +
      "&f=pjson";

    const json = await fetchJsonWithTimeout(url, 15000, {
      "User-Agent": "omniwx-worker/1.0",
    });

    if (Array.isArray(json?.features)) allFeatures.push(...json.features);
  }

  return allFeatures;
}

function degToRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

function normalizeDegrees(deg: number) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x;
}

function parseOffsetMinutes(offset: string) {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  return sign * (hh * 60 + mm);
}

function dayOfYearFromYmd(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const start = new Date(Date.UTC(y, 0, 1));
  return Math.floor((dt.getTime() - start.getTime()) / 86400000) + 1;
}

function formatLocalIsoFromUtcMinutes(args: { date: string; utcMinutes: number; offset: string }) {
  const { date, utcMinutes, offset } = args;
  if (!Number.isFinite(utcMinutes)) return null;

  const [y, m, d] = date.split("-").map(Number);
  const baseUtcMs = Date.UTC(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const utcMs = baseUtcMs + Math.round(utcMinutes * 60_000);

  const offsetMinutes = parseOffsetMinutes(offset);
  const localMs = utcMs + offsetMinutes * 60_000;
  const local = new Date(localMs);

  const yyyy = local.getUTCFullYear();
  const MM = String(local.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(local.getUTCDate()).padStart(2, "0");
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");

  return `${yyyy}-${MM}-${dd}T${hh}:${mm}:${ss}${offset}`;
}

function calcSolarEventUtcMinutes(args: {
  date: string;
  lat: number;
  lon: number;
  zenithDeg: number;
  isSunrise: boolean;
}) {
  const { date, lat, lon, zenithDeg, isSunrise } = args;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;

  const N = dayOfYearFromYmd(date);
  const lngHour = lon / 15;
  const t = isSunrise ? N + (6 - lngHour) / 24 : N + (18 - lngHour) / 24;
  const M = 0.9856 * t - 3.289;

  let L = M + 1.916 * Math.sin(degToRad(M)) + 0.02 * Math.sin(degToRad(2 * M)) + 282.634;
  L = normalizeDegrees(L);

  let RA = radToDeg(Math.atan(0.91764 * Math.tan(degToRad(L))));
  RA = normalizeDegrees(RA);

  const Lquadrant = Math.floor(L / 90) * 90;
  const RAquadrant = Math.floor(RA / 90) * 90;
  RA = (RA + (Lquadrant - RAquadrant)) / 15;

  const sinDec = 0.39782 * Math.sin(degToRad(L));
  const cosDec = Math.cos(Math.asin(sinDec));

  const cosH =
    (Math.cos(degToRad(zenithDeg)) - sinDec * Math.sin(degToRad(lat))) /
    (cosDec * Math.cos(degToRad(lat)));

  if (cosH > 1 || cosH < -1) return null;

  let H = isSunrise ? 360 - radToDeg(Math.acos(cosH)) : radToDeg(Math.acos(cosH));
  H = H / 15;

  const T = H + RA - 0.06571 * t - 6.622;
  let UT = T - lngHour;
  while (UT < 0) UT += 24;
  while (UT >= 24) UT -= 24;

  return UT * 60;
}

async function fetchMoonDay(lat: number, lon: number, date: string, offset: string) {
  const upstream =
    `https://api.met.no/weatherapi/sunrise/3.0/moon` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&date=${encodeURIComponent(date)}` +
    `&offset=${encodeURIComponent(offset)}`;

  const json: any = await fetchJsonWithHeaders(upstream, { "User-Agent": "omniwx-worker/1.0" });
  const props = json?.properties ?? {};
  const phaseDeg = extractMoonPhaseDegrees(props);

  const illuminationPct =
    typeof props?.moonphase?.percent === "number" && Number.isFinite(props.moonphase.percent)
      ? Math.round(props.moonphase.percent)
      : moonPhaseDegreesToIlluminationPct(phaseDeg);

  const label =
    typeof props?.moonphase?.label === "string" && props.moonphase.label.trim()
      ? props.moonphase.label.trim()
      : moonPhaseLabelFromDegrees(phaseDeg);

  return {
    date,
    moonrise: typeof props?.moonrise?.time === "string" ? props.moonrise.time : null,
    moonset: typeof props?.moonset?.time === "string" ? props.moonset.time : null,
    moonPhaseDegrees: phaseDeg,
    moonIlluminationPct: illuminationPct,
    moonPhaseLabel: label,
  };
}

async function fetchSunDay(lat: number, lon: number, date: string, offset: string) {
  const upstream =
    `https://api.met.no/weatherapi/sunrise/3.0/sun` +
    `?lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lon))}` +
    `&date=${encodeURIComponent(date)}` +
    `&offset=${encodeURIComponent(offset)}`;

  const json: any = await fetchJsonWithHeaders(upstream, { "User-Agent": "omniwx-worker/1.0" });
  const props = json?.properties ?? {};

  const sunrise =
    typeof props?.sunrise?.time === "string"
      ? props.sunrise.time
      : formatLocalIsoFromUtcMinutes({
          date,
          utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 90.833, isSunrise: true }) ?? NaN,
          offset,
        });

  const sunset =
    typeof props?.sunset?.time === "string"
      ? props.sunset.time
      : formatLocalIsoFromUtcMinutes({
          date,
          utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 90.833, isSunrise: false }) ?? NaN,
          offset,
        });

  const civilDawn = formatLocalIsoFromUtcMinutes({
    date,
    utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 96, isSunrise: true }) ?? NaN,
    offset,
  });

  const civilDusk = formatLocalIsoFromUtcMinutes({
    date,
    utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 96, isSunrise: false }) ?? NaN,
    offset,
  });

  const nauticalDawn = formatLocalIsoFromUtcMinutes({
    date,
    utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 102, isSunrise: true }) ?? NaN,
    offset,
  });

  const nauticalDusk = formatLocalIsoFromUtcMinutes({
    date,
    utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 102, isSunrise: false }) ?? NaN,
    offset,
  });

  const astronomicalDawn = formatLocalIsoFromUtcMinutes({
    date,
    utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 108, isSunrise: true }) ?? NaN,
    offset,
  });

  const astronomicalDusk = formatLocalIsoFromUtcMinutes({
    date,
    utcMinutes: calcSolarEventUtcMinutes({ date, lat, lon, zenithDeg: 108, isSunrise: false }) ?? NaN,
    offset,
  });

  return {
    date,
    sunrise: sunrise ?? null,
    sunset: sunset ?? null,
    civilDawn: civilDawn ?? null,
    civilDusk: civilDusk ?? null,
    nauticalDawn: nauticalDawn ?? null,
    nauticalDusk: nauticalDusk ?? null,
    astronomicalDawn: astronomicalDawn ?? null,
    astronomicalDusk: astronomicalDusk ?? null,
  };
}

/* =============================================================================
 * SkyScore grid helpers
 * ============================================================================= */

type SkyImagePoint = {
  lat: number;
  lon: number;
  cloudTotal: number | null;
  cloudLow: number | null;
  cloudMid: number | null;
  cloudHigh: number | null;
  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;
  humidityPct: number | null;
  aerosolIndex?: number | null;

  bortleClass?: number | null;
  bortleLabel?: string | null;
  elevationM?: number | null;
  skyBrightness?: number | null;
};

type SkyScoredPoint = SkyImagePoint & {
  score: number;
  weather01: number;
  darkness01: number;
  transparency01: number;
  seeing01: number;
  moon01: number;
  aerosols01: number;
  siteScore01: number;
};

type SkySamplingPlan = {
  mode: SkyGridMode;
  density: SkyGridDensity;
  sourceStepDeg: number;
  heroStepDeg?: number;
  heroRadiusDeg?: number;
  maxRegionalPts: number;
  maxHeroPts: number;
};

function chooseSkySamplingPlan(args: {
  zoom: number;
  mode: SkyGridMode;
  density: SkyGridDensity;
}): SkySamplingPlan {
  const { zoom, mode, density } = args;
  const z = Math.max(2, Math.min(12, zoom));

  let regionalBase =
    z <= 3 ? 1.5 :
    z <= 4 ? 1.0 :
    z <= 5 ? 0.5 :
    z <= 6 ? 0.25 :
    z <= 7 ? 0.20 :
    z <= 8 ? 0.15 :
    0.10;

  if (density === "low") regionalBase *= 1.35;
  else if (density === "high") regionalBase *= 0.72;

  regionalBase = clampFloat(regionalBase, 0.04, 2.0, 0.2);

  const maxRegionalPts =
    density === "high" ? (mode === "hero" ? 360 : 260) :
    density === "low" ? (mode === "hero" ? 180 : 120) :
    mode === "hero" ? 260 : 180;

  if (mode === "regional") {
    return {
      mode,
      density,
      sourceStepDeg: regionalBase,
      maxRegionalPts,
      maxHeroPts: 0,
    };
  }

  let heroStepDeg = regionalBase * 0.45;
  if (density === "high") heroStepDeg *= 0.82;
  if (density === "low") heroStepDeg *= 1.18;
  heroStepDeg = clampFloat(heroStepDeg, 0.025, 0.5, 0.08);

  let heroRadiusDeg =
    z >= 9 ? 1.2 :
    z >= 8 ? 1.6 :
    z >= 7 ? 2.0 :
    z >= 6 ? 2.6 :
    3.5;

  if (density === "high") heroRadiusDeg *= 1.15;
  if (density === "low") heroRadiusDeg *= 0.90;

  const maxHeroPts =
    density === "high" ? 420 :
    density === "low" ? 180 :
    280;

  return {
    mode,
    density,
    sourceStepDeg: regionalBase,
    heroStepDeg,
    heroRadiusDeg,
    maxRegionalPts,
    maxHeroPts,
  };
}

function buildRegularGrid(
  bounds: { west: number; east: number; south: number; north: number },
  stepDeg: number,
  maxPts: number,
) {
  const pts: Array<{ lat: number; lon: number }> = [];

  const latMin = Math.min(bounds.south, bounds.north);
  const latMax = Math.max(bounds.south, bounds.north);
  const lonMin = Math.min(bounds.west, bounds.east);
  const lonMax = Math.max(bounds.west, bounds.east);

  const estCount = (step: number) => {
    const nLat = Math.max(1, Math.floor((latMax - latMin) / step) + 1);
    const nLon = Math.max(1, Math.floor((lonMax - lonMin) / step) + 1);
    return nLat * nLon;
  };

  let step = stepDeg;
  while (estCount(step) > maxPts && step < 6) step *= 1.35;

  const lat0 = Math.floor(latMin / step) * step;
  const lon0 = Math.floor(lonMin / step) * step;

  for (let lat = lat0; lat <= latMax + 1e-9; lat += step) {
    for (let lon = lon0; lon <= lonMax + 1e-9; lon += step) {
      pts.push({ lat, lon });
    }
  }

  return { pts, stepUsed: step };
}

function buildHeroGrid(
  bounds: { west: number; east: number; south: number; north: number },
  centerLat: number,
  centerLon: number,
  stepDeg: number,
  radiusDeg: number,
  maxPts: number,
) {
  const pts: Array<{ lat: number; lon: number }> = [];

  const latMin = Math.max(Math.min(bounds.south, bounds.north), centerLat - radiusDeg);
  const latMax = Math.min(Math.max(bounds.south, bounds.north), centerLat + radiusDeg);
  const lonMin = Math.max(Math.min(bounds.west, bounds.east), centerLon - radiusDeg);
  const lonMax = Math.min(Math.max(bounds.west, bounds.east), centerLon + radiusDeg);

  if (latMax < latMin || lonMax < lonMin) {
    return { pts: [], stepUsed: stepDeg };
  }

  const estCount = (step: number) => {
    const nLat = Math.max(1, Math.floor((latMax - latMin) / step) + 1);
    const nLon = Math.max(1, Math.floor((lonMax - lonMin) / step) + 1);
    return nLat * nLon;
  };

  let step = stepDeg;
  while (estCount(step) > maxPts && step < 3) step *= 1.25;

  const lat0 = Math.floor(latMin / step) * step;
  const lon0 = Math.floor(lonMin / step) * step;

  for (let lat = lat0; lat <= latMax + 1e-9; lat += step) {
    for (let lon = lon0; lon <= lonMax + 1e-9; lon += step) {
      const dLat = lat - centerLat;
      const dLon = lon - centerLon;
      const ellipse = (dLat * dLat) / (radiusDeg * radiusDeg) + (dLon * dLon) / (radiusDeg * radiusDeg);
      if (ellipse <= 1.05) pts.push({ lat, lon });
    }
  }

  return { pts, stepUsed: step };
}

function dedupeGridPoints(points: Array<{ lat: number; lon: number }>, keyStep = 0.0001) {
  const out: Array<{ lat: number; lon: number }> = [];
  const seen = new Set<string>();

  for (const p of points) {
    const key = `${roundCoordKey(p.lat, keyStep).toFixed(4)},${roundCoordKey(p.lon, keyStep).toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function computeCloudPenaltyCanonical(p: SkyImagePoint) {
  const low = pct01Sky(p.cloudLow) ?? 0;
  const mid = pct01Sky(p.cloudMid) ?? 0;
  const high = pct01Sky(p.cloudHigh) ?? 0;
  const total = pct01Sky(p.cloudTotal);

  const cloudPenaltyFromLayers = clamp01(0.36 * low + 0.62 * mid + 0.96 * high);

  return Math.max(total ?? 0, cloudPenaltyFromLayers);
}

function computeTransparency01Canonical(p: SkyImagePoint) {
  const cloudPenalty = computeCloudPenaltyCanonical(p);

  const visKm = p.visibilityM != null ? p.visibilityM / 1000 : null;
  const visibilityPenalty =
    visKm == null
      ? 0.12
      : clamp01((22 - Math.max(0, Math.min(22, visKm))) / 22) * 0.40;

  const humidity = p.humidityPct ?? null;
  const humidityPenalty =
    humidity == null
      ? 0.05
      : clamp01((humidity - 68) / 32) * 0.24;

  let transparency01 = clamp01(1 - (cloudPenalty * 1.02 + visibilityPenalty + humidityPenalty));

  const cloudTotalPct = p.cloudTotal ?? null;
  if (cloudTotalPct != null) {
    if (cloudTotalPct >= 100) transparency01 = Math.min(transparency01, 0.02);
    else if (cloudTotalPct >= 98) transparency01 = Math.min(transparency01, 0.04);
    else if (cloudTotalPct >= 95) transparency01 = Math.min(transparency01, 0.07);
    else if (cloudTotalPct >= 90) transparency01 = Math.min(transparency01, 0.12);
    else if (cloudTotalPct >= 85) transparency01 = Math.min(transparency01, 0.18);
  }

  if (cloudPenalty >= 0.95) transparency01 = Math.min(transparency01, 0.06);
  else if (cloudPenalty >= 0.90) transparency01 = Math.min(transparency01, 0.12);
  else if (cloudPenalty >= 0.85) transparency01 = Math.min(transparency01, 0.18);

  return transparency01;
}

function computeSeeing01Canonical(p: SkyImagePoint) {
  const wind = p.windMps ?? 0;
  const gust = p.gustMps ?? wind;

  const sustainedPenalty = clamp01((wind - 4) / 10) * 0.42;
  const gustPenalty = clamp01((gust - 6) / 14) * 0.50;
  const humidityPenalty = p.humidityPct == null ? 0 : clamp01((p.humidityPct - 85) / 15) * 0.08;

  return clamp01(1 - (sustainedPenalty + gustPenalty + humidityPenalty));
}

function computeMoonScore01Canonical(args: {
  moonIsUp: boolean;
  moonIlluminationPct: number | null;
  darknessScore: number;
}) {
  const { moonIsUp, moonIlluminationPct, darknessScore } = args;
  if (!moonIsUp) return 1;

  const illum01 = clamp01((moonIlluminationPct ?? 0) / 100);
  const dark01 = clamp01(darknessScore);
  const maxPenalty = 0.82 * dark01;

  return clamp01(1 - illum01 * maxPenalty);
}

function computeAerosolScore01Canonical(p: SkyImagePoint) {
  const aerosolIndex = p.aerosolIndex ?? null;
  if (aerosolIndex == null) return 0.75;
  return clamp01(1 - clamp01(aerosolIndex));
}

function bortleToScore01Canonical(bortle: number | null | undefined) {
  if (bortle == null) return 0.5;

  const b = Math.max(1, Math.min(9, bortle));
  const map: Record<number, number> = {
    1: 1.0,
    2: 0.96,
    3: 0.89,
    4: 0.80,
    5: 0.67,
    6: 0.54,
    7: 0.40,
    8: 0.26,
    9: 0.14,
  };

  return map[Math.round(b)] ?? 0.5;
}

function elevationBonus01Canonical(elevationM: number | null | undefined) {
  if (elevationM == null) return 0;
  return Math.max(0, Math.min(0.08, (elevationM / 2500) * 0.08));
}

function computeSiteScore01Canonical(lat: number, lon: number) {
  const site = lookupBortle(lat, lon);
  const bortle01 = bortleToScore01Canonical(site?.bortleClass ?? null);
  const elevationBonus = elevationBonus01Canonical(site?.elevationM ?? null);
  return clamp01(bortle01 + elevationBonus);
}

function computeDarknessScoreForHour(args: {
  hourOffset: number;
  pointDate0: string;
  pointDate1: string;
  lat: number;
  lon: number;
  offset: string;
}) {
  const { hourOffset, pointDate0, pointDate1, lat, lon, offset } = args;

  const todaySunset = formatLocalIsoFromUtcMinutes({
    date: pointDate0,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate0, lat, lon, zenithDeg: 90.833, isSunrise: false }) ?? NaN,
    offset,
  });

  const todayCivilDusk = formatLocalIsoFromUtcMinutes({
    date: pointDate0,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate0, lat, lon, zenithDeg: 96, isSunrise: false }) ?? NaN,
    offset,
  });

  const todayNauticalDusk = formatLocalIsoFromUtcMinutes({
    date: pointDate0,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate0, lat, lon, zenithDeg: 102, isSunrise: false }) ?? NaN,
    offset,
  });

  const todayAstronomicalDusk = formatLocalIsoFromUtcMinutes({
    date: pointDate0,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate0, lat, lon, zenithDeg: 108, isSunrise: false }) ?? NaN,
    offset,
  });

  const tomorrowSunrise = formatLocalIsoFromUtcMinutes({
    date: pointDate1,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate1, lat, lon, zenithDeg: 90.833, isSunrise: true }) ?? NaN,
    offset,
  });

  const tomorrowCivilDawn = formatLocalIsoFromUtcMinutes({
    date: pointDate1,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate1, lat, lon, zenithDeg: 96, isSunrise: true }) ?? NaN,
    offset,
  });

  const tomorrowNauticalDawn = formatLocalIsoFromUtcMinutes({
    date: pointDate1,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate1, lat, lon, zenithDeg: 102, isSunrise: true }) ?? NaN,
    offset,
  });

  const tomorrowAstronomicalDawn = formatLocalIsoFromUtcMinutes({
    date: pointDate1,
    utcMinutes: calcSolarEventUtcMinutes({ date: pointDate1, lat, lon, zenithDeg: 108, isSunrise: true }) ?? NaN,
    offset,
  });

  const base = new Date(`${pointDate0}T00:00:00${offset}`);
  if (Number.isNaN(base.getTime())) return 1;

  const t = new Date(base.getTime() + Math.max(0, Math.min(47, Math.floor(hourOffset))) * 3600_000);
  const timeMs = t.getTime();

  const isBetween = (start?: string | null, end?: string | null) => {
    if (!start || !end) return false;
    const ts = new Date(start).getTime();
    const te = new Date(end).getTime();
    if (!Number.isFinite(ts) || !Number.isFinite(te) || !Number.isFinite(timeMs)) return false;
    return timeMs >= ts && timeMs <= te;
  };

  const isTrueDark = isBetween(todayAstronomicalDusk, tomorrowAstronomicalDawn);
  const isAstronomicalTwilight =
    isBetween(todayNauticalDusk, todayAstronomicalDusk) ||
    isBetween(tomorrowAstronomicalDawn, tomorrowNauticalDawn);

  const isNauticalTwilight =
    isBetween(todayCivilDusk, todayNauticalDusk) ||
    isBetween(tomorrowNauticalDawn, tomorrowCivilDawn);

  const isCivilTwilight =
    isBetween(todaySunset, todayCivilDusk) ||
    isBetween(tomorrowCivilDawn, tomorrowSunrise);

  const isNight = isBetween(todayCivilDusk, tomorrowSunrise);

  if (isTrueDark) return 1.0;
  if (isAstronomicalTwilight) return 0.78;
  if (isNauticalTwilight) return 0.52;
  if (isCivilTwilight) return 0.28;
  if (isNight) return 0.85;
  return 0.18;
}

function computeMoonApproxForGrid(args: {
  hourOffset: number;
  pointDate0: string;
  offset: string;
  lat: number;
  lon: number;
}) {
  const { hourOffset, pointDate0, offset, lat, lon } = args;

  const base = new Date(`${pointDate0}T00:00:00${offset}`);
  if (Number.isNaN(base.getTime())) {
    return { moonIsUp: false, moonIlluminationPct: null as number | null };
  }

  const t = new Date(base.getTime() + Math.max(0, Math.min(47, Math.floor(hourOffset))) * 3600_000);
  const localHour = t.getUTCHours() + t.getUTCMinutes() / 60;

  const phaseLookup = lookupBortle(lat, lon);
  void phaseLookup;

  const synodicDays = 29.530588853;
  const refMs = Date.UTC(2000, 0, 6, 18, 14, 0, 0);
  const ageDays = ((t.getTime() - refMs) / 86400000) % synodicDays;
  const normalizedAge = ageDays < 0 ? ageDays + synodicDays : ageDays;
  const illumPct = Math.round(((1 - Math.cos((2 * Math.PI * normalizedAge) / synodicDays)) / 2) * 100);

  const riseApprox = (6 + (normalizedAge / synodicDays) * 24) % 24;
  const setApprox = (riseApprox + 12) % 24;

  const moonIsUp =
    riseApprox <= setApprox
      ? localHour >= riseApprox && localHour <= setApprox
      : localHour >= riseApprox || localHour <= setApprox;

  return { moonIsUp, moonIlluminationPct: illumPct };
}

function buildSkyPointLookup(points: SkyScoredPoint[], stepUsed: number) {
  const key = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const m = new Map<string, SkyScoredPoint>();

  for (const p of points) {
    const la = Math.round(p.lat / stepUsed) * stepUsed;
    const lo = Math.round(p.lon / stepUsed) * stepUsed;
    m.set(key(la, lo), p);
  }

  return {
    get(lat: number, lon: number) {
      const la = Math.round(lat / stepUsed) * stepUsed;
      const lo = Math.round(lon / stepUsed) * stepUsed;
      return m.get(key(la, lo)) ?? null;
    },
  };
}

function sampleSkyScoreBilinear(
  lookup: ReturnType<typeof buildSkyPointLookup>,
  stepUsed: number,
  lat: number,
  lon: number,
) {
  const lat0 = Math.floor(lat / stepUsed) * stepUsed;
  const lat1 = lat0 + stepUsed;
  const lon0 = Math.floor(lon / stepUsed) * stepUsed;
  const lon1 = lon0 + stepUsed;

  const q11 = lookup.get(lat0, lon0);
  const q12 = lookup.get(lat0, lon1);
  const q21 = lookup.get(lat1, lon0);
  const q22 = lookup.get(lat1, lon1);

  if (!q11 || !q12 || !q21 || !q22) {
    const cand = [q11, q12, q21, q22].filter(Boolean) as SkyScoredPoint[];
    if (!cand.length) return 100;

    let best = cand[0].score;
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of cand) {
      const d = Math.abs(c.lat - lat) + Math.abs(c.lon - lon);
      if (d < bestD) {
        bestD = d;
        best = c.score;
      }
    }
    return best;
  }

  const t = Math.max(0, Math.min(1, (lon - lon0) / stepUsed));
  const u = Math.max(0, Math.min(1, (lat - lat0) / stepUsed));

  const s1 = lerp(q11.score, q12.score, t);
  const s2 = lerp(q21.score, q22.score, t);
  return lerp(s1, s2, u);
}

function buildSkyScoreGridCacheKey(reqUrl: URL) {
  const next = new URL(reqUrl.origin + "/__cache__/astro/skyscore-grid/v4");
  const keys = [
    "west",
    "south",
    "east",
    "north",
    "zoom",
    "hour",
    "w",
    "h",
    "includePoints",
    "mode",
    "density",
    "centerLat",
    "centerLon",
  ];
  for (const k of keys) {
    const v = reqUrl.searchParams.get(k);
    if (v != null) next.searchParams.set(k, v);
  }
  return new Request(next.toString(), { method: "GET" });
}

function buildAstroInspectCacheKey(reqUrl: URL, lat: number, lon: number, hourOffset: number) {
  const next = new URL(reqUrl.origin + "/__cache__/astro/inspect/v2");
  next.searchParams.set("lat", String(Math.round(lat * 1000) / 1000));
  next.searchParams.set("lon", String(Math.round(lon * 1000) / 1000));
  next.searchParams.set("hour", String(clampInt(hourOffset, 0, 47)));
  return new Request(next.toString(), { method: "GET" });
}

function buildUtcHourWindow(hourOffset: number, spanHours = 2) {
  const base = new Date();
  base.setUTCMinutes(0, 0, 0);

  const safeHourOffset = Math.max(0, Math.min(47, Math.floor(hourOffset)));
  const safeSpanHours = Math.max(1, Math.min(6, Math.floor(spanHours)));

  const start = new Date(base.getTime() + safeHourOffset * 3600_000);
  const end = new Date(start.getTime() + safeSpanHours * 3600_000);

  const toHourIso = (d: Date) => {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:00`;
  };

  return {
    startHourIso: toHourIso(start),
    endHourIso: toHourIso(end),
  };
}

async function fetchSkyImageGridPointsPass(args: {
  bounds: { west: number; east: number; south: number; north: number };
  zoom: number;
  hourOffset: number;
  mode: SkyGridMode;
  density: Exclude<SkyGridDensity, "auto">;
  centerLat?: number | null;
  centerLon?: number | null;
  batchSize: number;
  coarsenMultiplier?: number;
}) {
  const plan = chooseSkySamplingPlan({
    zoom: args.zoom,
    mode: args.mode,
    density: args.density,
  });

  const coarsen = Math.max(1, args.coarsenMultiplier ?? 1);

  const regional = buildRegularGrid(
    args.bounds,
    plan.sourceStepDeg * coarsen,
    Math.max(16, Math.floor(plan.maxRegionalPts / coarsen))
  );

  let heroPts: Array<{ lat: number; lon: number }> = [];
  let heroStepUsed: number | undefined;

  const centerLat =
    args.centerLat != null && Number.isFinite(args.centerLat)
      ? args.centerLat
      : midpoint(args.bounds.south, args.bounds.north);

  const centerLon =
    args.centerLon != null && Number.isFinite(args.centerLon)
      ? args.centerLon
      : midpoint(args.bounds.west, args.bounds.east);

  if (args.mode === "hero" && plan.heroStepDeg && plan.heroRadiusDeg) {
    const hero = buildHeroGrid(
      args.bounds,
      centerLat,
      centerLon,
      plan.heroStepDeg * coarsen,
      plan.heroRadiusDeg,
      Math.max(16, Math.floor(plan.maxHeroPts / coarsen))
    );
    heroPts = hero.pts;
    heroStepUsed = hero.stepUsed;
  }

  const mergedPts = dedupeGridPoints([...regional.pts, ...heroPts], 0.0001);
  const chunks = chunkArray(mergedPts, Math.max(1, Math.floor(args.batchSize)));
  const out: SkyImagePoint[] = [];

  const hourly = [
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "visibility",
    "wind_speed_10m",
    "wind_gusts_10m",
    "relative_humidity_2m",
  ].join(",");

  const { startHourIso, endHourIso } = buildUtcHourWindow(args.hourOffset, 2);

  for (const block of chunks) {
    const lats = block.map((p) => p.lat.toFixed(4)).join(",");
    const lons = block.map((p) => p.lon.toFixed(4)).join(",");

    const upstream =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${encodeURIComponent(lats)}` +
      `&longitude=${encodeURIComponent(lons)}` +
      `&hourly=${encodeURIComponent(hourly)}` +
      `&wind_speed_unit=ms` +
      `&timezone=GMT` +
      `&start_hour=${encodeURIComponent(startHourIso)}` +
      `&end_hour=${encodeURIComponent(endHourIso)}`;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), OPEN_METEO_SKYGRID_TIMEOUT_MS);

    try {
      const res = await fetch(upstream, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });

      if (!res.ok) {
        continue;
      }

      const json: any = await res.json();
      const rows: any[] = Array.isArray(json)
        ? json
        : Array.isArray(json?.results)
          ? json.results
          : [json];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const h = r?.hourly ?? {};
        const times: string[] = Array.isArray(h?.time) ? h.time : [];

        let hourIdx = times.findIndex((t: string) => String(t).slice(0, 13) === startHourIso.slice(0, 13));
        if (hourIdx < 0) hourIdx = 0;

        const pick = (name: string) => {
          const arr = h?.[name];
          const v = Array.isArray(arr) ? arr[hourIdx] : null;
          return safeNum(v);
        };

        const latVal = block[i]?.lat ?? safeNum(r?.latitude) ?? null;
        const lonVal = block[i]?.lon ?? safeNum(r?.longitude) ?? null;

        if (latVal == null || lonVal == null) continue;

        out.push({
          lat: latVal,
          lon: lonVal,
          cloudTotal: pick("cloud_cover"),
          cloudLow: pick("cloud_cover_low"),
          cloudMid: pick("cloud_cover_mid"),
          cloudHigh: pick("cloud_cover_high"),
          visibilityM: pick("visibility"),
          windMps: pick("wind_speed_10m"),
          gustMps: pick("wind_gusts_10m"),
          humidityPct: pick("relative_humidity_2m"),
        });
      }
    } catch {
      continue;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    points: out,
    stepUsed: Math.min(regional.stepUsed, heroStepUsed ?? regional.stepUsed),
    plan,
    heroCenterLat: args.mode === "hero" ? centerLat : null,
    heroCenterLon: args.mode === "hero" ? centerLon : null,
  };
}

async function fetchSkyImageGridPoints(args: {
  bounds: { west: number; east: number; south: number; north: number };
  zoom: number;
  hourOffset: number;
  mode: SkyGridMode;
  density: SkyGridDensity;
  centerLat?: number | null;
  centerLon?: number | null;
}) {
  const effectiveDensity = resolveEffectiveSkyGridDensity({
    zoom: args.zoom,
    mode: args.mode,
    density: args.density,
  });

  const primary = await fetchSkyImageGridPointsPass({
    bounds: args.bounds,
    zoom: args.zoom,
    hourOffset: args.hourOffset,
    mode: args.mode,
    density: effectiveDensity,
    centerLat: args.centerLat,
    centerLon: args.centerLon,
    batchSize: SKYGRID_PRIMARY_BATCH_SIZE,
    coarsenMultiplier: 1,
  });

  if (primary.points.length >= SKYGRID_MIN_USABLE_POINTS) {
    return {
      ...primary,
      plan: { ...primary.plan, density: effectiveDensity },
    };
  }

  const fallbackDensity: Exclude<SkyGridDensity, "auto"> =
    effectiveDensity === "high" ? "medium" : "low";

  const fallback = await fetchSkyImageGridPointsPass({
    bounds: args.bounds,
    zoom: args.zoom,
    hourOffset: args.hourOffset,
    mode: args.mode,
    density: fallbackDensity,
    centerLat: args.centerLat,
    centerLon: args.centerLon,
    batchSize: SKYGRID_FALLBACK_BATCH_SIZE,
    coarsenMultiplier: 2.0,
  });

  if (fallback.points.length >= SKYGRID_MIN_USABLE_POINTS) {
    return {
      ...fallback,
      plan: { ...fallback.plan, density: fallbackDensity },
    };
  }

  throw new Error("SkyScore upstream returned zero usable points");
}

async function buildSkyScoreGridPayload(args: {
  bounds: { west: number; south: number; east: number; north: number };
  zoom: number;
  hourOffset: number;
  width: number;
  height: number;
  includePoints?: boolean;
  mode: SkyGridMode;
  density: SkyGridDensity;
  centerLat?: number | null;
  centerLon?: number | null;
}): Promise<SkyScoreGridPayload> {
  const fetched = await fetchSkyImageGridPoints({
    bounds: args.bounds,
    zoom: args.zoom,
    hourOffset: args.hourOffset,
    mode: args.mode,
    density: args.density,
    centerLat: args.centerLat,
    centerLon: args.centerLon,
  });

  const { points, stepUsed, plan, heroCenterLat, heroCenterLon } = fetched;

  const now = new Date();
  const pointDate0 = now.toISOString().slice(0, 10);
  const pointDate1 = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

  const offset = "+00:00";

  const scored: SkyScoredPoint[] = points.map((p) => {
    const transparency01 = computeTransparency01Canonical(p);
    const seeing01 = computeSeeing01Canonical(p);
    const darkness01 = computeDarknessScoreForHour({
      hourOffset: args.hourOffset,
      pointDate0,
      pointDate1,
      lat: p.lat,
      lon: p.lon,
      offset,
    });

    const moonApprox = computeMoonApproxForGrid({
      hourOffset: args.hourOffset,
      pointDate0,
      offset,
      lat: p.lat,
      lon: p.lon,
    });

    const moon01 = computeMoonScore01Canonical({
      moonIsUp: moonApprox.moonIsUp,
      moonIlluminationPct: moonApprox.moonIlluminationPct,
      darknessScore: darkness01,
    });

    const aerosols01 = computeAerosolScore01Canonical(p);
    const siteLookup = lookupBortle(p.lat, p.lon);
    const siteScore01 = computeSiteScore01Canonical(p.lat, p.lon);

    const weather01 = clamp01(
      transparency01 * 0.40 +
      seeing01 * 0.16 +
      darkness01 * 0.20 +
      moon01 * 0.12 +
      aerosols01 * 0.12
    );

    const observer01 = clamp01(weather01 * (0.35 + 0.65 * siteScore01));
    const score = Math.round(observer01 * 100);

    return {
      ...p,
      score,
      weather01,
      darkness01,
      transparency01,
      seeing01,
      moon01,
      aerosols01,
      siteScore01,
      bortleClass: siteLookup?.bortleClass ?? null,
      bortleLabel: siteLookup?.bortleLabel ?? null,
      elevationM: siteLookup?.elevationM ?? null,
      skyBrightness: siteLookup?.skyBrightness ?? null,
    };
  });

  const lookup = buildSkyPointLookup(scored, stepUsed);
  const scores: number[] = [];

  const lonSpan = args.bounds.east - args.bounds.west;
  const latSpan = args.bounds.north - args.bounds.south;

  for (let y = 0; y < args.height; y++) {
    const v = y / Math.max(1, args.height - 1);
    const lat = args.bounds.north - v * latSpan;

    for (let x = 0; x < args.width; x++) {
      const u = x / Math.max(1, args.width - 1);
      const lon = args.bounds.west + u * lonSpan;
      scores.push(Math.round(sampleSkyScoreBilinear(lookup, stepUsed, lat, lon)));
    }
  }

  return {
    ok: true,
    bounds: args.bounds,
    zoom: args.zoom,
    hourOffset: args.hourOffset,
    sourceStepDeg: stepUsed,
    denseStepDeg: Math.max(
      lonSpan / Math.max(1, args.width - 1),
      latSpan / Math.max(1, args.height - 1),
    ),
    width: args.width,
    height: args.height,
    scores,
    points: args.includePoints
      ? scored.map((p) => ({
          lat: p.lat,
          lon: p.lon,
          score: p.score,
          weather01: p.weather01,
          darkness01: p.darkness01,
          transparency01: p.transparency01,
          seeing01: p.seeing01,
          moon01: p.moon01,
          aerosols01: p.aerosols01,
          siteScore01: p.siteScore01,
          humidityPct: p.humidityPct,
          bortleClass: p.bortleClass ?? null,
          bortleLabel: p.bortleLabel ?? null,
          elevationM: p.elevationM ?? null,
          skyBrightness: p.skyBrightness ?? null,
          cloudTotal: p.cloudTotal,
          cloudLow: p.cloudLow,
          cloudMid: p.cloudMid,
          cloudHigh: p.cloudHigh,
          visibilityM: p.visibilityM,
          windMps: p.windMps,
          gustMps: p.gustMps,
        }))
      : undefined,
    fetchedAt: new Date().toISOString(),
    diagnostics: {
      source: "canonical sky score grid v3 utc-stable",
      mode: plan.mode,
      density: plan.density,
      sourcePoints: scored.length,
      heroCenterLat,
      heroCenterLon,
    },
  };
}

async function buildAstroInspectPayload(args: {
  lat: number;
  lon: number;
  hourOffset: number;
}): Promise<AstroInspectPayload> {
  const { lat, lon, hourOffset } = args;
  const hourly = [
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "visibility",
    "wind_speed_10m",
    "wind_gusts_10m",
    "relative_humidity_2m",
  ].join(",");

  const { startHourIso, endHourIso } = buildUtcHourWindow(hourOffset, 2);

  const upstream =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(String(lat))}` +
    `&longitude=${encodeURIComponent(String(lon))}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&wind_speed_unit=ms` +
    `&timezone=GMT` +
    `&start_hour=${encodeURIComponent(startHourIso)}` +
    `&end_hour=${encodeURIComponent(endHourIso)}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), OPEN_METEO_SKYGRID_TIMEOUT_MS);

  let json: any;
  try {
    const res = await fetch(upstream, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body ? `${res.status}: ${body}` : `${res.status}`);
    }

    json = await res.json();
  } finally {
    clearTimeout(t);
  }

  const row = Array.isArray(json) ? json[0] : Array.isArray(json?.results) ? json.results[0] : json;
  const h = row?.hourly ?? {};
  const times: string[] = Array.isArray(h?.time) ? h.time : [];
  let hourIdx = times.findIndex((t: string) => String(t).slice(0, 13) === startHourIso.slice(0, 13));
  if (hourIdx < 0) hourIdx = 0;

  const pick = (name: string) => {
    const arr = h?.[name];
    const v = Array.isArray(arr) ? arr[hourIdx] : null;
    return safeNum(v);
  };

  const point: SkyImagePoint = {
    lat,
    lon,
    cloudTotal: pick("cloud_cover"),
    cloudLow: pick("cloud_cover_low"),
    cloudMid: pick("cloud_cover_mid"),
    cloudHigh: pick("cloud_cover_high"),
    visibilityM: pick("visibility"),
    windMps: pick("wind_speed_10m"),
    gustMps: pick("wind_gusts_10m"),
    humidityPct: pick("relative_humidity_2m"),
  };

  const aerosolSnapshot = await fetchAerosolSnapshot(lat, lon, "auto");
  point.aerosolIndex = aerosolSnapshot.index;

  const now = new Date();
  const pointDate0 = now.toISOString().slice(0, 10);
  const pointDate1 = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const offset = "+00:00";

  const transparency01 = computeTransparency01Canonical(point);
  const seeing01 = computeSeeing01Canonical(point);
  const darkness01 = computeDarknessScoreForHour({
    hourOffset,
    pointDate0,
    pointDate1,
    lat,
    lon,
    offset,
  });

  const moonApprox = computeMoonApproxForGrid({
    hourOffset,
    pointDate0,
    offset,
    lat,
    lon,
  });

  const moon01 = computeMoonScore01Canonical({
    moonIsUp: moonApprox.moonIsUp,
    moonIlluminationPct: moonApprox.moonIlluminationPct,
    darknessScore: darkness01,
  });

  const aerosols01 = computeAerosolScore01Canonical(point);
  const site = lookupBortle(lat, lon);
  const siteScore01 = computeSiteScore01Canonical(lat, lon);

  const weather01 = clamp01(
    transparency01 * 0.40 +
    seeing01 * 0.16 +
    darkness01 * 0.20 +
    moon01 * 0.12 +
    aerosols01 * 0.12
  );

  const observer01 = clamp01(weather01 * (0.35 + 0.65 * siteScore01));
  const skyScore = Math.round(observer01 * 100);

  return {
    ok: true,
    lat,
    lon,
    hourOffset,
    skyScore,
    weather01,
    darkness01,
    transparency01,
    seeing01,
    moon01,
    aerosols01,
    siteScore01,
    humidityPct: point.humidityPct,
    cloudTotal: point.cloudTotal,
    cloudLow: point.cloudLow,
    cloudMid: point.cloudMid,
    cloudHigh: point.cloudHigh,
    visibilityM: point.visibilityM,
    windMps: point.windMps,
    gustMps: point.gustMps,
    site: {
      elevationM: site?.elevationM ?? null,
      bortleClass: site?.bortleClass ?? null,
      bortleLabel: site?.bortleLabel ?? null,
      skyBrightness: site?.skyBrightness ?? null,
    },
    aerosols: aerosolSnapshot,
    fetchedAt: new Date().toISOString(),
  };
}

/* =============================================================================
 * Radar helpers
 * ============================================================================= */

function getIemWmsBase(env: Env) {
  return env.RADAR_IEM_WMS_BASE || "https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad";
}

function iemWmsEndpointForProduct(base: string, product: "N0Q" | "N0B" | "N0Z") {
  if (product === "N0B") return `${base}/n0b.cgi`;
  if (product === "N0Z") return `${base}/n0z.cgi`;
  return `${base}/n0q.cgi`;
}

function parseBbox3857(bbox: string) {
  const parts = bbox.split(",").map((x) => Number(x.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [minx, miny, maxx, maxy] = parts;
  if (maxx <= minx || maxy <= miny) return null;
  return { minx, miny, maxx, maxy };
}

function shrinkBbox(b: { minx: number; miny: number; maxx: number; maxy: number }, shrink: number) {
  const s = clampFloat(shrink, 0.6, 1.0, 0.85);
  const cx = (b.minx + b.maxx) / 2;
  const cy = (b.miny + b.maxy) / 2;
  const w = (b.maxx - b.minx) * s;
  const h = (b.maxy - b.miny) * s;
  return { minx: cx - w / 2, miny: cy - h / 2, maxx: cx + w / 2, maxy: cy + h / 2 };
}

function roundBboxKey(b: { minx: number; miny: number; maxx: number; maxy: number }, step = 250) {
  const r = (n: number) => Math.round(n / step) * step;
  return { minx: r(b.minx), miny: r(b.miny), maxx: r(b.maxx), maxy: r(b.maxy) };
}

/* =============================================================================
 * Worker main
 * ============================================================================= */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors({}) });
    }

    if (url.pathname === "/v1/radar/info") {
      return new Response(
        JSON.stringify({
          ok: true,
          iemWmsBase: getIemWmsBase(env),
          routes: {
            wms_v1: "/v1/radar/wms",
            wms_v2: "/v2/radar/wms",
            rainviewer_tiles: "/v1/radar/rainviewer/tiles/{z}/{x}/{y}.png",
            iem_ridge_tiles: "/v1/radar/iem/ridge/tiles/{z}/{x}/{y}.png",
          },
        }),
        { status: 200, headers: withCors({ "content-type": "application/json; charset=utf-8" }) },
      );
    }

    if (url.pathname === "/api/openmeteo/hourly" || url.pathname === "/v1/openmeteo/hourly") {
      const built = buildOmHourlyUpstream(url);
      if (!built.ok) {
        return new Response(JSON.stringify({ ok: false, error: built.error }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKey = buildOmHourlyCacheKey(url, built.lats, built.lons, built.units);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: OM_HOURLY_TTL_SECONDS,
        staleSeconds: OM_HOURLY_STALE_SECONDS,
        fetchUpstream: async () => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), OPEN_METEO_TIMEOUT_MS);
          try {
            const res = await fetch(built.upstreamUrl, { signal: ctrl.signal });
            const ct = res.headers.get("content-type") || "application/json; charset=utf-8";
            const body = await res.arrayBuffer();
            return new Response(body, { status: res.status, headers: { "content-type": ct } });
          } finally {
            clearTimeout(t);
          }
        },
      });
    }

    if (url.pathname === "/api/air-quality/hourly" || url.pathname === "/v1/air-quality/hourly") {
      const built = buildAirQualityHourlyUpstream(url);
      if (!built.ok) {
        return new Response(JSON.stringify({ ok: false, error: built.error }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      return swrFetchJson(request, ctx, {
        cacheKey: buildAirQualityHourlyCacheKey(url, built.lat, built.lon),
        ttlSeconds: AIR_QUALITY_TTL_SECONDS,
        staleSeconds: AIR_QUALITY_STALE_SECONDS,
        fetchUpstream: () => fetchAirQualityHourlyResponse(built),
      });
    }

    if (url.pathname === "/api/usgs/instantaneous" || url.pathname === "/v1/usgs/instantaneous") {
      const built = buildUsgsInstantaneousUpstream(url);
      if (!built.ok) {
        return new Response(JSON.stringify({ ok: false, error: built.error }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      return swrFetchJson(request, ctx, {
        cacheKey: buildUsgsInstantaneousCacheKey(url),
        ttlSeconds: USGS_IV_TTL_SECONDS,
        staleSeconds: USGS_IV_STALE_SECONDS,
        fetchUpstream: () => fetchUsgsInstantaneousResponse(built),
      });
    }

    if (url.pathname === "/api/usgs/water-stations" || url.pathname === "/v1/usgs/water-stations") {
      const bbox = parseBboxFromUrl(url);
      if (!bbox) {
        return new Response(JSON.stringify({ ok: false, error: "valid west/south/east/north bbox is required; max area 2500 square degrees" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      return swrFetchJson(request, ctx, {
        cacheKey: buildUsgsWaterStationsCacheKey(url, bbox),
        ttlSeconds: USGS_WATER_STATIONS_TTL_SECONDS,
        staleSeconds: USGS_WATER_STATIONS_STALE_SECONDS,
        fetchUpstream: () => fetchUsgsWaterStationsResponse(url, bbox),
      });
    }

    if (url.pathname === "/api/astro/location" || url.pathname === "/v1/astro/location") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const placeName = url.searchParams.get("placeName") || undefined;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKey = buildAstroLocationCacheKey(url, lat, lon);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: ASTRO_TTL_SECONDS,
        staleSeconds: ASTRO_STALE_SECONDS,
        fetchUpstream: async () => {
          const hourly = [
            "temperature_2m",
            "relative_humidity_2m",
            "cloud_cover",
            "cloud_cover_low",
            "cloud_cover_mid",
            "cloud_cover_high",
            "visibility",
            "wind_speed_10m",
            "wind_gusts_10m",
          ].join(",");

          const daily = ["sunrise", "sunset"].join(",");
          const astroForecastDays = 4;

          const forecastUrl =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${encodeURIComponent(String(lat))}` +
            `&longitude=${encodeURIComponent(String(lon))}` +
            `&hourly=${encodeURIComponent(hourly)}` +
            `&daily=${encodeURIComponent(daily)}` +
            `&forecast_days=${astroForecastDays}` +
            `&wind_speed_unit=ms` +
            `&timezone=auto`;

          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), OPEN_METEO_TIMEOUT_MS);

          let forecastJson: any;
          try {
            const res = await fetch(forecastUrl, {
              signal: ctrl.signal,
              headers: { accept: "application/json" },
            });

            if (!res.ok) {
              const txt = await res.text().catch(() => "");
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: "Astro forecast upstream error",
                  status: res.status,
                  body: txt.slice(0, 300),
                }),
                {
                  status: 502,
                  headers: { "content-type": "application/json; charset=utf-8" },
                },
              );
            }
            forecastJson = await res.json();
          } finally {
            clearTimeout(t);
          }

          const timezone = String(forecastJson?.timezone ?? "UTC");
          const utcOffsetSeconds =
            typeof forecastJson?.utc_offset_seconds === "number" ? forecastJson.utc_offset_seconds : 0;
          const offset = utcOffsetSecondsToIsoOffset(utcOffsetSeconds);

          const hourlyData = forecastJson?.hourly ?? {};
          const dailyData = forecastJson?.daily ?? {};

          const dayTimes: string[] = Array.isArray(dailyData.time) ? dailyData.time : [];
          if (!dayTimes.length) {
            return new Response(JSON.stringify({ ok: false, error: "Astro forecast missing daily.time" }), {
              status: 502,
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          }

          const astroDates = dayTimes.slice(0, astroForecastDays);

          let moonDays;
          let sunDays;
          let aerosolSnapshot: AerosolSnapshot = { index: null, label: null, source: null };

          try {
            [moonDays, sunDays, aerosolSnapshot] = await Promise.all([
              Promise.all(astroDates.map((date) => fetchMoonDay(lat, lon, date, offset))),
              Promise.all(astroDates.map((date) => fetchSunDay(lat, lon, date, offset))),
              fetchAerosolSnapshot(lat, lon, timezone),
            ]);
          } catch (error: any) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "Astro upstream error",
                body: error?.message ?? String(error),
              }),
              {
                status: 502,
                headers: { "content-type": "application/json; charset=utf-8" },
              },
            );
          }

          const todayDate = astroDates[0];
          const tomorrowDate = astroDates[1] ?? astroDates[0];
          const moonToday = moonDays?.[0] ?? null;
          const moonTomorrow = moonDays?.[1] ?? moonDays?.[0] ?? null;
          const sunToday = sunDays?.[0] ?? null;
          const sunTomorrow = sunDays?.[1] ?? sunDays?.[0] ?? null;

          const siteLookup = lookupBortle(lat, lon);

          const payload: AstroLocationPayload = {
            ok: true,
            lat,
            lon,
            placeName,
            timezone,
            fetchedAt: new Date().toISOString(),
            sun: {
              todaySunrise: sunToday?.sunrise ?? dailyData.sunrise?.[0] ?? null,
              todaySunset: sunToday?.sunset ?? dailyData.sunset?.[0] ?? null,
              tomorrowSunrise: sunTomorrow?.sunrise ?? dailyData.sunrise?.[1] ?? dailyData.sunrise?.[0] ?? null,
              tomorrowSunset: sunTomorrow?.sunset ?? dailyData.sunset?.[1] ?? dailyData.sunset?.[0] ?? null,
            },
            twilight: {
              todayCivilDusk: sunToday?.civilDusk ?? null,
              todayNauticalDusk: sunToday?.nauticalDusk ?? null,
              todayAstronomicalDusk: sunToday?.astronomicalDusk ?? null,
              tomorrowCivilDawn: sunTomorrow?.civilDawn ?? null,
              tomorrowNauticalDawn: sunTomorrow?.nauticalDawn ?? null,
              tomorrowAstronomicalDawn: sunTomorrow?.astronomicalDawn ?? null,
            },
            moonDays: Array.isArray(moonDays) ? moonDays : [moonToday, moonTomorrow].filter(Boolean),
            sunDays: Array.isArray(sunDays) ? sunDays : [sunToday, sunTomorrow].filter(Boolean),
            hourly: {
              time: Array.isArray(hourlyData.time) ? hourlyData.time : [],
              temperatureC: Array.isArray(hourlyData.temperature_2m) ? hourlyData.temperature_2m : [],
              humidityPct: Array.isArray(hourlyData.relative_humidity_2m) ? hourlyData.relative_humidity_2m : [],
              cloudTotal: Array.isArray(hourlyData.cloud_cover) ? hourlyData.cloud_cover : [],
              cloudLow: Array.isArray(hourlyData.cloud_cover_low) ? hourlyData.cloud_cover_low : [],
              cloudMid: Array.isArray(hourlyData.cloud_cover_mid) ? hourlyData.cloud_cover_mid : [],
              cloudHigh: Array.isArray(hourlyData.cloud_cover_high) ? hourlyData.cloud_cover_high : [],
              visibilityM: Array.isArray(hourlyData.visibility) ? hourlyData.visibility : [],
              windMps: Array.isArray(hourlyData.wind_speed_10m) ? hourlyData.wind_speed_10m : [],
              gustMps: Array.isArray(hourlyData.wind_gusts_10m) ? hourlyData.wind_gusts_10m : [],
            },
            site: {
              elevationM: siteLookup.elevationM,
              bortleClass: siteLookup.bortleClass,
              bortleLabel: siteLookup.bortleLabel,
              skyBrightness: siteLookup.skyBrightness,
            },
            aerosols: {
              index: aerosolSnapshot.index,
              label: aerosolSnapshot.label,
              source: aerosolSnapshot.source,
              airQualityIndex: aerosolSnapshot.airQualityIndex ?? null,
              airQualityLabel: aerosolSnapshot.airQualityLabel ?? null,
            },
            diagnostics: {
              moonSource: "metno sunrise 3.0",
              siteSource: siteLookup.source,
              aerosolSource: aerosolSnapshot.source,
            },
          };

          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/astro/inspect" || url.pathname === "/v1/astro/inspect") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const hourOffset = clampInt(Number(url.searchParams.get("hour") || "0"), 0, 47);

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKey = buildAstroInspectCacheKey(url, lat, lon, hourOffset);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: ASTRO_TTL_SECONDS,
        staleSeconds: ASTRO_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = await buildAstroInspectPayload({ lat, lon, hourOffset });
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/astro/skyscore-grid" || url.pathname === "/v1/astro/skyscore-grid") {
      const west = Number(url.searchParams.get("west"));
      const south = Number(url.searchParams.get("south"));
      const east = Number(url.searchParams.get("east"));
      const north = Number(url.searchParams.get("north"));
      const zoom = clampFloat(Number(url.searchParams.get("zoom") || "6"), 2, 12, 6);
      const hourOffset = clampInt(Number(url.searchParams.get("hour") || "0"), 0, 47);
      const width = clampInt(Number(url.searchParams.get("w") || "160"), 64, 256);
      const height = clampInt(Number(url.searchParams.get("h") || "160"), 64, 256);
      const includePoints = url.searchParams.get("includePoints") === "1";
      const mode = parseSkyGridMode(url.searchParams.get("mode"));
      const density = parseSkyGridDensity(url.searchParams.get("density"));
      const centerLat = safeNum(url.searchParams.get("centerLat"));
      const centerLon = safeNum(url.searchParams.get("centerLon"));

      if (![west, south, east, north].every(Number.isFinite) || east <= west || north <= south) {
        return new Response(JSON.stringify({ ok: false, error: "valid west/south/east/north bounds are required" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKey = buildSkyScoreGridCacheKey(url);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: ASTRO_TTL_SECONDS,
        staleSeconds: ASTRO_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = await buildSkyScoreGridPayload({
            bounds: { west, south, east, north },
            zoom,
            hourOffset,
            width,
            height,
            includePoints,
            mode,
            density,
            centerLat,
            centerLon,
          });

          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname.startsWith("/v1/radar/rainviewer/tiles/")) {
      const parts = url.pathname.replace("/v1/radar/rainviewer/tiles/", "").split("/");
      if (parts.length < 3) {
        return new Response(JSON.stringify({ ok: false, error: "bad tile path" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const z = parts[0];
      const x = parts[1];
      const y = parts[2].replace(".png", "");

      const ts = url.searchParams.get("ts");
      if (!ts || !/^\d+$/.test(ts)) {
        return new Response(JSON.stringify({ ok: false, error: "ts required (unix seconds)" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const size = url.searchParams.get("size") === "512" ? "512" : "256";
      const color = url.searchParams.get("color") ?? "2";
      const smooth = url.searchParams.get("smooth") ?? "1";
      const snow = url.searchParams.get("snow") ?? "1";

      const upstreamUrl = `https://tilecache.rainviewer.com/v2/radar/${ts}/${size}/${z}/${x}/${y}/${color}/${smooth}_${snow}.png`;

      const k = new URL(request.url);
      k.pathname = `/__cache__/radar/rainviewer/${ts}/${size}/${z}/${x}/${y}.png`;
      k.search = `?color=${color}&smooth=${smooth}&snow=${snow}`;
      const cacheKey = new Request(k.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: RADAR_TILE_TTL_SECONDS,
        staleSeconds: RADAR_TILE_STALE_SECONDS,
        fetchUpstream: async () => {
          const res = await fetch(
            upstreamUrl,
            {
              cf: { cacheEverything: true, cacheTtl: RADAR_TILE_TTL_SECONDS },
              headers: { "User-Agent": "omniwx-worker/1.0" },
            } as any,
          );

          const body = await res.arrayBuffer();
          return new Response(body, {
            status: res.status,
            headers: { "content-type": "image/png" },
          });
        },
      });
    }

    if (url.pathname.startsWith("/v1/radar/iem/ridge/tiles/")) {
      const parts = url.pathname.replace("/v1/radar/iem/ridge/tiles/", "").split("/");
      if (parts.length < 3) {
        return new Response(JSON.stringify({ ok: false, error: "bad tile path" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const z = parts[0];
      const x = parts[1];
      const y = parts[2].replace(".png", "");

      const radarRaw = (url.searchParams.get("radar") || "").trim().toUpperCase();
      const product = (url.searchParams.get("product") || "N0Q").trim().toUpperCase();
      const ts = (url.searchParams.get("ts") || "0").trim();

      if (!/^[A-Z0-9]{3}$/.test(radarRaw)) {
        return new Response(JSON.stringify({ ok: false, error: "radar must be 3-char site id (e.g. TLX)" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }
      if (!/^[A-Z0-9]{3}$/.test(product)) {
        return new Response(JSON.stringify({ ok: false, error: "product must be like N0Q, N0B, N0S..." }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }
      if (!(ts === "0" || /^\d{12}$/.test(ts))) {
        return new Response(JSON.stringify({ ok: false, error: "ts must be 0 or YYYYMMDDHHMM" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const service = `ridge::${radarRaw}-${product}-${ts}`;
      const upstreamUrl = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/${service}/${z}/${x}/${y}.png`;

      const k = new URL(request.url);
      k.pathname = `/__cache__/radar/iem/ridge/${radarRaw}/${product}/${ts}/${z}/${x}/${y}.png`;
      k.search = "";
      const cacheKey = new Request(k.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: RADAR_TILE_TTL_SECONDS,
        staleSeconds: RADAR_TILE_STALE_SECONDS,
        fetchUpstream: async () => {
          const res = await fetch(
            upstreamUrl,
            {
              cf: { cacheEverything: true, cacheTtl: RADAR_TILE_TTL_SECONDS },
              headers: { "User-Agent": "omniwx-worker/1.0" },
            } as any,
          );

          const body = await res.arrayBuffer();
          return new Response(body, {
            status: res.status,
            headers: { "content-type": "image/png" },
          });
        },
      });
    }

    if (url.pathname === "/v1/radar/wms") {
      const product = (url.searchParams.get("product") || "N0Q").toUpperCase() as "N0Q" | "N0B" | "N0Z";
      const width = Math.max(256, Math.min(1536, Math.floor(Number(url.searchParams.get("width") || "1024"))));
      const height = Math.max(256, Math.min(1536, Math.floor(Number(url.searchParams.get("height") || "1024"))));
      const bbox = url.searchParams.get("bbox");
      const timeIso = url.searchParams.get("time");

      if (!bbox) {
        return new Response(JSON.stringify({ ok: false, error: "bbox is required (EPSG:3857)" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const base = getIemWmsBase(env);
      const endpoint = iemWmsEndpointForProduct(base, product);

      const upstream = new URL(endpoint);
      upstream.searchParams.set("service", "WMS");
      upstream.searchParams.set("request", "GetMap");
      upstream.searchParams.set("version", "1.1.1");
      upstream.searchParams.set(
        "layers",
        product === "N0B" ? "nexrad-n0b-900913" : product === "N0Z" ? "nexrad-n0z-900913" : "nexrad-n0q-900913",
      );
      upstream.searchParams.set("styles", "");
      upstream.searchParams.set("format", "image/png");
      upstream.searchParams.set("transparent", "TRUE");
      upstream.searchParams.set("srs", "EPSG:3857");
      upstream.searchParams.set("bbox", bbox);
      upstream.searchParams.set("width", String(width));
      upstream.searchParams.set("height", String(height));
      if (timeIso) upstream.searchParams.set("time", timeIso);

      const k2 = new URL(url.origin + "/__cache__/radar/wms");
      k2.searchParams.set("product", product);
      k2.searchParams.set("bbox", bbox);
      k2.searchParams.set("width", String(width));
      k2.searchParams.set("height", String(height));
      if (timeIso) k2.searchParams.set("time", timeIso);

      const cacheKey = new Request(k2.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: WMS_TTL_SECONDS,
        staleSeconds: WMS_STALE_SECONDS,
        fetchUpstream: async () => {
          const res = await fetch(
            upstream.toString(),
            {
              cf: { cacheEverything: true, cacheTtl: WMS_TTL_SECONDS },
              headers: { "User-Agent": "omniwx-worker/1.0" },
            } as any,
          );

          const ct = res.headers.get("content-type") || "image/png";
          const body = await res.arrayBuffer();
          return new Response(body, { status: res.status, headers: { "content-type": ct } });
        },
      });
    }

    if (url.pathname === "/v2/radar/wms") {
      const product = (url.searchParams.get("product") || "N0Q").toUpperCase() as "N0Q" | "N0B" | "N0Z";
      const bboxRaw = url.searchParams.get("bbox");
      const timeIso = url.searchParams.get("time");

      if (!bboxRaw) {
        return new Response(JSON.stringify({ ok: false, error: "bbox is required (EPSG:3857)" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const parsed = parseBbox3857(bboxRaw);
      if (!parsed) {
        return new Response(JSON.stringify({ ok: false, error: "bbox must be minx,miny,maxx,maxy (EPSG:3857)" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const shrink = clampFloat(Number(url.searchParams.get("shrink") || "0.85"), 0.6, 1.0, 0.85);
      const dpr = clampFloat(Number(url.searchParams.get("dpr") || "2"), 1, 3, 2);
      const stormMode = url.searchParams.get("storm") === "1";
      const maxImageDimension = stormMode ? 3072 : 2048;

      const baseW = clampInt(Number(url.searchParams.get("width") || "1024"), 256, maxImageDimension);
      const baseH = clampInt(Number(url.searchParams.get("height") || "1024"), 256, maxImageDimension);

      const width = clampInt(Math.round(baseW * dpr), 256, maxImageDimension);
      const height = clampInt(Math.round(baseH * dpr), 256, maxImageDimension);

      const fmt = (url.searchParams.get("fmt") || "png32").toLowerCase();
      const format = "image/png";
      const transparent = "TRUE";
      const bgcolor = url.searchParams.get("bgcolor") || "0x00000000";

      const b2 = shrinkBbox(parsed, shrink);
      const bbox = `${b2.minx},${b2.miny},${b2.maxx},${b2.maxy}`;

      const base = getIemWmsBase(env);
      const endpoint = iemWmsEndpointForProduct(base, product);

      const upstream = new URL(endpoint);
      upstream.searchParams.set("service", "WMS");
      upstream.searchParams.set("request", "GetMap");
      upstream.searchParams.set("version", "1.1.1");
      upstream.searchParams.set(
        "layers",
        product === "N0B" ? "nexrad-n0b-900913" : product === "N0Z" ? "nexrad-n0z-900913" : "nexrad-n0q-900913",
      );
      upstream.searchParams.set("styles", "");
      upstream.searchParams.set("format", format);
      upstream.searchParams.set("transparent", transparent);
      upstream.searchParams.set("srs", "EPSG:3857");
      upstream.searchParams.set("bbox", bbox);
      upstream.searchParams.set("width", String(width));
      upstream.searchParams.set("height", String(height));
      upstream.searchParams.set("bgcolor", bgcolor);
      if (timeIso) upstream.searchParams.set("time", timeIso);

      const keyB = roundBboxKey(b2, 250);
      const k2 = new URL(url.origin + "/__cache__/radar/wms/v2");
      k2.searchParams.set("product", product);
      k2.searchParams.set("bbox", `${keyB.minx},${keyB.miny},${keyB.maxx},${keyB.maxy}`);
      k2.searchParams.set("width", String(width));
      k2.searchParams.set("height", String(height));
      k2.searchParams.set("shrink", String(shrink));
      k2.searchParams.set("dpr", String(dpr));
      k2.searchParams.set("fmt", fmt);
      k2.searchParams.set("bgcolor", bgcolor);
      if (stormMode) k2.searchParams.set("storm", "1");
      if (timeIso) k2.searchParams.set("time", timeIso);

      const cacheKey = new Request(k2.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: WMS_TTL_SECONDS,
        staleSeconds: WMS_STALE_SECONDS,
        fetchUpstream: async () => {
          const res = await fetch(
            upstream.toString(),
            {
              cf: { cacheEverything: true, cacheTtl: WMS_TTL_SECONDS },
              headers: { "User-Agent": "omniwx-worker/1.0" },
            } as any,
          );

          const ct = res.headers.get("content-type") || "image/png";
          const body = await res.arrayBuffer();
          return new Response(body, { status: res.status, headers: { "content-type": ct } });
        },
      });
    }

    if (url.pathname === "/api/alerts/global" || url.pathname === "/v1/alerts/global") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));
      const units = parseUnits(url.searchParams.get("units"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/api/alerts/global";
      cacheKeyUrl.searchParams.set("lat", String(roundCoordKey(lat, 0.05)));
      cacheKeyUrl.searchParams.set("lon", String(roundCoordKey(lon, 0.05)));
      cacheKeyUrl.searchParams.set("units", units);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: GLOBAL_ALERTS_TTL_SECONDS,
        staleSeconds: GLOBAL_ALERTS_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = await buildGlobalAlertsPayload(lat, lon, units);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/marine/conditions" || url.pathname === "/v1/marine/conditions") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/api/marine/conditions";
      cacheKeyUrl.searchParams.set("lat", String(roundCoordKey(lat, 0.05)));
      cacheKeyUrl.searchParams.set("lon", String(roundCoordKey(lon, 0.05)));
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: MARINE_CONDITIONS_TTL_SECONDS,
        staleSeconds: MARINE_CONDITIONS_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = await buildMarineConditionsPayload(lat, lon);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/marine/areas" || url.pathname === "/v1/marine/areas") {
      const west = Number(url.searchParams.get("west"));
      const south = Number(url.searchParams.get("south"));
      const east = Number(url.searchParams.get("east"));
      const north = Number(url.searchParams.get("north"));
      const zoom = clampFloat(Number(url.searchParams.get("zoom") ?? "3"), 0, 18, 3);

      if (![west, south, east, north].every(Number.isFinite)) {
        return new Response(JSON.stringify({ ok: false, error: "west, south, east, and north are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const viewport = {
        west: clampFloat(west, -180, 180, -180),
        south: clampFloat(south, -90, 90, -90),
        east: clampFloat(east, -180, 180, 180),
        north: clampFloat(north, -90, 90, 90),
      };
      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/api/marine/areas";
      cacheKeyUrl.searchParams.set("west", String(roundCoordKey(viewport.west, 2)));
      cacheKeyUrl.searchParams.set("south", String(roundCoordKey(viewport.south, 2)));
      cacheKeyUrl.searchParams.set("east", String(roundCoordKey(viewport.east, 2)));
      cacheKeyUrl.searchParams.set("north", String(roundCoordKey(viewport.north, 2)));
      cacheKeyUrl.searchParams.set("zoom", String(Math.floor(zoom)));
      cacheKeyUrl.searchParams.set("v", MARINE_AREAS_VERSION);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: MARINE_AREAS_TTL_SECONDS,
        staleSeconds: MARINE_AREAS_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = buildMarineAreasPayload(viewport, zoom);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (
      url.pathname === "/api/marine/extremes" ||
      url.pathname === "/v1/marine/extremes" ||
      url.pathname === "/marine-extremes"
    ) {
      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/api/marine/extremes/v1";
      cacheKeyUrl.search = "";
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: MARINE_EXTREMES_TTL_SECONDS,
        staleSeconds: MARINE_EXTREMES_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = await buildMarineExtremesPayload();
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/fire/hotspots" || url.pathname === "/v1/fire/hotspots") {
      const west = Number(url.searchParams.get("west"));
      const south = Number(url.searchParams.get("south"));
      const east = Number(url.searchParams.get("east"));
      const north = Number(url.searchParams.get("north"));
      const dayRange = clampInt(Number(url.searchParams.get("days") ?? "1"), 1, 5);

      if (![west, south, east, north].every(Number.isFinite)) {
        return new Response(JSON.stringify({ ok: false, error: "west, south, east, and north are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const safeWest = clampFloat(west, -180, 180, -180);
      const safeSouth = clampFloat(south, -90, 90, -90);
      const safeEast = clampFloat(east, -180, 180, 180);
      const safeNorth = clampFloat(north, -90, 90, 90);
      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/api/fire/hotspots";
      cacheKeyUrl.searchParams.set("west", String(roundCoordKey(safeWest, 0.1)));
      cacheKeyUrl.searchParams.set("south", String(roundCoordKey(safeSouth, 0.1)));
      cacheKeyUrl.searchParams.set("east", String(roundCoordKey(safeEast, 0.1)));
      cacheKeyUrl.searchParams.set("north", String(roundCoordKey(safeNorth, 0.1)));
      cacheKeyUrl.searchParams.set("days", String(dayRange));
      cacheKeyUrl.searchParams.set("v", FIRE_HOTSPOTS_CACHE_VERSION);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: FIRE_HOTSPOTS_TTL_SECONDS,
        staleSeconds: FIRE_HOTSPOTS_STALE_SECONDS,
        fetchUpstream: async () => {
          const payload = await buildFireHotspotsPayload({
            env,
            west: safeWest,
            south: safeSouth,
            east: safeEast,
            north: safeNorth,
            dayRange,
          });
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/current") {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const units = parseUnits(url.searchParams.get("units"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
      status: 400,
      headers: withCors({ "content-type": "application/json; charset=utf-8" }),
    });
  }

  const latKey = Math.round(lat * 100) / 100;
  const lonKey = Math.round(lon * 100) / 100;

  const cacheKeyUrl = new URL(request.url);
  cacheKeyUrl.pathname = "/__cache__/api/current";
  cacheKeyUrl.searchParams.set("lat", String(latKey));
  cacheKeyUrl.searchParams.set("lon", String(lonKey));
  cacheKeyUrl.searchParams.set("units", units);

  const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
  const upstream = toOpenMeteoUrlCurrentSingle(lat, lon, units);
  const fallbackUpstream = toOpenMeteoUrlCurrentFallback(lat, lon, units);

  return swrFetchJson(request, ctx, {
    cacheKey,
    ttlSeconds: CURRENT_TTL_SECONDS,
    staleSeconds: CURRENT_STALE_SECONDS,
    fetchUpstream: async () => {
      const failures: string[] = [];

      const fetchOpenMeteoCurrent = async () => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), OPEN_METEO_TIMEOUT_MS);
        try {
          const res = await fetch(upstream, { signal: ctrl.signal });
          if (res.ok) {
            const json = (await res.json()) as OpenMeteoCurrentSingleResponse;
            const cur = json?.current ?? null;

            const payload: CurrentResponse = {
              ok: true,
              source: "open-meteo",
              time: cur?.time ? String(cur.time) : null,
              units,
              temp: cur?.temperature_2m ?? null,
              feels: cur?.apparent_temperature ?? null,
              dewPoint: cur?.dew_point_2m ?? null,
              humidityPct: cur?.relative_humidity_2m ?? null,
              cloudCoverPct: cur?.cloud_cover ?? null,
              wind: cur?.wind_speed_10m ?? null,
              windGust: cur?.wind_gusts_10m ?? null,
              windDir: cur?.wind_direction_10m ?? null,
              pressureMb: cur?.pressure_msl ?? null,
              weatherCode: cur?.weather_code ?? null,
            };

            return currentJsonResponse(payload, "open-meteo");
          }

          const txt = await res.text().catch(() => "");
          failures.push(`open-meteo current HTTP ${res.status}${txt ? ` ${txt.slice(0, 120)}` : ""}`);
        } finally {
          clearTimeout(t);
        }
      };

      const fetchOpenMeteoHourlyFallback = async () => {
        const fbCtrl = new AbortController();
        const fbTimer = setTimeout(() => fbCtrl.abort(), OPEN_METEO_TIMEOUT_MS);

        try {
          const fbRes = await fetch(fallbackUpstream, { signal: fbCtrl.signal });

          if (!fbRes.ok) {
            const fbTxt = await fbRes.text().catch(() => "");
            failures.push(`open-meteo hourly HTTP ${fbRes.status}${fbTxt ? ` ${fbTxt.slice(0, 120)}` : ""}`);
            return;
          }

          const fbJson = (await fbRes.json()) as OpenMeteoHourlyFallbackResponse;
          const h = fbJson?.hourly ?? {};
          const idx = pickClosestHourlyIndex(h.time);

          if (idx < 0) {
            failures.push("open-meteo hourly missing data");
            return;
          }

          const at = <T,>(arr: Array<T | null> | undefined, i: number): T | null =>
            Array.isArray(arr) && i >= 0 && i < arr.length ? (arr[i] ?? null) : null;

          const payload: CurrentResponse = {
            ok: true,
            source: "open-meteo",
            time: Array.isArray(h.time) ? h.time[idx] ?? null : null,
            units,
            temp: at(h.temperature_2m, idx),
            feels: at(h.apparent_temperature, idx),
            dewPoint: at(h.dew_point_2m, idx),
            humidityPct: at(h.relative_humidity_2m, idx),
            cloudCoverPct: at(h.cloud_cover, idx),
            wind: at(h.wind_speed_10m, idx),
            windGust: at(h.wind_gusts_10m, idx),
            windDir: at(h.wind_direction_10m, idx),
            pressureMb: at(h.pressure_msl, idx),
            weatherCode: at(h.weather_code, idx),
          };

          const response = currentJsonResponse(payload, "open-meteo");
          response.headers.set("X-Omni-Current-Fallback", "open-meteo-hourly");
          return response;
        } finally {
          clearTimeout(fbTimer);
        }
      };

      try {
        const omCurrent = await fetchOpenMeteoCurrent();
        if (omCurrent) return omCurrent;
      } catch (err: any) {
        failures.push(`open-meteo current ${err?.message ?? String(err)}`);
      }

      try {
        const omHourly = await fetchOpenMeteoHourlyFallback();
        if (omHourly) return omHourly;
      } catch (err: any) {
        failures.push(`open-meteo hourly ${err?.message ?? String(err)}`);
      }

      try {
        const nwsPayload = await fetchNwsCurrentPayload(lat, lon, units);
        const response = currentJsonResponse(nwsPayload, "nws");
        response.headers.set("X-Omni-Current-Fallback", "nws");
        return response;
      } catch (err: any) {
        failures.push(`nws ${err?.message ?? String(err)}`);
      }

      try {
        const metPayload = await fetchMetNorwayCurrentPayload(lat, lon, units);
        const response = currentJsonResponse(metPayload, "met-norway");
        response.headers.set("X-Omni-Current-Fallback", "met-norway");
        return response;
      } catch (err: any) {
        failures.push(`met-norway ${err?.message ?? String(err)}`);
      }

      return new Response(JSON.stringify({ ok: false, error: "All weather providers failed", providers: failures }), {
        status: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    },
  });
}

    if (url.pathname === "/land-extremes") {
      const unit: Unit = url.searchParams.get("unit") === "C" ? "C" : "F";

      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/land-extremes";
      cacheKeyUrl.searchParams.set("unit", unit);
      cacheKeyUrl.searchParams.set("v", LAND_EXTREMES_POINTS_VERSION);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: LAND_TTL_SECONDS,
        staleSeconds: LAND_STALE_SECONDS,
        fetchUpstream: async () => {
          const fetchedAtIso = new Date().toISOString();
          const pts = landExtremePoints();
          const chunks = chunk(pts, OPEN_METEO_BATCH_SIZE);

          const rows: Array<
            LandPoint & {
              t: number | null;
              wind: number | null;
              gust: number | null;
              precip: number | null;
              time: string | null;
            }
          > = [];

          const batchResults = await mapLimit(chunks, LAND_OPEN_METEO_CONCURRENCY, (c) =>
            fetchOpenMeteoCurrentBatch(c, unit),
          );

          for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
            const c = chunks[chunkIndex];
            const results = batchResults[chunkIndex] ?? [];
            for (let i = 0; i < c.length; i++) {
              const r = results[i] ?? { current: null, updatedAtIso: null };
              rows.push({
                ...c[i],
                t: r.current?.temperature_2m ?? null,
                wind: r.current?.wind_speed_10m ?? null,
                gust: r.current?.wind_gusts_10m ?? null,
                precip: r.current?.precipitation ?? null,
                time: r.updatedAtIso,
              });
            }
          }

          const validRows = rows.filter((r) => r.t != null || r.wind != null || r.gust != null || r.precip != null).length;
          if (validRows === 0 && rows.length > 0) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "Open-Meteo returned no usable current weather for land extremes",
                meta: {
                  pointsTotal: rows.length,
                  fetchedAtIso,
                  source: "open-meteo",
                  pointsVersion: LAND_EXTREMES_POINTS_VERSION,
                },
              }),
              {
                status: 502,
                headers: { "content-type": "application/json; charset=utf-8" },
              },
            );
          }

          const { heroes, groups, updatedAt } = buildLandExtremes(unit, rows);
          const pointsUs = rows.filter((r) => r.badge !== "Global").length;
          const pointsGlobal = rows.filter((r) => r.badge === "Global").length;
          const pointsScan = rows.filter((r) => r.group === "scan").length;
          const pointsCurated = rows.length - pointsScan;

          const payload: LandExtremesResponse = {
            ok: true,
            unit,
            updatedAt,
            heroes,
            groups,
            meta: {
              pointsTotal: rows.length,
              pointsUs,
              pointsGlobal,
              pointsScan,
              pointsCurated,
              fetchedAtIso,
              source: "open-meteo",
              ttlSeconds: LAND_TTL_SECONDS,
              pointsVersion: LAND_EXTREMES_POINTS_VERSION,
            },
          };

          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/mars-insight" || url.pathname === "/api/mars/insight") {
      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/mars-insight";
      cacheKeyUrl.searchParams.set("v", "insight-archive-v1");
      return swrFetchJson(request, ctx, {
        cacheKey: new Request(cacheKeyUrl.toString(), { method: "GET" }),
        ttlSeconds: 86400,
        staleSeconds: 86400 * 30,
        fetchUpstream: async () => {
          const payload = await fetchMarsInsightWeather(env);
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/almanac/climo" || url.pathname === "/v1/almanac/climo") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKey = buildAlmanacCacheKey(url, lat, lon);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: ALMANAC_TTL_SECONDS,
        staleSeconds: ALMANAC_STALE_SECONDS,
        fetchUpstream: async () => {
          let noaaFallbackReason: string | null = null;

          try {
            const normalsStation = await findNearestNormalsStationForWorker(env, lat, lon);
            const { normals, precipMonthlyIn } = await fetchMonthlyNormalsForWorker(env, normalsStation.id);
            if (!hasUsableMonthlyNormalsForWorker(normals)) {
              throw new Error("NOAA normals did not return enough temperature coverage");
            }

            return new Response(
              JSON.stringify({
                station: {
                  id: normalsStation.id,
                  name: normalsStation.name ?? null,
                  latitude: normalsStation.latitude ?? null,
                  longitude: normalsStation.longitude ?? null,
                  elevation: normalsStation.elevation ?? null,
                },
                normals,
                precipMonthlyIn,
                source: "noaa_cdo_normal_mly",
                fetchedAtIso: new Date().toISOString(),
              }),
              {
                status: 200,
                headers: { "content-type": "application/json; charset=utf-8" },
              },
            );
          } catch (err: any) {
            noaaFallbackReason = err instanceof Error ? err.message : String(err ?? "unknown NOAA almanac failure");
          }

          const fallback = await fetchMonthlyNormalsFromOpenMeteoArchive(lat, lon);
          return new Response(
            JSON.stringify({
              station: {
                id: fallback.station.id,
                name: fallback.station.name,
                latitude: fallback.station.latitude,
                longitude: fallback.station.longitude,
                elevation: fallback.station.elevation ?? null,
              },
              normals: fallback.normals,
              precipMonthlyIn: fallback.precipMonthlyIn,
              source: "open_meteo_archive_normals",
              fetchedAtIso: new Date().toISOString(),
              diagnostics: {
                ...fallback.diagnostics,
                fallbackFrom: "noaa_cdo_normal_mly",
                fallbackReason: noaaFallbackReason,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        },
      });
    }

    if (url.pathname === "/api/almanac/prior-year" || url.pathname === "/v1/almanac/prior-year") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const priorYear = new Date().getFullYear() - 1;
      const keyUrl = new URL(url.toString());
      keyUrl.pathname = "/__cache__/almanac/prior-year/v1";
      keyUrl.searchParams.set("lat", String(roundCoordKey(lat, 0.05)));
      keyUrl.searchParams.set("lon", String(roundCoordKey(lon, 0.05)));
      const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: ALMANAC_TTL_SECONDS,
        staleSeconds: ALMANAC_STALE_SECONDS,
        fetchUpstream: async () => {
          const lastYear = await fetchPriorYearSeriesFromOpenMeteo(lat, lon, priorYear);
          return new Response(
            JSON.stringify({
              lastYear,
              fetchedAtIso: new Date().toISOString(),
              diagnostics: {
                priorYear,
                source: "open_meteo_archive",
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        },
      });
    }

    if (url.pathname === "/api/fire/restrictions/unit") {
      const region = (url.searchParams.get("region") ?? "").trim();
      const slug = (url.searchParams.get("slug") ?? "").trim();
      const forestName = (url.searchParams.get("name") ?? "").trim();

      if (!region || !slug || !forestName) {
        return new Response(JSON.stringify({ ok: false, error: "region, slug, and name are required" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const record = await fetchForestRestrictionRecordCached(ctx, {
        name: forestName,
        region,
        slug,
      }).catch((err: any) => ({
        ok: false,
        error: err instanceof Error ? err.message : String(err ?? "unknown error"),
      }));

      return new Response(JSON.stringify(record), {
        status: 200,
        headers: withCors({ "content-type": "application/json; charset=utf-8" }),
      });
    }

    if (url.pathname === "/api/fire/restrictions/geojson") {
      const west = Number(url.searchParams.get("west"));
      const south = Number(url.searchParams.get("south"));
      const east = Number(url.searchParams.get("east"));
      const north = Number(url.searchParams.get("north"));
      const zoom = Number(url.searchParams.get("zoom") ?? "6");

      if (![west, south, east, north].every(Number.isFinite)) {
        return new Response(JSON.stringify({ ok: false, error: "west, south, east, and north are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const keyUrl = new URL(url.toString());
      keyUrl.pathname = "/__cache__/fire/restrictions/geojson/v8";
      keyUrl.searchParams.set("west", String(roundCoordKey(west, 0.2)));
      keyUrl.searchParams.set("south", String(roundCoordKey(south, 0.2)));
      keyUrl.searchParams.set("east", String(roundCoordKey(east, 0.2)));
      keyUrl.searchParams.set("north", String(roundCoordKey(north, 0.2)));
      keyUrl.searchParams.set("zoom", String(clampInt(zoom, 3, 12)));
      const cacheKey = new Request(keyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: FIRE_CONTEXT_TTL_SECONDS,
        staleSeconds: FIRE_CONTEXT_STALE_SECONDS,
        fetchUpstream: async () => {
          const simplifyDegrees =
            zoom >= 10 ? 0.0015 : zoom >= 8 ? 0.003 : zoom >= 6 ? 0.008 : 0.02;

          const settled = await Promise.allSettled([
            fetchForestBoundaryFeaturesForBbox(west, south, east, north, simplifyDegrees),
            fetchBlmArizonaFieldBoundaryFeaturesForBbox(
              west,
              south,
              east,
              north,
              simplifyDegrees,
            ),
            fetchBlmOregonWashingtonDistrictBoundaryFeaturesForBbox(
              west,
              south,
              east,
              north,
              simplifyDegrees,
            ),
            fetchMinnesotaCountyBoundaryFeaturesForBbox(
              west,
              south,
              east,
              north,
              simplifyDegrees,
            ),
            fetchBlmArizonaRestrictionRecordsCached(ctx),
            fetchBlmOregonWashingtonRestrictionRecordsCached(ctx),
            fetchMinnesotaDnrRestrictionRecordsCached(ctx),
          ] as const);

          const [
            boundaryFeaturesResult,
            blmBoundaryFeaturesResult,
            blmOrWaBoundaryFeaturesResult,
            minnesotaCountyFeaturesResult,
            blmRecordMapResult,
            blmOrWaRecordMapResult,
            minnesotaRecordMapResult,
          ] = settled;

          const boundaryFeatures =
            boundaryFeaturesResult.status === "fulfilled" ? boundaryFeaturesResult.value : [];
          const blmBoundaryFeatures =
            blmBoundaryFeaturesResult.status === "fulfilled" ? blmBoundaryFeaturesResult.value : [];
          const blmOrWaBoundaryFeatures =
            blmOrWaBoundaryFeaturesResult.status === "fulfilled" ? blmOrWaBoundaryFeaturesResult.value : [];
          const minnesotaCountyFeatures =
            minnesotaCountyFeaturesResult.status === "fulfilled" ? minnesotaCountyFeaturesResult.value : [];
          const blmRecordMap = blmRecordMapResult.status === "fulfilled" ? blmRecordMapResult.value : {};
          const blmOrWaRecordMap =
            blmOrWaRecordMapResult.status === "fulfilled" ? blmOrWaRecordMapResult.value : {};
          const minnesotaRecordMap =
            minnesotaRecordMapResult.status === "fulfilled" ? minnesotaRecordMapResult.value : {};

          const forests = boundaryFeatures
            .map((feature: any) => {
              const attrs = feature?.attributes ?? {};
              const name = typeof attrs?.FORESTNAME === "string" ? attrs.FORESTNAME.trim() : "";
              const region = typeof attrs?.REGION === "string" ? attrs.REGION.trim() : null;
              const slug = name ? slugifyForestName(name) : "";
              if (!name || !slug || !region) return null;
              return {
                name,
                region,
                slug,
                forestOrgCode: typeof attrs?.FORESTORGCODE === "string" ? attrs.FORESTORGCODE : null,
                forestNumber: typeof attrs?.FORESTNUMBER === "string" ? attrs.FORESTNUMBER : null,
              };
            })
            .filter(Boolean) as Array<{
            name: string;
            region: string;
            slug: string;
            forestOrgCode: string | null;
            forestNumber: string | null;
          }>;

          const dedupedForests = Array.from(
            new Map(forests.map((forest) => [`${forest.region}|${forest.slug}`, forest] as const)).values(),
          );

          const recordMap = new Map<string, FireRestrictionRecord>();
          const forestChunks = chunk(dedupedForests, 8);

          for (const forestChunk of forestChunks) {
            const settled = await Promise.allSettled(
              forestChunk.map((forest) => fetchForestRestrictionRecordCached(ctx, forest)),
            );

            settled.forEach((result, idx) => {
              const forest = forestChunk[idx];
              const key = `${forest.region}|${forest.slug}`;

              if (result.status === "fulfilled") {
                recordMap.set(key, result.value);
                return;
              }

              recordMap.set(key, {
                id: `usfs:${String(forest.region).padStart(2, "0")}:${forest.slug}`,
                agency: "USFS",
                forestName: forest.name,
                region: forest.region,
                slug: forest.slug,
                forestOrgCode: forest.forestOrgCode,
                forestNumber: forest.forestNumber,
                status: "unknown",
                summary: `Restriction status is unavailable for ${forest.name}.`,
                sourceUrl: null,
                checkedAt: new Date().toISOString(),
                cards: [],
              });
            });
          }

          const usfsFeatures = boundaryFeatures
            .map((feature: any, idx: number) => {
              const geometry = arcGisGeometryToGeoJson(feature?.geometry);
              if (!geometry) return null;

              const attrs = feature?.attributes ?? {};
              const forestName = typeof attrs?.FORESTNAME === "string" ? attrs.FORESTNAME.trim() : "";
              const region = typeof attrs?.REGION === "string" ? attrs.REGION.trim() : null;
              const slug = forestName ? slugifyForestName(forestName) : "";
              if (!forestName || !region || !slug) return null;

              const record =
                recordMap.get(`${region}|${slug}`) ??
                ({
                  id: `usfs:${String(region).padStart(2, "0")}:${slug}`,
                  agency: "USFS",
                  forestName,
                  region,
                  slug,
                  status: "unknown",
                  summary: `Restriction status is unavailable for ${forestName}.`,
                  sourceUrl: null,
                  checkedAt: new Date().toISOString(),
                  cards: [],
                } satisfies FireRestrictionRecord);

              return {
                type: "Feature",
                id: feature?.attributes?.OBJECTID ?? `fire-restriction-${idx}`,
                geometry,
                properties: {
                  id: record.id,
                  agency: record.agency,
                  forestName: record.forestName,
                  region: record.region,
                  slug: record.slug,
                  status: record.status,
                  summary: record.summary,
                  sourceUrl: record.sourceUrl,
                  checkedAt: record.checkedAt,
                  orderCount: record.cards.length,
                  hasOrders: record.cards.length > 0,
                },
              };
            })
            .filter(Boolean);

          const blmFeatures = blmBoundaryFeatures
            .map((feature: any, idx: number) => {
              const geometry = arcGisGeometryToGeoJson(feature?.geometry);
              if (!geometry) return null;

              const attrs = feature?.attributes ?? {};
              const officeCode = typeof attrs?.ADM_UNIT_CD === "string" ? attrs.ADM_UNIT_CD.trim() : "";
              const officeNameRaw = typeof attrs?.ADMU_NAME === "string" ? attrs.ADMU_NAME.trim() : "";
              if (!officeCode || !officeNameRaw) return null;

              const officeName = titleCaseWords(officeNameRaw);
              const record =
                blmRecordMap[officeCode] ??
                ({
                  id: `blm:az:${officeCode.toLowerCase()}`,
                  agency: "BLM",
                  forestName: officeName,
                  region: "AZ",
                  slug: slugifyForestName(officeName),
                  status: "unknown",
                  summary: `Restriction status is unavailable for ${officeName}.`,
                  sourceUrl: BLM_AZ_RESTRICTIONS_URL,
                  checkedAt: new Date().toISOString(),
                  cards: [],
                } satisfies FireRestrictionRecord);

              return {
                type: "Feature",
                id: feature?.attributes?.OBJECTID ?? `blm-fire-restriction-${idx}`,
                geometry,
                properties: {
                  id: record.id,
                  agency: record.agency,
                  forestName: record.forestName,
                  region: record.region,
                  slug: record.slug,
                  status: record.status,
                  summary: record.summary,
                  sourceUrl: record.sourceUrl,
                  checkedAt: record.checkedAt,
                  orderCount: record.cards.length,
                  hasOrders: record.cards.length > 0,
                },
              };
            })
            .filter(Boolean);

          const blmOrWaFeatures = blmOrWaBoundaryFeatures
            .map((feature: any, idx: number) => {
              const geometry = arcGisGeometryToSimpleGeoJson(feature?.geometry);
              if (!geometry) return null;

              const attrs = feature?.attributes ?? {};
              const unitNameRaw = typeof attrs?.ADMU_NAME === "string" ? attrs.ADMU_NAME.trim() : "";
              const parentNameRaw = typeof attrs?.PARENT_NAME === "string" ? attrs.PARENT_NAME.trim() : "";
              if (!unitNameRaw) return null;

              const normalizedName = normalizeBlmUnitName(parentNameRaw || unitNameRaw);
              const fallbackName = titleCaseWords(unitNameRaw);
              const record =
                blmOrWaRecordMap[normalizedName] ??
                ({
                  id: `blm:orwa:${slugifyForestName(normalizedName || fallbackName)}`,
                  agency: "BLM",
                  forestName: fallbackName,
                  region: "ORWA",
                  slug: slugifyForestName(fallbackName),
                  status: "unknown",
                  summary: `Restriction status is unavailable for ${fallbackName}.`,
                  sourceUrl: BLM_ORWA_RESTRICTIONS_URL,
                  checkedAt: new Date().toISOString(),
                  cards: [],
                } satisfies FireRestrictionRecord);

              return {
                type: "Feature",
                id: feature?.attributes?.OBJECTID ?? `blm-orwa-fire-restriction-${idx}`,
                geometry,
                properties: {
                  id: record.id,
                  agency: record.agency,
                  forestName: record.forestName,
                  region: record.region,
                  slug: record.slug,
                  status: record.status,
                  summary: record.summary,
                  sourceUrl: record.sourceUrl,
                  checkedAt: record.checkedAt,
                  orderCount: record.cards.length,
                  hasOrders: record.cards.length > 0,
                },
              };
            })
            .filter(Boolean);

          const minnesotaFeatures = minnesotaCountyFeatures
            .map((feature: any, idx: number) => {
              const geometry = arcGisGeometryToGeoJson(feature?.geometry);
              if (!geometry) return null;

              const attrs = feature?.attributes ?? {};
              const countyNameRaw = typeof attrs?.NAME === "string" ? attrs.NAME.trim() : "";
              if (!countyNameRaw) return null;

              const normalizedCountyName = normalizeMinnesotaCountyName(countyNameRaw);
              const displayName = countyNameRaw.endsWith("County") ? countyNameRaw : `${countyNameRaw} County`;
              const record =
                minnesotaRecordMap[normalizedCountyName] ??
                ({
                  id: `mndnr:${slugifyForestName(displayName)}`,
                  agency: "MN DNR",
                  forestName: displayName,
                  region: "MN",
                  slug: slugifyForestName(displayName),
                  status: "none",
                  summary: summarizeMinnesotaRestrictionStatus("none", displayName),
                  sourceUrl: MINNESOTA_DNR_RESTRICTIONS_URL,
                  checkedAt: new Date().toISOString(),
                  cards: [],
                } satisfies FireRestrictionRecord);

              return {
                type: "Feature",
                id: feature?.attributes?.OBJECTID ?? `mn-fire-restriction-${idx}`,
                geometry,
                properties: {
                  id: record.id,
                  agency: record.agency,
                  forestName: record.forestName,
                  region: record.region,
                  slug: record.slug,
                  status: record.status,
                  summary: record.summary,
                  sourceUrl: record.sourceUrl,
                  checkedAt: record.checkedAt,
                  orderCount: record.cards.length,
                  hasOrders: record.cards.length > 0,
                },
              };
            })
            .filter(Boolean);

          return new Response(
            JSON.stringify({
              type: "FeatureCollection",
              features: [...usfsFeatures, ...blmFeatures, ...blmOrWaFeatures, ...minnesotaFeatures],
              fetchedAtIso: new Date().toISOString(),
            }),
            {
              status: 200,
              headers: { "content-type": "application/json; charset=utf-8" },
            },
          );
        },
      });
    }

    if (url.pathname === "/api/fire/context" || url.pathname === "/v1/fire/context") {
      const lat = Number(url.searchParams.get("lat"));
      const lon = Number(url.searchParams.get("lon"));

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return new Response(JSON.stringify({ ok: false, error: "lat and lon are required numbers" }), {
          status: 400,
          headers: withCors({ "content-type": "application/json; charset=utf-8" }),
        });
      }

      const cacheKey = buildFireContextCacheKey(url, lat, lon);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: FIRE_CONTEXT_TTL_SECONDS,
        staleSeconds: FIRE_CONTEXT_STALE_SECONDS,
        fetchUpstream: async () => {
          const [fireDangerResult, fireWeatherResult] = await Promise.allSettled([
            fetchFireDangerContext(lat, lon),
            fetchFireWeatherContext(lat, lon),
          ]);
          const forest = await resolveNearbyForest(lat, lon).catch(() => null);
          const restrictions =
            forest?.region && forest?.slug
              ? await fetchForestRestrictionsCached(ctx, {
                  name: forest.name,
                  region: forest.region,
                  slug: forest.slug,
                }).catch(() => ({
                  supported: false as const,
                  inEffect: null,
                  summary: null,
                  source: null,
                  cards: [],
                }))
              : {
                  supported: false as const,
                  inEffect: null,
                  summary: null,
                  source: null,
                  cards: [],
                };

          const fireDanger =
            fireDangerResult.status === "fulfilled"
              ? fireDangerResult.value
              : {
                  classValue: null,
                  classLabel: null,
                  summary: null,
                  rawLabel: null,
                  source: "USDA Forest Service Wildfire Hazard Potential",
                };

          const fireWeather =
            fireWeatherResult.status === "fulfilled"
              ? fireWeatherResult.value
              : {
                  redFlagWarning: false,
                  fireWeatherWatch: false,
                  alertCount: 0,
                  headlines: [],
                  summary: null,
                  source: "NOAA / NWS Alerts API",
                  alertEvents: [] as string[],
                };

          const payload: FireContextPayload = {
            ok: true,
            lat,
            lon,
            fetchedAtIso: new Date().toISOString(),
            forest: forest
              ? {
                  name: forest.name,
                  region: forest.region,
                  slug: forest.slug,
                }
              : null,
            fireDanger: {
              classValue: fireDanger.classValue,
              classLabel: fireDanger.classLabel,
              summary: fireDanger.summary,
              source: fireDanger.source,
            },
            fireWeather: {
              redFlagWarning: fireWeather.redFlagWarning,
              fireWeatherWatch: fireWeather.fireWeatherWatch,
              alertCount: fireWeather.alertCount,
              headlines: fireWeather.headlines,
              summary: fireWeather.summary,
              source: fireWeather.source,
            },
            restrictions: {
              supported: restrictions.supported,
              inEffect: restrictions.inEffect,
              summary: restrictions.summary,
              source: restrictions.source,
              cards: restrictions.cards,
            },
            diagnostics: {
              hazardRaw: fireDanger.rawLabel,
              alertEvents: fireWeather.alertEvents,
            },
          };

          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        },
      });
    }

    if (url.pathname === "/api/nasa/apod") {
      const date = url.searchParams.get("date");
      const upstream = new URL("https://api.nasa.gov/planetary/apod");
      if (date) upstream.searchParams.set("date", date);
      upstream.searchParams.set("api_key", env.NASA_API_KEY);

      const res = await fetch(upstream.toString());
      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=21600",
        }),
      });
    }

    if (url.pathname.startsWith("/api/nasa/donki/")) {
      const donkiPath = url.pathname.replace("/api/nasa/donki/", "");
      const upstream = new URL(`https://api.nasa.gov/DONKI/${donkiPath}`);
      url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
      upstream.searchParams.set("api_key", env.NASA_API_KEY);
      const cacheKey = buildDonkiCacheKey(url, donkiPath);

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: DONKI_TTL_SECONDS,
        staleSeconds: DONKI_STALE_SECONDS,
        fetchUpstream: async () => {
          try {
            return await fetchDonkiUpstream(upstream);
          } catch (err: any) {
            return new Response(
              JSON.stringify({
                ok: false,
                error: "DONKI upstream fetch failed",
                detail: err instanceof Error ? err.message : String(err ?? "unknown error"),
                path: donkiPath,
              }),
              {
                status: 502,
                headers: {
                  "content-type": "application/json; charset=utf-8",
                },
              },
            );
          }
        },
        tag: `donki:${donkiPath}`,
      });
    }

    if (url.pathname.startsWith("/api/ncei/")) {
      const subpath = url.pathname.replace("/api/ncei", "");
      const upstream = `https://www.ncei.noaa.gov/cdo-web/api/v2${subpath}?${url.searchParams.toString()}`;

      const res = await fetch(upstream, {
        headers: { token: env.NOAA_NCEI_TOKEN, accept: "application/json" },
      });

      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=3600",
        }),
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        routes: [
          "/land-extremes?unit=F|C",
          "/api/alerts/global?lat=##&lon=##&units=imperial|metric",
          "/api/marine/conditions?lat=##&lon=##",
          "/api/fire/hotspots?west=##&south=##&east=##&north=##&days=1",
          "/api/current?lat=##&lon=##&units=imperial|metric",
          "/api/openmeteo/hourly?lat=..,..&lon=..,..&hourly=...&timezone=auto&units=imperial|metric",
          "/api/almanac/climo?lat=##&lon=##",
          "/api/astro/location?lat=##&lon=##&placeName=Current%20location",
          "/api/astro/inspect?lat=##&lon=##&hour=0",
          "/api/astro/skyscore-grid?west=..&south=..&east=..&north=..&zoom=7&hour=0&w=160&h=160&includePoints=1&mode=regional&density=auto",
          "/v1/radar/info",
          "/v1/radar/wms?product=N0Q|N0B|N0Z&bbox=minx,miny,maxx,maxy&width=1024&height=1024&time=ISO",
          "/v2/radar/wms?product=N0Q|N0B|N0Z&bbox=minx,miny,maxx,maxy&width=1024&height=1024&time=ISO&shrink=0.85&dpr=2&fmt=png32",
          "/v1/radar/rainviewer/tiles/{z}/{x}/{y}.png?ts=UNIX&size=512&color=2&smooth=1&snow=1",
          "/v1/radar/iem/ridge/tiles/{z}/{x}/{y}.png?radar=TLX&product=N0Q&ts=0",
          "/api/nasa/apod?date=YYYY-MM-DD",
          "/api/nasa/donki/<TYPE>?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD",
          "/api/ncei/*",
        ],
      }),
      { headers: withCors({ "content-type": "application/json" }) },
    );
  },
};
