// components/boot/AppBoot.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
};

const DEFAULT_CITY_KEY = 'omniwx:profile:defaultCity';
const APP_BG = '#020617';

function safeJsonParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

/**
 * AppBoot:
 * - Holds native splash until boot tasks finish (fast local hydration)
 * - Shows a short in-app brand overlay fade
 * - Hard-gates into onboarding if default city is missing (no tab flash)
 *
 * NOTE:
 * - Do NOT set StatusBar here; control StatusBar once at app/_layout.tsx.
 */
export function AppBoot({ children }: Props) {
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  const [bootReady, setBootReady] = useState(false);
  const [overlayDone, setOverlayDone] = useState(false);

  const [hasDefaultCity, setHasDefaultCity] = useState<boolean | null>(null);
  const refreshSeqRef = useRef(0);

  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  const OMNI_MARK = useMemo(() => require('../../assets/brand/omniwx-mark.png'), []);

  const refreshDefaultCity = useCallback(async () => {
    const seq = ++refreshSeqRef.current;
    const raw = await AsyncStorage.getItem(DEFAULT_CITY_KEY);
    const city = safeJsonParse<any>(raw);

    const ok = !!(
      city &&
      (city.lat != null || city.latitude != null) &&
      (city.lon != null || city.longitude != null)
    );

    if (seq === refreshSeqRef.current) {
      setHasDefaultCity(ok);
    }
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        await SplashScreen.preventAutoHideAsync();
      } catch {
        // ignore
      }

      await refreshDefaultCity();

      if (cancelled) return;

      setBootReady(true);

      try {
        await SplashScreen.hideAsync();
      } catch {
        // ignore
      }

      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 550, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 10, tension: 90, useNativeDriver: true }),
      ]).start(() => {
        if (!cancelled) setOverlayDone(true);
      });
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, [fade, refreshDefaultCity, scale]);

  useEffect(() => {
    if (!bootReady) return;
    void refreshDefaultCity();
  }, [bootReady, refreshDefaultCity, segments]);

  const gatePending = hasDefaultCity == null;
  const inOnboarding = String(segments?.[0] ?? '') === '(onboarding)';
  const mustOnboard = bootReady && hasDefaultCity === false && !inOnboarding;
  const shouldLeaveOnboarding = bootReady && hasDefaultCity === true && inOnboarding;

  return (
    <View style={styles.root}>
      {mustOnboard ? <Redirect href={'/(onboarding)/default-city' as any} /> : null}
      {shouldLeaveOnboarding ? <Redirect href={'/' as any} /> : null}
      {children}

      {!overlayDone && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.overlay,
            {
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              opacity: fade,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={styles.center}>
            <Image source={OMNI_MARK} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.glowRow}>
            <View style={styles.glow} />
          </View>
        </Animated.View>
      )}

      {(!bootReady || gatePending) && <View style={styles.bootGuard} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: APP_BG },
  bootGuard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: APP_BG,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: APP_BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  logo: { width: 120, height: 120 },
  glowRow: {
    position: 'absolute',
    bottom: 80,
    left: 24,
    right: 24,
    height: 10,
    overflow: 'hidden',
    borderRadius: 999,
    opacity: 0.55,
  },
  glow: { flex: 1, backgroundColor: 'rgba(80,200,255,0.25)' },
});
