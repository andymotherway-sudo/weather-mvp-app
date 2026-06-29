// app/(onboarding)/default-city.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLocation from 'expo-location';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { usePlace, type Place } from '../context/PlaceContext';
import { primeClimatologyCache } from '../lib/climatology/hook';
import { formatCompactLocation } from '../lib/locations/formats';
import {
  LOCATION_ONBOARDING_KEY,
  LOCATION_ONBOARDING_VERSION,
} from '../lib/onboarding/locationGate';

const DEFAULT_CITY_KEY = 'omniwx:profile:defaultCity';
const PENDING_GPS_KEY = 'omniwx:onboarding:pendingGps';

type GeoResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

function safeJoin(parts: Array<string | undefined | null>, sep = ', ') {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(sep);
}

function placeFromCity(payload: {
  name: string;
  lat: number;
  lon: number;
  country?: string;
  admin1?: string;
}): Place {
  const id = `${payload.lat.toFixed(4)},${payload.lon.toFixed(4)}`;
  const label =
    formatCompactLocation({
      name: payload.name,
      admin1: payload.admin1,
      country: payload.country,
    }) || payload.name || 'Default City';
  return { id, name: label, lat: payload.lat, lon: payload.lon, source: 'search' };
}

function tick(ms = 0) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export default function DefaultCityScreen() {
  const { setActive } = usePlace();

  const OMNI_MARK = useMemo(() => require('../../assets/brand/omniwx-logo-transparent.png'), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const navigatingRef = useRef(false);
  const gpsResolveInFlightRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.65, duration: 1400, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  async function completeToLand() {
    await tick(150);
    router.replace('/' as any);
  }

  async function persistAndActivate(payload: {
    name: string;
    lat: number;
    lon: number;
    country?: string;
    admin1?: string;
  }) {
    await Promise.all([
      AsyncStorage.setItem(DEFAULT_CITY_KEY, JSON.stringify(payload)),
      AsyncStorage.setItem(LOCATION_ONBOARDING_KEY, LOCATION_ONBOARDING_VERSION),
    ]);
    setActive(placeFromCity(payload));
    void primeClimatologyCache(payload.lat, payload.lon);
    await tick(100);
  }

  async function clearPendingGpsFlag() {
    await AsyncStorage.removeItem(PENDING_GPS_KEY);
  }

  async function resolveGpsAndRoute() {
    if (gpsResolveInFlightRef.current) return;
    gpsResolveInFlightRef.current = true;
    navigatingRef.current = true;

    setGpsLoading(true);
    setErr(null);

    try {
      await tick(250);

      const lastKnown = await ExpoLocation.getLastKnownPositionAsync();
      const pos =
        lastKnown ??
        (await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        }));

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      let name = 'Current Location';
      let admin1: string | undefined;
      let country: string | undefined;

      try {
        const rev = await ExpoLocation.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        const top = rev?.[0];
        if (top) {
          name =
            top.city ||
            top.subregion ||
            top.district ||
            top.region ||
            top.name ||
            'Current Location';
          admin1 = top.region || top.subregion || undefined;
          country = top.country || undefined;
        }
      } catch {
        // coords are enough
      }

      await persistAndActivate({ name, lat, lon, admin1, country });
      await clearPendingGpsFlag();
      await completeToLand();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to use GPS city');
      await clearPendingGpsFlag();
    } finally {
      gpsResolveInFlightRef.current = false;
      navigatingRef.current = false;
      setGpsLoading(false);
    }
  }

  // On mount/resume of this screen, continue first-run GPS onboarding if needed.
  useEffect(() => {
    let cancelled = false;

    async function maybeResumePendingGps() {
      try {
        const pending = await AsyncStorage.getItem(PENDING_GPS_KEY);
        if (cancelled || pending !== '1') return;

        const perm = await ExpoLocation.getForegroundPermissionsAsync();
        if (cancelled) return;

        if (perm.status === 'granted') {
          await resolveGpsAndRoute();
        }
      } catch {
        // ignore
      }
    }

    void maybeResumePendingGps();

    return () => {
      cancelled = true;
    };
  }, []);

  async function searchCitiesNow(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setErr(null);
      return;
    }

    setLoading(true);
    setErr(null);

    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        trimmed
      )}&count=12&language=en&format=json`;

      const res = await fetch(url);
      const data = await res.json();
      setResults(Array.isArray(data?.results) ? data.results : []);
    } catch (e: any) {
      setResults([]);
      setErr(e?.message ?? 'Search failed');
    } finally {
      setLoading(false);
    }
  }

  function searchCities(q: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      void searchCitiesNow(q);
    }, 180);
  }

  async function selectCity(item: GeoResult) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;

    try {
      await persistAndActivate({
        name: item.name,
        lat: item.latitude,
        lon: item.longitude,
        country: item.country,
        admin1: item.admin1,
      });

      await clearPendingGpsFlag();
      await completeToLand();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to set default city');
    } finally {
      navigatingRef.current = false;
    }
  }

  async function useMyCurrentGpsCity() {
    if (navigatingRef.current || gpsResolveInFlightRef.current) return;

    setGpsLoading(true);
    setErr(null);

    try {
      const currentPerm = await ExpoLocation.getForegroundPermissionsAsync();

      if (currentPerm.status === 'granted') {
        await AsyncStorage.setItem(PENDING_GPS_KEY, '1');
        await resolveGpsAndRoute();
        return;
      }

      // Persist intent before opening OS permission prompt.
      await AsyncStorage.setItem(PENDING_GPS_KEY, '1');

      const requested = await ExpoLocation.requestForegroundPermissionsAsync();

      if (requested.status !== 'granted') {
        await clearPendingGpsFlag();
        setErr('Location permission is not granted. Enable it to use GPS city.');
        setGpsLoading(false);
        return;
      }

      // If the permission flow remounted the screen, the mount effect will continue it.
      // If not, continue immediately here.
      await resolveGpsAndRoute();
    } catch (e: any) {
      await clearPendingGpsFlag();
      setErr(e?.message ?? 'Failed to use GPS city');
      setGpsLoading(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.bgBlobA} />
      <View style={styles.bgBlobB} />
      <View style={styles.bgBlobC} />

      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Animated.View style={[styles.logoGlow, { opacity: glow }]} />
          <Image source={OMNI_MARK} style={styles.logo} resizeMode="contain" />
        </View>

        <Text style={styles.title}>Choose your home city</Text>
        <Text style={styles.subtitle}>This becomes your default place across the app.</Text>

        <Pressable
          style={[styles.gpsButton, (gpsLoading || navigatingRef.current) && styles.gpsButtonDisabled]}
          onPress={useMyCurrentGpsCity}
          disabled={gpsLoading || navigatingRef.current}
        >
          {gpsLoading ? (
            <View style={styles.gpsRow}>
              <ActivityIndicator color="white" />
              <Text style={styles.gpsText}>Using GPS city…</Text>
            </View>
          ) : (
            <Text style={styles.gpsText}>Use my current GPS city</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.searchCard}>
        <Text style={styles.searchLabel}>Search</Text>
        <TextInput
          placeholder="Try “Phoenix”, “London”, “Tokyo”…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            searchCities(text);
          }}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={() => void searchCitiesNow(query)}
        />

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="white" />
            <Text style={styles.loadingText}>Searching…</Text>
          </View>
        )}

        {!!err && !loading && !gpsLoading && <Text style={styles.err}>{err}</Text>}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void selectCity(item)} disabled={navigatingRef.current}>
            <View style={styles.pin}>
              <Text style={styles.pinText}>⌁</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {formatCompactLocation({
                  name: item.name,
                  admin1: item.admin1,
                  country: item.country,
                })}
              </Text>
              <Text style={styles.rowSub}>{safeJoin([item.country, item.admin1 ? '•' : null, item.admin1])}</Text>
            </View>
            <Text style={styles.rowCoords}>
              {item.latitude.toFixed(2)}
              {'\n'}
              {item.longitude.toFixed(2)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  bgBlobA: {
    position: 'absolute',
    top: -120,
    left: -140,
    width: 320,
    height: 320,
    borderRadius: 320,
    backgroundColor: 'rgba(80,200,255,0.18)',
  },
  bgBlobB: {
    position: 'absolute',
    top: 140,
    right: -160,
    width: 360,
    height: 360,
    borderRadius: 360,
    backgroundColor: 'rgba(120,120,255,0.14)',
  },
  bgBlobC: {
    position: 'absolute',
    bottom: -180,
    left: -120,
    width: 380,
    height: 380,
    borderRadius: 380,
    backgroundColor: 'rgba(80,255,180,0.10)',
  },

  header: { paddingTop: 28, paddingHorizontal: 24, paddingBottom: 10 },
  logoWrap: { width: 74, height: 74, marginBottom: 14, justifyContent: 'center', alignItems: 'center' },
  logoGlow: { position: 'absolute', width: 92, height: 92, borderRadius: 92, backgroundColor: 'rgba(80,200,255,0.18)' },
  logo: { width: 70, height: 84 },

  title: { color: 'white', fontSize: 28, fontWeight: '900' },
  subtitle: { marginTop: 6, color: 'rgba(255,255,255,0.62)', fontWeight: '700' },

  gpsButton: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  gpsButtonDisabled: { opacity: 0.55 },
  gpsText: { color: 'white', fontWeight: '900', fontSize: 14 },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  searchCard: {
    marginTop: 8,
    marginHorizontal: 24,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(11,18,32,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  searchLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  loadingRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  loadingText: { color: 'rgba(255,255,255,0.65)', fontWeight: '800' },
  err: { marginTop: 10, color: 'rgba(255,120,120,0.9)', fontWeight: '900' },

  listContent: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 26 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(11,18,32,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 10,
  },
  pin: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  pinText: { color: 'rgba(255,255,255,0.80)', fontWeight: '900', fontSize: 16, marginTop: -1 },
  rowTitle: { color: 'white', fontSize: 16, fontWeight: '900' },
  rowDim: { color: 'rgba(255,255,255,0.70)', fontWeight: '800' },
  rowSub: { marginTop: 2, color: 'rgba(255,255,255,0.55)', fontWeight: '700', fontSize: 13 },
  rowCoords: {
    width: 72,
    textAlign: 'right',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '800',
    fontSize: 12,
    lineHeight: 16,
  },
});
