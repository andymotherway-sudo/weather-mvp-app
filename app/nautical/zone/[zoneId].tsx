import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useMarineForecast } from '../../lib/nautical/marineForecast';

export default function NauticalZoneDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { zoneId, name, wfo, lat, lon } = useLocalSearchParams<{
    zoneId: string;
    name?: string;
    wfo?: string;
    lat?: string;
    lon?: string;
  }>();

  // What you want the PUBLIC to see in the header (green text -> header)
  const headerTitle = `Zone: ${String(zoneId)}${wfo ? ` · WFO ${String(wfo)}` : ''}`;

  // What you want visible in the page content (the longer descriptive name)
  const title = name ? String(name) : `Marine Zone ${String(zoneId)}`;

  const { forecast, loading, error } = useMarineForecast(String(zoneId));

  // Space for the sticky button + safe area so content never hides behind it
  const bottomPad = Math.max(insets.bottom, 12) + 90;

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: '#020617' },
          headerTintColor: 'white',
        }}
      />

      <View style={{ flex: 1, backgroundColor: '#020617' }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: bottomPad }}
        >
          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700' }}>
            {title}
          </Text>

          {/* Keep this line if you want redundancy; otherwise you can delete it
              since it's now in the header. */}
          <Text style={{ color: '#94a3b8', marginTop: 6 }}>
            Zone: {String(zoneId)}
            {wfo ? ` · WFO ${String(wfo)}` : ''}
          </Text>

          {lat && lon && (
            <Text style={{ color: '#64748b', marginTop: 4 }}>
              Centroid: {Number(lat).toFixed(3)}, {Number(lon).toFixed(3)}
            </Text>
          )}

          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 12,
              backgroundColor: '#0b1220',
            }}
          >
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '600' }}>
              Marine Forecast
            </Text>

            {loading && (
              <View style={{ marginTop: 10 }}>
                <ActivityIndicator />
                <Text style={{ color: '#94a3b8', marginTop: 8 }}>
                  Loading forecast…
                </Text>
              </View>
            )}

            {!!error && (
              <Text style={{ color: '#fb7185', marginTop: 10 }}>{error}</Text>
            )}

            {forecast && (
              <>
                <Text
                  style={{
                    color: '#e2e8f0',
                    marginTop: 10,
                    fontWeight: '600',
                  }}
                >
                  {forecast.headline}
                </Text>

                {forecast.periods.map((p) => (
                  <View key={p.name} style={{ marginTop: 12 }}>
                    <Text style={{ color: 'white', fontWeight: '600' }}>
                      {p.name}
                    </Text>
                    <Text
                      style={{
                        color: '#cbd5e1',
                        marginTop: 4,
                        lineHeight: 18,
                      }}
                    >
                      {p.summary}
                    </Text>
                  </View>
                ))}

                <Text style={{ color: '#64748b', marginTop: 14 }}>
                  Issued: {new Date(forecast.issuedAt).toLocaleString()}
                </Text>
                <Text style={{ color: '#64748b', marginTop: 4 }}>
                  Source: {forecast.source}
                </Text>
              </>
            )}
          </View>
        </ScrollView>

        {/* Sticky CTA above Android system nav */}
        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: Math.max(insets.bottom, 12),
          }}
        >
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/(tabs)/nautical',
                params: {
                  zoneId: String(zoneId),
                  zoneName: title, // long friendly name in-page, still passed along
                  wfo: wfo ? String(wfo) : undefined,
                  lat: lat ? String(lat) : undefined,
                  lon: lon ? String(lon) : undefined,
                },
              })
            }
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: '#111827',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '700' }}>
              Open Nautical Wx (zone)
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
