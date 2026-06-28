import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

export type AnimatedPageBackgroundVariant = 'aviation' | 'almanac' | 'space';

type Props = {
  variant: AnimatedPageBackgroundVariant;
  style?: StyleProp<ViewStyle>;
};

const BACKGROUNDS: Record<AnimatedPageBackgroundVariant, ImageSourcePropType> = {
  aviation: require('../../assets/backgrounds/bg-aviation.png'),
  almanac: require('../../assets/backgrounds/bg-almanac.png'),
  space: require('../../assets/backgrounds/bg-space.png'),
};

function useReduceMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(!!enabled);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reduceMotion;
}

function useLoop(duration: number, reduceMotion: boolean, to = 1) {
  const value = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      value.value = 0;
      return;
    }
    value.value = withRepeat(withTiming(to, { duration, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [duration, reduceMotion, to, value]);

  return value;
}

export function AnimatedPageBackground({ variant, style }: Props) {
  const reduceMotion = useReduceMotionPreference();
  const slow = useLoop(32000, reduceMotion);
  const pulse = useLoop(5200, reduceMotion);
  const shimmer = useLoop(18000, reduceMotion);

  const driftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(slow.value, [0, 1], variant === 'space' ? [-14, 18] : [-18, 22]) },
      { translateY: interpolate(slow.value, [0, 1], variant === 'aviation' ? [8, -8] : [4, -5]) },
    ],
    opacity: interpolate(slow.value, [0, 1], [0.06, 0.14]),
  }));

  const reverseDriftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(slow.value, [0, 1], [16, -18]) },
      { translateY: interpolate(slow.value, [0, 1], [-4, 6]) },
    ],
    opacity: interpolate(slow.value, [0, 1], [0.04, 0.11]),
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.07, 0.18]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.985, 1.025]) }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], variant === 'almanac' ? [0.08, 0.16] : [0.05, 0.13]),
    transform: [
      { translateX: interpolate(shimmer.value, [0, 1], [-8, 8]) },
      { scale: interpolate(shimmer.value, [0, 1], [0.98, 1.03]) },
    ],
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root, style]}>
      <Image source={BACKGROUNDS[variant]} resizeMode="cover" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      {variant === 'aviation' ? (
        <AviationOverlay driftStyle={driftStyle} reverseDriftStyle={reverseDriftStyle} pulseStyle={pulseStyle} />
      ) : null}
      {variant === 'almanac' ? (
        <AlmanacOverlay driftStyle={driftStyle} pulseStyle={pulseStyle} glowStyle={glowStyle} />
      ) : null}
      {variant === 'space' ? (
        <SpaceOverlay driftStyle={driftStyle} reverseDriftStyle={reverseDriftStyle} pulseStyle={pulseStyle} glowStyle={glowStyle} />
      ) : null}
    </View>
  );
}

function AviationOverlay({
  driftStyle,
  reverseDriftStyle,
  pulseStyle,
}: {
  driftStyle: StyleProp<ViewStyle>;
  reverseDriftStyle: StyleProp<ViewStyle>;
  pulseStyle: StyleProp<ViewStyle>;
}) {
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G opacity={0.72} stroke="rgba(125,211,252,0.32)" strokeWidth={1.1} fill="none">
            <Path d="M-20 530 C 80 470, 132 495, 205 450 S 318 392, 418 320" strokeDasharray="7 18" />
            <Path d="M-28 610 C 74 558, 160 570, 245 518 S 345 470, 430 418" strokeDasharray="2 15" />
            <Path d="M-18 178 C 82 132, 168 170, 242 124 S 340 68, 416 92" strokeDasharray="10 20" />
          </G>
          <G opacity={0.55} stroke="rgba(147,197,253,0.24)" strokeWidth={0.85} fill="none">
            <Path d="M-15 302 C 78 284, 156 338, 244 312 S 350 292, 420 246" />
            <Path d="M-30 690 C 76 638, 142 684, 238 646 S 326 610, 420 618" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, reverseDriftStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G opacity={0.62} stroke="rgba(186,230,253,0.22)" strokeWidth={0.75} fill="none">
            <Path d="M8 420 C 108 370, 210 410, 302 362 S 382 312, 420 285" />
            <Path d="M-24 760 C 80 705, 158 718, 242 688 S 334 646, 414 656" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, pulseStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G fill="rgba(125,211,252,0.42)" stroke="rgba(226,245,255,0.18)" strokeWidth={1}>
            <Circle cx={84} cy={162} r={2.5} />
            <Circle cx={266} cy={452} r={2.6} />
            <Circle cx={338} cy={640} r={2.3} />
          </G>
        </Svg>
      </Animated.View>
    </>
  );
}

function AlmanacOverlay({
  driftStyle,
  pulseStyle,
  glowStyle,
}: {
  driftStyle: StyleProp<ViewStyle>;
  pulseStyle: StyleProp<ViewStyle>;
  glowStyle: StyleProp<ViewStyle>;
}) {
  const tracePaths = useMemo(
    () => [
      'M22 612 C 64 590, 92 628, 134 604 S 214 568, 258 592 S 326 646, 382 604',
      'M14 660 C 58 642, 95 664, 144 640 S 215 616, 278 632 S 338 664, 404 642',
    ],
    []
  );

  return (
    <>
      <Animated.View style={[styles.warmGlow, glowStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G opacity={0.58} stroke="rgba(255,217,142,0.26)" strokeWidth={1} fill="none">
            <Path d="M-40 502 C 70 426, 162 404, 250 438 S 388 526, 444 466" strokeDasharray="4 18" />
            <Path d="M-28 560 C 74 498, 150 492, 228 528 S 340 596, 426 530" strokeDasharray="2 16" />
          </G>
          <G opacity={0.54} stroke="rgba(147,197,253,0.25)" strokeWidth={0.9} fill="none">
            {tracePaths.map((path) => (
              <Path key={path} d={path} />
            ))}
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, pulseStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G opacity={0.38} stroke="rgba(255,255,255,0.18)" strokeWidth={0.8}>
            <Line x1={24} y1={624} x2={366} y2={624} />
            <Line x1={24} y1={662} x2={366} y2={662} />
          </G>
          <G fill="rgba(255,219,147,0.34)">
            <Circle cx={96} cy={603} r={2.2} />
            <Circle cx={226} cy={528} r={2.1} />
            <Circle cx={314} cy={630} r={2.4} />
          </G>
        </Svg>
      </Animated.View>
    </>
  );
}

function SpaceOverlay({
  driftStyle,
  reverseDriftStyle,
  pulseStyle,
  glowStyle,
}: {
  driftStyle: StyleProp<ViewStyle>;
  reverseDriftStyle: StyleProp<ViewStyle>;
  pulseStyle: StyleProp<ViewStyle>;
  glowStyle: StyleProp<ViewStyle>;
}) {
  const stars = useMemo(
    () => [
      [54, 124, 0.9],
      [122, 212, 0.7],
      [236, 158, 0.85],
      [324, 278, 0.75],
      [82, 430, 0.6],
      [298, 520, 0.72],
      [188, 700, 0.62],
    ],
    []
  );

  return (
    <>
      <Animated.View style={[styles.auroraGlow, glowStyle]} />
      <Animated.View style={[StyleSheet.absoluteFill, driftStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G opacity={0.55} stroke="rgba(103,232,249,0.23)" strokeWidth={1} fill="none">
            <Path d="M-48 210 C 44 168, 102 198, 182 168 S 304 98, 440 144" strokeDasharray="8 20" />
            <Path d="M-36 620 C 78 564, 168 596, 246 552 S 332 490, 428 512" />
            <Path d="M-22 676 C 90 640, 166 658, 258 604 S 350 554, 426 580" strokeDasharray="2 17" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, reverseDriftStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G opacity={0.42} stroke="rgba(191,219,254,0.22)" strokeWidth={0.85} fill="none">
            <Path d="M16 824 C 82 610, 140 470, 236 318 S 358 94, 420 -30" strokeDasharray="7 18" />
            <Path d="M-18 384 C 96 328, 210 370, 305 304 S 372 244, 426 258" />
          </G>
        </Svg>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, pulseStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="none">
          <G fill="rgba(191,235,255,0.55)">
            {stars.map(([cx, cy, r]) => (
              <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
            ))}
          </G>
          <Rect x={0} y={0} width={390} height={844} fill="rgba(15,23,42,0.015)" />
        </Svg>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#020817',
    overflow: 'hidden',
  },
  scrim: {
    backgroundColor: 'rgba(2, 8, 23, 0.34)',
  },
  warmGlow: {
    position: 'absolute',
    top: -80,
    right: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(251, 191, 36, 0.42)',
  },
  auroraGlow: {
    position: 'absolute',
    left: -120,
    top: 88,
    width: 260,
    height: 420,
    borderRadius: 150,
    backgroundColor: 'rgba(45, 212, 191, 0.28)',
    transform: [{ rotate: '-18deg' }],
  },
});
