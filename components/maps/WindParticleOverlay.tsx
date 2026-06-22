import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Canvas, Path } from '@shopify/react-native-skia';

import type { Region } from './MapRenderer';

type WindFeature = {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: {
    id?: string;
    speedMps?: number;
    directionDeg?: number;
  };
};

type Props = {
  enabled: boolean;
  geojson: any;
  isFocused: boolean;
  opacity: number;
  region: Region | null;
  width: number;
  height: number;
};

type ParticleSeed = {
  x: number;
  y: number;
  phase: number;
  life: number;
  speedScale: number;
};

type WindSample = {
  x: number;
  y: number;
  u: number;
  v: number;
  speed: number;
};

type WindCell = {
  u: number;
  v: number;
  speed: number;
  valid: boolean;
};

type WindField = {
  cols: number;
  rows: number;
  cellW: number;
  cellH: number;
  cells: WindCell[];
  particles: ParticleSeed[];
};

type ParticlePaths = {
  slow: string;
  medium: string;
  fast: string;
};

const MAX_PARTICLES = 240;
const FRAME_MS = 58;
const FIELD_CELL_PX = 58;
const INTEGRATION_STEP_S = 0.18;
const TRAIL_POINTS = 7;
const MAX_STEPS = 42;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function mercatorY(lat: number) {
  const clamped = clamp(lat, -85, 85);
  const rad = (clamped * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function projectToScreen(lon: number, lat: number, region: Region, width: number, height: number) {
  const latDelta = Math.max(0.001, region.latitudeDelta);
  const lonDelta = Math.max(0.001, region.longitudeDelta);
  const west = region.longitude - lonDelta / 2;
  const east = region.longitude + lonDelta / 2;
  const south = clamp(region.latitude - latDelta / 2, -85, 85);
  const north = clamp(region.latitude + latDelta / 2, -85, 85);
  const mercNorth = mercatorY(north);
  const mercSouth = mercatorY(south);
  const mercSpan = Math.max(0.000001, mercNorth - mercSouth);

  return {
    x: ((lon - west) / Math.max(0.000001, east - west)) * width,
    y: ((mercNorth - mercatorY(lat)) / mercSpan) * height,
  };
}

function hash01(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function windToScreenVelocity(directionDeg: number, speedMps: number) {
  const toDeg = (directionDeg + 180) % 360;
  const rad = (toDeg * Math.PI) / 180;
  const visualSpeed = 18 + clamp(speedMps, 0, 32) * 4.2;
  return {
    u: Math.sin(rad) * visualSpeed,
    v: -Math.cos(rad) * visualSpeed,
  };
}

function sampleWindCell(samples: WindSample[], x: number, y: number): WindCell {
  let wSum = 0;
  let uSum = 0;
  let vSum = 0;
  let sSum = 0;

  for (const sample of samples) {
    const dx = x - sample.x;
    const dy = y - sample.y;
    const d2 = dx * dx + dy * dy;
    const w = 1 / Math.max(900, d2);
    wSum += w;
    uSum += sample.u * w;
    vSum += sample.v * w;
    sSum += sample.speed * w;
  }

  if (!wSum) return { u: 0, v: 0, speed: 0, valid: false };
  return {
    u: uSum / wSum,
    v: vSum / wSum,
    speed: sSum / wSum,
    valid: true,
  };
}

function buildWindField(geojson: any, region: Region | null, width: number, height: number): WindField | null {
  if (!region || width <= 0 || height <= 0) return null;
  const features: WindFeature[] = Array.isArray(geojson?.features) ? geojson.features : [];
  if (!features.length) return null;

  const samples: WindSample[] = [];

  for (const feature of features) {
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = safeNumber(coords[0]);
    const lat = safeNumber(coords[1]);
    const directionDeg = safeNumber(feature.properties?.directionDeg);
    const speedMps = safeNumber(feature.properties?.speedMps);
    if (lat == null || lon == null || directionDeg == null || speedMps == null) continue;

    const base = projectToScreen(lon, lat, region, width, height);
    if (base.x < -80 || base.x > width + 80 || base.y < -80 || base.y > height + 80) continue;
    const velocity = windToScreenVelocity(directionDeg, speedMps);
    samples.push({ x: base.x, y: base.y, u: velocity.u, v: velocity.v, speed: speedMps });
  }

  if (!samples.length) return null;

  const cols = Math.max(8, Math.min(34, Math.ceil(width / FIELD_CELL_PX) + 2));
  const rows = Math.max(8, Math.min(42, Math.ceil(height / FIELD_CELL_PX) + 2));
  const cellW = width / Math.max(1, cols - 1);
  const cellH = height / Math.max(1, rows - 1);
  const cells: WindCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push(sampleWindCell(samples, col * cellW, row * cellH));
    }
  }

  const area = Math.max(1, width * height);
  const particleCount = Math.min(MAX_PARTICLES, Math.max(95, Math.round(area / 4200)));
  const particles: ParticleSeed[] = [];

  for (let i = 0; i < particleCount; i += 1) {
    const seed = `wind-particle:${Math.round(width)}:${Math.round(height)}:${i}`;
    const a = hash01(`${seed}:x`);
    const b = hash01(`${seed}:y`);
    const c = hash01(`${seed}:phase`);
    const d = hash01(`${seed}:life`);
    const e = hash01(`${seed}:scale`);
    particles.push({
      x: a * width,
      y: b * height,
      phase: c,
      life: 4.2 + d * 3.8,
      speedScale: 0.72 + e * 0.58,
    });
  }

  return { cols, rows, cellW, cellH, cells, particles };
}

function sampleField(field: WindField, x: number, y: number): WindCell | null {
  if (x < -24 || x > field.cellW * (field.cols - 1) + 24 || y < -24 || y > field.cellH * (field.rows - 1) + 24) {
    return null;
  }
  const fx = clamp(x / field.cellW, 0, field.cols - 1);
  const fy = clamp(y / field.cellH, 0, field.rows - 1);
  const col = Math.min(field.cols - 2, Math.floor(fx));
  const row = Math.min(field.rows - 2, Math.floor(fy));
  const tx = fx - col;
  const ty = fy - row;
  const i00 = row * field.cols + col;
  const i10 = i00 + 1;
  const i01 = i00 + field.cols;
  const i11 = i01 + 1;
  const c00 = field.cells[i00];
  const c10 = field.cells[i10];
  const c01 = field.cells[i01];
  const c11 = field.cells[i11];
  if (!c00?.valid || !c10?.valid || !c01?.valid || !c11?.valid) return null;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  return {
    u: c00.u * w00 + c10.u * w10 + c01.u * w01 + c11.u * w11,
    v: c00.v * w00 + c10.v * w10 + c01.v * w01 + c11.v * w11,
    speed: c00.speed * w00 + c10.speed * w10 + c01.speed * w01 + c11.speed * w11,
    valid: true,
  };
}

function buildPaths(field: WindField | null, tick: number, width: number, height: number): ParticlePaths {
  const empty = { slow: '', medium: '', fast: '' };
  if (!field?.particles.length) return empty;
  const t = tick / 1000;
  const buckets: Record<keyof ParticlePaths, string[]> = {
    slow: [],
    medium: [],
    fast: [],
  };

  for (const particle of field.particles) {
    const age = (particle.phase * particle.life + t) % particle.life;
    const steps = Math.min(MAX_STEPS, Math.max(TRAIL_POINTS, Math.floor(age / INTEGRATION_STEP_S)));
    let x = particle.x;
    let y = particle.y;
    const points: Array<{ x: number; y: number; speed: number }> = [];
    let alive = true;

    for (let i = 0; i < steps; i += 1) {
      const cell = sampleField(field, x, y);
      if (!cell) {
        alive = false;
        break;
      }
      x += cell.u * particle.speedScale * INTEGRATION_STEP_S;
      y += cell.v * particle.speedScale * INTEGRATION_STEP_S;
      if (x < -36 || x > width + 36 || y < -36 || y > height + 36) {
        alive = false;
        break;
      }
      if (i >= steps - TRAIL_POINTS) points.push({ x, y, speed: cell.speed });
    }

    if (!alive || points.length < 2) continue;
    const avgSpeed = points.reduce((sum, point) => sum + point.speed, 0) / points.length;
    const bucket: keyof ParticlePaths = avgSpeed >= 13 ? 'fast' : avgSpeed >= 7 ? 'medium' : 'slow';
    const [first, ...rest] = points;
    buckets[bucket].push(
      `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${rest
        .map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(' ')}`,
    );
  }

  return {
    slow: buckets.slow.join(' '),
    medium: buckets.medium.join(' '),
    fast: buckets.fast.join(' '),
  };
}

export function WindParticleOverlay({ enabled, geojson, height, isFocused, opacity, region, width }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled || !isFocused) return;
    let active = true;
    let last = Date.now();
    const timer = setInterval(() => {
      if (!active) return;
      const now = Date.now();
      setTick((prev) => prev + Math.min(120, now - last));
      last = now;
    }, FRAME_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled, isFocused]);

  const field = useMemo(() => buildWindField(geojson, region, width, height), [geojson, height, region, width]);
  const paths = useMemo(() => buildPaths(field, tick, width, height), [field, height, tick, width]);
  const hasPath = !!(paths.slow || paths.medium || paths.fast);

  if (!enabled || !isFocused || !hasPath) return null;

  const layerOpacity = clamp(opacity, 0.08, 0.95);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {paths.slow ? (
          <>
            <Path path={paths.slow} color={`rgba(8, 13, 24, ${0.14 * layerOpacity})`} style="stroke" strokeWidth={3.0} strokeCap="round" strokeJoin="round" />
            <Path path={paths.slow} color={`rgba(147, 197, 253, ${0.34 * layerOpacity})`} style="stroke" strokeWidth={1.1} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.medium ? (
          <>
            <Path path={paths.medium} color={`rgba(8, 13, 24, ${0.18 * layerOpacity})`} style="stroke" strokeWidth={3.3} strokeCap="round" strokeJoin="round" />
            <Path path={paths.medium} color={`rgba(186, 230, 253, ${0.56 * layerOpacity})`} style="stroke" strokeWidth={1.42} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.fast ? (
          <>
            <Path path={paths.fast} color={`rgba(8, 13, 24, ${0.22 * layerOpacity})`} style="stroke" strokeWidth={3.7} strokeCap="round" strokeJoin="round" />
            <Path path={paths.fast} color={`rgba(255, 255, 255, ${0.66 * layerOpacity})`} style="stroke" strokeWidth={1.65} strokeCap="round" strokeJoin="round" />
            <Path path={paths.fast} color={`rgba(125, 211, 252, ${0.28 * layerOpacity})`} style="stroke" strokeWidth={0.72} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
      </Canvas>
    </View>
  );
}
