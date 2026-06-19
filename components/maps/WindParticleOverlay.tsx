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
  dx: number;
  dy: number;
  speed: number;
  phase: number;
  trail: number;
  alpha: number;
};

const MAX_PARTICLES = 150;
const FRAME_MS = 58;

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

function buildParticles(geojson: any, region: Region | null, width: number, height: number): ParticleSeed[] {
  if (!region || width <= 0 || height <= 0) return [];
  const features: WindFeature[] = Array.isArray(geojson?.features) ? geojson.features : [];
  if (!features.length) return [];

  const particles: ParticleSeed[] = [];
  const copiesPerFeature = features.length < 40 ? 3 : features.length < 70 ? 2 : 1;

  for (const feature of features) {
    if (particles.length >= MAX_PARTICLES) break;
    const coords = feature.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lon = safeNumber(coords[0]);
    const lat = safeNumber(coords[1]);
    const directionDeg = safeNumber(feature.properties?.directionDeg);
    const speedMps = safeNumber(feature.properties?.speedMps);
    if (lat == null || lon == null || directionDeg == null || speedMps == null) continue;

    const base = projectToScreen(lon, lat, region, width, height);
    if (base.x < -80 || base.x > width + 80 || base.y < -80 || base.y > height + 80) continue;

    const toDeg = (directionDeg + 180) % 360;
    const rad = (toDeg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const px = -dy;
    const py = dx;
    const baseSeed = String(feature.properties?.id ?? `${lat.toFixed(3)},${lon.toFixed(3)}`);
    const flowSpeed = 18 + clamp(speedMps, 0, 26) * 3.1;

    for (let copy = 0; copy < copiesPerFeature && particles.length < MAX_PARTICLES; copy += 1) {
      const a = hash01(`${baseSeed}:${copy}:a`);
      const b = hash01(`${baseSeed}:${copy}:b`);
      const c = hash01(`${baseSeed}:${copy}:c`);
      const lateral = (a - 0.5) * 46;
      const along = (b - 0.5) * 58;
      particles.push({
        x: base.x + px * lateral + dx * along,
        y: base.y + py * lateral + dy * along,
        dx,
        dy,
        speed: flowSpeed * (0.82 + c * 0.34),
        phase: hash01(`${baseSeed}:${copy}:phase`),
        trail: 16 + clamp(speedMps, 0, 30) * 1.35,
        alpha: 0.32 + clamp(speedMps / 24, 0, 1) * 0.34,
      });
    }
  }

  return particles;
}

function buildPath(particles: ParticleSeed[], tick: number, width: number, height: number) {
  if (!particles.length) return '';
  const travel = Math.max(90, Math.min(width, height) * 0.26);
  const t = tick / 1000;
  const segments: string[] = [];

  for (const p of particles) {
    const offset = ((p.phase * travel + t * p.speed) % travel) - travel * 0.5;
    const x2 = p.x + p.dx * offset;
    const y2 = p.y + p.dy * offset;
    if (x2 < -40 || x2 > width + 40 || y2 < -40 || y2 > height + 40) continue;
    const x1 = x2 - p.dx * p.trail;
    const y1 = y2 - p.dy * p.trail;
    segments.push(`M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }

  return segments.join(' ');
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

  const particles = useMemo(() => buildParticles(geojson, region, width, height), [geojson, height, region, width]);
  const path = useMemo(() => buildPath(particles, tick, width, height), [height, particles, tick, width]);

  if (!enabled || !isFocused || !path) return null;

  const layerOpacity = clamp(opacity, 0.08, 0.95);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={path}
          color={`rgba(8, 13, 24, ${0.18 * layerOpacity})`}
          style="stroke"
          strokeWidth={3.4}
          strokeCap="round"
        />
        <Path
          path={path}
          color={`rgba(186, 230, 253, ${0.58 * layerOpacity})`}
          style="stroke"
          strokeWidth={1.45}
          strokeCap="round"
        />
        <Path
          path={path}
          color={`rgba(255, 255, 255, ${0.24 * layerOpacity})`}
          style="stroke"
          strokeWidth={0.58}
          strokeCap="round"
        />
      </Canvas>
    </View>
  );
}
