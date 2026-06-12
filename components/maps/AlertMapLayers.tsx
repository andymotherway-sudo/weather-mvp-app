import React from 'react';

import MapLibreGL from '@maplibre/maplibre-react-native';

type Props = {
  alertsGeojson: any;
  alertsOpacity: number;
  enabled: boolean;
  onPress: (e: any) => void;
};

export function AlertMapLayers({ alertsGeojson, alertsOpacity, enabled, onPress }: Props) {
  if (!enabled) return null;

  return (
    <MapLibreGL.ShapeSource
      id="weather-alerts-source"
      shape={alertsGeojson as any}
      onPress={onPress}
      hitbox={{ width: 44, height: 44 }}
    >
      <MapLibreGL.FillLayer
        id="weather-alerts-fill"
        style={{
          fillColor: ['coalesce', ['get', 'fillColor'], '#a78bfa'] as any,
          fillOpacity: Math.max(0.08, Math.min(0.42, alertsOpacity * 0.28)),
        }}
      />
      <MapLibreGL.LineLayer
        id="weather-alerts-line"
        style={{
          lineColor: ['coalesce', ['get', 'lineColor'], '#ddd6fe'] as any,
          lineOpacity: Math.max(0.38, Math.min(0.96, alertsOpacity)),
          lineWidth: ['match', ['get', 'rank'], 8, 3.3, 7, 2.9, 6, 2.6, 5, 2.4, 2] as any,
        }}
      />
      <MapLibreGL.CircleLayer
        id="weather-alerts-point"
        filter={['==', ['geometry-type'], 'Point'] as any}
        style={{
          circleColor: ['coalesce', ['get', 'fillColor'], '#a78bfa'] as any,
          circleRadius: ['interpolate', ['linear'], ['zoom'], 2, 7, 6, 10, 10, 14] as any,
          circleOpacity: Math.max(0.55, Math.min(0.95, alertsOpacity)),
          circleStrokeColor: ['coalesce', ['get', 'lineColor'], '#ddd6fe'] as any,
          circleStrokeOpacity: Math.max(0.72, Math.min(1, alertsOpacity)),
          circleStrokeWidth: ['match', ['get', 'rank'], 8, 3, 7, 2.6, 6, 2.4, 5, 2.2, 2] as any,
        }}
      />
      <MapLibreGL.SymbolLayer
        id="weather-alerts-label"
        minZoomLevel={5}
        style={{
          textField: ['get', 'label'],
          textSize: ['interpolate', ['linear'], ['zoom'], 5, 9, 8, 11, 11, 13] as any,
          textFont: ['Open Sans Bold'],
          textColor: '#fff7ed',
          textHaloColor: 'rgba(2,6,23,0.96)',
          textHaloWidth: 1.35,
          textMaxWidth: 12,
          textAllowOverlap: false,
          textOptional: true,
        }}
      />
    </MapLibreGL.ShapeSource>
  );
}
