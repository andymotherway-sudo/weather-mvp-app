import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import MapView, { Polygon, Region } from 'react-native-maps';

import { useMarineZonesByBbox } from '../lib/nautical/useMarineZonesByBbox';

const INITIAL_REGION: Region = {
  latitude: 44.0,
  longitude: -124.5,
  latitudeDelta: 3,
  longitudeDelta: 3,
};

function regionToBbox(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return { west, south, east, north };
}

export default function NauticalMapTab() {
  const router = useRouter();
  const [region, setRegion] = useState<Region>(INITIAL_REGION);

  const zoomedInEnough = region.latitudeDelta < 12 && region.longitudeDelta < 12;

  const bbox = zoomedInEnough ? regionToBbox(region) : null;
  const { zones, loading, error } = useMarineZonesByBbox(bbox);

  const visibleZones = useMemo(() => zones.slice(0, 80), [zones]);

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={INITIAL_REGION}
        onRegionChangeComplete={setRegion}
      >
        {visibleZones.map((z) => (
// app/(tabs)/nautical-map.tsx (or wherever NauticalMapTab lives)

    <Polygon
      key={`${z.id}-${z.wfo}`}
      coordinates={z.polygon}
      tappable
      strokeWidth={2}
      strokeColor="rgba(59,130,246,0.95)"
      fillColor="rgba(59,130,246,0.25)"
      onPress={() =>
        router.push({
          pathname: '/nautical/zone/[zoneId]',
          params: {
            zoneId: z.id,                 // ✅ REQUIRED
            name: z.name,
            wfo: z.wfo,
            lat: String(z.centroid.latitude),
            lon: String(z.centroid.longitude),
          },
        })
      }
    />


        ))}
      </MapView>

      <View style={{ position: 'absolute', top: 12, left: 12, zIndex: 999 }}>
        <Text style={{ color: 'white' }}>
          zoomedInEnough: {String(zoomedInEnough)}
        </Text>
        <Text style={{ color: 'white' }}>
          zones: {zones.length} (rendering {visibleZones.length})
        </Text>
        {loading && <ActivityIndicator />}
        {!!error && <Text style={{ color: 'salmon' }}>ERROR: {error}</Text>}
        {!zoomedInEnough && (
          <Text style={{ color: 'white' }}>Zoom in to load marine zones</Text>
        )}
      </View>
    </View>
  );
}
