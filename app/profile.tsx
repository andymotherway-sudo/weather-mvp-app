// app/profile.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePlace, type Place } from './context/PlaceContext';
import { useSettings } from './context/SettingsContext';
import { formatCompactLocation } from './lib/locations/formats';
import { APP_COLOR_MODE_OPTIONS, appChrome } from './lib/theme/appAppearance';

const DEFAULT_CITY_KEY = 'omniwx:profile:defaultCity';

type DefaultCity = { name: string; lat: number; lon: number; country?: string; admin1?: string };

function formatCity(c: DefaultCity) {
  return formatCompactLocation({
    name: c.name,
    admin1: c.admin1,
    country: c.country,
  });
}
function placeFromDefaultCity(c: DefaultCity): Place {
  const id = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
  return { id, name: formatCity(c), lat: c.lat, lon: c.lon, source: 'search' };
}

const FORECAST_MODEL_OPTIONS = [
  { key: 'best_match', label: 'Best match' },
  { key: 'gfs', label: 'NOAA U.S.' },
  { key: 'ecmwf', label: 'ECMWF' },
  { key: 'dwd_icon', label: 'DWD ICON' },
] as const;

export default function ProfileScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; returnLabel?: string }>();
  const { active, useGPS, setActive } = usePlace();
  const {
    tempUnit,
    setTempUnit,
    baseMapStyle,
    setBaseMapStyle,
    forecastModel,
    setForecastModel,
    appColorMode,
    setAppColorMode,
    alwaysUseWxLab,
    setAlwaysUseWxLab,
  } = useSettings();
  const OMNI_MARK = useMemo(() => require('../assets/brand/omniwx-mark-word.png'), []);
  const chrome = useMemo(() => appChrome(appColorMode), [appColorMode]);
  const [defaultCity, setDefaultCity] = useState<DefaultCity | null>(null);
  const [loading, setLoading] = useState(true);

  const leaveSettings = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    const returnTo = typeof params.returnTo === 'string' ? params.returnTo : null;
    if (returnTo) {
      router.replace(returnTo as any);
      return;
    }

    router.replace('/(tabs)' as any);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DEFAULT_CITY_KEY);
        if (!mounted) return;
        setDefaultCity(raw ? (JSON.parse(raw) as DefaultCity) : null);
      } catch {
        if (!mounted) return;
        setDefaultCity(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const activeLabel =
    active?.source === 'gps' ? 'Current Location (GPS)' : active ? active.name : 'None';
  const pillStyle = (selected = false, extra?: any) => [
    styles.pill,
    {
      backgroundColor: selected ? chrome.pillActive : chrome.pill,
      borderColor: selected ? chrome.borderStrong : chrome.border,
    },
    extra,
  ];

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: chrome.background }]}>
        <ActivityIndicator color="white" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: chrome.background }]}>
      {/* background blobs for “richer” look */}
      <View style={[styles.bgBlobA, { backgroundColor: chrome.blobA }]} />
      <View style={[styles.bgBlobB, { backgroundColor: chrome.blobB }]} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Pressable style={styles.backButton} onPress={leaveSettings}>
            <Text style={styles.backButtonText}>
              {typeof params.returnLabel === 'string' && params.returnLabel.trim()
                ? `Back to ${params.returnLabel}`
                : 'Back'}
            </Text>
          </Pressable>

          <View style={styles.heroRow}>
            <View style={styles.logoWrap}>
              <View style={styles.logoGlow} />
              <Image source={OMNI_MARK} style={styles.logo} resizeMode="contain" />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Settings</Text>
              <Text style={styles.subtitle}>Home base, GPS mode, and preferences.</Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: chrome.card, borderColor: chrome.border }]}>
          <Text style={styles.label}>Active Place</Text>
          <Text style={styles.value}>{activeLabel}</Text>

          <View style={{ height: 14 }} />

          <Text style={styles.label}>Default City</Text>
          <Text style={styles.value}>{defaultCity ? formatCity(defaultCity) : 'Not set'}</Text>

          <View style={{ height: 14 }} />

          <View style={styles.rowButtons}>
            <Pressable
              style={pillStyle(false, [styles.optionPillHalf, defaultCity ? null : styles.pillDisabled])}
              disabled={!defaultCity}
              onPress={() => defaultCity && setActive(placeFromDefaultCity(defaultCity))}
            >
              <Text style={styles.pillText}>Use Default</Text>
            </Pressable>

            <Pressable style={pillStyle(false, styles.optionPillHalf)} onPress={useGPS}>
              <Text style={styles.pillText}>Use GPS</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: chrome.card, borderColor: chrome.border }]}>
          <Text style={styles.label}>Preferences</Text>
          <Text style={styles.value}>Units, appearance, and map behavior</Text>

          <View style={{ height: 14 }} />

          <Text style={styles.label}>Temperature</Text>
          <View style={styles.rowButtons}>
            <Pressable
              style={pillStyle(tempUnit === 'F', styles.optionPillHalf)}
              onPress={() => setTempUnit('F')}
            >
              <Text style={styles.pillText}>Fahrenheit</Text>
            </Pressable>
            <Pressable
              style={pillStyle(tempUnit === 'C', styles.optionPillHalf)}
              onPress={() => setTempUnit('C')}
            >
              <Text style={styles.pillText}>Celsius</Text>
            </Pressable>
          </View>

          <View style={{ height: 14 }} />

          <Text style={styles.label}>App Color</Text>
          <Text style={styles.helperText}>
            Applies across OMNIwx surfaces. Weather layers, precip colors, charts, and graph lines keep their data colors.
          </Text>
          <View style={styles.optionGrid}>
            {APP_COLOR_MODE_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={pillStyle(appColorMode === option.key, styles.appearancePill)}
                onPress={() => setAppColorMode(option.key)}
              >
                <Text style={styles.pillText}>{option.label}</Text>
                <Text style={styles.pillSubText}>{option.helper}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ height: 14 }} />

          <Text style={styles.label}>Base Map</Text>
          <View style={styles.rowButtons}>
            <Pressable
              style={pillStyle(baseMapStyle === 'dark', styles.optionPillHalf)}
              onPress={() => setBaseMapStyle('dark')}
            >
              <Text style={styles.pillText}>Dark</Text>
            </Pressable>
            <Pressable
              style={pillStyle(baseMapStyle === 'light', styles.optionPillHalf)}
              onPress={() => setBaseMapStyle('light')}
            >
              <Text style={styles.pillText}>Light</Text>
            </Pressable>
          </View>

          <View style={{ height: 14 }} />

          <Pressable
            style={[
              styles.toggleRow,
              { backgroundColor: chrome.pill, borderColor: alwaysUseWxLab ? chrome.borderStrong : chrome.border },
            ]}
            onPress={() => setAlwaysUseWxLab(!alwaysUseWxLab)}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.toggleTitle}>Always use wxLab</Text>
              <Text style={styles.toggleHelp}>Start Land and Hourly in the detailed wxLab view.</Text>
            </View>
            <View style={[styles.toggleTrack, alwaysUseWxLab ? styles.toggleTrackOn : null]}>
              <View style={[styles.toggleKnob, alwaysUseWxLab ? styles.toggleKnobOn : null]} />
            </View>
          </Pressable>

          <View style={{ height: 14 }} />

          <Text style={styles.label}>Forecast Model</Text>
          <Text style={styles.helperText}>Used by wxLab and forecast views. Best match remains the safest default.</Text>
          <View style={styles.optionGrid}>
            {FORECAST_MODEL_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                style={pillStyle(forecastModel === option.key, styles.compactPill)}
                onPress={() => setForecastModel(option.key)}
              >
                <Text style={styles.pillText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Pressable
          style={[styles.primaryButton, { backgroundColor: chrome.primary, borderColor: chrome.primaryBorder }]}
          onPress={() =>
            router.push({
              pathname: '/(onboarding)/default-city' as any,
              params: { returnTo: 'back' } as any,
            })
          }
        >
          <Text style={styles.primaryButtonText}>
            {defaultCity ? 'Change Default City' : 'Set Default City'}
          </Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={leaveSettings}>
          <Text style={styles.secondaryButtonText}>Done</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  bgBlobA: {
    position: 'absolute',
    top: -120,
    left: -150,
    width: 360,
    height: 360,
    borderRadius: 360,
    backgroundColor: 'rgba(80,200,255,0.16)',
  },
  bgBlobB: {
    position: 'absolute',
    bottom: -140,
    right: -170,
    width: 420,
    height: 420,
    borderRadius: 420,
    backgroundColor: 'rgba(120,120,255,0.12)',
  },
  container: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  center: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },

  hero: { marginBottom: 14 },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backButtonText: { color: 'white', fontWeight: '800', fontSize: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  logoWrap: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' },
  logoGlow: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 76,
    backgroundColor: 'rgba(80,200,255,0.14)',
  },
  logo: { width: 46, height: 46 },

  title: { color: 'white', fontSize: 28, fontWeight: '900' },
  subtitle: { marginTop: 2, color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 13 },

  card: {
    backgroundColor: 'rgba(11,18,32,0.78)',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 14,
  },
  label: { color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  value: { color: 'white', fontSize: 15, fontWeight: '900', marginTop: 5 },
  helperText: { color: 'rgba(255,255,255,0.62)', fontSize: 11, lineHeight: 16, marginTop: 5, marginBottom: 9 },

  rowButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  stackButtons: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  optionGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    minHeight: 42,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: 'rgba(37,99,235,0.35)',
    borderColor: 'rgba(147,197,253,0.55)',
  },
  pillDisabled: { opacity: 0.45 },
  pillText: { color: 'white', fontWeight: '900', fontSize: 13, textAlign: 'center' },
  pillSubText: { marginTop: 3, color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '800', textAlign: 'center' },
  optionPillHalf: { flexGrow: 1, flexBasis: '46%', minWidth: 118 },
  compactPill: { flexGrow: 1, flexBasis: '22%', minWidth: 78 },
  appearancePill: { flexGrow: 1, flexBasis: '46%', minWidth: 132 },
  toggleRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  toggleTitle: { color: 'white', fontSize: 14, fontWeight: '900' },
  toggleHelp: { marginTop: 3, color: 'rgba(255,255,255,0.58)', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  toggleTrack: {
    width: 46,
    height: 26,
    borderRadius: 999,
    padding: 3,
    backgroundColor: 'rgba(148,163,184,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  toggleTrackOn: {
    backgroundColor: 'rgba(37,99,235,0.72)',
    borderColor: 'rgba(147,197,253,0.45)',
  },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  toggleKnobOn: {
    transform: [{ translateX: 20 }],
    backgroundColor: 'white',
  },

  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  primaryButtonText: { color: 'white', fontWeight: '900', fontSize: 15 },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  secondaryButtonText: { color: 'white', fontWeight: '900', fontSize: 15 },
});
