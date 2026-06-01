import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';

type Props = {
  lat: number;
  lon: number;
  placeName?: string;
  compact?: boolean;
};

export function OpenAstroMapCard({ lat, lon, placeName, compact = false }: Props) {
  const router = useRouter();
  const { chrome } = useAppChrome();
  const openMap = () =>
    router.push({
      pathname: '/(tabs)/astro-map',
      params: {
        lat: String(lat),
        lon: String(lon),
        from: 'space-card',
        nav: String(Date.now()),
      },
    });

  if (compact) {
    return (
      <Pressable style={styles.compactButton} onPress={openMap}>
        <Text style={styles.compactTitle}>Explore Astro Map</Text>
        <Text style={styles.compactSub} numberOfLines={1}>
          {placeName ?? 'Current location'}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }]}>
      <Text style={styles.title}>Explore Astro Map</Text>
      <Text style={styles.body}>
        View observing conditions on the map for {placeName ?? 'this location'}, and jump into the astronomy map centered on the same place.
      </Text>

      <Pressable
        style={styles.button}
        onPress={openMap}
      >
        <Text style={styles.buttonText}>Open Astro Map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  title: {
    color: '#F9FAFB',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
  },
  body: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  button: {
    minHeight: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 14,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  compactButton: {
    alignSelf: 'flex-start',
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: -4,
    marginBottom: 14,
    backgroundColor: 'rgba(37,99,235,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.38)',
  },
  compactTitle: {
    color: '#F9FAFB',
    fontSize: 13,
    fontWeight: '900',
  },
  compactSub: {
    marginTop: 2,
    color: 'rgba(219,234,254,0.72)',
    fontSize: 11,
    fontWeight: '700',
  },
});
