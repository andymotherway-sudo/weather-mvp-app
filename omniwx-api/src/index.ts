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

export interface Env {
  NOAA_NCEI_TOKEN: string;
  NASA_API_KEY: string;
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
  group?: "airport" | "notable" | "capital" | "city";
};

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
    fetchedAtIso: string;
    source: "open-meteo";
    ttlSeconds: number;
    pointsVersion: string;
  };
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

type CurrentResponse = {
  ok: true;
  source: "open-meteo";
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
  const cache = caches.default;
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

/* =============================================================================
 * Knobs
 * ============================================================================= */

const LAND_MAX_ROWS = 10;
const LAND_GLOBAL_ROWS = 8;

const LAND_TTL_SECONDS = 600;
const LAND_STALE_SECONDS = 6 * 3600;

const CURRENT_TTL_SECONDS = 60;
const CURRENT_STALE_SECONDS = 30 * 60;

const OM_HOURLY_TTL_SECONDS = 600;
const OM_HOURLY_STALE_SECONDS = 6 * 3600;

const ASTRO_TTL_SECONDS = 600;
const ASTRO_STALE_SECONDS = 6 * 3600;

const RADAR_TILE_TTL_SECONDS = 900;
const RADAR_TILE_STALE_SECONDS = 24 * 3600;
const WMS_TTL_SECONDS = 300;
const WMS_STALE_SECONDS = 24 * 3600;

const OPEN_METEO_TIMEOUT_MS = 8500;
const OPEN_METEO_BATCH_SIZE = 75;

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

function fmtTemp(v: number | null | undefined, unit: Unit) {
  if (v == null || !Number.isFinite(v)) return "—";
  return unit === "F" ? `${v.toFixed(1)} °F` : `${v.toFixed(1)} °C`;
}

function fmtWind(v: number | null | undefined, unit: Unit) {
  if (v == null || !Number.isFinite(v)) return "—";
  return unit === "F" ? `${v.toFixed(0)} mph` : `${v.toFixed(0)} km/h`;
}

function fmtPrecip(v: number | null | undefined, unit: Unit) {
  if (v == null || !Number.isFinite(v)) return "—";
  return unit === "F" ? `${v.toFixed(2)} in` : `${v.toFixed(1)} mm`;
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
  const usRows = rows.filter((r) => r.badge !== "Global");
  const globalRows = rows.filter((r) => r.badge === "Global");

  const sortDesc = <T>(arr: T[], get: (x: T) => number) => arr.slice().sort((a, b) => get(b) - get(a));
  const sortAsc = <T>(arr: T[], get: (x: T) => number) => arr.slice().sort((a, b) => get(a) - get(b));

  const hotSorted = dedupeByBaseName(
    sortDesc(usRows.filter((r) => r.t != null && Number.isFinite(r.t)), (r) => r.t as number),
  ).slice(0, LAND_MAX_ROWS);

  const coldSorted = dedupeByBaseName(
    sortAsc(usRows.filter((r) => r.t != null && Number.isFinite(r.t)), (r) => r.t as number),
  ).slice(0, LAND_MAX_ROWS);

  const windSorted = dedupeByBaseName(
    sortDesc(
      usRows.filter((r) => (r.gust ?? r.wind) != null && Number.isFinite((r.gust ?? r.wind) as number)),
      (r) => (r.gust ?? r.wind) as number,
    ),
  ).slice(0, LAND_MAX_ROWS);

  const rainSorted = dedupeByBaseName(
    sortDesc(usRows.filter((r) => r.precip != null && Number.isFinite(r.precip)), (r) => r.precip as number),
  ).slice(0, LAND_MAX_ROWS);

  const globalHotSorted = dedupeByBaseName(
    sortDesc(globalRows.filter((r) => r.t != null && Number.isFinite(r.t)), (r) => r.t as number),
  ).slice(0, LAND_GLOBAL_ROWS);

  const globalColdSorted = dedupeByBaseName(
    sortAsc(globalRows.filter((r) => r.t != null && Number.isFinite(r.t)), (r) => r.t as number),
  ).slice(0, LAND_GLOBAL_ROWS);

  const globalRainSorted = dedupeByBaseName(
    sortDesc(globalRows.filter((r) => r.precip != null && Number.isFinite(r.precip)), (r) => r.precip as number),
  ).slice(0, LAND_GLOBAL_ROWS);

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
    title: "Hottest (Current)",
    subtitle: "US airports + notable locations",
    items: hotSorted.map((r) => toExtreme("hot", r, fmtTemp(r.t, unit), "Hottest (current)")),
  };

  const gCold: LandGroup = {
    title: "Coldest (Current)",
    subtitle: "US airports + notable locations",
    items: coldSorted.map((r) => toExtreme("cold", r, fmtTemp(r.t, unit), "Coldest (current)")),
  };

  const gWind: LandGroup = {
    title: "Windiest (Current Gust)",
    subtitle: "US airports + notable locations",
    items: windSorted.map((r) =>
      toExtreme(
        "wind",
        r,
        fmtWind((r.gust ?? r.wind) ?? null, unit),
        r.gust != null ? "Strongest gust (current)" : "Strongest wind (current)",
      ),
    ),
  };

  const gRain: LandGroup = {
    title: "Wettest (Current)",
    subtitle: "Timestep precip right now (not 24h total)",
    items: rainSorted.map((r) => toExtreme("rain", r, fmtPrecip(r.precip, unit), "Wettest (current)")),
  };

  const gGlobalHot: LandGroup = {
    title: "Global Hottest (Current)",
    subtitle: "Curated iconic locations (deserts, tropics, etc.)",
    items: globalHotSorted.map((r) => toExtreme("hot", r, fmtTemp(r.t, unit), "Global hottest (current)")),
  };

  const gGlobalCold: LandGroup = {
    title: "Global Coldest (Current)",
    subtitle: "Curated iconic locations (polar stations, high latitude, etc.)",
    items: globalColdSorted.map((r) => toExtreme("cold", r, fmtTemp(r.t, unit), "Global coldest (current)")),
  };

  const gGlobalRain: LandGroup = {
    title: "Global Wettest (Current)",
    subtitle: "Curated iconic locations (monsoon / rainforest zones)",
    items: globalRainSorted.map((r) => toExtreme("rain", r, fmtPrecip(r.precip, unit), "Global wettest (current)")),
  };

  const heroes: Partial<Record<LandExtremeKind, LandExtreme | null>> = {
    hot: gHot.items[0] ?? null,
    cold: gCold.items[0] ?? null,
    wind: gWind.items[0] ?? null,
    rain: gRain.items[0] ?? null,
  };

  const updatedAt = rows.map((r) => r.time).filter(Boolean).sort().slice(-1)[0] ?? null;

  return { heroes, groups: [gHot, gCold, gWind, gRain, gGlobalHot, gGlobalCold, gGlobalRain], updatedAt };
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
  if (!hourly) return { ok: false as const, error: "hourly is required" };

  const tz = url.searchParams.get("timezone") ?? url.searchParams.get("tz") ?? "auto";
  const units = parseUnits(url.searchParams.get("units"));

  const temperatureUnit = units === "imperial" ? "fahrenheit" : "celsius";
  const windUnit = units === "imperial" ? "mph" : "kmh";
  const precipUnit = units === "imperial" ? "inch" : "mm";

  const upstream = new URL("https://api.open-meteo.com/v1/forecast");
  upstream.searchParams.set("latitude", lats.join(","));
  upstream.searchParams.set("longitude", lons.join(","));
  upstream.searchParams.set("hourly", hourly);
  upstream.searchParams.set("timezone", tz);
  upstream.searchParams.set("temperature_unit", temperatureUnit);
  upstream.searchParams.set("wind_speed_unit", windUnit);
  upstream.searchParams.set("precipitation_unit", precipUnit);

  const forecastDays = url.searchParams.get("forecast_days");
  if (forecastDays) upstream.searchParams.set("forecast_days", forecastDays);

  return { ok: true as const, upstreamUrl: upstream.toString(), lats, lons, units };
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
  keyUrl.pathname = "/__cache__/astro/location/v4";
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

function computeAerosolScore01Canonical(_p: SkyImagePoint) {
  return 0.75;
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
  const next = new URL(reqUrl.origin + "/__cache__/astro/skyscore-grid/v3");
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
  const next = new URL(reqUrl.origin + "/__cache__/astro/inspect/v1");
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

          const forecastUrl =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${encodeURIComponent(String(lat))}` +
            `&longitude=${encodeURIComponent(String(lon))}` +
            `&hourly=${encodeURIComponent(hourly)}` +
            `&daily=${encodeURIComponent(daily)}` +
            `&forecast_days=2` +
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

          const todayDate = dayTimes[0];
          const tomorrowDate = dayTimes[1] ?? dayTimes[0];

          let moonToday;
          let moonTomorrow;
          let sunToday;
          let sunTomorrow;

          try {
            [moonToday, moonTomorrow, sunToday, sunTomorrow] = await Promise.all([
              fetchMoonDay(lat, lon, todayDate, offset),
              fetchMoonDay(lat, lon, tomorrowDate, offset),
              fetchSunDay(lat, lon, todayDate, offset),
              fetchSunDay(lat, lon, tomorrowDate, offset),
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
            moonDays: [moonToday, moonTomorrow],
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
              index: null,
              label: null,
              source: null,
            },
            diagnostics: {
              moonSource: "metno sunrise 3.0",
              siteSource: siteLookup.source,
              aerosolSource: "pending",
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

      const baseW = clampInt(Number(url.searchParams.get("width") || "1024"), 256, 2048);
      const baseH = clampInt(Number(url.searchParams.get("height") || "1024"), 256, 2048);

      const width = clampInt(Math.round(baseW * dpr), 256, 2048);
      const height = clampInt(Math.round(baseH * dpr), 256, 2048);

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

          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }

        const txt = await res.text().catch(() => "");

        if (res.status === 429) {
          const fbCtrl = new AbortController();
          const fbTimer = setTimeout(() => fbCtrl.abort(), OPEN_METEO_TIMEOUT_MS);

          try {
            const fbRes = await fetch(fallbackUpstream, { signal: fbCtrl.signal });

            if (!fbRes.ok) {
              const fbTxt = await fbRes.text().catch(() => "");
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: "Upstream rate limited and fallback failed",
                  status: fbRes.status,
                  body: fbTxt.slice(0, 300),
                }),
                { status: 502, headers: { "content-type": "application/json; charset=utf-8" } },
              );
            }

            const fbJson = (await fbRes.json()) as OpenMeteoHourlyFallbackResponse;
            const h = fbJson?.hourly ?? {};
            const idx = pickClosestHourlyIndex(h.time);

            if (idx < 0) {
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: "Upstream rate limited and fallback missing hourly data",
                }),
                { status: 502, headers: { "content-type": "application/json; charset=utf-8" } },
              );
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

            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: {
                "content-type": "application/json; charset=utf-8",
                "X-Omni-Current-Fallback": "hourly",
              },
            });
          } finally {
            clearTimeout(fbTimer);
          }
        }

        return new Response(
          JSON.stringify({ ok: false, error: "Upstream error", status: res.status, body: txt.slice(0, 200) }),
          { status: 502, headers: { "content-type": "application/json; charset=utf-8" } },
        );
      } finally {
        clearTimeout(t);
      }
    },
  });
}

    if (url.pathname === "/land-extremes") {
      const unit: Unit = url.searchParams.get("unit") === "C" ? "C" : "F";

      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.pathname = "/__cache__/land-extremes";
      cacheKeyUrl.searchParams.set("unit", unit);
      cacheKeyUrl.searchParams.set("v", LAND_POINTS_VERSION);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      return swrFetchJson(request, ctx, {
        cacheKey,
        ttlSeconds: LAND_TTL_SECONDS,
        staleSeconds: LAND_STALE_SECONDS,
        fetchUpstream: async () => {
          const fetchedAtIso = new Date().toISOString();
          const pts = (LAND_POINTS as unknown as LandPoint[]) ?? [];
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

          for (const c of chunks) {
            const results = await fetchOpenMeteoCurrentBatch(c, unit);
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

          const { heroes, groups, updatedAt } = buildLandExtremes(unit, rows);
          const pointsUs = rows.filter((r) => r.badge !== "Global").length;
          const pointsGlobal = rows.filter((r) => r.badge === "Global").length;

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
              fetchedAtIso,
              source: "open-meteo",
              ttlSeconds: LAND_TTL_SECONDS,
              pointsVersion: LAND_POINTS_VERSION,
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

      const res = await fetch(upstream.toString(), { headers: { accept: "application/json" } });

      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=1800",
        }),
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
          "/api/current?lat=##&lon=##&units=imperial|metric",
          "/api/openmeteo/hourly?lat=..,..&lon=..,..&hourly=...&timezone=auto&units=imperial|metric",
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