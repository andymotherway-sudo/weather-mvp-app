// components/maps/BaseMap.tsx
import React from 'react';
import { View } from 'react-native';
import MapView, { MapViewProps, PROVIDER_GOOGLE, Region } from 'react-native-maps';

type Props = {
  initialRegion: Region;
  children?: React.ReactNode;
  mapProps?: Partial<MapViewProps>;
  topOverlay?: React.ReactNode;    // optional (chips, title)
  bottomOverlay?: React.ReactNode; // optional (timeline controls)
};

export function BaseMap(props: Props) {
  const { initialRegion, children, mapProps, topOverlay, bottomOverlay } = props;

  return (
    <View style={{ flex: 1 }}>
      <MapView
        style={{ flex: 1 }}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        {...mapProps}
      >
        {children}
      </MapView>

      {topOverlay ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          {topOverlay}
        </View>
      ) : null}

      {bottomOverlay ? (
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          {bottomOverlay}
        </View>
      ) : null}
    </View>
  );
}
