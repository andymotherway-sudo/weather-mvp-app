import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Canvas, Circle, Path } from '@shopify/react-native-skia';

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
  id: number;
  x: number;
  y: number;
  phase: number;
  life: number;
  speedScale: number;
};

type ParticleRuntime = ParticleSeed & {
  age: number;
  generation: number;
  history: Array<{ x: number; y: number; speed: number }>;
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
  tail: string;
  bodySlow: string;
  bodyBreezy: string;
  bodyFast: string;
  headSlow: string;
  headBreezy: string;
  headFast: string;
  heads: Array<{ x: number; y: number; speed: number }>;
};

export type WindParticleExportSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  speed: number;
  intensity: number;
};

const MAX_PARTICLES = 420;
const FRAME_MS = 33;
const FIELD_CELL_PX = 46;
const MIN_TRAIL_POINTS = 11;
const MAX_TRAIL_POINTS = 26;

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
  const visualSpeed = 20 + clamp(speedMps, 0, 34) * 4.9;
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
  const geographicSpan = Math.max(0.08, Math.sqrt(region.latitudeDelta * region.longitudeDelta));
  const zoomDensity = clamp(2.6 / geographicSpan, 0.72, 1.32);
  const particleCount = Math.min(MAX_PARTICLES, Math.max(130, Math.round((area / 3050) * zoomDensity)));
  const particles: ParticleSeed[] = [];

  for (let i = 0; i < particleCount; i += 1) {
    const seed = `wind-particle:${Math.round(width)}:${Math.round(height)}:${i}`;
    const a = hash01(`${seed}:x`);
    const b = hash01(`${seed}:y`);
    const c = hash01(`${seed}:phase`);
    const d = hash01(`${seed}:life`);
    const e = hash01(`${seed}:scale`);
    particles.push({
      id: i,
      x: a * width,
      y: b * height,
      phase: c,
      life: 5.4 + d * 5.2,
      speedScale: 0.58 + e * 0.54,
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

function initializeParticleRuntime(field: WindField | null): ParticleRuntime[] {
  if (!field) return [];
  return field.particles.map((particle) => ({
    ...particle,
    age: particle.phase * particle.life,
    generation: 0,
    history: [],
  }));
}

function resetParticle(
  particle: ParticleRuntime,
  field: WindField,
  width: number,
  height: number,
) {
  particle.generation += 1;
  const seed = `wind-runtime:${particle.id}:${particle.generation}`;
  let x = hash01(`${seed}:x`) * width;
  let y = hash01(`${seed}:y`) * height;

  // Prefer locations where the interpolated field is valid and moving. This
  // avoids obvious empty patches and stationary dots along sparse field edges.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const sample = sampleField(field, x, y);
    if (sample?.valid && sample.speed >= 0.35) break;
    x = hash01(`${seed}:x:${attempt}`) * width;
    y = hash01(`${seed}:y:${attempt}`) * height;
  }

  particle.x = x;
  particle.y = y;
  particle.age = 0;
  particle.history = [];
}

function pathForPoints(points: Array<{ x: number; y: number }>) {
  if (points.length < 2) return '';
  const [first, ...rest] = points;
  return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${rest
    .map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')}`;
}

function advanceParticlePaths(
  field: WindField | null,
  particles: ParticleRuntime[],
  elapsedSeconds: number,
  width: number,
  height: number,
): ParticlePaths {
  const empty: ParticlePaths = {
    tail: '',
    bodySlow: '',
    bodyBreezy: '',
    bodyFast: '',
    headSlow: '',
    headBreezy: '',
    headFast: '',
    heads: [],
  };
  if (!field || !particles.length) return empty;
  const tailPaths: string[] = [];
  const bodySlowPaths: string[] = [];
  const bodyBreezyPaths: string[] = [];
  const bodyFastPaths: string[] = [];
  const headSlowPaths: string[] = [];
  const headBreezyPaths: string[] = [];
  const headFastPaths: string[] = [];
  const heads: ParticlePaths['heads'] = [];

  for (const particle of field.particles) {
    const runtime = particles[particle.id];
    if (!runtime) continue;
    const cell = sampleField(field, runtime.x, runtime.y);
    if (!cell) {
      resetParticle(runtime, field, width, height);
      continue;
    }

    // Midpoint (RK2) advection follows curved wind fields more naturally than
    // a single Euler step while requiring only one additional field sample.
    const midpoint = sampleField(
      field,
      runtime.x + cell.u * runtime.speedScale * elapsedSeconds * 0.5,
      runtime.y + cell.v * runtime.speedScale * elapsedSeconds * 0.5,
    ) ?? cell;

    const nextCell = sampleField(
      field,
      runtime.x + midpoint.u * runtime.speedScale * elapsedSeconds,
      runtime.y + midpoint.v * runtime.speedScale * elapsedSeconds,
    ) ?? midpoint;
    const flowU = (midpoint.u * 0.72 + nextCell.u * 0.28);
    const flowV = (midpoint.v * 0.72 + nextCell.v * 0.28);

    runtime.age += elapsedSeconds;
    runtime.x += flowU * runtime.speedScale * elapsedSeconds;
    runtime.y += flowV * runtime.speedScale * elapsedSeconds;
    if (
      runtime.age >= runtime.life ||
      runtime.x < -36 ||
      runtime.x > width + 36 ||
      runtime.y < -36 ||
      runtime.y > height + 36
    ) {
      resetParticle(runtime, field, width, height);
      continue;
    }

    runtime.history.push({ x: runtime.x, y: runtime.y, speed: cell.speed });
    const trailLength = Math.round(
      MIN_TRAIL_POINTS + clamp(cell.speed / 18, 0, 1) * (MAX_TRAIL_POINTS - MIN_TRAIL_POINTS),
    );
    if (runtime.history.length > trailLength) {
      runtime.history.splice(0, runtime.history.length - trailLength);
    }
    if (runtime.history.length < 2) continue;

    const lastIndex = runtime.history.length - 1;
    const bodyStart = Math.max(0, Math.floor(lastIndex * 0.38));
    const headStart = Math.max(bodyStart, Math.floor(lastIndex * 0.72));
    const tail = pathForPoints(runtime.history.slice(0, bodyStart + 2));
    const body = pathForPoints(runtime.history.slice(bodyStart, headStart + 2));
    const head = pathForPoints(runtime.history.slice(headStart));
    if (tail) tailPaths.push(tail);
    const speed = Math.max(cell.speed, midpoint.speed, nextCell.speed);
    if (speed >= 11) {
      if (body) bodyFastPaths.push(body);
      if (head) headFastPaths.push(head);
    } else if (speed >= 5.5) {
      if (body) bodyBreezyPaths.push(body);
      if (head) headBreezyPaths.push(head);
    } else {
      if (body) bodySlowPaths.push(body);
      if (head) headSlowPaths.push(head);
    }
    heads.push({ x: runtime.x, y: runtime.y, speed });
  }

  return {
    tail: tailPaths.join(' '),
    bodySlow: bodySlowPaths.join(' '),
    bodyBreezy: bodyBreezyPaths.join(' '),
    bodyFast: bodyFastPaths.join(' '),
    headSlow: headSlowPaths.join(' '),
    headBreezy: headBreezyPaths.join(' '),
    headFast: headFastPaths.join(' '),
    heads,
  };
}

function snapshotParticleSegments(particles: ParticleRuntime[]): WindParticleExportSegment[] {
  const segments: WindParticleExportSegment[] = [];
  for (const particle of particles) {
    if (particle.history.length < 2) continue;
    const startIndex = Math.max(0, particle.history.length - 7);
    const trail = particle.history.slice(startIndex);
    for (let index = 1; index < trail.length; index += 1) {
      const start = trail[index - 1];
      const end = trail[index];
      segments.push({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        speed: end.speed,
        intensity: index / Math.max(1, trail.length - 1),
      });
    }
  }
  return segments;
}

export function buildWindParticleExportFrames({
  frameCount,
  geojson,
  height,
  region,
  width,
}: {
  frameCount: number;
  geojson: any;
  height: number;
  region: Region | null;
  width: number;
}) {
  const field = buildWindField(geojson, region, width, height);
  if (!field || frameCount < 2) return [];
  const particles = initializeParticleRuntime(field);

  // Warm the deterministic particle field before capturing so the first
  // exported frame already contains developed trails.
  for (let step = 0; step < 10; step += 1) {
    advanceParticlePaths(field, particles, 0.1, width, height);
  }

  return Array.from({ length: frameCount }, () => {
    advanceParticlePaths(field, particles, 0.12, width, height);
    return snapshotParticleSegments(particles);
  });
}

export function WindParticleOverlay({ enabled, geojson, height, isFocused, opacity, region, width }: Props) {
  const field = useMemo(() => buildWindField(geojson, region, width, height), [geojson, height, region, width]);
  const particleRuntimeRef = React.useRef<ParticleRuntime[]>([]);
  const [paths, setPaths] = useState<ParticlePaths>({
    tail: '',
    bodySlow: '',
    bodyBreezy: '',
    bodyFast: '',
    headSlow: '',
    headBreezy: '',
    headFast: '',
    heads: [],
  });

  useEffect(() => {
    particleRuntimeRef.current = initializeParticleRuntime(field);
    setPaths({
      tail: '',
      bodySlow: '',
      bodyBreezy: '',
      bodyFast: '',
      headSlow: '',
      headBreezy: '',
      headFast: '',
      heads: [],
    });
  }, [field]);

  useEffect(() => {
    if (!enabled || !isFocused || !field) return;
    let active = true;
    let last = Date.now();
    const timer = setInterval(() => {
      if (!active) return;
      const now = Date.now();
      const elapsedSeconds = Math.min(0.12, Math.max(0.016, (now - last) / 1000));
      last = now;
      setPaths(advanceParticlePaths(field, particleRuntimeRef.current, elapsedSeconds, width, height));
    }, FRAME_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [enabled, field, height, isFocused, width]);

  const hasPath = !!(
    paths.tail ||
    paths.bodySlow ||
    paths.bodyBreezy ||
    paths.bodyFast ||
    paths.headSlow ||
    paths.headBreezy ||
    paths.headFast
  );

  if (!enabled || !isFocused || !hasPath) return null;

  const layerOpacity = clamp(opacity, 0.08, 0.95);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        {paths.tail ? (
          <Path
            path={paths.tail}
            color={`rgba(125, 211, 252, ${0.16 * layerOpacity})`}
            style="stroke"
            strokeWidth={0.8}
            strokeCap="round"
            strokeJoin="round"
          />
        ) : null}
        {paths.bodySlow ? (
          <>
            <Path path={paths.bodySlow} color={`rgba(8, 13, 24, ${0.12 * layerOpacity})`} style="stroke" strokeWidth={2.8} strokeCap="round" strokeJoin="round" />
            <Path path={paths.bodySlow} color={`rgba(147, 197, 253, ${0.34 * layerOpacity})`} style="stroke" strokeWidth={1.05} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.bodyBreezy ? (
          <>
            <Path path={paths.bodyBreezy} color={`rgba(8, 13, 24, ${0.16 * layerOpacity})`} style="stroke" strokeWidth={3.0} strokeCap="round" strokeJoin="round" />
            <Path path={paths.bodyBreezy} color={`rgba(103, 232, 249, ${0.46 * layerOpacity})`} style="stroke" strokeWidth={1.22} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.bodyFast ? (
          <>
            <Path path={paths.bodyFast} color={`rgba(8, 13, 24, ${0.20 * layerOpacity})`} style="stroke" strokeWidth={3.3} strokeCap="round" strokeJoin="round" />
            <Path path={paths.bodyFast} color={`rgba(252, 211, 77, ${0.50 * layerOpacity})`} style="stroke" strokeWidth={1.35} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.headSlow ? (
          <>
            <Path path={paths.headSlow} color={`rgba(8, 13, 24, ${0.16 * layerOpacity})`} style="stroke" strokeWidth={3.2} strokeCap="round" strokeJoin="round" />
            <Path path={paths.headSlow} color={`rgba(219, 234, 254, ${0.58 * layerOpacity})`} style="stroke" strokeWidth={1.35} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.headBreezy ? (
          <>
            <Path path={paths.headBreezy} color={`rgba(8, 13, 24, ${0.20 * layerOpacity})`} style="stroke" strokeWidth={3.5} strokeCap="round" strokeJoin="round" />
            <Path path={paths.headBreezy} color={`rgba(240, 249, 255, ${0.74 * layerOpacity})`} style="stroke" strokeWidth={1.55} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.headFast ? (
          <>
            <Path path={paths.headFast} color={`rgba(8, 13, 24, ${0.24 * layerOpacity})`} style="stroke" strokeWidth={3.8} strokeCap="round" strokeJoin="round" />
            <Path path={paths.headFast} color={`rgba(254, 240, 138, ${0.84 * layerOpacity})`} style="stroke" strokeWidth={1.72} strokeCap="round" strokeJoin="round" />
          </>
        ) : null}
        {paths.heads.map((head, index) => (
          <Circle
            key={index}
            cx={head.x}
            cy={head.y}
            r={head.speed >= 13 ? 1.65 : head.speed >= 7 ? 1.35 : 1.05}
            color={`rgba(255, 255, 255, ${0.72 * layerOpacity})`}
          />
        ))}
      </Canvas>
    </View>
  );
}
