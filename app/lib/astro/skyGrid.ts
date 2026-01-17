// app/lib/astro/skyGrid.ts
import type { LatLon } from '../maps/types';

export type SkyPoint = { lat: number; lon: number; sky: number }; // 0..100

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function gridStepDegreesForZoom(z: number) {
  // coarse at low zoom, finer as you zoom in
  if (z <= 3) return 2.0;
  if (z <= 5) return 1.0;
  if (z <= 7) return 0.5;
  if (z <= 9) return 0.25;
  return 0.15;
}

export function roundKey(n: number, step: number) {
  return Math.round(n / step) * step;
}

export function bboxKey(bounds: { north: number; south: number; east: number; west: number }, step: number) {
  // quantize bounds so tiny pans don’t trigger full recompute
  const q = (x: number) => roundKey(x, step);
  return `${q(bounds.west)}:${q(bounds.south)}:${q(bounds.east)}:${q(bounds.north)}@${step}`;
}

export function buildGridPoints(bounds: { north: number; south: number; east: number; west: number }, stepDeg: number): Array<LatLon> {
  const pts: Array<LatLon> = [];

  const south = Math.max(-85, Math.min(85, bounds.south));
  const north = Math.max(-85, Math.min(85, bounds.north));

  const west = bounds.west;
  const east = bounds.east;

  // handle dateline crossing
  const spansDateline = east < west;

  for (let lat = south; lat <= north + 1e-9; lat += stepDeg) {
    if (!spansDateline) {
      for (let lon = west; lon <= east + 1e-9; lon += stepDeg) pts.push({ lat, lon });
    } else {
      for (let lon = west; lon <= 180 + 1e-9; lon += stepDeg) pts.push({ lat, lon });
      for (let lon = -180; lon <= east + 1e-9; lon += stepDeg) pts.push({ lat, lon });
    }
  }
  return pts;
}

// MVP stub — you’ll replace this with real SkyScore (clouds/moon/bortle/etc)
export function computeSkyScoreStub(_lat: number, _lon: number): number {
  // placeholder: return mid score
  return 60;
}

export function skyPointsToGeoJSON(points: SkyPoint[]) {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { sky: clamp(p.sky, 0, 100) },
    })),
  } as const;
}
