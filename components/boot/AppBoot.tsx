// components/boot/AppBoot.tsx
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: React.ReactNode;
};

/**
 * AppBoot does two things:
 * 1) Holds the native splash until our "boot tasks" finish (fonts, small local hydration).
 * 2) Shows a short in-app brand overlay that fades away to reveal the app behind it.
 */
export function AppBoot({ children }: Props) {
  const insets = useSafeAreaInsets();
  const [bootReady, setBootReady] = useState(false);
  const [overlayDone, setOverlayDone] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  const OMNI_MARK = useMemo(() => require('../../assets/brand/omniwx-mark.png'), []);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      // ✅ Keep native splash on-screen until we're ready to render.
      try {
        await SplashScreen.preventAutoHideAsync();
      } catch {
        // ignore (can throw if already prevented)
      }

      // ---- Boot tasks (keep these FAST + deterministic) ----
      // Example placeholders:
      // - load fonts (recommended)
      // - read a couple keys from AsyncStorage (settings, last place)
      // - warm caches
      //
      // IMPORTANT: do NOT await network calls here.

      // If you already load fonts elsewhere, remove this and just await that.
      // (Leaving as a no-op to keep this drop-in safe.)
      await new Promise((r) => setTimeout(r, 50));

      if (cancelled) return;

      setBootReady(true);

      // ✅ Release native splash once React is ready.
      try {
        await SplashScreen.hideAsync();
      } catch {
        // ignore
      }

      // ---- In-app overlay animation (short + sweet) ----
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
  }, [fade, scale]);

  // We still render children immediately; the overlay sits on top.
  return (
    <View style={styles.root}>
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

          {/* Optional: a subtle “aurora shimmer” bar without extra libs */}
          <View style={styles.glowRow}>
            <View style={styles.glow} />
          </View>
        </Animated.View>
      )}

      {/* If you ever want to hard-gate rendering until bootReady, you can.
          But this pattern keeps your UI mounted behind the overlay for a seamless reveal. */}
      {!bootReady && <View style={styles.bootGuard} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bootGuard: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 120,
    height: 120,
  },
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
  glow: {
    flex: 1,
    backgroundColor: 'rgba(80,200,255,0.25)',
  },
});