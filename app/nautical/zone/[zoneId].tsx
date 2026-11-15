// app/nautical/zone/[zoneId].tsx
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OmniStatusCard } from '../../../components/common/OmniStatusCard';
import { Card } from '../../../components/layout/Card';
import { theme } from '../../../styles/theme';
import { useMarineForecast } from '../../lib/nautical/marineForecast';
import { useAppChrome } from '../../lib/theme/useAppChrome';

export default function NauticalZoneDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { chrome } = useAppChrome();

  const { zoneId, name, wfo, lat, lon } = useLocalSearchParams<{
    zoneId: string;
    name?: string;
    wfo?: string;
    lat?: string;
    lon?: string;
  }>();

  const id = String(zoneId ?? '').trim();
  const title = name ? String(name) : `Marine Zone ${id || '—'}`;
  const headerTitle = `Zone: ${id || '—'}${wfo ? ` · WFO ${String(wfo)}` : ''}`;

  const { forecast, loading, error, status } = useMarineForecast(id || undefined, wfo ? String(wfo) : undefined);

  const bottomPad = Math.max(insets.bottom, 12) + 90;

  return (
    <>
      <Stack.Screen
        options={{
          title: headerTitle,
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: chrome.background },
          headerTintColor: chrome.textPrimary,
        }}
      />

      <View style={[styles.root, { backgroundColor: chrome.background }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
          <Text style={[styles.title, { color: chrome.textPrimary }]}>{title}</Text>

          <Text style={[styles.meta, { color: chrome.textSecondary }]}>
            Zone: {id || '—'}
            {wfo ? ` · WFO ${String(wfo)}` : ''}
          </Text>

          {lat && lon && (
            <Text style={[styles.metaSecondary, { color: chrome.textMuted }]}>
              Centroid: {Number(lat).toFixed(3)}, {Number(lon).toFixed(3)}
            </Text>
          )}

          <View style={styles.forecastSection}>
            {loading ? (
              <OmniStatusCard
                tone="loading"
                title="Loading official marine forecast"
                message="Requesting the latest bulletin for this zone."
              />
            ) : null}

            {!!error && status === 'error' ? (
              <OmniStatusCard
                tone="error"
                title="Official forecast unavailable"
                message={error}
              />
            ) : null}

            {!forecast && !loading && status === 'not_available' ? (
              <OmniStatusCard
                tone="unavailable"
                title="No official bulletin for this area"
                message="Model-based marine conditions may still be available on the Nautical screen."
              />
            ) : null}

            {forecast ? (
              <Card style={styles.forecastCard}>
                <Text style={[styles.sectionTitle, { color: chrome.textPrimary }]}>Official Marine Forecast</Text>
                <Text style={[styles.headline, { color: chrome.textPrimary }]}>
                  {forecast.headline}
                </Text>

                {forecast.periods.map((p) => (
                  <View key={p.name} style={styles.period}>
                    <Text style={[styles.periodName, { color: chrome.textPrimary }]}>{p.name}</Text>
                    <Text style={[styles.periodSummary, { color: chrome.textSecondary }]}>
                      {p.summary}
                    </Text>
                  </View>
                ))}

                <Text style={[styles.source, { color: chrome.textMuted }]}>
                  Issued: {new Date(forecast.issuedAt).toLocaleString()}
                </Text>
                <Text style={[styles.sourceSecondary, { color: chrome.textMuted }]}>
                  Source: {forecast.source}
                </Text>
              </Card>
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.footer, { bottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open this zone in Nautical weather"
            onPress={() =>
              router.push({
                pathname: '/(tabs)/nautical',
                params: {
                  zoneId: id,
                  zoneName: title,
                  wfo: wfo ? String(wfo) : undefined,
                  lat: lat ? String(lat) : undefined,
                  lon: lon ? String(lon) : undefined,
                },
              })
            }
            style={({ pressed }) => [
              styles.openButton,
              { backgroundColor: chrome.primary, borderColor: chrome.primaryBorder, opacity: pressed ? 0.74 : 1 },
            ]}
          >
            <Text style={styles.openButtonText}>
              Open Nautical Wx (zone)
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '900' },
  meta: { marginTop: 6, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  metaSecondary: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  forecastSection: { marginTop: theme.spacing.lg },
  forecastCard: { marginBottom: theme.spacing.lg },
  sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: '900' },
  headline: { marginTop: theme.spacing.sm, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  period: { marginTop: theme.spacing.md },
  periodName: { fontSize: 13, lineHeight: 18, fontWeight: '900' },
  periodSummary: { marginTop: 4, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  source: { marginTop: theme.spacing.lg, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  sourceSecondary: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  footer: { position: 'absolute', left: theme.spacing.lg, right: theme.spacing.lg },
  openButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
  },
  openButtonText: { color: 'white', fontSize: 14, fontWeight: '900' },
});
