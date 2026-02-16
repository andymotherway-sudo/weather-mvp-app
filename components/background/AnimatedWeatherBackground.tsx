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
 * Cinematic animated background using Skia + Reanimated values (no deprecated Skia hooks).
 * - Deep gradient base
 * - Moving soft blooms
 * - Aurora ribbons
 * - Vignette
 * - Subtle grain dots
 */
export function AnimatedWeatherBackground({ scene, style }: Props) {
  const { width, height } = useWindowDimensions();

  const cloud = clamp01(scene.cloudiness ?? 0.25);
  const fog = clamp01(scene.fog ?? 0.0);
  const wind = clamp01(scene.wind ?? 0.2);

  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, {
        duration: 16000,
        easing: Easing.inOut(Easing.quad),
      }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const palette = useMemo(() => getPalette(scene.time), [scene.time]);

  // Bloom positions drift slowly; wind nudges horizontal travel.
  const bloom1 = useDerivedValue(() => {
    const x = interpolate(t.value, [0, 1], [width * 0.15, width * (0.55 + 0.25 * wind)]);
    const y = interpolate(t.value, [0, 1], [height * 0.18, height * 0.26]);
    const r = interpolate(t.value, [0, 1], [Math.min(width, height) * 0.42, Math.min(width, height) * 0.52]);
    const a = interpolate(t.value, [0, 1], [0.28, 0.38]) * (1 - 0.35 * cloud);
    return { x, y, r, a };
  });

  const bloom2 = useDerivedValue(() => {
    const x = interpolate(t.value, [0, 1], [width * 0.85, width * (0.45 - 0.25 * wind)]);
    const y = interpolate(t.value, [0, 1], [height * 0.35, height * 0.48]);
    const r = interpolate(t.value, [0, 1], [Math.min(width, height) * 0.33, Math.min(width, height) * 0.44]);
    const a = interpolate(t.value, [0, 1], [0.18, 0.26]) * (1 - 0.25 * cloud);
    return { x, y, r, a };
  });

  // Aurora ribbons: opacity and slight vertical wobble.
  const auroraA = useDerivedValue(() => {
    const wobble = interpolate(t.value, [0, 1], [-18, 18]);
    const a = (0.22 + 0.10 * (1 - cloud)) * (1 - 0.35 * fog);
    return { wobble, a };
  });
  const auroraB = useDerivedValue(() => {
    const wobble = interpolate(t.value, [0, 1], [14, -14]);
    const a = (0.16 + 0.08 * (1 - cloud)) * (1 - 0.35 * fog);
    return { wobble, a };
  });

  const vignetteOpacity = 0.55 + 0.25 * cloud + 0.15 * fog;

  // Prebuild ribbon paths in screen coords (no percentages => fixes AnimatedProp<number> errors).
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

  // Grain dots (very subtle). Keep count low for perf.
  const grainDots = useMemo(() => {
    const n = 70;
    const out: Array<{ x: number; y: number; r: number; a: number }> = [];
    // deterministic-ish layout
    let seed = 1337;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < n; i++) {
      const x = rnd() * width;
      const y = rnd() * height;
      const r = 0.6 + rnd() * 1.2;
      const a = 0.025 + rnd() * 0.035;
      out.push({ x, y, r, a });
    }
    return out;
  }, [width, height]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Canvas style={styles.canvas}>
        {/* Base */}
        <Fill>
          <LinearGradient start={vec(0, 0)} end={vec(width, height)} colors={palette.baseGradient} />
        </Fill>

        {/* Soft horizon lift */}
        <Rect x={0} y={height * 0.55} width={width} height={height * 0.55} color={palette.horizonTint} />

        {/* Moving blooms */}
        <Group>
          <Circle cx={bloom1.value.x} cy={bloom1.value.y} r={bloom1.value.r} color={withAlpha(palette.bloomA, bloom1.value.a)}>
            <BlurMask blur={30} style="normal" />
          </Circle>
          <Circle cx={bloom2.value.x} cy={bloom2.value.y} r={bloom2.value.r} color={withAlpha(palette.bloomB, bloom2.value.a)}>
            <BlurMask blur={26} style="normal" />
          </Circle>
        </Group>

        {/* Aurora ribbons */}
        <Group>
          <Group transform={[{ translateY: auroraA.value.wobble }]}>
            <Path path={ribbonPath1} opacity={auroraA.value.a}>
              <LinearGradient
                start={vec(0, height * 0.15)}
                end={vec(width, height * 0.70)}
                colors={palette.auroraA}
              />
            </Path>
          </Group>

          <Group transform={[{ translateY: auroraB.value.wobble }]}>
            <Path path={ribbonPath2} opacity={auroraB.value.a}>
              <LinearGradient
                start={vec(width, height * 0.05)}
                end={vec(0, height * 0.60)}
                colors={palette.auroraB}
              />
            </Path>
          </Group>
        </Group>

        {/* Fog veil */}
        {fog > 0 ? (
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            color={withAlpha(palette.fogTint, 0.08 + 0.20 * fog)}
          />
        ) : null}

        {/* Subtle grain */}
        <Group>
          {grainDots.map((d, i) => (
            <Circle key={i} cx={d.x} cy={d.y} r={d.r} color={`rgba(255,255,255,${d.a})`} />
          ))}
        </Group>

        {/* Vignette */}
        <Fill>
          <RadialGradient
            c={vec(width * 0.5, height * 0.35)}
            r={Math.max(width, height) * 0.85}
            colors={[
              'rgba(0,0,0,0)',
              `rgba(0,0,0,${vignetteOpacity})`,
            ]}
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
  // expects "rgba(r,g,b,alpha)" or "rgb(r,g,b)" or hex-ish strings.
  // If it’s already rgba, replace alpha. If not, wrap as rgba via fallback.
  if (color.startsWith('rgba(')) {
    const inner = color.slice(5, -1);
    const parts = inner.split(',').map((x) => x.trim());
    if (parts.length >= 3) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamp01(a)})`;
    }
  }
  return color; // best effort
}

function getPalette(time: WeatherTime) {
  // All rgba for consistent blending.
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
      };
  }
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
});