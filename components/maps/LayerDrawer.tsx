// components/maps/LayerDrawer.tsx
import React from 'react';
import { ScrollView, View } from 'react-native';

import type { LayerId, MapRuntimeState } from '../../app/lib/maps/types';
import { LayerSheet } from './LayerSheet';

export function LayerDrawer(props: {
  state: MapRuntimeState;
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;

  // optional: wire these later if you add a legend/source modal
  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
}) {
  const { state, onToggleLayer, onSetOpacity, onOpenLegend, onOpenSourceInfo } = props;

  // Scroll wrapper here keeps LayerSheet simple and prevents clipping in drawers
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 18 }}>
      <View style={{ padding: 0 }}>
        <LayerSheet
          state={state}
          onToggleLayer={onToggleLayer}
          onSetOpacity={onSetOpacity}
          onOpenLegend={onOpenLegend}
          onOpenSourceInfo={onOpenSourceInfo}
        />
      </View>
    </ScrollView>
  );
}
