// app/(tabs)/nautical-map.tsx  (DROP-IN REPLACEMENT)

import MapLibreGL from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useMarineZonesByBbox } from '../lib/nautical/useMarineZonesByBbox';
import type { NauticalZone } from '../lib/nautical/zones';

type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
  zoom?: number;
};

const INITIAL_REGION: Region = {
  latitude: 44.0,
  longitude: -124.5,
  latitudeDelta: 3,
  longitudeDelta: 3,
};

const MAPLIBRE_DARK_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

function lonDeltaFromZoom(z: number) {
  return 360 / Math.pow(2, z);
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

/**
 * Build GeoJSON for MapLibre.
 * - If zonesArcgis returns `geometry` (Polygon/MultiPolygon), we use it directly (best).
 * - Otherwise we fall back to the `polygon` LatLng[] outer ring.
 */
function zonesToFeatureCollection(zones: NauticalZone[]) {
  return {
    type: 'FeatureCollection' as const,
    features: zones.map((z) => {
      const anyZ: any = z as any;

      // Prefer MapLibre-ready geometry if present
      let geometry: any | null = anyZ.geometry ?? null;

      // Fallback to outer ring only
      if (!geometry) {
        const ring = closeRingIfNeeded(z.polygon.map((p) => [p.longitude, p.latitude] as [number, number]));
        geometry = {
          type: 'Polygon' as const,
          coordinates: [ring],
        };
      }

      return {
        type: 'Feature' as const,
        id: z.id,
        properties: {
          id: z.id,
          name: z.name,
          wfo: z.wfo,
        },
        geometry,
      };
    }),
  };
}

export default function NauticalMapTab() {
  const router = useRouter();

  const [region, setRegion] = useState<Region>(INITIAL_REGION);
  const [mapReady, setMapReady] = useState(false);

  // Fetch control: only fetch zones when zoomed in enough
  const zoomedInEnough = region.latitudeDelta < 12 && region.longitudeDelta < 12;
  const bbox = zoomedInEnough ? regionToBbox(region) : null;

  const { zones, loading, error } = useMarineZonesByBbox(bbox);

  // Keep it sane while testing; increase later
  const visibleZones = useMemo(() => zones.slice(0, 300), [zones]);

  const zonesById = useMemo(() => {
    const m = new Map<string, NauticalZone>();
    for (const z of visibleZones) m.set(z.id, z);
    return m;
  }, [visibleZones]);

  const featureCollection = useMemo(
    () => zonesToFeatureCollection(visibleZones),
    [visibleZones],
  );

  // Camera defaults
  const cameraRef = useRef<any>(null);
  const initialCamera = useMemo(() => {
    const centerCoordinate: [number, number] = [INITIAL_REGION.longitude, INITIAL_REGION.latitude];
    const zoomLevel = approxZoomFromLongitudeDelta(INITIAL_REGION.longitudeDelta);
    return { centerCoordinate, zoomLevel };
  }, []);

  // Region updates from MapLibre
  const lastEmitRef = useRef<number>(0);

  const handleRegionDidChange = (e: any) => {
    // We’ll derive region from visibleBounds when available; otherwise from center+zoom.
    const bounds = e?.properties?.visibleBounds;
    const center = e?.properties?.centerCoordinate;
    const zRaw = e?.properties?.zoomLevel;

    const zoom =
      typeof zRaw === 'number' && Number.isFinite(zRaw) ? clamp(zRaw, 1, 20) : undefined;

    if (Array.isArray(bounds) && bounds.length >= 2) {
      // bounds often come as [[west,south],[east,north]]
      const west = Number(bounds[0]?.[0]);
      const south = Number(bounds[0]?.[1]);
      const east = Number(bounds[1]?.[0]);
      const north = Number(bounds[1]?.[1]);

      if ([west, south, east, north].every(Number.isFinite)) {
        const lonDelta = Math.max(0.0001, Math.abs(east - west));
        const latDelta = Math.max(0.0001, Math.abs(north - south));

        // Debounce state churn while panning
        const now = Date.now();
        if (now - lastEmitRef.current > 150) {
          lastEmitRef.current = now;
          setRegion({
            latitude: (south + north) / 2,
            longitude: (west + east) / 2,
            latitudeDelta: latDelta,
            longitudeDelta: lonDelta,
            zoom: zoom ?? approxZoomFromLongitudeDelta(lonDelta),
          });
        }
        return;
      }
    }

    if (Array.isArray(center) && center.length >= 2) {
      const lon = Number(center[0]);
      const lat = Number(center[1]);
      if ([lat, lon].every(Number.isFinite)) {
        const lonDelta = zoom !== undefined ? lonDeltaFromZoom(zoom) : region.longitudeDelta;
        const latDelta = Math.max(0.0001, lonDelta * 0.6);

        const now = Date.now();
        if (now - lastEmitRef.current > 150) {
          lastEmitRef.current = now;
          setRegion({
            latitude: lat,
            longitude: lon,
            latitudeDelta: latDelta,
            longitudeDelta: lonDelta,
            zoom,
          });
        }
      }
    }
  };

  // Make sure MapLibre is initialized enough before trying anything fancy
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#020617' }}>
      <MapLibreGL.MapView
        style={{ flex: 1 }}
        mapStyle={MAPLIBRE_DARK_STYLE_URL}
        logoEnabled={false}
        attributionEnabled={false}
        onRegionDidChange={handleRegionDidChange}
      >
        <MapLibreGL.Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: initialCamera.centerCoordinate,
            zoomLevel: initialCamera.zoomLevel,
          }}
          animationDuration={0}
        />

        {/* Only render layers when map is ready */}
        {mapReady ? (
          <MapLibreGL.ShapeSource
            id="marine-zones"
            shape={featureCollection as any}
            onPress={(e: any) => {
              const f = e?.features?.[0];
              const id = String(f?.properties?.id ?? f?.id ?? '');
              if (!id) return;

              const z = zonesById.get(id);
              if (!z) return;

              router.push({
                pathname: '/nautical/zone/[zoneId]',
                params: {
                  zoneId: z.id,
                  name: z.name,
                  wfo: z.wfo,
                  lat: String(z.centroid.latitude),
                  lon: String(z.centroid.longitude),
                },
              });
            }}
          >
            {/* ✅ This is the key: a near-invisible fill makes taps reliable */}
            <MapLibreGL.FillLayer
              id="marine-zones-hit"
              style={{
                fillOpacity: 0.01, // effectively invisible, but hittable
              }}
            />

            {/* Outline-only visual */}
            <MapLibreGL.LineLayer
              id="marine-zones-outline"
              style={{
                lineColor: 'rgba(59,130,246,0.95)',
                lineWidth: 2,
                lineOpacity: 0.95,
              }}
            />
          </MapLibreGL.ShapeSource>
        ) : null}
      </MapLibreGL.MapView>

      {/* Debug HUD */}
      <View style={{ position: 'absolute', top: 12, left: 12 }}>
        <Text style={{ color: 'white' }}>zoomedInEnough: {String(zoomedInEnough)}</Text>
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
