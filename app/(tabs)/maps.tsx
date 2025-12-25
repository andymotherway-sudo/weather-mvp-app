// app/(tabs)/maps.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createInitialMapState, mapReducer } from '../lib/maps/state';

import type { Region } from 'react-native-maps';
import { Glass } from '../../components/common/Glass';
import { LayerSheetModal, type LayerSheetValue } from '../../components/maps/LayerSheetModal';
import { LegendChip } from '../../components/maps/LegendChip';
import { MapRenderer } from '../../components/maps/MapRenderer';
import { RadarLegend } from '../../components/maps/RadarLegend';
import { TimelineScrubber } from '../../components/maps/TimelineScrubber';
import { ViewSelector } from '../../components/maps/ViewSelector';
import type { RadarScan } from '../lib/maps/radarIem';
import {
  buildLocalFallbackFramesUTC,
  buildRainViewerTileUrlForFrame,
  fetchRainViewerFrames,
  iemNationalMosaicTimestamps,
  resolveRadarLayer,
} from '../lib/maps/radarIem';

import { useLocation } from '../context/LocationContext';

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#cbd5e1' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#334155' }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ color: '#e2e8f0' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1f2937' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#64748b' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#e2e8f0' }] },
  { featureType: 'road', elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0b1220' }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

const LIGHT_MAP_STYLE: any[] = [];

function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, waitMs: number) {
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (...args: Parameters<T>) => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => fn(...args), waitMs);
  };
}

function clamp(i: number, n: number) {
  if (n <= 0) return 0;
  return Math.max(0, Math.min(n - 1, Math.floor(i)));
}

function approxZoomFromLongitudeDelta(lonDelta: number) {
  return Math.round(Math.log2(360 / lonDelta));
}

type AnchorMode = 'gps' | 'map';

/**
 * BottomDock: a single “owner” for bottom UI so we never overlap controls.
 * - left / center / right slots
 * - respects safe area
 * - can coexist with your top/side overlays
 */
function BottomDock(props: { left?: React.ReactNode; center?: React.ReactNode; right?: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12 + insets.bottom,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flexShrink: 0 }}>{props.left}</View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>{props.center}</View>
        <View style={{ flexShrink: 0 }}>{props.right}</View>
      </View>
    </View>
  );
}

export default function MapsScreen() {
  const insets = useSafeAreaInsets();

  const [state, dispatch] = React.useReducer(mapReducer, undefined, () =>
    createInitialMapState({ viewId: 'radar', nerdy: false }),
  );

  const { location, permission, loading: locationLoading } = useLocation();
  const mapRef = useRef<MapView | null>(null);

  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [sheetValue, setSheetValue] = useState<LayerSheetValue>({
    baseMapStyle: 'dark',
    radarProvider: 'rainviewer',
  });

  useEffect(() => {
    const enabled = !!state.layers?.['radar.reflectivity']?.enabled;
    if (!enabled) {
      dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'radar.reflectivity', enabled: true });
      dispatch({ type: 'SET_LAYER_OPACITY', layerId: 'radar.reflectivity', opacity: 0.9 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [mapZoom, setMapZoom] = useState<number>(4);

  const [anchorMode, setAnchorMode] = useState<AnchorMode>('gps');
  const [anchorPoint, setAnchorPoint] = useState<{ lat: number; lon: number } | null>(null);

  const [product, setProduct] = useState<'N0Q' | 'N0B' | 'N0Z'>('N0Q');

  const [rvFrames, setRvFrames] = useState<RadarScan[]>([]);
  const [radarError, setRadarError] = useState<string | null>(null);

  useEffect(() => {
    if (permission !== 'granted') return;
    if (!location) return;
    if (anchorMode !== 'gps') return;
    setAnchorPoint({ lat: location.lat, lon: location.lon });
  }, [permission, location, anchorMode]);

  useEffect(() => {
    if (anchorPoint) return;
    if (permission !== 'granted') return;
    if (!location) return;
    setAnchorPoint({ lat: location.lat, lon: location.lon });
  }, [anchorPoint, permission, location]);

  const debouncedAnchorToMap = useDebouncedCallback((lat: number, lon: number) => {
    if (anchorMode !== 'map') return;
    setAnchorPoint({ lat, lon });
  }, 120);

  const selectionPoint = anchorPoint;

  const nationalFrames = useMemo(() => {
    const stamps = iemNationalMosaicTimestamps();
    const now = Date.now();
    const minutes = [50, 45, 40, 35, 30, 25, 20, 15, 10, 5, 0];
    return stamps.map((ts, i) => {
      const iso = new Date(now - minutes[i] * 60_000).toISOString();
      return { iso, stamp: ts };
    });
  }, []);

  const fallbackLocalFrames = useMemo(
    () => buildLocalFallbackFramesUTC({ minutesBack: 60, stepMinutes: 5 }),
    [],
  );

  const radarChoice = useMemo(() => {
    const p = selectionPoint ?? { lat: 39.5, lon: -98.35 };
    const ts =
      nationalFrames[Math.min(state.radarTime.frameIndex, nationalFrames.length - 1)]?.stamp ??
      '900913';
    return resolveRadarLayer(p.lat, p.lon, {
      zoom: mapZoom,
      product,
      localMinZoom: 9.5,
      maxLocalDistanceKm: 300,
      nationalTimestamp: ts,
    });
  }, [selectionPoint?.lat, selectionPoint?.lon, mapZoom, product, nationalFrames, state.radarTime.frameIndex]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setRadarError(null);
        const frames = await fetchRainViewerFrames();
        if (cancelled) return;
        setRvFrames(frames);
      } catch (e: any) {
        if (cancelled) return;
        setRadarError(e?.message ?? 'Failed to load radar timeline');
        setRvFrames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeFrames: RadarScan[] = useMemo(() => {
    if (rvFrames.length) return rvFrames;
    return fallbackLocalFrames;
  }, [rvFrames, fallbackLocalFrames]);

  const frameCount = activeFrames.length;
  const safeFrameIndex = clamp(state.radarTime.frameIndex, frameCount);

  const radarEnabled = !!state.layers['radar.reflectivity']?.enabled;
  const wildfireEnabled = !!state.layers['wildfire.perimeters']?.enabled;

  const radarOpacity = useMemo(() => {
    const configured = state.layers['radar.reflectivity']?.opacity ?? 0.9;
    if (!state.nerdy) return Math.min(1, Math.max(0.75, configured));
    return Math.min(1, Math.max(0.55, configured));
  }, [state.layers, state.nerdy]);

  const [providerLabel, setProviderLabel] = useState<string>('RainViewer');

  const targetUrlTemplate = useMemo(() => {
    if (!radarEnabled) return null;
    const frame = activeFrames[safeFrameIndex];
    if (!frame?.stamp) return null;
    return `__RV__${frame.stamp}`;
  }, [radarEnabled, activeFrames, safeFrameIndex]);

  const [resolvedTargetUrl, setResolvedTargetUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!targetUrlTemplate) {
        setResolvedTargetUrl(null);
        return;
      }

      if (targetUrlTemplate.startsWith('__RV__')) {
        const framePath = targetUrlTemplate.slice('__RV__'.length);
        try {
          const { tileUrl, providerLabel: pl } = await buildRainViewerTileUrlForFrame(framePath);
          if (cancelled) return;
          setProviderLabel(pl);
          const join = tileUrl.includes('?') ? '&' : '?';
          setResolvedTargetUrl(`${tileUrl}${join}cb=${Date.now()}`);
        } catch (e: any) {
          if (cancelled) return;
          setRadarError(e?.message ?? 'Failed to build radar tile url');
          setResolvedTargetUrl(null);
        }
        return;
      }

      setResolvedTargetUrl(targetUrlTemplate);
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUrlTemplate]);

  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [fadeUrl, setFadeUrl] = useState<string | null>(null);
  const [fadeT, setFadeT] = useState(1);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!resolvedTargetUrl) return;
    if (!baseUrl) setBaseUrl(resolvedTargetUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTargetUrl]);

  useEffect(() => {
    if (!resolvedTargetUrl) return;
    if (baseUrl === resolvedTargetUrl) return;

    setFadeUrl(resolvedTargetUrl);
    setFadeT(0);

    const start = Date.now();
    const duration = 280;

    const tick = () => {
      const t = (Date.now() - start) / duration;
      if (t >= 1) {
        setBaseUrl(resolvedTargetUrl);
        setFadeUrl(null);
        setFadeT(1);
        animRef.current = null;
        return;
      }
      setFadeT(t);
      animRef.current = requestAnimationFrame(tick);
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(tick);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [resolvedTargetUrl]);

  const baseOpacity = useMemo(() => {
    if (!fadeUrl) return radarOpacity;
    return radarOpacity * (1 - fadeT);
  }, [fadeUrl, fadeT, radarOpacity]);

  const fadeOpacity = useMemo(() => {
    if (!fadeUrl) return 0;
    return radarOpacity * fadeT;
  }, [fadeUrl, fadeT, radarOpacity]);

  const timestampLabel = useMemo(() => {
    if (frameCount === 0) return 'Latest';
    const iso = activeFrames[safeFrameIndex]?.iso;
    if (!iso) return `Frame ${safeFrameIndex}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return `Frame ${safeFrameIndex}`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [activeFrames, safeFrameIndex, frameCount]);

  const initialRegion = useMemo(() => {
    if (permission === 'granted' && location) {
      return { latitude: location.lat, longitude: location.lon, latitudeDelta: 4, longitudeDelta: 4 };
    }
    return { latitude: 39.5, longitude: -98.35, latitudeDelta: 40, longitudeDelta: 40 };
  }, [permission, location]);

  const canSwitchProduct = state.nerdy;
  const showHud = state.nerdy;

  const recenterToGps = () => {
    if (permission !== 'granted' || !location) return;

    setAnchorMode('gps');
    setAnchorPoint({ lat: location.lat, lon: location.lon });

    mapRef.current?.animateToRegion(
      { latitude: location.lat, longitude: location.lon, latitudeDelta: 4, longitudeDelta: 4 },
      350,
    );
  };

  const radarTileMaxZ = 10;

  // --- Dock sizing: keep legend above scrubber reliably
  // Glass TimelineScrubber usually ends up ~56–72px tall; we give it safe headroom.
  const DOCK_ESTIMATED_HEIGHT = 78;
  const dockBottom = 12 + insets.bottom;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }}>
      <View style={{ flex: 1 }}>
        <MapRenderer
          engine="rn-maps"
          initialRegion={initialRegion}
          mapStyle={sheetValue.baseMapStyle}
          onPanDrag={() => {
            if (anchorMode !== 'map') setAnchorMode('map');
          }}
          onRegionChangeComplete={(r: Region) => {
            setMapZoom(approxZoomFromLongitudeDelta(r.longitudeDelta));
            if (anchorMode === 'map') debouncedAnchorToMap(r.latitude, r.longitude);
          }}
          radar={{
            enabled: radarEnabled,
            baseTemplate: baseUrl,
            fadeTemplate: fadeUrl,
            baseOpacity,
            fadeOpacity,
            tileMaxZ: radarTileMaxZ,
          }}
        />

        {/* Floating top controls */}
        <View style={{ position: 'absolute', left: 12, right: 12, top: 8, gap: 10 }}>
          <Glass style={{ paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: '900' }}>Maps</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ color: 'rgba(255,255,255,0.75)' }}>{timestampLabel}</Text>

                <Pressable
                  onPress={() => dispatch({ type: 'SET_NERDY', nerdy: !state.nerdy })}
                  style={{
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.14)',
                    backgroundColor: state.nerdy ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>
                    {state.nerdy ? 'Nerdy' : 'Simple'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: 8 }}>
              <ViewSelector
                value={state.viewId}
                nerdy={state.nerdy}
                onChange={(id) => dispatch({ type: 'SET_VIEW', viewId: id })}
              />
            </View>

            {canSwitchProduct ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <ChipDark active={product === 'N0Q'} label="N0Q" onPress={() => setProduct('N0Q')} />
                <ChipDark active={product === 'N0B'} label="N0B" onPress={() => setProduct('N0B')} />
                <ChipDark active={product === 'N0Z'} label="N0Z" onPress={() => setProduct('N0Z')} />
              </View>
            ) : null}
          </Glass>

          {showHud ? (
            <Glass style={{ paddingVertical: 10 }}>
              <Text style={{ color: 'white', fontWeight: '900' }}>
                {state.viewId.toUpperCase()} · {state.nerdy ? 'NERDY' : 'SIMPLE'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.80)', marginTop: 4 }}>
                Radar: {radarChoice.tier === 'local' ? 'Local' : 'National'} · {product} ·{' '}
                {frameCount ? `${frameCount} frames` : '…'}
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.80)', marginTop: 2 }}>
                Provider: {providerLabel} · Zoom ~ {mapZoom} (max z={radarTileMaxZ})
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.80)', marginTop: 2 }}>
                Anchor:{' '}
                {permission !== 'granted' ? 'No location' : anchorMode === 'gps' ? 'GPS' : 'Map'}
                {locationLoading ? ' (locating…) ' : ''}
              </Text>
              {radarError ? (
                <Text style={{ color: 'rgba(255,255,255,0.95)', marginTop: 6 }}>⚠ {radarError}</Text>
              ) : null}
            </Glass>
          ) : null}
        </View>

        {/* Right-side actions */}
        <View style={{ position: 'absolute', right: 12, top: 140, gap: 10 }}>
          <Fab label="Layers" onPress={() => setLayersSheetOpen(true)} />
          <Fab label="GPS" onPress={recenterToGps} disabled={permission !== 'granted' || !location} />
        </View>

        {/* Legend (moved ABOVE the dock so it never collides with scrubber) */}
        <View
          style={{
            position: 'absolute',
            left: 12,
            bottom: dockBottom + DOCK_ESTIMATED_HEIGHT + 10,
          }}
        >
          <LegendChip title="dBZ">
            <RadarLegend
              style={sheetValue.radarProvider === 'rainviewer' ? 'rainviewer' : 'generic'}
            />
          </LegendChip>
        </View>

        {/* Bottom Dock: TimelineScrubber is now “docked” and won’t overlap other UI */}
        <BottomDock
          center={
            <Glass style={{ paddingVertical: 8 }}>
              <TimelineScrubber
                state={state}
                frames={activeFrames}
                onSetFrame={(frameIndex) =>
                  dispatch({ type: 'SET_RADAR_FRAME', frameIndex: clamp(frameIndex, frameCount) })
                }
                onSetPlaying={(playing) => {
                  if (playing && frameCount < 2) {
                    dispatch({ type: 'SET_RADAR_PLAYING', playing: false });
                    return;
                  }
                  dispatch({ type: 'SET_RADAR_PLAYING', playing });
                }}
              />
            </Glass>
          }
        />

        {/* Premium Layer Sheet Modal */}
        <LayerSheetModal
          visible={layersSheetOpen}
          onClose={() => setLayersSheetOpen(false)}
          nerdy={state.nerdy}
          value={sheetValue}
          onChange={(next: LayerSheetValue) => setSheetValue(next)}
          state={state}
          radarEnabled={radarEnabled}
          wildfireEnabled={wildfireEnabled}
          onToggleRadar={(enabled: boolean) =>
            dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'radar.reflectivity', enabled })
          }
          onToggleWildfire={(enabled: boolean) =>
            dispatch({ type: 'SET_LAYER_ENABLED', layerId: 'wildfire.perimeters', enabled })
          }
          onToggleLayer={(layerId, enabled) =>
            dispatch({ type: 'SET_LAYER_ENABLED', layerId, enabled })
          }
          onSetOpacity={(layerId, opacity) =>
            dispatch({ type: 'SET_LAYER_OPACITY', layerId, opacity })
          }
        />
      </View>
    </SafeAreaView>
  );
}

function ChipDark(props: { label: string; active?: boolean; onPress: () => void }) {
  const active = !!props.active;
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
        opacity: active ? 1 : 0.9,
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{props.label}</Text>
    </Pressable>
  );
}

function Fab(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
        backgroundColor: 'rgba(2,6,23,0.72)',
        opacity: props.disabled ? 0.5 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 10,
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900' }}>{props.label}</Text>
    </Pressable>
  );
}
