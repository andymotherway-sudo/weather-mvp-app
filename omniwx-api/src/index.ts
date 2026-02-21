// src/index.ts
import { LAND_POINTS, LAND_POINTS_VERSION } from "./landPoints.generated";

export interface Env {
  NOAA_NCEI_TOKEN: string;
  NASA_API_KEY: string;
}

type Unit = "F" | "C";
type LandExtremeKind = "hot" | "cold" | "wind" | "rain";

/**
 * Keep this local so index.ts doesn't depend on any non-generated file.
 * landPoints.generated.ts should export LAND_POINTS (array) + LAND_POINTS_VERSION (string).
 */
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
type OpenMeteoBatchResponse = OpenMeteoBatchItem[] | { results: OpenMeteoBatchItem[] } | unknown;

/**
 * CORS helpers (kept consistent with your current worker)
 */
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

/**
 * /land-extremes tuning knobs
 */
const LAND_MAX_ROWS = 10;
const LAND_GLOBAL_ROWS = 8;
const LAND_WORKER_TTL_SECONDS = 600; // 10 min
const OPEN_METEO_TIMEOUT_MS = 8500;

// Key: avoid Cloudflare subrequest limits by batching Open-Meteo requests.
const OPEN_METEO_BATCH_SIZE = 75; // tune 50–100 (smaller = safer, more requests)

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
  // Open-Meteo "current precipitation" is timestep amount, not 24h total.
  return unit === "F" ? `${v.toFixed(2)} in` : `${v.toFixed(1)} mm`;
}

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
    `&timezone=UTC`
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

function chunk<T>(arr: T[], size: number): T[][] {
  const s = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
  return out;
}

/**
 * Dedupe names like:
 * - "Honolulu" vs "Honolulu (Capital)"
 * - "Seattle (SEA)" vs "Seattle"
 *
 * This is dedupe within a ranking list so the same place doesn't show twice.
 */
function baseNameKey(name: string) {
  let s = String(name ?? "").trim().toLowerCase();

  // Strip common suffixes
  s = s.replace(/\s*\(capital\)\s*$/i, "");
  s = s.replace(/\s*\([a-z0-9]{3}\)\s*$/i, ""); // airport IATA suffix

  // Normalize punctuation/spacing
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

  const sortDesc = <T>(arr: T[], get: (x: T) => number) =>
    arr.slice().sort((a, b) => get(b) - get(a));
  const sortAsc = <T>(arr: T[], get: (x: T) => number) =>
    arr.slice().sort((a, b) => get(a) - get(b));

  // ---------- US ----------
  const hotSorted = dedupeByBaseName(
    sortDesc(
      usRows.filter((r) => r.t != null && Number.isFinite(r.t)),
      (r) => r.t as number,
    ),
  ).slice(0, LAND_MAX_ROWS);

  const coldSorted = dedupeByBaseName(
    sortAsc(
      usRows.filter((r) => r.t != null && Number.isFinite(r.t)),
      (r) => r.t as number,
    ),
  ).slice(0, LAND_MAX_ROWS);

  const windSorted = dedupeByBaseName(
    sortDesc(
      usRows.filter((r) => (r.gust ?? r.wind) != null && Number.isFinite((r.gust ?? r.wind) as number)),
      (r) => (r.gust ?? r.wind) as number,
    ),
  ).slice(0, LAND_MAX_ROWS);

  const rainSorted = dedupeByBaseName(
    sortDesc(
      usRows.filter((r) => r.precip != null && Number.isFinite(r.precip)),
      (r) => r.precip as number,
    ),
  ).slice(0, LAND_MAX_ROWS);

  // ---------- Global (you asked: hottest, coldest, wetter) ----------
  const globalHotSorted = dedupeByBaseName(
    sortDesc(
      globalRows.filter((r) => r.t != null && Number.isFinite(r.t)),
      (r) => r.t as number,
    ),
  ).slice(0, LAND_GLOBAL_ROWS);

  const globalColdSorted = dedupeByBaseName(
    sortAsc(
      globalRows.filter((r) => r.t != null && Number.isFinite(r.t)),
      (r) => r.t as number,
    ),
  ).slice(0, LAND_GLOBAL_ROWS);

  const globalRainSorted = dedupeByBaseName(
    sortDesc(
      globalRows.filter((r) => r.precip != null && Number.isFinite(r.precip)),
      (r) => r.precip as number,
    ),
  ).slice(0, LAND_GLOBAL_ROWS);

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
    updatedAt: r.time ?? null,
    valueText,
    subtitle,
    badge: r.badge,
    kind,
  });

  // US groups
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

  // Global groups (distinct — what you asked for)
  const gGlobalHot: LandGroup = {
    title: "Global Hottest (Current)",
    subtitle: "Curated iconic locations (deserts, tropics, etc.)",
    items: globalHotSorted.map((r) => toExtreme("hot", r, fmtTemp(r.t, unit), "Global hottest (current)")),
  };
  const gGlobalCold: LandGroup = {
    title: "Global Coldest (Current)",
    subtitle: "Curated iconic locations (polar stations, high latitude, etc.)",
    items: globalColdSorted.map((r) =>
      toExtreme("cold", r, fmtTemp(r.t, unit), "Global coldest (current)"),
    ),
  };
  const gGlobalRain: LandGroup = {
    title: "Global Wettest (Current)",
    subtitle: "Curated iconic locations (monsoon / rainforest zones)",
    items: globalRainSorted.map((r) =>
      toExtreme("rain", r, fmtPrecip(r.precip, unit), "Global wettest (current)"),
    ),
  };

  // Heroes remain “overall US-based leaders” like before (top of US lists).
  // If you want heroes split by US/Global later, we can extend schema.
  const heroes: Partial<Record<LandExtremeKind, LandExtreme | null>> = {
    hot: gHot.items[0] ?? null,
    cold: gCold.items[0] ?? null,
    wind: gWind.items[0] ?? null,
    rain: gRain.items[0] ?? null,
  };

  const updatedAt =
    rows
      .map((r) => r.time)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? null;

  return {
    heroes,
    groups: [gHot, gCold, gWind, gRain, gGlobalHot, gGlobalCold, gGlobalRain],
    updatedAt,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: withCors({}) });
    }

    // ==========================
    // Land Extremes endpoint
    // ==========================
    if (url.pathname === "/land-extremes") {
      const unit: Unit = url.searchParams.get("unit") === "C" ? "C" : "F";

      // Edge cache key should vary on unit + points version (from generated file).
      const cache = caches.default;
      const cacheKeyUrl = new URL(request.url);
      cacheKeyUrl.searchParams.set("unit", unit);
      cacheKeyUrl.searchParams.set("v", LAND_POINTS_VERSION);
      const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });

      const cached = await cache.match(cacheKey);
      if (cached) {
        return new Response(cached.body, {
          status: cached.status,
          headers: withCors(Object.fromEntries(cached.headers.entries())),
        });
      }

      const fetchedAtIso = new Date().toISOString();

      // ---- BATCHED fan-out (prevents "Too many subrequests") ----
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
      // ----------------------------------------------------------

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
          ttlSeconds: LAND_WORKER_TTL_SECONDS,
          pointsVersion: LAND_POINTS_VERSION,
        },
      };

      const res = new Response(JSON.stringify(payload), {
        status: 200,
        headers: withCors({
          "content-type": "application/json; charset=utf-8",
          "cache-control": `public, max-age=${LAND_WORKER_TTL_SECONDS}`,
        }),
      });

      await cache.put(cacheKey, res.clone());
      return res;
    }

    // ==========================
    // EXISTING: NASA APOD endpoint
    // ==========================
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

    // ==========================
    // EXISTING: NASA DONKI proxy
    // ==========================
    if (url.pathname.startsWith("/api/nasa/donki/")) {
      const donkiPath = url.pathname.replace("/api/nasa/donki/", "");
      const upstream = new URL(`https://api.nasa.gov/DONKI/${donkiPath}`);

      url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));
      upstream.searchParams.set("api_key", env.NASA_API_KEY);

      const res = await fetch(upstream.toString(), {
        headers: { accept: "application/json" },
      });

      return new Response(res.body, {
        status: res.status,
        headers: withCors({
          "content-type": res.headers.get("content-type") || "application/json",
          "cache-control": "public, max-age=0, s-maxage=1800",
        }),
      });
    }

    // ==========================
    // EXISTING: NOAA NCEI proxy
    // ==========================
    if (url.pathname.startsWith("/api/ncei/")) {
      const subpath = url.pathname.replace("/api/ncei", "");
      const upstream = `https://www.ncei.noaa.gov/cdo-web/api/v2${subpath}?${url.searchParams.toString()}`;

      const res = await fetch(upstream, {
        headers: {
          token: env.NOAA_NCEI_TOKEN,
          accept: "application/json",
        },
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
          "/api/nasa/apod?date=YYYY-MM-DD",
          "/api/nasa/donki/<TYPE>?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD  (TYPE: FLR|CME|SEP|GST)",
          "/api/ncei/*",
        ],
      }),
      { headers: withCors({ "content-type": "application/json" }) },
    );
  },
};