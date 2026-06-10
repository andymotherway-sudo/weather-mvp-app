import MapLibreGL from '@maplibre/maplibre-react-native';
import { useIsFocused } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';
import type {
  AviationAltitudeFilter,
  AviationHazardFilter,
  AviationProductFilter,
} from '../lib/maps/useAviationMapData';
import { useAviationMapData } from '../lib/maps/useAviationMapData';

type AviationFeature = {
  type: 'Feature';
  id?: string | number;
  properties?: Record<string, any>;
  geometry?: any;
};

const DEFAULT_REGION: Region = {
  latitude: 38.8,
  longitude: -97.6,
  latitudeDelta: 23,
  longitudeDelta: 34,
  zoom: 4,
};

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as AviationFeature[] };
const FL_LEVELS = [10, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 360, 420, 480];

const PRODUCTS: Array<{ key: AviationProductFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'gairmet', label: 'G-AIRMET' },
  { key: 'sigmet', label: 'SIGMET' },
  { key: 'convectiveSigmet', label: 'Conv SIGMET' },
  { key: 'cwa', label: 'CWA' },
  { key: 'other', label: 'Other' },
];

const HAZARDS: Array<{ key: AviationHazardFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'TURB', label: 'Turb' },
  { key: 'ICE', label: 'Ice' },
  { key: 'LLWS', label: 'LLWS' },
  { key: 'IFR_MTN', label: 'IFR/MTN' },
  { key: 'TS', label: 'TS' },
  { key: 'OTHER', label: 'Other' },
];

const ALTITUDES: Array<{ key: AviationAltitudeFilter; label: string; sub: string }> = [
  { key: 'all', label: 'All', sub: 'Any' },
  { key: 'low', label: 'Low', sub: 'SFC-FL120' },
  { key: 'mid', label: 'Mid', sub: 'FL120-FL240' },
  { key: 'high', label: 'High', sub: 'FL240+' },
];

function parseCoord(value: string | undefined) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function regionFromParams(lat?: string, lon?: string): Region {
  const latN = parseCoord(lat);
  const lonN = parseCoord(lon);
  if (latN == null || lonN == null) return DEFAULT_REGION;
  return { latitude: latN, longitude: lonN, latitudeDelta: 5, longitudeDelta: 6.5, zoom: 6 };
}

function fmtTime(value: string | null | undefined) {
  if (!value) return '--';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '--';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeChip(value: string | null | undefined, idx: number) {
  if (!value) return `T${idx + 1}`;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return `T${idx + 1}`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function chooseInitialValidTime(validTimes: string[]) {
  if (!validTimes.length) return null;
  const now = Date.now();
  let best = validTimes[0];
  let bestDelta = Math.abs(Date.parse(best) - now);
  for (const value of validTimes) {
    const delta = Math.abs(Date.parse(value) - now);
    if (delta < bestDelta) {
      best = value;
      bestDelta = delta;
    }
  }
  return best;
}

function featureMatchesTime(feature: AviationFeature, selectedValidTime: string | null) {
  if (!selectedValidTime) return true;
  const key = feature.properties?.validKey;
  return typeof key === 'string' && key === selectedValidTime;
}

function featureMatchesAltitude(feature: AviationFeature, altitude: AviationAltitudeFilter) {
  if (altitude === 'all') return true;
  const bands = String(feature.properties?.altitudeBands ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return bands.includes(altitude);
}

function featureMatchesFlightLevel(feature: AviationFeature, flightLevel: number) {
  const props = feature.properties ?? {};
  const ft = flightLevel * 100;
  const base = typeof props.baseFt === 'number' && Number.isFinite(props.baseFt) ? props.baseFt : null;
  const top = typeof props.topFt === 'number' && Number.isFinite(props.topFt) ? props.topFt : null;

  if (base != null || top != null) {
    const lo = base ?? 0;
    const hi = top ?? base ?? 60000;
    return ft >= lo && ft <= hi;
  }

  if (flightLevel < 120) return featureMatchesAltitude(feature, 'low');
  if (flightLevel < 240) return featureMatchesAltitude(feature, 'mid');
  return featureMatchesAltitude(feature, 'high');
}

function filterHazards(
  features: AviationFeature[],
  product: AviationProductFilter,
  hazard: AviationHazardFilter,
  altitude: AviationAltitudeFilter,
  flightLevel: number,
  selectedValidTime: string | null,
) {
  return {
    type: 'FeatureCollection' as const,
    features: features.filter((feature) => {
      const props = feature.properties ?? {};
      if (product !== 'all' && props.productKey !== product) return false;
      if (hazard !== 'all' && props.hazardKey !== hazard) return false;
      if (!featureMatchesAltitude(feature, altitude)) return false;
      if (!featureMatchesFlightLevel(feature, flightLevel)) return false;
      return featureMatchesTime(feature, selectedValidTime);
    }),
  };
}

function featureTitle(feature: AviationFeature | null) {
  const props = feature?.properties ?? {};
  return [props.hazardType, props.severityLabel !== 'Not specified' ? props.severityLabel : null, props.altitudeLabel]
    .filter(Boolean)
    .join(' / ') || 'Aviation hazard';
}

function featureRows(feature: AviationFeature | null) {
  const props = feature?.properties ?? {};
  return [
    ['Source product', props.sourceProduct],
    ['Hazard type', props.hazardType],
    ['Severity', props.severityLabel],
    ['Altitude', props.altitudeLabel],
    ['Issued', fmtTime(props.issuedTime)],
    ['Valid', fmtTime(props.validTime ?? props.validFrom)],
    ['Expires', fmtTime(props.expiresTime)],
    ['Raw feature id', props.rawFeatureId],
  ].filter(([, value]) => value != null && value !== '');
}

function pickFeature(event: any) {
  return event?.features?.[0] ?? event?.feature ?? null;
}

export default function AviationMapScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const cameraRef = useRef<any>(null);
  const { lat, lon, label } = useLocalSearchParams<{ lat?: string; lon?: string; label?: string }>();
  const initialRegion = useMemo(() => regionFromParams(lat, lon), [lat, lon]);

  const aviation = useAviationMapData(isFocused);
  const [region, setRegion] = useState<Region>(initialRegion);
  const [product, setProduct] = useState<AviationProductFilter>('all');
  const [hazard, setHazard] = useState<AviationHazardFilter>('all');
  const [altitude, setAltitude] = useState<AviationAltitudeFilter>('all');
  const [flightLevel, setFlightLevel] = useState(180);
  const [showObs, setShowObs] = useState(true);
  const [showPireps, setShowPireps] = useState(true);
  const [selectedValidTime, setSelectedValidTime] = useState<string | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<AviationFeature | null>(null);

  useEffect(() => setRegion(initialRegion), [initialRegion]);

  useEffect(() => {
    if (selectedValidTime && aviation.validTimes.includes(selectedValidTime)) return;
    setSelectedValidTime(chooseInitialValidTime(aviation.validTimes));
  }, [aviation.validTimes, selectedValidTime]);

  const hazards = useMemo(
    () => filterHazards(aviation.allHazards.features, product, hazard, altitude, flightLevel, selectedValidTime),
    [altitude, aviation.allHazards.features, flightLevel, hazard, product, selectedValidTime],
  );

  const weatherSymbols = useMemo(() => {
    const features = showPireps ? aviation.pireps.features.map((feature: AviationFeature) => ({
      ...feature,
      properties: {
        ...(feature.properties ?? {}),
        symbolLabel: feature.properties?.iconLabel ?? 'UA',
      },
    })) : [];
    return { type: 'FeatureCollection' as const, features };
  }, [aviation.pireps.features, showPireps]);

  const observationSymbols = useMemo(
    () => ({ type: 'FeatureCollection' as const, features: showObs ? aviation.metars.features : [] }),
    [aviation.metars.features, showObs],
  );

  const legendLine = useMemo(() => {
    const parts = [
      `${hazards.features.length} hazards`,
      selectedValidTime ? `valid ${timeChip(selectedValidTime, 0)}` : 'latest available',
      `FL${String(flightLevel).padStart(3, '0')}`,
    ];
    return parts.join(' / ');
  }, [flightLevel, hazards.features.length, selectedValidTime]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.mapWrap}>
        {isFocused ? (
        <MapRenderer
          cameraRef={cameraRef}
          engine="maplibre"
          initialRegion={region}
          mapStyle="dark"
          boundaryReliefTone="orange"
          regionEventMode="settled"
          onRegionChangeComplete={setRegion}
          onPanDrag={() => {}}
          radar={{ enabled: false, templates: [null, null, null], opacities: [0, 0, 0], tileMaxZ: 0, localImage: null }}
          overlays={[]}
        >
          <MapLibreGL.ShapeSource id="aviation-hazards" shape={hazards as any} onPress={(e) => setSelectedFeature(pickFeature(e))}>
            <MapLibreGL.FillLayer
              id="aviation-hazard-fill"
              style={{
                fillColor: [
                  'match',
                  ['get', 'hazardKey'],
                  'TURB',
                  '#f59e0b',
                  'ICE',
                  '#38bdf8',
                  'LLWS',
                  '#fb7185',
                  'IFR_MTN',
                  '#94a3b8',
                  'TS',
                  '#a78bfa',
                  '#f8fafc',
                ] as any,
                fillOpacity: [
                  'match',
                  ['get', 'severityLabel'],
                  'Severe',
                  0.34,
                  'Extreme',
                  0.42,
                  'Moderate',
                  0.24,
                  0.18,
                ] as any,
              }}
            />
            <MapLibreGL.LineLayer
              id="aviation-hazard-line"
              style={{
                lineColor: [
                  'match',
                  ['get', 'hazardKey'],
                  'TURB',
                  '#fbbf24',
                  'ICE',
                  '#7dd3fc',
                  'LLWS',
                  '#fecdd3',
                  'IFR_MTN',
                  '#e2e8f0',
                  'TS',
                  '#ddd6fe',
                  '#f8fafc',
                ] as any,
                lineOpacity: 0.82,
                lineWidth: ['match', ['get', 'severityLabel'], 'Severe', 2.4, 'Extreme', 2.8, 1.6] as any,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="aviation-hazard-labels"
              minZoomLevel={4}
              style={{
                textField: ['get', 'iconLabel'],
                textSize: ['interpolate', ['linear'], ['zoom'], 4, 10, 7, 12, 10, 14] as any,
                textColor: '#f8fafc',
                textHaloColor: 'rgba(2,6,23,0.96)',
                textHaloWidth: 1.5,
                textAllowOverlap: false,
                textOptional: true,
              }}
            />
          </MapLibreGL.ShapeSource>

          <MapLibreGL.ShapeSource id="aviation-observations" shape={observationSymbols as any}>
            <MapLibreGL.CircleLayer
              id="aviation-observation-dot"
              minZoomLevel={4}
              style={{
                circleColor: ['get', 'stationCategoryColor'] as any,
                circleRadius: ['interpolate', ['linear'], ['zoom'], 4, 3.5, 7, 5.5, 10, 7] as any,
                circleOpacity: 0.92,
                circleStrokeColor: 'rgba(248,250,252,0.92)',
                circleStrokeWidth: 1.4,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="aviation-observation-station"
              minZoomLevel={5}
              style={{
                textField: ['get', 'stationLabel'],
                textSize: 10,
                textColor: 'rgba(226,232,240,0.88)',
                textHaloColor: 'rgba(2,6,23,0.96)',
                textHaloWidth: 1,
                textOffset: [1.2, 1.25],
                textAnchor: 'top-left',
                textAllowOverlap: false,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="aviation-observation-temp"
              minZoomLevel={6}
              style={{
                textField: ['get', 'stationTemp'],
                textSize: 10,
                textColor: 'rgba(248,250,252,0.92)',
                textHaloColor: 'rgba(2,6,23,0.96)',
                textHaloWidth: 1,
                textOffset: [-1.1, -1.1],
                textAnchor: 'bottom-right',
                textAllowOverlap: true,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="aviation-observation-visdew"
              minZoomLevel={7}
              style={{
                textField: ['concat', ['get', 'stationVis'], '\n', ['get', 'stationDew']] as any,
                textSize: 10,
                textColor: 'rgba(226,232,240,0.88)',
                textHaloColor: 'rgba(2,6,23,0.96)',
                textHaloWidth: 1,
                textOffset: [-1.1, 1.1],
                textAnchor: 'top-right',
                textAllowOverlap: true,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="aviation-observation-altim"
              minZoomLevel={7}
              style={{
                textField: ['get', 'stationAltim'],
                textSize: 10,
                textColor: 'rgba(226,232,240,0.88)',
                textHaloColor: 'rgba(2,6,23,0.96)',
                textHaloWidth: 1,
                textOffset: [1.1, -1.05],
                textAnchor: 'bottom-left',
                textAllowOverlap: true,
              }}
            />
          </MapLibreGL.ShapeSource>

          <MapLibreGL.ShapeSource id="aviation-weather-symbols" shape={weatherSymbols as any}>
            <MapLibreGL.CircleLayer
              id="aviation-weather-symbol-dots"
              style={{
                circleColor: ['get', 'iconBgColor'] as any,
                circleRadius: ['interpolate', ['linear'], ['zoom'], 4, 4, 7, 6, 10, 8] as any,
                circleOpacity: 0.9,
                circleStrokeColor: ['get', 'iconStrokeColor'] as any,
                circleStrokeWidth: 1.2,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="aviation-weather-symbol-labels"
              minZoomLevel={5}
              style={{
                textField: ['get', 'symbolLabel'],
                textSize: 9,
                textColor: ['get', 'iconTextColor'] as any,
                textHaloColor: 'rgba(2,6,23,0.9)',
                textHaloWidth: 0.7,
                textAllowOverlap: true,
              }}
            />
          </MapLibreGL.ShapeSource>
        </MapRenderer>
        ) : (
          <View style={{ flex: 1, backgroundColor: '#020617' }} />
        )}
      </View>

      <View pointerEvents="box-none" style={[styles.topPanel, { paddingTop: Math.max(12, insets.top + 4) }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>AVIATION MAP</Text>
            <Text style={styles.title}>{label ? String(label) : 'Hazard layers'}</Text>
            <Text style={styles.sub}>{legendLine}</Text>
          </View>
          {aviation.loading ? <ActivityIndicator color="#fff" /> : null}
        </View>

        <View style={styles.sliderCard}>
          <View style={styles.sliderHead}>
            <Text style={styles.railTitle}>Flight level</Text>
            <Text style={styles.sliderValue}>FL{String(flightLevel).padStart(3, '0')}</Text>
          </View>
          <AltitudeSlider value={flightLevel} onChange={setFlightLevel} />
        </View>

        <Rail title="Altitude">
          {ALTITUDES.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => setAltitude(item.key)}
              style={[styles.altChip, altitude === item.key && styles.chipActive]}
            >
              <Text style={[styles.chipText, altitude === item.key && styles.chipTextActive]}>{item.label}</Text>
              <Text style={styles.chipSub}>{item.sub}</Text>
            </Pressable>
          ))}
        </Rail>

        <Rail title="Product">
          {PRODUCTS.map((item) => (
            <Chip key={item.key} label={item.label} active={product === item.key} onPress={() => setProduct(item.key)} />
          ))}
        </Rail>

        <Rail title="Hazard">
          {HAZARDS.map((item) => (
            <Chip key={item.key} label={item.label} active={hazard === item.key} onPress={() => setHazard(item.key)} />
          ))}
        </Rail>

        <Rail title="Symbols">
          <Chip label="Obs" active={showObs} onPress={() => setShowObs((value) => !value)} />
          <Chip label="PIREPs" active={showPireps} onPress={() => setShowPireps((value) => !value)} />
        </Rail>

        <Rail title="Valid time">
          {aviation.validTimes.length ? (
            aviation.validTimes.slice(0, 12).map((value, idx) => (
              <Chip
                key={value}
                label={timeChip(value, idx)}
                active={selectedValidTime === value}
                onPress={() => setSelectedValidTime(value)}
              />
            ))
          ) : (
            <Text style={styles.emptyText}>No valid snapshots yet</Text>
          )}
        </Rail>

        {aviation.error ? <Text style={styles.errorText}>{aviation.error}</Text> : null}
      </View>

      <View pointerEvents="box-none" style={[styles.bottomPanel, { paddingBottom: Math.max(14, insets.bottom + 8) }]}>
        <View style={styles.legend}>
          <LegendDot color="#fbbf24" label="Turb" />
          <LegendDot color="#7dd3fc" label="Ice" />
          <LegendDot color="#fecdd3" label="LLWS" />
          <LegendDot color="#e2e8f0" label="IFR/MTN" />
          <LegendDot color="#ddd6fe" label="TS" />
          <LegendDot color="#22c55e" label="VFR" />
          <LegendDot color="#3b82f6" label="MVFR" />
          <LegendDot color="#bae6fd" label="PIREPs" />
        </View>

        {selectedFeature ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetEyebrow}>Debug inspector</Text>
                <Text style={styles.sheetTitle}>{featureTitle(selectedFeature)}</Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setSelectedFeature(null)}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            {featureRows(selectedFeature).map(([rowLabel, value]) => (
              <View key={rowLabel} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{rowLabel}</Text>
                <Text style={styles.detailValue}>{String(value)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function AltitudeSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [width, setWidth] = useState(1);
  const idx = Math.max(0, FL_LEVELS.findIndex((level) => level === value));
  const usableWidth = Math.max(1, width - 28);
  const pct = idx / Math.max(1, FL_LEVELS.length - 1);

  const updateFromX = (x: number) => {
    const clamped = Math.max(0, Math.min(usableWidth, x - 14));
    const nextIdx = Math.round((clamped / usableWidth) * (FL_LEVELS.length - 1));
    onChange(FL_LEVELS[nextIdx]);
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => updateFromX(event.nativeEvent.locationX),
        onPanResponderMove: (event) => updateFromX(event.nativeEvent.locationX),
      }),
    [usableWidth],
  );

  return (
    <View style={styles.sliderWrap} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} {...pan.panHandlers}>
      <View style={styles.sliderTrack} />
      <View style={[styles.sliderFill, { width: 14 + usableWidth * pct }]} />
      {FL_LEVELS.map((level, levelIdx) => {
        const left = 14 + (usableWidth * levelIdx) / Math.max(1, FL_LEVELS.length - 1);
        const major = level === 10 || level % 60 === 0;
        return (
          <View key={level} style={[styles.sliderTick, { left, height: major ? 16 : 10, opacity: major ? 0.88 : 0.48 }]} />
        );
      })}
      <View style={[styles.sliderThumb, { left: 14 + usableWidth * pct }]} />
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>FL010</Text>
        <Text style={styles.sliderLabel}>FL180</Text>
        <Text style={styles.sliderLabel}>FL480</Text>
      </View>
    </View>
  );
}

function Rail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.railBlock}>
      <Text style={styles.railTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent}>
        {children}
      </ScrollView>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020617' },
  mapWrap: { ...StyleSheet.absoluteFillObject },
  topPanel: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 12, gap: 8 },
  bottomPanel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, gap: 10 },
  header: {
    borderRadius: 20,
    padding: 12,
    backgroundColor: 'rgba(2,6,23,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: { color: 'rgba(253,186,116,0.92)', fontSize: 11, fontWeight: '900' },
  title: { color: 'white', fontSize: 22, fontWeight: '900', marginTop: 2 },
  sub: { color: 'rgba(255,255,255,0.68)', fontSize: 12, fontWeight: '700', marginTop: 3 },
  railBlock: {
    borderRadius: 16,
    paddingVertical: 9,
    paddingLeft: 10,
    backgroundColor: 'rgba(2,6,23,0.66)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  railTitle: { color: 'rgba(255,255,255,0.56)', fontSize: 10, fontWeight: '900', marginBottom: 8, textTransform: 'uppercase' },
  railContent: { gap: 8, paddingRight: 10 },
  sliderCard: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 11,
    backgroundColor: 'rgba(2,6,23,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderValue: { color: '#fff7ed', fontSize: 13, fontWeight: '900' },
  sliderWrap: { height: 52, justifyContent: 'center' },
  sliderTrack: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 20,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  sliderFill: {
    position: 'absolute',
    left: 14,
    top: 20,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(251,146,60,0.86)',
  },
  sliderTick: {
    position: 'absolute',
    top: 15,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  sliderThumb: {
    position: 'absolute',
    top: 12,
    width: 21,
    height: 21,
    marginLeft: -10.5,
    borderRadius: 999,
    backgroundColor: '#fb923c',
    borderWidth: 3,
    borderColor: '#fff7ed',
  },
  sliderLabels: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' },
  sliderLabel: { color: 'rgba(255,255,255,0.52)', fontSize: 10, fontWeight: '800' },
  chip: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  altChip: {
    width: 86,
    minHeight: 46,
    borderRadius: 13,
    paddingHorizontal: 10,
    alignItems: 'flex-start',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  chipActive: { backgroundColor: 'rgba(251,146,60,0.24)', borderColor: 'rgba(253,186,116,0.58)' },
  chipText: { color: 'rgba(255,255,255,0.74)', fontSize: 12, fontWeight: '900' },
  chipTextActive: { color: '#fff7ed' },
  chipSub: { color: 'rgba(255,255,255,0.46)', fontSize: 10, fontWeight: '800', marginTop: 3 },
  emptyText: { color: 'rgba(255,255,255,0.56)', fontSize: 12, fontWeight: '800', paddingVertical: 8 },
  errorText: {
    color: '#fecaca',
    backgroundColor: 'rgba(127,29,29,0.78)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontWeight: '800',
  },
  legend: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: 'rgba(2,6,23,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 999 },
  legendText: { color: 'rgba(255,255,255,0.74)', fontSize: 11, fontWeight: '800' },
  sheet: {
    borderRadius: 20,
    padding: 12,
    backgroundColor: 'rgba(2,6,23,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  sheetEyebrow: { color: 'rgba(253,186,116,0.9)', fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  sheetTitle: { color: 'white', fontSize: 17, fontWeight: '900', marginTop: 2 },
  closeButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  closeText: { color: 'white', fontWeight: '900', fontSize: 12 },
  detailRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  detailLabel: { color: 'rgba(255,255,255,0.54)', fontSize: 12, fontWeight: '800', flex: 0.9 },
  detailValue: { color: 'rgba(255,255,255,0.90)', fontSize: 12, fontWeight: '800', flex: 1.4, textAlign: 'right' },
});
