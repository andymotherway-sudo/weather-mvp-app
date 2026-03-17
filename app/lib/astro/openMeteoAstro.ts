// app/lib/astro/openMeteoAstro.ts
export type AstroInputs = {
  lat: number;
  lon: number;

  cloudLow: number | null;   // %
  cloudMid: number | null;   // %
  cloudHigh: number | null;  // %
  cloudTotal: number | null; // %

  visibilityM: number | null;
  windMps: number | null;
  gustMps: number | null;

  humidityPct: number | null;

  // Site / environment enrichments
  elevationM: number | null;
  aerosolIndex: number | null; // 0..1 where higher = worse
  bortleClass: number | null;  // 1..9 where higher = brighter sky
};

type CacheEntry = { fetchedAt: number; inputs: AstroInputs[] };
const CACHE = new Map<string, CacheEntry>();

function keyFor(
  bounds: { north: number; south: number; east: number; west: number },
  hourIso: string,
  stepDeg: number
) {
  // round bounds so tiny pans don’t refetch
  const r = (x: number) => Math.round(x * 20) / 20; // 0.05°
  return `astro:${r(bounds.north)}:${r(bounds.south)}:${r(bounds.east)}:${r(bounds.west)}:${hourIso}:${stepDeg}`;
}

export function buildGrid(
  bounds: { north: number; south: number; east: number; west: number },
  stepDeg: number
) {
  const pts: Array<{ lat: number; lon: number }> = [];
  const latMin = Math.min(bounds.south, bounds.north);
  const latMax = Math.max(bounds.south, bounds.north);
  const lonMin = Math.min(bounds.west, bounds.east);
  const lonMax = Math.max(bounds.west, bounds.east);

  for (let lat = latMin; lat <= latMax + stepDeg * 0.25; lat += stepDeg) {
    for (let lon = lonMin; lon <= lonMax + stepDeg * 0.25; lon += stepDeg) {
      pts.push({
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      });
    }
  }

  return pts;
}

function findBestHourIndex(times: unknown, targetIso: string) {
  if (!Array.isArray(times) || !times.length) return 0;

  const target = new Date(targetIso).getTime();
  if (!Number.isFinite(target)) return 0;

  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(String(times[i])).getTime();
    if (!Number.isFinite(t)) continue;

    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  return bestIdx;
}

export async function fetchAstroInputsGrid(args: {
  bounds: { north: number; south: number; east: number; west: number };
  hourIso: string;
  stepDeg?: number;
  ttlMs?: number;
}): Promise<AstroInputs[]> {
  const stepDeg = args.stepDeg ?? 0.5;
  const ttlMs = args.ttlMs ?? 10 * 60_000;

  const k = keyFor(args.bounds, args.hourIso, stepDeg);
  const now = Date.now();
  const cached = CACHE.get(k);
  if (cached && now - cached.fetchedAt < ttlMs) return cached.inputs;

  const pts = buildGrid(args.bounds, stepDeg);

  const lats = pts.map((p) => p.lat.toFixed(3)).join(',');
  const lons = pts.map((p) => p.lon.toFixed(3)).join(',');

  const hourly = [
    'cloud_cover',
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'visibility',
    'wind_speed_10m',
    'wind_gusts_10m',
    'relative_humidity_2m',
  ].join(',');

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lats)}` +
    `&longitude=${encodeURIComponent(lons)}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&wind_speed_unit=ms` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo astro grid failed: ${res.status}`);
  }

  const data = await res.json();

  // Multi-location response is usually an array; keep parser permissive
  const rows: any[] = Array.isArray(data) ? data : [data];

  const out: AstroInputs[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const h = r?.hourly ?? {};
    const idx = findBestHourIndex(h?.time, args.hourIso);

    const pick = (name: string) => {
      const arr = h?.[name];
      const v = Array.isArray(arr) ? arr[idx] : null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    out.push({
      lat: pts[i]?.lat ?? Number(r?.latitude),
      lon: pts[i]?.lon ?? Number(r?.longitude),

      cloudTotal: pick('cloud_cover'),
      cloudLow: pick('cloud_cover_low'),
      cloudMid: pick('cloud_cover_mid'),
      cloudHigh: pick('cloud_cover_high'),

      visibilityM: pick('visibility'),
      windMps: pick('wind_speed_10m'),
      gustMps: pick('wind_gusts_10m'),

      humidityPct: pick('relative_humidity_2m'),

      // Ready for future enrichments:
      elevationM: null,
      aerosolIndex: null,
      bortleClass: null,
    });
  }

  CACHE.set(k, { fetchedAt: now, inputs: out });
  return out;
}