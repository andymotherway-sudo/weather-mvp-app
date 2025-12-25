// app/(tabs)/buoy-map.tsx
// World map of live NOAA buoys with severity coloring + marine areas + area summary

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  Marker,
  Polygon,
  PROVIDER_GOOGLE,
} from 'react-native-maps';

import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings } from '../context/SettingsContext';
import { useAllBuoyDetails } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';
import {
  getMarineAreaById,
  getMarineAreaCenter,
  MARINE_AREAS,
  type MarineArea,
} from '../lib/nautical/areas';

type Severity = 'calm' | 'moderate' | 'rough' | 'extreme';

function formatWaterTemp(
  valueC: number | null | undefined,
  unit: 'F' | 'C',
): string | null {
  if (valueC == null) return null;
  if (unit === 'C') return `${valueC.toFixed(1)} °C`;
  const f = (valueC * 9) / 5 + 32;
  return `${f.toFixed(1)} °F`;
}

/** Compute a simple severity metric from waves + wind. */
function getSeverity(
  waveM: number | null | undefined,
  windKts: number | null | undefined,
): Severity {
  const ft = waveM != null ? waveM * 3.28084 : null;
  const w = windKts ?? 0;

  if ((ft == null || ft < 3) && w < 15) return 'calm';
  if ((ft != null && ft < 6) && w < 25) return 'moderate';
  if ((ft != null && ft < 10) || w < 35) return 'rough';
  return 'extreme';
}

/** Map severity → color for markers. */
function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'calm':
      return '#22c55e'; // green
    case 'moderate':
      return '#eab308'; // yellow
    case 'rough':
      return '#f97316'; // orange
    case 'extreme':
      return '#ef4444'; // red
    default:
      return '#6b7280';
  }
}

/** Custom pulsing marker for extreme buoys. */
function ExtremeMarker({
  coordinate,
  color,
  title,
  description,
  onPress,
}: {
  coordinate: { latitude: number; longitude: number };
  color: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 3],
  });

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0],
  });

  return (
    <Marker
      coordinate={coordinate}
      title={title}
      description={description}
      onCalloutPress={onPress}
    >
      <View style={styles.extremeWrapper}>
        <Animated.View
          style={[
            styles.pulseCircle,
            {
              backgroundColor: color,
              opacity,
              transform: [{ scale }],
            },
          ]}
        />
        <View
          style={[
            styles.extremeDot,
            {
              backgroundColor: color,
              borderColor: '#0f172a',
            },
          ]}
        />
      </View>
    </Marker>
  );
}

/** Helper: buoys within a marine area bounds */
function buoysInArea(area: MarineArea, buoys: BuoyDetailData[]) {
  const { minLat, maxLat, minLon, maxLon } = area.bounds;
  return buoys.filter(
    (b) =>
      Number.isFinite(b.lat) &&
      Number.isFinite(b.lon) &&
      b.lat >= minLat &&
      b.lat <= maxLat &&
      b.lon >= minLon &&
      b.lon <= maxLon,
  );
}

/** Helper: summarize extremes within area */
function summarizeArea(
  buoys: BuoyDetailData[],
): {
  count: number;
  highestWave?: BuoyDetailData;
  strongestWind?: BuoyDetailData;
  warmestWater?: BuoyDetailData;
  coolestWater?: BuoyDetailData;
} {
  const summary: {
    count: number;
    highestWave?: BuoyDetailData;
    strongestWind?: BuoyDetailData;
    warmestWater?: BuoyDetailData;
    coolestWater?: BuoyDetailData;
  } = { count: buoys.length };

  if (!buoys.length) {
    return summary;
  }

  let highestWave: BuoyDetailData | undefined;
  let strongestWind: BuoyDetailData | undefined;
  let warmestWater: BuoyDetailData | undefined;
  let coolestWater: BuoyDetailData | undefined;

  for (const b of buoys) {
    if (
      b.waveHeightM != null &&
      (!highestWave || (highestWave.waveHeightM ?? 0) < b.waveHeightM)
    ) {
      highestWave = b;
    }

    if (
      b.windSpeedKts != null &&
      (!strongestWind || (strongestWind.windSpeedKts ?? 0) < b.windSpeedKts)
    ) {
      strongestWind = b;
    }

    if (
      b.waterTempC != null &&
      (!warmestWater || (warmestWater.waterTempC ?? -Infinity) < b.waterTempC)
    ) {
      warmestWater = b;
    }

    if (
      b.waterTempC != null &&
      (!coolestWater || (coolestWater.waterTempC ?? Infinity) > b.waterTempC)
    ) {
      coolestWater = b;
    }
  }

  summary.highestWave = highestWave;
  summary.strongestWind = strongestWind;
  summary.warmestWater = warmestWater;
  summary.coolestWater = coolestWater;

  return summary;
}


export default function BuoyMapScreen() {
  const router = useRouter();
  const { tempUnit } = useSettings();
  const { data, loading, error } = useAllBuoyDetails();

const { buoyId: targetBuoyId, areaId: initialAreaId } =
  useLocalSearchParams<{ buoyId?: string; areaId?: string }>();

// start with the area from params (if any)
const [selectedAreaId, setSelectedAreaId] = useState<string | null>(
  (initialAreaId as string | undefined) ?? null,
);

  const mapRef = useRef<MapView | null>(null);

  const buoys: BuoyDetailData[] = useMemo(
    () =>
      (data ?? []).filter(
        (b) => Number.isFinite(b.lat) && Number.isFinite(b.lon),
      ),
    [data],
  );

  const selectedArea = useMemo(
    () => (selectedAreaId ? getMarineAreaById(selectedAreaId) : undefined),
    [selectedAreaId],
  );

  const buoysForSelectedArea = useMemo(
    () =>
      selectedArea ? buoysInArea(selectedArea, buoys) : ([] as BuoyDetailData[]),
    [selectedArea, buoys],
  );

  const selectedAreaSummary = useMemo(
    () => (selectedArea ? summarizeArea(buoysForSelectedArea) : null),
    [selectedArea, buoysForSelectedArea],
  );

  const initialRegion = {
    latitude: 0,
    longitude: 0,
    latitudeDelta: 140,
    longitudeDelta: 360,
  };

  // Focus map on targeted buoy (from Explore / Nautical) if provided
  useEffect(() => {
    if (!targetBuoyId || !buoys.length || !mapRef.current) return;

    const match = buoys.find(
      (b) => b.id.toUpperCase() === String(targetBuoyId).toUpperCase(),
    );
    if (!match) return;

    mapRef.current.animateToRegion(
      {
        latitude: match.lat,
        longitude: match.lon,
        latitudeDelta: 6,
        longitudeDelta: 6,
      },
      800,
    );
  }, [targetBuoyId, buoys]);

  // If an initial areaId comes in, center on that area
  useEffect(() => {
    if (!initialAreaId || !mapRef.current) return;
    const area = getMarineAreaById(initialAreaId);
    if (!area) return;
    setSelectedAreaId(area.id);
    const center = getMarineAreaCenter(area);
    mapRef.current.animateToRegion(
      {
        latitude: center.latitude,
        longitude: center.longitude,
        latitudeDelta: 12,
        longitudeDelta: 12,
      },
      800,
    );
  }, [initialAreaId]);

  return (
    <View style={styles.container}>
      {/* Header overlay */}
      <View style={styles.header}>
        <Text style={typography.title}>Buoy Map</Text>
        <Text style={typography.subtitle}>
          Live NOAA buoys – severity by color, extremes pulsing
        </Text>

        {/* Legend chip */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: '#22c55e' }]}
            />
            <Text style={styles.legendLabel}>Calm</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: '#eab308' }]}
            />
            <Text style={styles.legendLabel}>Moderate</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: '#f97316' }]}
            />
            <Text style={styles.legendLabel}>Rough</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: '#ef4444' }]}
            />
            <Text style={styles.legendLabel}>Extreme</Text>
          </View>
        </View>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" />
            <Text style={styles.loadingText}>Loading buoys…</Text>
          </View>
        )}
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
      >
        {/* Marine area polygons */}
        {MARINE_AREAS.map((area) => {
          const { bounds } = area;
          const coords = [
            { latitude: bounds.minLat, longitude: bounds.minLon },
            { latitude: bounds.minLat, longitude: bounds.maxLon },
            { latitude: bounds.maxLat, longitude: bounds.maxLon },
            { latitude: bounds.maxLat, longitude: bounds.minLon },
          ];

          const isSelected = area.id === selectedAreaId;

          // crude size heuristic: big open-ocean areas vs smaller coastal boxes
          const spanLat = bounds.maxLat - bounds.minLat;
          const spanLon = bounds.maxLon - bounds.minLon;
          const isLarge = spanLat > 20 || spanLon > 35;

          return (
            <Polygon
              key={area.id}
              coordinates={coords}
              tappable
              strokeColor={
                isSelected
                  ? 'rgba(56, 189, 248, 0.95)'
                  : 'rgba(148, 163, 184, 0.8)'
              }
              fillColor={
                isSelected
                  ? 'rgba(15, 23, 42, 0.55)'
                  : 'rgba(15, 23, 42, 0.35)'
              }
              strokeWidth={isSelected ? 2 : 1}
              zIndex={isLarge ? 0 : 10}      // 🔑 coastal > open-ocean
              onPress={() => setSelectedAreaId(area.id)}
            />
          );
        })}


        {/* Buoy markers */}
        {buoys.map((b) => {
          const waveFt =
            b.waveHeightM != null ? b.waveHeightM * 3.28084 : null;
          const windKts = b.windSpeedKts ?? null;
          const severity = getSeverity(b.waveHeightM ?? null, windKts);
          const color = getSeverityColor(severity);

          const wavesText =
            waveFt != null ? `Waves ${waveFt.toFixed(1)} ft` : 'Waves —';
          const windText =
            windKts != null ? `Wind ${windKts.toFixed(0)} kt` : 'Wind —';

          const waterVal = formatWaterTemp(b.waterTempC, tempUnit);
          const waterText = waterVal ? `Water ${waterVal}` : null;

          const parts = [wavesText, windText];
          if (waterText) parts.push(waterText);
          const description = parts.join(' · ');

          const displayName = b.name ?? b.id;
          const coordinate = { latitude: b.lat, longitude: b.lon };

          const handleCalloutPress = () =>
            router.push({
              pathname: '/buoy/[buoyId]',
              params: { buoyId: b.id, name: displayName },
            });

          if (severity === 'extreme') {
            return (
              <ExtremeMarker
                key={b.id}
                coordinate={coordinate}
                color={color}
                title={displayName}
                description={description}
                onPress={handleCalloutPress}
              />
            );
          }

          return (
            <Marker
              key={b.id}
              coordinate={coordinate}
              title={displayName}
              description={description}
              pinColor={color}
              onCalloutPress={handleCalloutPress}
            />
          );
        })}
      </MapView>

      {/* Area summary sheet */}
      {selectedArea && selectedAreaSummary && (
        <View style={styles.areaSheet}>
          <View style={{ flex: 1 }}>
            <Text style={styles.areaTitle}>{selectedArea.name}</Text>
            <Text style={styles.areaSubtitle}>
              {selectedArea.region} · {selectedArea.ocean}
            </Text>
            <Text style={styles.areaSubtitle}>
              {selectedAreaSummary.count} buoy
              {selectedAreaSummary.count === 1 ? '' : 's'} in area
            </Text>

            {selectedAreaSummary.highestWave &&
              selectedAreaSummary.highestWave.waveHeightM != null && (
                <Text style={styles.areaSubtitle}>
                  Max Hs{' '}
                  {(
                    selectedAreaSummary.highestWave.waveHeightM * 3.28084
                  ).toFixed(1)}{' '}
                  ft @ {selectedAreaSummary.highestWave.id}
                </Text>
              )}

            {selectedAreaSummary.strongestWind &&
              selectedAreaSummary.strongestWind.windSpeedKts != null && (
                <Text style={styles.areaSubtitle}>
                  Max wind{' '}
                  {selectedAreaSummary.strongestWind.windSpeedKts.toFixed(0)} kt
                  {' @ '}
                  {selectedAreaSummary.strongestWind.id}
                </Text>
              )}

            {selectedAreaSummary.warmestWater &&
              selectedAreaSummary.warmestWater.waterTempC != null && (
                <Text style={styles.areaSubtitle}>
                  Warmest water{' '}
                  {formatWaterTemp(
                    selectedAreaSummary.warmestWater.waterTempC,
                    tempUnit,
                  )}{' '}
                  @ {selectedAreaSummary.warmestWater.id}
                </Text>
              )}

            {selectedAreaSummary.coolestWater &&
              selectedAreaSummary.coolestWater.waterTempC != null && (
                <Text style={styles.areaSubtitle}>
                  Coolest water{' '}
                  {formatWaterTemp(
                    selectedAreaSummary.coolestWater.waterTempC,
                    tempUnit,
                  )}{' '}
                  @ {selectedAreaSummary.coolestWater.id}
                </Text>
              )}
          </View>

          <Pressable
            style={styles.areaButton}
            onPress={() =>
              router.push({
                pathname: '/nautical',
                params: { areaId: selectedArea.id },
              })
            }
          >
            <Text style={styles.areaButtonText}>View Nautical Wx</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  map: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    backgroundColor: 'rgba(15,23,42,0.88)',
    zIndex: 10,
  },
  loadingRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginTop: theme.spacing.xs,
    fontSize: 12,
    color: theme.colors.errorText,
  },
  extremeWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseCircle: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  extremeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  legendRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendLabel: {
    fontSize: 11,
    color: theme.colors.textSecondary,
  },
  areaSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: '#1e293b',
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  areaSubtitle: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 2,
  },
  areaButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#38bdf8',
    marginLeft: 8,
  },
  areaButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#020617',
  },
});
