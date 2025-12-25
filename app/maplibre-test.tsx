import MapLibreGL from '@maplibre/maplibre-react-native';
import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { RadarOverlay } from './lib/maps/radar/RadarOverlay';
import { useAnimatedRadar } from './lib/maps/radar/useAnimatedRadar';

const DEMO_STYLE = 'https://demotiles.maplibre.org/style.json';

function PillButton(props: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: props.active ? '#111c' : '#0008',
      }}
    >
      <Text style={{ color: 'white' }}>{props.label}</Text>
    </Pressable>
  );
}

export default function MapLibreTestScreen() {
  const cameraRef = useRef<any>(null);
  const [zoom, setZoom] = useState(4);

  const radar = useAnimatedRadar({
    enabled: true,     // initial play state
    intervalMs: 1500,  // initial speed
    fadeMs: 600,
    opacity: 0.75,
  });

  function setZoomSafe(next: number) {
    const clamped = Math.max(1, Math.min(16, next));
    setZoom(clamped);
    cameraRef.current?.setCamera({
      zoomLevel: clamped,
      animationDuration: 200,
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <MapLibreGL.MapView style={{ flex: 1 }} mapStyle={DEMO_STYLE}>
        <MapLibreGL.Camera
          ref={cameraRef}
          zoomLevel={zoom}
          centerCoordinate={[-112.074, 33.448]}
          animationDuration={0}
        />

        <RadarOverlay
          templateA={radar.templateA}
          templateB={radar.templateB}
          opacityA={radar.opacityA}
          opacityB={radar.opacityB}
        />
      </MapLibreGL.MapView>

      {/* Left controls: play/pause + speed */}
      <View
        style={{
          position: 'absolute',
          left: 16,
          bottom: 32,
          gap: 8,
        }}
      >
        <PillButton
          label={radar.isPlaying ? 'Pause' : 'Play'}
          onPress={() => radar.setIsPlaying(!radar.isPlaying)}
          active={radar.isPlaying}
        />

        <PillButton
          label="Speed: Fast"
          onPress={() => radar.setSpeedMs(800)}
          active={radar.speedMs === 800}
        />
        <PillButton
          label="Speed: Normal"
          onPress={() => radar.setSpeedMs(1500)}
          active={radar.speedMs === 1500}
        />
        <PillButton
          label="Speed: Slow"
          onPress={() => radar.setSpeedMs(2500)}
          active={radar.speedMs === 2500}
        />
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap', maxWidth: 240 }}>
  {radar.frames.map((f, idx) => {
    const active = idx === radar.frameIndex;
    return (
      <Pressable
        key={`${f}-${idx}`}
        onPress={() => radar.jumpTo(idx)}
        style={{
          paddingVertical: 6,
          paddingHorizontal: 8,
          borderRadius: 10,
          backgroundColor: active ? '#111c' : '#0008',
        }}
      >
        <Text style={{ color: 'white', fontSize: 12 }}>
          {f === 'latest' ? 'Now' : f.replace('m', '').toUpperCase()}
        </Text>
      </Pressable>
    );
  })}
</View>


      {/* Right controls: zoom */}
      <View
        style={{
          position: 'absolute',
          right: 16,
          bottom: 32,
          alignItems: 'center',
          gap: 8,
        }}
      >
        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: '#0008',
          }}
        >
          <Text style={{ color: 'white' }}>Zoom: {zoom.toFixed(1)}</Text>
        </View>

        <Pressable
          onPress={() => setZoomSafe(zoom + 1)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: '#0008',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 22 }}>+</Text>
        </Pressable>

        <Pressable
          onPress={() => setZoomSafe(zoom - 1)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            backgroundColor: '#0008',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: 'white', fontSize: 26, marginTop: -2 }}>−</Text>
        </Pressable>
      </View>
    </View>
  );
}
