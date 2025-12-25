// components/maps/MapCanvas.tsx
import React from 'react';
import { View } from 'react-native';
import MapView, { UrlTile } from 'react-native-maps';

import { iemRadarTileTemplate } from '../../app/lib/maps/radarIem';
import type { MapRuntimeState } from '../../app/lib/maps/types';

export function MapCanvas(props: {
  state: MapRuntimeState;
  radarStamp: string | 0; // 0=latest or YYYYmmddHHMM for animation frames
}) {
  const { state, radarStamp } = props;

  // MVP default (OKC radar). Next step: auto-select nearest radar for map center.
  const radarId = 'KTLX';
  const product = 'N0Q';

  const radarEnabled = state.layers['radar.reflectivity']?.enabled;

  return (
    <View style={{ flex: 1, borderTopWidth: 1 }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: 39.5,
          longitude: -98.35, // CONUS-ish
          latitudeDelta: 40,
          longitudeDelta: 40,
        }}
      >
        {radarEnabled ? (
          <UrlTile
            urlTemplate={iemRadarTileTemplate({ radarId, product, stamp: radarStamp })}
            maximumZ={12}
            tileSize={256}
            opacity={(state.layers['radar.reflectivity']?.opacity ?? 0.9)}
          />
        ) : null}
      </MapView>
    </View>
  );
}
