import React, { useEffect, useState } from 'react';

import MapLibreGL from '@maplibre/maplibre-react-native';

import type { MarineLayerBudget } from '../../app/lib/maps/layerBudgets';
import type { SelectedMarineFeature } from '../../app/lib/maps/useMarineMapLayer';

type MapCameraRef = React.RefObject<{
  setCamera?: (config: { centerCoordinate: [number, number]; zoomLevel: number; animationDuration: number }) => void;
} | null>;

function clampNumber(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type Props = {
  globalMarineAreasFc: any;
  marineBuoysFc: any;
  marineConditionsEnabled: boolean;
  marineConditionsOpacity: number;
  marineZonesFc: any;
  mapCameraRef: MapCameraRef;
  mapZoom: number;
  selectedGlobalMarineArea: any;
  selectedGlobalMarineAreaFc: any;
  selectedMarineZone: any;
  selectedMarineZoneFc: any;
  setSelectedMarineFeature: (feature: SelectedMarineFeature) => void;
  setSelectedWaterStationId: (id: string | null) => void;
  waterStationsEnabled: boolean;
  waterStationsGeojson: any;
  waterStationsOpacity: number;
  layerBudget: MarineLayerBudget;
};

export function MarineMapLayers({
  globalMarineAreasFc,
  marineBuoysFc,
  marineConditionsEnabled,
  marineConditionsOpacity,
  marineZonesFc,
  mapCameraRef,
  mapZoom,
  selectedGlobalMarineArea,
  selectedGlobalMarineAreaFc,
  selectedMarineZone,
  selectedMarineZoneFc,
  setSelectedMarineFeature,
  setSelectedWaterStationId,
  waterStationsEnabled,
  waterStationsGeojson,
  waterStationsOpacity,
  layerBudget,
}: Props) {
  const [extremePulseOn, setExtremePulseOn] = useState(false);

  useEffect(() => {
    if (!marineConditionsEnabled) {
      setExtremePulseOn(false);
      return;
    }
    const timer = setInterval(() => setExtremePulseOn((value) => !value), 650);
    return () => clearInterval(timer);
  }, [marineConditionsEnabled]);

  const zoomIntoCluster = (feature: any) => {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return;
    mapCameraRef.current?.setCamera?.({
      centerCoordinate: [Number(coords[0]), Number(coords[1])],
      zoomLevel: clampNumber((mapZoom ?? 5) + 2, 1, 20),
      animationDuration: 450,
    });
  };

  return (
    <>
      {marineConditionsEnabled ? (
        <>
          <MapLibreGL.ShapeSource
            id="global-marine-areas-source"
            shape={globalMarineAreasFc as any}
            onPress={(e: any) => {
              const feature = e?.features?.[0];
              const id = String(feature?.properties?.id ?? feature?.id ?? '');
              if (!id) return;
              setSelectedWaterStationId(null);
              setSelectedMarineFeature({ kind: 'globalArea', id });
            }}
          >
            <MapLibreGL.FillLayer
              id="global-marine-areas-fill"
              minZoomLevel={2}
              maxZoomLevel={7.6}
              style={{
                fillColor: [
                  'match',
                  ['get', 'precision'],
                  'official',
                  'rgba(56,189,248,1)',
                  'curated',
                  'rgba(20,184,166,1)',
                  'rgba(20,184,166,1)',
                ] as any,
                fillOpacity: [
                  'match',
                  ['get', 'precision'],
                  'official',
                  0.025,
                  'curated',
                  0.02,
                  ['interpolate', ['linear'], ['zoom'], 2, 0.006, 6.5, 0.014],
                ] as any,
              }}
            />
            <MapLibreGL.LineLayer
              id="global-marine-areas-line"
              minZoomLevel={2}
              maxZoomLevel={7.6}
              style={{
                lineColor: [
                  'match',
                  ['get', 'precision'],
                  'official',
                  'rgba(125,211,252,0.86)',
                  'curated',
                  'rgba(94,234,212,0.78)',
                  'rgba(94,234,212,0.50)',
                ] as any,
                lineJoin: 'round',
                lineWidth: [
                  'match',
                  ['get', 'precision'],
                  'official',
                  ['interpolate', ['linear'], ['zoom'], 2, 0.72, 7.6, 1.4],
                  'curated',
                  ['interpolate', ['linear'], ['zoom'], 2, 0.62, 7.6, 1.2],
                  ['interpolate', ['linear'], ['zoom'], 2, 0.45, 5, 0.72, 7.6, 1],
                ] as any,
                lineOpacity: 0.42 * marineConditionsOpacity,
              }}
            />
          </MapLibreGL.ShapeSource>

          {selectedGlobalMarineArea ? (
            <MapLibreGL.ShapeSource id="selected-global-marine-area-source" shape={selectedGlobalMarineAreaFc as any}>
              <MapLibreGL.FillLayer
                id="selected-global-marine-area-fill"
                style={{
                  fillColor: 'rgba(20,184,166,1)',
                  fillOpacity: 0.018 * marineConditionsOpacity,
                }}
              />
              <MapLibreGL.LineLayer
                id="selected-global-marine-area-line"
                style={{
                  lineColor: 'rgba(153,246,228,0.88)',
                  lineJoin: 'round',
                  lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 1, 7, 1.8] as any,
                  lineOpacity: 0.86 * marineConditionsOpacity,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          <MapLibreGL.ShapeSource
            id="marine-zones-source"
            shape={marineZonesFc as any}
            onPress={(e: any) => {
              const feature = e?.features?.[0];
              const id = String(feature?.properties?.id ?? feature?.id ?? '');
              if (!id) return;
              setSelectedWaterStationId(null);
              setSelectedMarineFeature({ kind: 'zone', id });
            }}
          >
            <MapLibreGL.FillLayer
              id="marine-zones-hit-fill"
              minZoomLevel={3.8}
              style={{
                fillColor: 'rgba(20,184,166,1)',
                fillOpacity: 0.01,
              }}
            />
            <MapLibreGL.LineLayer
              id="marine-zones-line"
              minZoomLevel={3.8}
              style={{
                lineColor: 'rgba(45,212,191,0.72)',
                lineJoin: 'round',
                lineWidth: ['interpolate', ['linear'], ['zoom'], 3.8, 0.34, 7.2, 0.68, 10, 1.05] as any,
                lineOpacity: 0.44 * marineConditionsOpacity,
              }}
            />
          </MapLibreGL.ShapeSource>

          {selectedMarineZone ? (
            <MapLibreGL.ShapeSource id="selected-marine-zone-source" shape={selectedMarineZoneFc as any}>
              <MapLibreGL.FillLayer
                id="selected-marine-zone-fill"
                style={{
                  fillColor: 'rgba(20,184,166,1)',
                  fillOpacity: 0.06 * marineConditionsOpacity,
                }}
              />
              <MapLibreGL.LineLayer
                id="selected-marine-zone-line"
                style={{
                  lineColor: 'rgba(153,246,228,0.92)',
                  lineJoin: 'round',
                  lineWidth: ['interpolate', ['linear'], ['zoom'], 2, 1.05, 7, 1.75, 10, 2.4] as any,
                  lineOpacity: 0.78 * marineConditionsOpacity,
                }}
              />
            </MapLibreGL.ShapeSource>
          ) : null}

          <MapLibreGL.ShapeSource
            id="marine-buoys-source"
            shape={marineBuoysFc as any}
            cluster
            clusterRadius={44}
            clusterMaxZoomLevel={layerBudget.buoyClusterMaxZoom}
            onPress={(e: any) => {
              const feature = e?.features?.[0];
              const props = feature?.properties ?? {};
              const id = String(props.id ?? feature?.id ?? '');

              if (props?.cluster) {
                zoomIntoCluster(feature);
                return;
              }

              if (!id) return;
              setSelectedWaterStationId(null);
              setSelectedMarineFeature({ kind: 'buoy', id });
            }}
          >
            <MapLibreGL.CircleLayer
              id="marine-buoy-clusters"
              filter={['has', 'point_count'] as any}
              style={{
                circleColor: 'rgba(14,165,233,0.38)',
                circleStrokeColor: 'rgba(186,230,253,0.92)',
                circleStrokeWidth: 1.2,
                circleRadius: ['step', ['get', 'point_count'], 14, 25, 18, 75, 22, 200, 26] as any,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="marine-buoy-cluster-count"
              filter={['has', 'point_count'] as any}
              style={{
                textField: ['to-string', ['get', 'point_count']] as any,
                textSize: 12,
                textColor: '#e0f2fe',
                textHaloColor: 'rgba(2,6,23,0.95)',
                textHaloWidth: 1,
              }}
            />
            <MapLibreGL.CircleLayer
              id="marine-buoy-extreme-pulse"
              filter={['all', ['!', ['has', 'point_count']], ['==', ['get', 'severity'], 'extreme']] as any}
              style={{
                circleColor: '#ef4444',
                circleOpacity: (extremePulseOn ? 0.42 : 0.14) * marineConditionsOpacity,
                circleRadius: [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  3,
                  extremePulseOn ? 12 : 7,
                  7,
                  extremePulseOn ? 18 : 10,
                  10,
                  extremePulseOn ? 25 : 14,
                ] as any,
                circleStrokeColor: 'rgba(254,202,202,0.92)',
                circleStrokeOpacity: (extremePulseOn ? 0.95 : 0.32) * marineConditionsOpacity,
                circleStrokeWidth: extremePulseOn ? 2 : 1,
              }}
            />
            <MapLibreGL.CircleLayer
              id="marine-buoy-points"
              filter={['!', ['has', 'point_count']] as any}
              style={{
                circleColor: [
                  'match',
                  ['get', 'severity'],
                  'calm',
                  '#22c55e',
                  'moderate',
                  '#eab308',
                  'rough',
                  '#f97316',
                  'extreme',
                  '#ef4444',
                  '#38bdf8',
                ] as any,
                circleOpacity: 0.94 * marineConditionsOpacity,
                circleRadius: ['interpolate', ['linear'], ['zoom'], 3, 3.5, 7, 5.5, 10, 7.5] as any,
                circleStrokeColor: 'rgba(2,6,23,0.96)',
                circleStrokeWidth: 1.3,
              }}
            />
            <MapLibreGL.SymbolLayer
              id="marine-buoy-labels"
              filter={['all', ['!', ['has', 'point_count']], ['>=', ['zoom'], 6]] as any}
              style={{
                textField: ['get', 'id'] as any,
                textSize: 10,
                textOffset: [0, 1.2],
                textAnchor: 'top',
                textColor: '#e0f2fe',
                textHaloColor: 'rgba(2,6,23,0.95)',
                textHaloWidth: 1,
                textOptional: true,
              }}
            />
          </MapLibreGL.ShapeSource>
        </>
      ) : null}

      {waterStationsEnabled ? (
        <MapLibreGL.ShapeSource
          id="usgs-water-stations-source"
          shape={waterStationsGeojson as any}
          cluster
          clusterRadius={42}
          clusterMaxZoomLevel={layerBudget.waterStationClusterMaxZoom}
          onPress={(e: any) => {
            const feature = e?.features?.[0];
            const props = feature?.properties ?? {};
            const id = String(props.siteId ?? props.id ?? feature?.id ?? '');

            if (props?.cluster) {
              zoomIntoCluster(feature);
              return;
            }

            if (!id) return;
            setSelectedMarineFeature(null);
            setSelectedWaterStationId(id);
          }}
        >
          <MapLibreGL.CircleLayer
            id="usgs-water-station-clusters"
            filter={['has', 'point_count'] as any}
            style={{
              circleColor: 'rgba(56,189,248,0.36)',
              circleStrokeColor: 'rgba(186,230,253,0.94)',
              circleStrokeWidth: 1.2,
              circleOpacity: waterStationsOpacity,
              circleRadius: ['step', ['get', 'point_count'], 13, 20, 17, 60, 21, 160, 25] as any,
            }}
          />
          <MapLibreGL.SymbolLayer
            id="usgs-water-station-cluster-count"
            filter={['has', 'point_count'] as any}
            style={{
              textField: ['to-string', ['get', 'point_count']] as any,
              textSize: 11,
              textColor: '#e0f2fe',
              textHaloColor: 'rgba(2,6,23,0.95)',
              textHaloWidth: 1,
            }}
          />
          <MapLibreGL.CircleLayer
            id="usgs-water-station-points"
            filter={['!', ['has', 'point_count']] as any}
            style={{
              circleColor: '#38bdf8',
              circleOpacity: 0.92 * waterStationsOpacity,
              circleRadius: ['interpolate', ['linear'], ['zoom'], 5, 4, 8, 6.5, 11, 8.5] as any,
              circleStrokeColor: 'rgba(2,6,23,0.96)',
              circleStrokeWidth: 1.25,
            }}
          />
          <MapLibreGL.SymbolLayer
            id="usgs-water-station-labels"
            filter={['all', ['!', ['has', 'point_count']], ['>=', ['zoom'], 8]] as any}
            style={{
              textField: ['get', 'label'] as any,
              textSize: 10,
              textOffset: [0, 1.15],
              textAnchor: 'top',
              textColor: '#e0f2fe',
              textHaloColor: 'rgba(2,6,23,0.95)',
              textHaloWidth: 1,
              textOptional: true,
            }}
          />
        </MapLibreGL.ShapeSource>
      ) : null}
    </>
  );
}
