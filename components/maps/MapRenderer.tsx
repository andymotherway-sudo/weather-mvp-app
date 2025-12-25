// components/maps/MapRenderer.tsx
import React from 'react';
import { View } from 'react-native';
import MapView, { UrlTile, type Region } from 'react-native-maps';

export type RadarOverlay = {
  enabled: boolean;
  baseTemplate: string | null;
  fadeTemplate: string | null;
  baseOpacity: number;
  fadeOpacity: number;
  tileMaxZ: number;
};

export type MapRendererProps = {
  engine?: 'rn-maps' | 'maplibre';

  initialRegion: Region;
  mapStyle: 'dark' | 'light';

  onRegionChangeComplete: (r: Region) => void;
  onPanDrag?: () => void;

  radar: RadarOverlay;
};

export function MapRenderer(props: MapRendererProps) {
  // For now we only implement rn-maps. MapLibre comes next.
  return <MapRendererRNMaps {...props} />;
}

function MapRendererRNMaps(props: MapRendererProps) {
  const { initialRegion, onRegionChangeComplete, onPanDrag, radar } = props;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onRegionChangeComplete={onRegionChangeComplete}
        onPanDrag={onPanDrag}
      >
        {radar.enabled && radar.baseTemplate ? (
          <UrlTile
            urlTemplate={radar.baseTemplate}
            tileSize={256}
            maximumZ={radar.tileMaxZ}
            opacity={radar.baseOpacity}
          />
        ) : null}

        {radar.enabled && radar.fadeTemplate ? (
          <UrlTile
            urlTemplate={radar.fadeTemplate}
            tileSize={256}
            maximumZ={radar.tileMaxZ}
            opacity={radar.fadeOpacity}
          />
        ) : null}
      </MapView>
    </View>
  );
}

export type { Region };

