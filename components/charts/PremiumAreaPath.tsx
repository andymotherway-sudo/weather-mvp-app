import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { usePreviousValue } from '../../app/lib/ui/usePreviousValue';

type Props = {
  width: number;
  height: number;

  /** SVG path "d" strings */
  areaPathD: string;   // filled area path (closed)
  linePathD?: string;  // optional line on top (not closed)

  /** Optional: control how fancy */
  durationMs?: number;
  liftPx?: number; // small vertical drift on transition
};

const AnimatedView = Animated.createAnimatedComponent(View);

export function PremiumAreaPath({
  width,
  height,
  areaPathD,
  linePathD,
  durationMs = 320,
  liftPx = 6,
}: Props) {
  const prevArea = usePreviousValue(areaPathD);
  const prevLine = usePreviousValue(linePathD);

  // Only animate when the path actually changes
  const changed = prevArea && prevArea !== areaPathD;

  const t = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!changed) return;
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: durationMs,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1), // premium ease
      useNativeDriver: true,
    }).start();
  }, [changed, durationMs, t]);

  const prevOpacity = changed ? t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) : 0;
  const nextOpacity = changed ? t.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) : 1;

  const prevY = changed ? t.interpolate({ inputRange: [0, 1], outputRange: [0, liftPx] }) : 0;
  const nextY = changed ? t.interpolate({ inputRange: [0, 1], outputRange: [-liftPx, 0] }) : 0;

  // Unique gradient id per instance to avoid collisions
  const gid = useMemo(() => `grad_${Math.random().toString(36).slice(2)}`, []);

  return (
    <View style={{ width, height }}>
      {/* PREV */}
      {changed && prevArea ? (
        <AnimatedView pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: prevOpacity, transform: [{ translateY: prevY }] }]}>
          <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
            <Defs>
              <LinearGradient id={gid + '_prev'} x1="0" y1="0" x2="0" y2="1">
                {/* Not pure white; cool off-white + transparency */}
                <Stop offset="0" stopColor="rgba(245,247,255,0.22)" />
                <Stop offset="1" stopColor="rgba(245,247,255,0.05)" />
              </LinearGradient>
            </Defs>

            <G>
              <Path d={prevArea} fill={`url(#${gid + '_prev'})`} />
              {/* subtle ridge/highlight */}
              {prevLine ? (
                <Path d={prevLine} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={2} />
              ) : null}
            </G>
          </Svg>
        </AnimatedView>
      ) : null}

      {/* CURRENT */}
      <AnimatedView pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: nextOpacity, transform: [{ translateY: nextY }] }]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="rgba(245,247,255,0.22)" />
              <Stop offset="1" stopColor="rgba(245,247,255,0.05)" />
            </LinearGradient>
          </Defs>

          <G>
            <Path d={areaPathD} fill={`url(#${gid})`} />
            {linePathD ? (
              <Path d={linePathD} fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth={2} />
            ) : null}
          </G>
        </Svg>
      </AnimatedView>
    </View>
  );
}