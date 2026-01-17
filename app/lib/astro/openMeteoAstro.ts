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
};

type CacheEntry = { fetchedAt: number; inputs: AstroInputs[] };
const CACHE = new Map<string, CacheEntry>();

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function keyFor(bounds: { north: number; south: number; east: number; west: number }, hourIso: string, stepDeg: number) {
  // round bounds so tiny pans don’t refetch
  const r = (x: number) => Math.round(x * 20) / 20; // 0.05°
  return `astro:${r(bounds.north)}:${r(bounds.south)}:${r(bounds.east)}:${r(bounds.west)}:${hourIso}:${stepDeg}`;
}

export function buildGrid(bounds: { north: number; south: number; east: number; west: number }, stepDeg: number) {
  const pts: Array<{ lat: number; lon: number }> = [];
  const latMin = Math.min(bounds.south, bounds.north);
  const latMax = Math.max(bounds.south, bounds.north);
  const lonMin = Math.min(bounds.west, bounds.east);
  const lonMax = Math.max(bounds.west, bounds.east);

  for (let lat = latMin; lat <= latMax; lat += stepDeg) {
    for (let lon = lonMin; lon <= lonMax; lon += stepDeg) {
      pts.push({ lat, lon });
    }
  }
  return pts;
}

export async function fetchAstroInputsGrid(args: {
  bounds: { north: number; south: number; east: number; west: number };
  hourIso: string;           // choose “now” hour in local tz later; MVP can use current ISO
  stepDeg?: number;          // e.g. 0.5° wide, 0.25° local
  ttlMs?: number;            // caching
}): Promise<AstroInputs[]> {
  const stepDeg = args.stepDeg ?? 0.5;
  const ttlMs = args.ttlMs ?? 10 * 60_000;

  const k = keyFor(args.bounds, args.hourIso, stepDeg);
  const now = Date.now();
  const cached = CACHE.get(k);
  if (cached && now - cached.fetchedAt < ttlMs) return cached.inputs;

  const pts = buildGrid(args.bounds, stepDeg);

  // Open-Meteo supports multiple coords via repeated lat/lon in one request using "latitude=..,..&longitude=..,.."
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
  ].join(',');

  // timezone=auto is fine; we’ll just pick the first returned hour matching hourIso later if you want.
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(lats)}` +
    `&longitude=${encodeURIComponent(lons)}` +
    `&hourly=${encodeURIComponent(hourly)}` +
    `&timezone=auto`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo astro grid failed: ${res.status}`);

  const data = await res.json();

  // Multi-location response is an array (Open-Meteo does this); keep parser permissive:
  const rows: any[] = Array.isArray(data) ? data : [data];

  const out: AstroInputs[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Pick the first hour for MVP (next step: find matching hourIso)
    const idx = 0;

    const h = r?.hourly ?? {};
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
      windMps: pick('wind_speed_10m'),  // Open-Meteo units depend on settings; you can force m/s later
      gustMps: pick('wind_gusts_10m'),
    });
  }

  CACHE.set(k, { fetchedAt: now, inputs: out });
  return out;
}
