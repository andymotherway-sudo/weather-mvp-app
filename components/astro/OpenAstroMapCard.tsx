import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  lat: number;
  lon: number;
  placeName?: string;
};

export function OpenAstroMapCard({ lat, lon, placeName }: Props) {
  const router = useRouter();

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Explore Astro Map</Text>
      <Text style={styles.body}>
        View observing conditions on the map for {placeName ?? 'this location'}, and jump into the astronomy map centered on the same place.
      </Text>

      <Pressable
        style={styles.button}
        onPress={() =>
          router.push({
            pathname: '/(tabs)/maps',
            params: {
              view: 'astronomy',
              lat: String(lat),
              lon: String(lon),
            },
          })
        }
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
});