// components/background/AnimatedWeatherBackground.tsx
import React, { useEffect, useMemo } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';

import {
  BlurMask,
  Canvas,
  Circle,
  Fill,
  Group,
  LinearGradient,
  Paint,
  Path,
  RadialGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia';

import {
  Easing,
  interpolate,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

export type WeatherTime = 'night' | 'sunrise' | 'day' | 'sunset';

export type WeatherScene = {
  time: WeatherTime;
  cloudiness?: number; // 0..1
  fog?: number; // 0..1
  wind?: number; // 0..1
};

type Props = {
  scene: WeatherScene;
  style?: StyleProp<ViewStyle>;
};

/**
 * Cinematic animated background using Skia + Reanimated (Skia 2.x friendly).
 * Key rule: DO NOT read .value during React render. Pass shared/derived values directly to Skia props.
 */
export function AnimatedWeatherBackground({ scene, style }: Props) {
  const { width, height } = useWindowDimensions();

  const cloud = clamp01(scene.cloudiness ?? 0.25);
  const fog = clamp01(scene.fog ?? 0.0);
  const wind = clamp01(scene.wind ?? 0.2);

  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 18000, easing: Easing.inOut(Easing.cubic) }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const palette = useMemo(() => getPalette(scene.time), [scene.time]);

  const minSide = Math.min(width, height);

  // --- Bloom 1 (split into animated scalars so Skia can consume them) ---
  const b1x = useDerivedValue(() =>
    interpolate(t.value, [0, 1], [width * 0.14, width * (0.60 + 0.22 * wind)])
  );
  const b1y = useDerivedValue(() =>
    interpolate(t.value, [0, 1], [height * 0.16, height * 0.28])
  );
  const b1r = useDerivedValue(() =>
    interpolate(t.value, [0, 1], [minSide * 0.44, minSide * 0.56])
  );
  const b1a = useDerivedValue(() => {
    const base = interpolate(t.value, [0, 1], [0.18, 0.30]);
    return base * (1 - 0.45 * cloud) * (1 - 0.35 * fog);
  });

  // --- Bloom 2 ---
  const b2x = useDerivedValue(() =>
    interpolate(t.value, [0, 1], [width * 0.86, width * (0.44 - 0.22 * wind)])
  );
  const b2y = useDerivedValue(() =>
    interpolate(t.value, [0, 1], [height * 0.34, height * 0.50])
  );
  const b2r = useDerivedValue(() =>
    interpolate(t.value, [0, 1], [minSide * 0.32, minSide * 0.46])
  );
  const b2a = useDerivedValue(() => {
    const base = interpolate(t.value, [0, 1], [0.10, 0.18]);
    return base * (1 - 0.35 * cloud) * (1 - 0.35 * fog);
  });

  // Aurora wobble + opacity
  const auroraWobbleA = useDerivedValue(() => interpolate(t.value, [0, 1], [-16, 16]));
  const auroraWobbleB = useDerivedValue(() => interpolate(t.value, [0, 1], [12, -12]));

  const auroraOpacityA = useDerivedValue(() => (0.20 + 0.12 * (1 - cloud)) * (1 - 0.45 * fog));
  const auroraOpacityB = useDerivedValue(() => (0.14 + 0.10 * (1 - cloud)) * (1 - 0.45 * fog));

  const vignetteOpacity = 0.50 + 0.30 * cloud + 0.18 * fog;

  // Prebuild ribbon paths in screen coords
  const ribbonPath1 = useMemo(() => {
    const top = height * 0.18;
    const mid = height * 0.40;
    const bot = height * 0.58;
    return `
      M ${-width * 0.1} ${mid}
      C ${width * 0.15} ${top}, ${width * 0.35} ${bot}, ${width * 0.55} ${mid}
      C ${width * 0.75} ${top}, ${width * 0.95} ${bot}, ${width * 1.15} ${mid}
      L ${width * 1.15} ${mid + height * 0.22}
      C ${width * 0.90} ${mid + height * 0.28}, ${width * 0.70} ${mid + height * 0.10}, ${width * 0.50} ${mid + height * 0.22}
      C ${width * 0.30} ${mid + height * 0.34}, ${width * 0.10} ${mid + height * 0.14}, ${-width * 0.1} ${mid + height * 0.22}
      Z
    `;
  }, [width, height]);

  const ribbonPath2 = useMemo(() => {
    const top = height * 0.10;
    const mid = height * 0.30;
    const bot = height * 0.46;
    return `
      M ${-width * 0.2} ${mid}
      C ${width * 0.05} ${bot}, ${width * 0.30} ${top}, ${width * 0.52} ${mid}
      C ${width * 0.74} ${bot}, ${width * 0.98} ${top}, ${width * 1.25} ${mid}
      L ${width * 1.25} ${mid + height * 0.16}
      C ${width * 0.95} ${mid + height * 0.22}, ${width * 0.76} ${mid + height * 0.06}, ${width * 0.50} ${mid + height * 0.16}
      C ${width * 0.24} ${mid + height * 0.26}, ${width * 0.02} ${mid + height * 0.10}, ${-width * 0.2} ${mid + height * 0.16}
      Z
    `;
  }, [width, height]);

  // Grain dots: tint + softer (less “white speckle”)
  const grainDots = useMemo(() => {
    const n = 64;
    const out: Array<{ x: number; y: number; r: number; a: number }> = [];
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < n; i++) {
      out.push({
        x: rnd() * width,
        y: rnd() * height,
        r: 0.5 + rnd() * 1.1,
        a: 0.010 + rnd() * 0.020, // much lower contrast
      });
    }
    return out;
  }, [width, height]);

  // Grain tint: slightly bluish at night, warmer at sunrise/sunset
  const grainTint = palette.grainTint;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={styles.canvas}>
        {/* Base gradient */}
        <Fill>
          <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={palette.baseGradient} />
        </Fill>

        {/* Soft horizon lift */}
        <Rect x={0} y={height * 0.55} width={width} height={height * 0.55} color={palette.horizonTint} />

        {/* Moving blooms (use Paint so color can be animated) */}
        <Group>
          <Circle cx={b1x} cy={b1y} r={b1r}>
            <Paint color={palette.bloomA} opacity={b1a} />
            <BlurMask blur={34} style="normal" />
          </Circle>

          <Circle cx={b2x} cy={b2y} r={b2r}>
            <Paint color={palette.bloomB} opacity={b2a} />
            <BlurMask blur={30} style="normal" />
          </Circle>
        </Group>

        {/* Aurora ribbons */}
        <Group>
          <Group transform={[{ translateY: auroraWobbleA as any }]}>
            <Path path={ribbonPath1}>
              <Paint opacity={auroraOpacityA} />
              <LinearGradient start={vec(0, height * 0.15)} end={vec(width, height * 0.70)} colors={palette.auroraA} />
            </Path>
          </Group>

          <Group transform={[{ translateY: auroraWobbleB as any }]}>
            <Path path={ribbonPath2}>
              <Paint opacity={auroraOpacityB} />
              <LinearGradient start={vec(width, height * 0.05)} end={vec(0, height * 0.60)} colors={palette.auroraB} />
            </Path>
          </Group>
        </Group>

        {/* Fog veil */}
        {fog > 0 ? (
          <Rect x={0} y={0} width={width} height={height} color={withAlpha(palette.fogTint, 0.06 + 0.22 * fog)} />
        ) : null}

        {/* Subtle grain */}
        <Group>
          {grainDots.map((d, i) => (
            <Circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              color={withAlpha(grainTint, d.a)}
            />
          ))}
        </Group>

        {/* Vignette */}
        <Fill>
          <RadialGradient
            c={vec(width * 0.5, height * 0.36)}
            r={Math.max(width, height) * 0.90}
            colors={['rgba(0,0,0,0)', `rgba(0,0,0,${vignetteOpacity})`]}
          />
        </Fill>
      </Canvas>
    </View>
  );
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function withAlpha(color: string, a: number) {
  if (color.startsWith('rgba(')) {
    const inner = color.slice(5, -1);
    const parts = inner.split(',').map((x) => x.trim());
    if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamp01(a)})`;
  }
  return color;
}

function getPalette(time: WeatherTime) {
  switch (time) {
    case 'sunrise':
      return {
        baseGradient: ['rgba(10,12,25,1)', 'rgba(42,35,55,1)', 'rgba(120,70,60,1)'],
        horizonTint: 'rgba(255,170,120,0.05)',
        bloomA: 'rgba(255,190,140,1)',
        bloomB: 'rgba(120,200,255,1)',
        auroraA: ['rgba(120,255,210,0.0)', 'rgba(120,255,210,0.55)', 'rgba(70,120,255,0.0)'],
        auroraB: ['rgba(255,120,210,0.0)', 'rgba(255,120,210,0.45)', 'rgba(120,255,210,0.0)'],
        fogTint: 'rgba(220,210,255,1)',
        grainTint: 'rgba(255,240,230,1)',
      };
    case 'sunset':
      return {
        baseGradient: ['rgba(8,10,22,1)', 'rgba(35,25,55,1)', 'rgba(140,70,55,1)'],
        horizonTint: 'rgba(255,160,110,0.06)',
        bloomA: 'rgba(255,160,120,1)',
        bloomB: 'rgba(120,180,255,1)',
        auroraA: ['rgba(120,255,210,0.0)', 'rgba(120,255,210,0.50)', 'rgba(70,120,255,0.0)'],
        auroraB: ['rgba(255,120,210,0.0)', 'rgba(255,120,210,0.38)', 'rgba(120,255,210,0.0)'],
        fogTint: 'rgba(230,210,255,1)',
        grainTint: 'rgba(245,235,255,1)',
      };
    case 'day':
      return {
        baseGradient: ['rgba(8,14,28,1)', 'rgba(18,35,60,1)', 'rgba(55,95,120,1)'],
        horizonTint: 'rgba(160,220,255,0.05)',
        bloomA: 'rgba(140,220,255,1)',
        bloomB: 'rgba(180,255,240,1)',
        auroraA: ['rgba(90,240,255,0.0)', 'rgba(90,240,255,0.38)', 'rgba(80,140,255,0.0)'],
        auroraB: ['rgba(130,255,220,0.0)', 'rgba(130,255,220,0.30)', 'rgba(90,240,255,0.0)'],
        fogTint: 'rgba(200,230,255,1)',
        grainTint: 'rgba(230,245,255,1)',
      };
    case 'night':
    default:
      return {
        baseGradient: ['rgba(5,8,18,1)', 'rgba(10,16,36,1)', 'rgba(18,28,60,1)'],
        horizonTint: 'rgba(80,120,200,0.05)',
        bloomA: 'rgba(120,180,255,1)',
        bloomB: 'rgba(120,255,220,1)',
        auroraA: ['rgba(80,255,220,0.0)', 'rgba(80,255,220,0.55)', 'rgba(90,140,255,0.0)'],
        auroraB: ['rgba(160,120,255,0.0)', 'rgba(160,120,255,0.40)', 'rgba(80,255,220,0.0)'],
        fogTint: 'rgba(170,200,255,1)',
        grainTint: 'rgba(210,230,255,1)',
      };
  }
}

const styles = StyleSheet.create({
  canvas: { flex: 1 },
});