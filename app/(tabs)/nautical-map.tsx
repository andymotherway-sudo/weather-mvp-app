// app/(tabs)/nautical-map.tsx
//
// MapLibre Nautical map (zones + buoys) with ALWAYS-VISIBLE flashing “extreme” buoys.
// ✅ No clouds / no radar here (clean map)
// ✅ Tap buoy -> selection sheet -> Open -> /buoy/[buoyId]
// ✅ Tap extreme beacon -> also selects + shows sheet
// ✅ Can start where Weather Map was (lat/lon + deltas/zoom) when coming from Maps
// ✅ HARD reset per navigation token (nav) to avoid “camera lock” / reused instance issues

import MapLibreGL from '@maplibre/maplibre-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Region } from '../../components/maps/MapRenderer';
import { MapRenderer } from '../../components/maps/MapRenderer';

import { useSettings } from '../context/SettingsContext';
import { useAllBuoyDetails } from '../lib/buoys/detailHooks';
import type { BuoyDetailData } from '../lib/buoys/noaaTypes';

import { useMarineZonesByBbox } from '../lib/nautical/useMarineZonesByBbox';
import type { NauticalZone } from '../lib/nautical/zones';

type Severity = 'calm' | 'moderate' | 'rough' | 'extreme';

const DEFAULT_REGION: Region = {
  latitude: 44.0,
  longitude: -124.5,
  latitudeDelta: 3,
  longitudeDelta: 3,
  zoom: 5,
};

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}
function lonDeltaFromZoom(z: number) {
  return 360 / Math.pow(2, z);
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function regionToBbox(region: Region) {
  const west = region.longitude - region.longitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const north = region.latitude + region.latitudeDelta / 2;
  return { west, south, east, north };
}

function closeRingIfNeeded(coords: Array<[number, number]>) {
  if (coords.length < 3) return coords;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return coords;
  return [...coords, first];
}

function zonesToFeatureCollection(zones: NauticalZone[]) {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((z) => {
      const anyZ: any = z as any;
      let geometry: any | null = anyZ.geometry ?? null;

      if (!geometry && Array.isArray((z as any).polygon) && (z as any).polygon.length) {
        const ring = closeRingIfNeeded(
          (z as any).polygon.map((p: any) => [p.longitude, p.latitude] as [number, number]),
        );
        geometry = { type: 'Polygon' as const, coordinates: [ring] };
      }

      if (!geometry) {
        geometry = { type: 'Polygon' as const, coordinates: [[[0, 0], [0, 0], [0, 0], [0, 0]]] };
      }

      return {
        type: 'Feature' as const,
        id: z.id,
        properties: { kind: 'zone', id: z.id, name: z.name, wfo: z.wfo },
        geometry,
      };
    }),
  };
}

function getSeverity(waveM: number | null | undefined, windKts: number | null | undefined): Severity {
  const ft = waveM != null ? waveM * 3.28084 : null;
  const w = windKts ?? 0;

  if ((ft == null || ft < 3) && w < 15) return 'calm';
  if (ft != null && ft < 6 && w < 25) return 'moderate';
  if ((ft != null && ft < 10) || w < 35) return 'rough';
  return 'extreme';
}

function buoysToFeatureCollection(buoys: Array<BuoyDetailData & { __severity?: Severity }>) {
  return {
    type: 'FeatureCollection' as const,
    features: buoys.map((b) => ({
      type: 'Feature' as const,
      id: b.id,
      properties: {
        kind: 'buoy',
        id: b.id,
        name: b.name ?? b.id,
        severity: (b.__severity ?? getSeverity(b.waveHeightM ?? null, b.windSpeedKts ?? null)) as Severity,
      },
      geometry: { type: 'Point' as const, coordinates: [b.lon, b.lat] as [number, number] },
    })),
  };
}

function formatWaterTemp(valueC: number | null | undefined, unit: 'F' | 'C') {
  if (valueC == null) return null;
  if (unit === 'C') return `${valueC.toFixed(1)} °C`;
  const f = (valueC * 9) / 5 + 32;
  return `${f.toFixed(1)} °F`;
}

export default function NauticalMapTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tempUnit } = useSettings();

  const cameraRef = useRef<any>(null);

  const {
    buoyId: targetBuoyId,
    lat,
    lon,
    latDelta,
    lonDelta,
    zoom,
    nav,
  } = useLocalSearchParams<{
    buoyId?: string;
    lat?: string;
    lon?: string;
    latDelta?: string;
    lonDelta?: string;
    zoom?: string;
    nav?: string;
  }>();

  // ✅ force remount of the MapRenderer (breaks “camera lock” / stale map state)
  const mapKey = useMemo(() => {
    const k = String(nav ?? '');
    return k ? `nautical:${k}` : 'nautical:static';
  }, [nav]);

  // ✅ derive initial region from params if present
  const initialRegionFromParams: Region = useMemo(() => {
    const latN = lat != null ? Number(lat) : NaN;
    const lonN = lon != null ? Number(lon) : NaN;

    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return DEFAULT_REGION;

    const zFromParams = zoom != null && Number.isFinite(Number(zoom)) ? Number(zoom) : null;
    const latD = latDelta != null && Number.isFinite(Number(latDelta)) ? Number(latDelta) : null;
    const lonD = lonDelta != null && Number.isFinite(Number(lonDelta)) ? Number(lonDelta) : null;

    const zGuess = zFromParams ?? (lonD != null ? approxZoomFromLongitudeDelta(lonD) : (DEFAULT_REGION.zoom ?? 6));

    return {
      latitude: latN,
      longitude: lonN,
      latitudeDelta: latD ?? Math.max(0.0001, (lonD ?? lonDeltaFromZoom(zGuess)) * 0.6),
      longitudeDelta: lonD ?? lonDeltaFromZoom(zGuess),
      zoom: zGuess,
    };
  }, [lat, lon, latDelta, lonDelta, zoom]);

  // Region is for bbox fetch + HUD only
  const [region, setRegion] = useState<Region>(initialRegionFromParams);
  useEffect(() => setRegion(initialRegionFromParams), [initialRegionFromParams]);

  const [mapZoom, setMapZoom] = useState<number>(
    initialRegionFromParams.zoom ?? approxZoomFromLongitudeDelta(initialRegionFromParams.longitudeDelta),
  );
  useEffect(() => {
    setMapZoom(initialRegionFromParams.zoom ?? approxZoomFromLongitudeDelta(initialRegionFromParams.longitudeDelta));
  }, [initialRegionFromParams]);

  const mapZoomRef = useRef(mapZoom);
  useEffect(() => {
    mapZoomRef.current = mapZoom;
  }, [mapZoom]);

  // Pulse for extreme beacons
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    let alive = true;
    const t0 = Date.now();
    const id = setInterval(() => {
      if (!alive) return;
      const t = (Date.now() - t0) / 1000;
      const p = (Math.sin(t * Math.PI * 2 * 0.85) + 1) / 2;
      setPulse(p);
    }, 50);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Zones
  const zoomedInEnough = mapZoom >= 4;
  const bbox = zoomedInEnough ? regionToBbox(region) : null;
  const { zones, loading: zonesLoading, error: zonesError } = useMarineZonesByBbox(bbox);

  const zonesSafe = zones ?? [];
  const maxZones = mapZoom < 4 ? 0 : mapZoom < 6 ? 600 : mapZoom < 8 ? 1200 : 2500;

  const visibleZones = useMemo(() => zonesSafe.slice(0, maxZones), [zonesSafe, maxZones]);
  const zonesById = useMemo(() => new Map(visibleZones.map((z) => [z.id, z])), [visibleZones]);
  const zonesFC = useMemo(() => zonesToFeatureCollection(visibleZones), [visibleZones]);

  // Buoys
  const { data: buoyData, loading: buoysLoading, error: buoysError } = useAllBuoyDetails();

  const buoysAll: BuoyDetailData[] = useMemo(
    () => (buoyData ?? []).filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lon)),
    [buoyData],
  );

  const buoysWithSeverity = useMemo(
    () =>
      buoysAll.map((b) => ({
        ...b,
        __severity: getSeverity(b.waveHeightM ?? null, b.windSpeedKts ?? null) as Severity,
      })),
    [buoysAll],
  );

  const extremeBuoys = useMemo(() => buoysWithSeverity.filter((b) => b.__severity === 'extreme'), [buoysWithSeverity]);
  const normalBuoys = useMemo(() => buoysWithSeverity.filter((b) => b.__severity !== 'extreme'), [buoysWithSeverity]);

  const buoysById = useMemo(() => new Map(buoysAll.map((b) => [b.id, b])), [buoysAll]);

  const buoysFC = useMemo(() => buoysToFeatureCollection(normalBuoys), [normalBuoys]);
  const extremeBuoysFC = useMemo(() => buoysToFeatureCollection(extremeBuoys), [extremeBuoys]);

  // Selection
  const [selected, setSelected] = useState<
    | { kind: 'buoy'; id: string }
    | { kind: 'zone'; id: string }
    | null
  >(null);

  const selectedBuoy = selected?.kind === 'buoy' ? buoysById.get(selected.id) ?? null : null;
  const selectedZone = selected?.kind === 'zone' ? zonesById.get(selected.id) ?? null : null;

  // ✅ if a buoy deep-link is provided, center once after buoy list loads
  const didCenterBuoyRef = useRef<string>('');
  useEffect(() => {
    if (!targetBuoyId || !buoysAll.length) return;

    const key = `buoy:${String(targetBuoyId).toUpperCase()}@nav:${String(nav ?? '')}`;
    if (didCenterBuoyRef.current === key) return;

    const match = buoysAll.find((b) => b.id.toUpperCase() === String(targetBuoyId).toUpperCase());
    if (!match) return;

    didCenterBuoyRef.current = key;
    setSelected({ kind: 'buoy', id: match.id });

    const z = 6;
    cameraRef.current?.setCamera?.({
      centerCoordinate: [match.lon, match.lat],
      zoomLevel: z,
      animationDuration: 650,
    });
  }, [targetBuoyId, buoysAll, nav]);

  const buoyColorExpr: any = [
    'match',
    ['get', 'severity'],
    'calm', '#22c55e',
    'moderate', '#eab308',
    'rough', '#f97316',
    'extreme', '#ef4444',
    '#6b7280',
  ];

  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        <MapRenderer
          key={mapKey}                 // ✅ hard remount per nav
          engine="maplibre"
          initialRegion={initialRegionFromParams} // ✅ start where caller asked
          mapStyle="dark"
          radar={{ enabled: false, templates: [], opacities: [], tileMaxZ: 7, localImage: null }}
          overlays={[]}
          cameraRef={cameraRef}
          onPanDrag={() => {}}
          onRegionChangeComplete={(r: Region) => {
            const zFloat =
              typeof (r as any).zoom === 'number' && Number.isFinite((r as any).zoom)
                ? (r as any).zoom
                : approxZoomFromLongitudeDelta(r.longitudeDelta);

            setMapZoom(zFloat);

            if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
            regionDebounceRef.current = setTimeout(() => {
              setRegion(r);
            }, 150);
          }}
        >
          {/* ZONES */}
          <MapLibreGL.ShapeSource
            id="marine-zones"
            shape={zonesFC as any}
            onPress={(e: any) => {
              const f = e?.features?.[0];
              const id = String(f?.properties?.id ?? f?.id ?? '');
              if (!id) return;
              setSelected({ kind: 'zone', id });
            }}
          >
            <MapLibreGL.FillLayer id="marine-zones-fill" style={{ fillColor: 'rgba(59,130,246,0.18)', fillOpacity: 1 }} />
            <MapLibreGL.FillLayer id="marine-zones-hit" style={{ fillOpacity: 0.01 }} />
            <MapLibreGL.LineLayer
              id="marine-zones-outline"
              style={{ lineColor: 'rgba(59,130,246,0.9)', lineWidth: 2, lineOpacity: 0.9 }}
            />
          </MapLibreGL.ShapeSource>

          {/* EXTREME BUOYS */}
          <MapLibreGL.ShapeSource
            id="extreme-buoys"
            shape={extremeBuoysFC as any}
            onPress={(e: any) => {
              const f = e?.features?.[0];
              const props = f?.properties ?? {};
              const id = String(props.id ?? f?.id ?? '');
              if (!id) return;
              setSelected({ kind: 'buoy', id });
            }}
          >
            <MapLibreGL.CircleLayer
              id="extreme-buoy-beacon"
              style={{
                circleColor: 'rgba(239,68,68,1)',
                circleOpacity: 0.12 + 0.30 * pulse,
                circleRadius: 10 + 14 * pulse,
              }}
            />
            <MapLibreGL.CircleLayer
              id="extreme-buoy-core"
              style={{
                circleColor: '#ef4444',
                circleOpacity: 0.96,
                circleRadius: 5,
                circleStrokeColor: 'rgba(2,6,23,0.95)',
                circleStrokeWidth: 1.5,
              }}
            />
          </MapLibreGL.ShapeSource>

          {/* NORMAL BUOYS (CLUSTERED) */}
          <MapLibreGL.ShapeSource
            id="buoys"
            shape={buoysFC as any}
            cluster
            clusterRadius={44}
            clusterMaxZoomLevel={8}
            onPress={(e: any) => {
              const f = e?.features?.[0];
              const props = f?.properties ?? {};
              const id = String(props.id ?? f?.id ?? '');

              if (props?.cluster) {
                const coords = f?.geometry?.coordinates;
                if (Array.isArray(coords) && coords.length >= 2) {
                  const [lonN, latN] = coords as [number, number];
                  const nextZoom = clamp((mapZoomRef.current ?? 5) + 2, 1, 20);
                  cameraRef.current?.setCamera?.({
                    centerCoordinate: [lonN, latN],
                    zoomLevel: nextZoom,
                    animationDuration: 450,
                  });
                }
                return;
              }

              if (id) setSelected({ kind: 'buoy', id });
            }}
          >
            <MapLibreGL.CircleLayer
              id="buoy-clusters"
              filter={['has', 'point_count']}
              style={{
                circleColor: 'rgba(148,163,184,0.30)',
                circleStrokeColor: 'rgba(148,163,184,0.9)',
                circleStrokeWidth: 1,
                circleRadius: ['step', ['get', 'point_count'], 14, 25, 18, 75, 22, 200, 26],
              }}
            />
            <MapLibreGL.SymbolLayer
              id="buoy-cluster-count"
              filter={['has', 'point_count']}
              style={{
                textField: ['to-string', ['get', 'point_count']],
                textSize: 12,
                textColor: '#e5e7eb',
                textHaloColor: 'rgba(2,6,23,0.95)',
                textHaloWidth: 1,
              }}
            />
            <MapLibreGL.CircleLayer
              id="buoy-dots"
              filter={['!', ['has', 'point_count']]}
              style={{
                circleColor: buoyColorExpr,
                circleRadius: 5,
                circleStrokeColor: 'rgba(2,6,23,0.95)',
                circleStrokeWidth: 1.5,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="buoy-labels"
              filter={['all', ['!', ['has', 'point_count']], ['>=', ['zoom'], 6]]}
              style={{
                textField: ['get', 'id'],
                textSize: 10,
                textOffset: [0, 1.2],
                textAnchor: 'top',
                textColor: '#e5e7eb',
                textHaloColor: 'rgba(2,6,23,0.95)',
                textHaloWidth: 1,
              }}
            />
          </MapLibreGL.ShapeSource>
        </MapRenderer>

        {/* Top HUD */}
        <View style={{ position: 'absolute', top: 12, left: 12, right: 12 }}>
          <View
            style={{
              backgroundColor: 'rgba(15,23,42,0.88)',
              borderRadius: 14,
              padding: 10,
              borderWidth: 1,
              borderColor: '#1e293b',
            }}
          >
            <Text style={{ color: '#e5e7eb', fontWeight: '900', fontSize: 16 }}>Nautical Map</Text>
            <Text style={{ color: '#94a3b8', marginTop: 2, fontSize: 11 }}>
              Buoys + Forecast Zones · extremes: {extremeBuoys.length}
            </Text>

            <View style={{ marginTop: 8, flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ color: '#e5e7eb', fontSize: 11 }}>buoys: {buoysAll.length}</Text>
              <Text style={{ color: '#e5e7eb', fontSize: 11 }}>
                zones: {zonesSafe.length} {zoomedInEnough ? '' : '(zoom in to z4+)'}
              </Text>
              <Text style={{ color: '#e5e7eb', fontSize: 11 }}>z~{Math.round(mapZoom)}</Text>
            </View>

            {(buoysLoading || zonesLoading) && (
              <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center' }}>
                <ActivityIndicator size="small" />
                <Text style={{ color: '#94a3b8', marginLeft: 8, fontSize: 11 }}>Loading…</Text>
              </View>
            )}

            {!!buoysError && (
              <Text style={{ color: 'salmon', marginTop: 6, fontSize: 11 }}>BUOY ERROR: {String(buoysError)}</Text>
            )}
            {!!zonesError && (
              <Text style={{ color: 'salmon', marginTop: 6, fontSize: 11 }}>ZONE ERROR: {String(zonesError)}</Text>
            )}
          </View>
        </View>

        {/* Selection sheet */}
        {selectedBuoy ? (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 12 + insets.bottom,
              padding: 12,
              borderRadius: 16,
              backgroundColor: '#020617',
              borderWidth: 1,
              borderColor: '#1e293b',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#e5e7eb', fontWeight: '800' }}>{selectedBuoy.name ?? selectedBuoy.id}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
                Waves {selectedBuoy.waveHeightM != null ? `${(selectedBuoy.waveHeightM * 3.28084).toFixed(1)} ft` : '—'}
                {' · '}
                Wind {selectedBuoy.windSpeedKts != null ? `${selectedBuoy.windSpeedKts.toFixed(0)} kt` : '—'}
                {formatWaterTemp(selectedBuoy.waterTempC, tempUnit) ? ` · Water ${formatWaterTemp(selectedBuoy.waterTempC, tempUnit)}` : ''}
              </Text>
            </View>

            <Pressable
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#38bdf8' }}
              onPress={() =>
                router.push({
                  pathname: '/buoy/[buoyId]',
                  params: { buoyId: selectedBuoy.id, name: selectedBuoy.name ?? selectedBuoy.id },
                })
              }
            >
              <Text style={{ color: '#020617', fontWeight: '900', fontSize: 12 }}>Open</Text>
            </Pressable>

            <Pressable
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: '#0f172a',
                borderWidth: 1,
                borderColor: '#1e293b',
              }}
              onPress={() => setSelected(null)}
            >
              <Text style={{ color: '#e5e7eb', fontWeight: '900', fontSize: 12 }}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {selectedZone ? (
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 12 + insets.bottom,
              padding: 12,
              borderRadius: 16,
              backgroundColor: '#020617',
              borderWidth: 1,
              borderColor: '#1e293b',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#e5e7eb', fontWeight: '800' }}>{selectedZone.name ?? selectedZone.id}</Text>
              <Text style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
                Zone {selectedZone.id} · WFO {selectedZone.wfo}
              </Text>
            </View>

            <Pressable
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: '#38bdf8' }}
              onPress={() =>
                router.push({
                  pathname: '/nautical/zone/[zoneId]',
                  params: {
                    zoneId: selectedZone.id,
                    name: selectedZone.name,
                    wfo: selectedZone.wfo,
                    lat: String((selectedZone as any)?.centroid?.latitude ?? ''),
                    lon: String((selectedZone as any)?.centroid?.longitude ?? ''),
                  },
                })
              }
            >
              <Text style={{ color: '#020617', fontWeight: '900', fontSize: 12 }}>Forecast</Text>
            </Pressable>

            <Pressable
              style={{
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: '#0f172a',
                borderWidth: 1,
                borderColor: '#1e293b',
              }}
              onPress={() => setSelected(null)}
            >
              <Text style={{ color: '#e5e7eb', fontWeight: '900', fontSize: 12 }}>✕</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
