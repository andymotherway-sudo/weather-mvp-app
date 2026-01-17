// app/lib/aurora/ovation.ts
export type OvationPoint = { lat: number; lon: number; prob: number };

type Cache = { fetchedAt: number; points: OvationPoint[] };
const CACHE: { cur: Cache | null } = { cur: null };

const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export async function fetchOvationPoints(args?: { ttlMs?: number }): Promise<OvationPoint[]> {
  const ttlMs = args?.ttlMs ?? 2 * 60_000;
  const now = Date.now();

  if (CACHE.cur && now - CACHE.cur.fetchedAt < ttlMs) return CACHE.cur.points;

  const res = await fetch(OVATION_URL);
  if (!res.ok) throw new Error(`OVATION fetch failed: ${res.status}`);

  const data = await res.json();
  const pts: OvationPoint[] = [];

  // Case 1: array of objects [{lat, lon, prob}, ...]
  if (Array.isArray(data)) {
    for (const row of data) {
      const lat = Number(row?.lat ?? row?.latitude);
      const lon = Number(row?.lon ?? row?.longitude);
      const prob = Number(row?.prob ?? row?.value ?? row?.aurora ?? row?.probability);
      if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(prob)) {
        pts.push({ lat, lon, prob: clamp(prob, 0, 100) });
      }
    }
  }

  // Case 2: grid payload with "coordinates"/"values" style (fallback heuristics)
  if (!pts.length && data && typeof data === 'object') {
    const values = (data as any)?.values ?? (data as any)?.data ?? (data as any)?.ovation;
    // If it's a 360x181 flattened array of probabilities (common in examples)
    if (Array.isArray(values) && values.length >= 360 * 181) {
      let idx = 0;
      for (let latI = 0; latI < 181; latI++) {
        const lat = -90 + latI; // -90..90
        for (let lonI = 0; lonI < 360; lonI++) {
          const lon = -180 + lonI; // -180..179
          const prob = Number(values[idx++]);
          if (Number.isFinite(prob) && prob > 0) pts.push({ lat, lon, prob: clamp(prob, 0, 100) });
        }
      }
    }
  }

  if (!pts.length) throw new Error('OVATION parse produced 0 points; paste sample JSON so we can lock schema.');

  CACHE.cur = { fetchedAt: now, points: pts };
  return pts;
}

export function sampleOvationAt(points: OvationPoint[], lat: number, lon: number): number {
  // nearest-neighbor (fast MVP)
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;

  for (const p of points) {
    const d = Math.abs(p.lat - lat) + Math.abs(p.lon - lon);
    if (d < bestD) {
      bestD = d;
      best = p.prob;
    }
  }
  return best;
}

/**
 * “Oval” polygon approximation:
 * build a crude contour by selecting points above a threshold and returning a convex hull.
 * This is not perfect, but it gives you an actual boundary polygon immediately.
 */
export function buildAuroraOvalHull(points: OvationPoint[], thresholdProb: number): GeoJSON.Feature<GeoJSON.Polygon> | null {
  const pts = points.filter((p) => p.prob >= thresholdProb && Math.abs(p.lat) >= 45); // keep it polar-ish
  if (pts.length < 12) return null;

  // Simple monotonic chain convex hull in lon/lat space (ok for an MVP oval look)
  const arr = pts.map((p) => [p.lon, p.lat] as [number, number]).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of arr) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  const hull = lower.concat(upper);
  if (hull.length < 3) return null;

  const ring = hull.concat([hull[0]]);

  return {
    type: 'Feature',
    properties: { thresholdProb },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}
