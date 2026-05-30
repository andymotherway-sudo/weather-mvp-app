// components/maps/ViewSelector.tsx
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { MapViewId } from '../../app/lib/maps/types';
import { MAP_VIEWS } from '../../app/lib/maps/views';

const VIEW_SELECTOR_IDS: MapViewId[] = [
  'radar',
  'aviation',
  'mariner',
  'astronomer',
];

export function ViewSelector(props: {
  value: MapViewId;
  onChange: (id: MapViewId) => void;
  nerdy: boolean;
  ids?: MapViewId[];
}) {
  const { value, onChange, nerdy, ids } = props;

  const views = useMemo(() => {
    const viewIds = ids?.length ? ids : VIEW_SELECTOR_IDS;

    return viewIds
      .map((id) => MAP_VIEWS.find((v) => v.id === id))
      .filter(Boolean)
      .filter((v: any) => {
        if (v.id === 'storm' && !nerdy) return false;
        if (v.nerdyOnly && !nerdy) return false;
        return true;
      });
  }, [ids, nerdy]);

  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {views.map((v: any) => {
        const active = v.id === value;
        return (
          <Pressable
            key={v.id}
            onPress={() => onChange(v.id)}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 11,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
              backgroundColor: active ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)',
              opacity: active ? 1 : 0.94,
            }}
          >
            <Text
              style={{
                color: 'white',
                fontWeight: active ? '800' : '700',
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
