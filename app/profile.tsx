// app/profile.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePlace, type Place } from './context/PlaceContext';

const DEFAULT_CITY_KEY = 'omniwx:profile:defaultCity';

type DefaultCity = { name: string; lat: number; lon: number; country?: string; admin1?: string };

function formatCity(c: DefaultCity) {
  return `${c.name}${c.admin1 ? `, ${c.admin1}` : ''}${c.country ? `, ${c.country}` : ''}`;
}
function placeFromDefaultCity(c: DefaultCity): Place {
  const id = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
  return { id, name: formatCity(c), lat: c.lat, lon: c.lon, source: 'search' };
}

export default function ProfileScreen() {
  const { active, useGPS, setActive } = usePlace();
  const OMNI_MARK = useMemo(() => require('../assets/brand/omniwx-mark-word.png'), []);
  const [defaultCity, setDefaultCity] = useState<DefaultCity | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="white" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* background blobs for “richer” look */}
      <View style={styles.bgBlobA} />
      <View style={styles.bgBlobB} />

      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
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

        <View style={styles.card}>
          <Text style={styles.label}>Active Place</Text>
          <Text style={styles.value}>{activeLabel}</Text>

          <View style={{ height: 14 }} />

          <Text style={styles.label}>Default City</Text>
          <Text style={styles.value}>{defaultCity ? formatCity(defaultCity) : 'Not set'}</Text>

          <View style={{ height: 14 }} />

          <View style={styles.rowButtons}>
            <Pressable
              style={[styles.pill, defaultCity ? null : styles.pillDisabled]}
              disabled={!defaultCity}
              onPress={() => defaultCity && setActive(placeFromDefaultCity(defaultCity))}
            >
              <Text style={styles.pillText}>Use Default</Text>
            </Pressable>

            <Pressable style={styles.pill} onPress={useGPS}>
              <Text style={styles.pillText}>Use GPS</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.primaryButton}
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
  container: { padding: 24, paddingBottom: 32 },
  center: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },

  hero: { marginBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  logoWrap: { width: 64, height: 64, justifyContent: 'center', alignItems: 'center' },
  logoGlow: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 86,
    backgroundColor: 'rgba(80,200,255,0.14)',
  },
  logo: { width: 52, height: 52 },

  title: { color: 'white', fontSize: 30, fontWeight: '900' },
  subtitle: { marginTop: 3, color: 'rgba(255,255,255,0.62)', fontWeight: '700' },

  card: {
    backgroundColor: 'rgba(11,18,32,0.78)',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginBottom: 18,
  },
  label: { color: 'rgba(255,255,255,0.58)', fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  value: { color: 'white', fontSize: 16, fontWeight: '900', marginTop: 6 },

  rowButtons: { flexDirection: 'row', gap: 10 },
  pill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
  },
  pillDisabled: { opacity: 0.45 },
  pillText: { color: 'white', fontWeight: '900' },

  primaryButton: {
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  primaryButtonText: { color: 'white', fontWeight: '900', fontSize: 16 },
});