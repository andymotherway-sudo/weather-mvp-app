// components/maps/ViewSelector.tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MapViewId } from '../../app/lib/maps/types';
import { MAP_VIEWS } from '../../app/lib/maps/views';

export function ViewSelector(props: {
  value: MapViewId;
  onChange: (id: MapViewId) => void;
  nerdy: boolean;
}) {
  const { value, onChange, nerdy } = props;

  const views = MAP_VIEWS.filter((v) => {
    if (v.id === 'storm' && !nerdy) return false;
    return true;
  });

  return (
    // NOTE: keep this container tight; parent Glass provides the “panel”
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {views.map((v) => {
        const active = v.id === value;
        return (
          <Pressable
            key={v.id}
            onPress={() => onChange(v.id)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
              opacity: active ? 1 : 0.92,
            }}
          >
            <Text
              style={{
                color: 'white',
                fontWeight: active ? '800' : '600',
                fontSize: 13,
                letterSpacing: 0.2,
              }}
            >
              {v.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
