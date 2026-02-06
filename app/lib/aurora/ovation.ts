// app/lib/aurora/ovation.ts
export type OvationPoint = { lat: number; lon: number; prob: number };

type Cache = { fetchedAt: number; points: OvationPoint[] };
const CACHE: { cur: Cache | null } = { cur: null };

const OVATION_URL = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function isFiniteNum(x: any): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function normLon(lon: number) {
  // Normalize to [-180, 180]
  let x = lon;
  while (x > 180) x -= 360;
  while (x < -180) x += 360;
  return x;
}

export async function fetchOvationPoints(args?: { ttlMs?: number }): Promise<OvationPoint[]> {
  const ttlMs = args?.ttlMs ?? 2 * 60_000;
  const now = Date.now();

  if (CACHE.cur && now - CACHE.cur.fetchedAt < ttlMs) return CACHE.cur.points;

  const res = await fetch(OVATION_URL);
  if (!res.ok) throw new Error(`OVATION fetch failed: ${res.status}`);

  const data = await res.json();
  const pts: OvationPoint[] = [];

  // ------------------------------------------------------------
  // Case 0 (MOST COMMON for this endpoint):
  // { coordinates: [ [lon(0..360), lat, prob], ... ] }
  // ------------------------------------------------------------
  if (data && typeof data === 'object' && Array.isArray((data as any).coordinates)) {
    const coords = (data as any).coordinates as any[];
    for (const c of coords) {
      const lonRaw = Number(c?.[0]);
      const lat = Number(c?.[1]);
      const prob = Number(c?.[2]);
      if (isFiniteNum(lat) && isFiniteNum(lonRaw) && isFiniteNum(prob)) {
        // many feeds use 0..360; normalize to -180..180
        const lon = normLon(lonRaw > 180 ? lonRaw - 360 : lonRaw);
        pts.push({ lat, lon, prob: clamp(prob, 0, 100) });
      }
    }
    if (pts.length) {
      CACHE.cur = { fetchedAt: now, points: pts };
      return pts;
    }
  }

  // ------------------------------------------------------------
  // Case 1: array of objects [{lat, lon, prob}, ...]
  // ------------------------------------------------------------
  if (Array.isArray(data) && data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    for (const row of data as any[]) {
      const lat = Number(row?.lat ?? row?.latitude);
      const lonRaw = Number(row?.lon ?? row?.longitude);
      const prob = Number(row?.prob ?? row?.value ?? row?.aurora ?? row?.probability ?? row?.p);
      if (isFiniteNum(lat) && isFiniteNum(lonRaw) && isFiniteNum(prob)) {
        pts.push({ lat, lon: normLon(lonRaw), prob: clamp(prob, 0, 100) });
      }
    }
  }

  // ------------------------------------------------------------
  // Case 2: array of triplets [[lat, lon, prob], ...] OR [[lon, lat, prob], ...]
  // ------------------------------------------------------------
  if (!pts.length && Array.isArray(data) && data.length && Array.isArray(data[0]) && (data[0] as any[]).length >= 3) {
    for (const row of data as any[]) {
      const a = Number(row?.[0]);
      const b = Number(row?.[1]);
      const prob = Number(row?.[2]);
      if (!isFiniteNum(a) || !isFiniteNum(b) || !isFiniteNum(prob)) continue;

      // detect which is lat by range
      const lat = Math.abs(a) <= 90 ? a : b;
      const lonRaw = Math.abs(a) <= 90 ? b : a;

      if (isFiniteNum(lat) && isFiniteNum(lonRaw)) {
        pts.push({ lat, lon: normLon(lonRaw), prob: clamp(prob, 0, 100) });
      }
    }
  }

  // ------------------------------------------------------------
  // Case 3: flattened 181x360 grid (fallback)
  // ------------------------------------------------------------
  if (!pts.length && data && typeof data === 'object') {
    const values = (data as any)?.values ?? (data as any)?.data ?? (data as any)?.ovation;
    if (Array.isArray(values) && values.length >= 360 * 181) {
      let idx = 0;
      for (let latI = 0; latI < 181; latI++) {
        const lat = -90 + latI;
        for (let lonI = 0; lonI < 360; lonI++) {
          const lon = -180 + lonI;
          const prob = Number(values[idx++]);
          if (isFiniteNum(prob) && prob > 0) pts.push({ lat, lon, prob: clamp(prob, 0, 100) });
        }
      }
    }
  }

  if (!pts.length) {
    const keys = data && typeof data === 'object' ? Object.keys(data).slice(0, 12).join(', ') : typeof data;
    throw new Error(`OVATION parse produced 0 points (schema changed). Top-level keys/type: ${keys}`);
  }

  CACHE.cur = { fetchedAt: now, points: pts };
  return pts;
}

export function sampleOvationAt(points: OvationPoint[], lat: number, lon: number): number {
  // IDW (inverse-distance weighting) over K nearest points
  // This matches the “smoothed” visual behavior much better than nearest-neighbor.
  const K = 8;

  // quick bail
  if (!points.length) return 0;

  // gather K closest by squared distance in degrees (good enough for this use)
  const nearest: Array<{ d2: number; p: number }> = [];
  for (const p of points) {
    const dLat = p.lat - lat;
    const dLon = p.lon - lon;
    const d2 = dLat * dLat + dLon * dLon;

    // exact hit
    if (d2 === 0) return p.prob;

    // insert into small sorted list
    let inserted = false;
    for (let i = 0; i < nearest.length; i++) {
      if (d2 < nearest[i].d2) {
        nearest.splice(i, 0, { d2, p: p.prob });
        inserted = true;
        break;
      }
    }
    if (!inserted) nearest.push({ d2, p: p.prob });
    if (nearest.length > K) nearest.pop();
  }

  // If the nearest point is *far*, don’t hallucinate probability.
  // (1 degree ~ 111km) — this gate prevents weird reads when data is sparse.
  const maxD2 = (2.5 * 2.5); // ~2.5° radius
  if (!nearest.length || nearest[0].d2 > maxD2) return 0;

  // IDW: weight = 1 / d^2
  let num = 0;
  let den = 0;
  for (const x of nearest) {
    const w = 1 / x.d2;
    num += x.p * w;
    den += w;
  }

  const v = den > 0 ? num / den : 0;
  return clamp(v, 0, 100);
}

export function boundsFromPoints(points: Array<{ lat: number; lon: number }>) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * REAL “aurora oval”: contour rings from binned grid.
 * Returns MultiLineString features with properties { thr }.
 */
export function buildAuroraContourRings(
  points: OvationPoint[],
  opts?: { thresholds?: number[]; binDeg?: number; minProbToInclude?: number }
): GeoJSON.FeatureCollection {
  const thresholds = (opts?.thresholds ?? [5, 10, 20, 35, 50]).slice().sort((a, b) => a - b);
  const binDeg = clamp(opts?.binDeg ?? 1, 0.5, 2);
  const minProbToInclude = clamp(opts?.minProbToInclude ?? 0, 0, 100);

  const key = (lat: number, lon: number) => `${lat},${lon}`;

  const cellProb = new Map<string, number>();
  for (const p of points) {
    if (p.prob < minProbToInclude) continue;
    const lat = Math.round(p.lat / binDeg) * binDeg;
    const lon = Math.round(p.lon / binDeg) * binDeg;
    const k = key(lat, lon);
    const prev = cellProb.get(k) ?? 0;
    if (p.prob > prev) cellProb.set(k, p.prob);
  }

  const features: any[] = [];

  for (const thr of thresholds) {
    const filled = new Set<string>();
    let minLat = 999, maxLat = -999, minLon = 999, maxLon = -999;

    for (const [k, prob] of cellProb.entries()) {
      if (prob < thr) continue;
      filled.add(k);
      const [latS, lonS] = k.split(',');
      const lat = Number(latS);
      const lon = Number(lonS);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }

    if (filled.size < 10) continue;

    const has = (lat: number, lon: number) => filled.has(key(lat, lon));

    type Seg = [[number, number], [number, number]];
    const segs: Seg[] = [];
    const half = binDeg / 2;

    for (let lat = minLat; lat <= maxLat + 1e-9; lat += binDeg) {
      for (let lon = minLon; lon <= maxLon + 1e-9; lon += binDeg) {
        if (!has(lat, lon)) continue;

        const x0 = lon - half, x1 = lon + half;
        const y0 = lat - half, y1 = lat + half;

        if (!has(lat + binDeg, lon)) segs.push([[x0, y1], [x1, y1]]);
        if (!has(lat - binDeg, lon)) segs.push([[x0, y0], [x1, y0]]);
        if (!has(lat, lon + binDeg)) segs.push([[x1, y0], [x1, y1]]);
        if (!has(lat, lon - binDeg)) segs.push([[x0, y0], [x0, y1]]);
      }
    }

    const ptKey = (pt: [number, number]) => `${pt[0].toFixed(3)},${pt[1].toFixed(3)}`;

    const adjacency = new Map<string, number[]>();
    for (let i = 0; i < segs.length; i++) {
      const a = segs[i][0], b = segs[i][1];
      const ka = ptKey(a), kb = ptKey(b);
      if (!adjacency.has(ka)) adjacency.set(ka, []);
      if (!adjacency.has(kb)) adjacency.set(kb, []);
      adjacency.get(ka)!.push(i);
      adjacency.get(kb)!.push(i);
    }

    const used = new Array(segs.length).fill(false);
    const lines: number[][][] = [];

    function takeNextFrom(pt: [number, number]) {
      const arr = adjacency.get(ptKey(pt)) ?? [];
      for (const idx of arr) if (!used[idx]) return idx;
      return -1;
    }

    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;

      let line: [number, number][] = [segs[i][0], segs[i][1]];

      while (true) {
        const end = line[line.length - 1];
        const nxt = takeNextFrom(end);
        if (nxt < 0) break;
        used[nxt] = true;
        const [a, b] = segs[nxt];
        const endK = ptKey(end);
        line.push(ptKey(a) === endK ? b : a);
      }

      while (true) {
        const start = line[0];
        const nxt = takeNextFrom(start);
        if (nxt < 0) break;
        used[nxt] = true;
        const [a, b] = segs[nxt];
        const startK = ptKey(start);
        line.unshift(ptKey(a) === startK ? b : a);
      }

      if (line.length >= 4) lines.push(line.map((p) => [p[0], p[1]]));
    }

    features.push({
      type: 'Feature',
      properties: { thr },
      geometry: { type: 'MultiLineString', coordinates: lines },
    });
  }

  return { type: 'FeatureCollection', features } as any;
}
