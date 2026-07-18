import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../common/Glass';
import { LayerSheet, type LayerSheetMode } from './LayerSheet';

import {
  LAYER_CATALOG,
} from '../../app/lib/maps/layerCatalog';
import type { LayerId, MapRuntimeState } from '../../app/lib/maps/types';

export function LayerSheetModal(props: {
  visible: boolean;
  onClose: () => void;
  state: MapRuntimeState;
  nerdy: boolean;
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;
  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
  onOpenStandardMap?: () => void;
  onOpenAstroMap?: () => void;
  onOpenAviationMap?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {
    visible,
    onClose,
    state,
    onToggleLayer,
    onSetOpacity,
    onOpenLegend,
    onOpenSourceInfo,
    onOpenStandardMap,
    onOpenAstroMap,
    onOpenAviationMap,
  } = props;

  const [mode, setMode] = useState<LayerSheetMode>('standard');

  useEffect(() => {
    setMode(state.viewId === 'aviation' ? 'aviation' : 'standard');
  }, [state.viewId, visible]);

  const activeCount = useMemo(() => {
    const activeGroups = mode === 'aviation'
      ? new Set(['aviation'])
      : new Set(['weather', 'fireAir', 'marine', 'reference']);

    return Object.entries(state.layers ?? {})
      .filter(([, runtime]) => runtime?.enabled)
      .filter(([layerId]) => {
        const catalog = LAYER_CATALOG.find((layer) => layer.id === layerId);
        return catalog ? activeGroups.has(catalog.group) : false;
      }).length;
  }, [mode, state.layers]);

  const handleSelectMode = (nextMode: 'standard' | 'aviation' | 'astronomy') => {
    if (nextMode === 'astronomy') {
      onClose();
      onOpenAstroMap?.();
      return;
    }

    setMode(nextMode);
    if (nextMode === 'standard') onOpenStandardMap?.();
    if (nextMode === 'aviation') onOpenAviationMap?.();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,6,23,0.94)' }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: 10,
            paddingTop: 10 + Math.max(insets.top, 6),
            paddingBottom: 10 + Math.max(insets.bottom, 6),
          }}
        >
          <Glass
            style={{
              flex: 1,
              borderRadius: 28,
              overflow: 'hidden',
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Pill label="MAP LAYERS" />
                    {activeCount ? <Pill label={`${activeCount} active`} subtle /> : null}
                  </View>

                  <Text style={{ color: 'white', fontWeight: '900', fontSize: 22 }}>Overlay selector</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 4, lineHeight: 18 }}>
                    Layers apply live as you toggle them. Use the grouped sections below to move faster.
                  </Text>
                </View>

                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 13,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.12)',
                    backgroundColor: 'rgba(255,255,255,0.05)',
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: '900' }}>Done</Text>
                </Pressable>
              </View>

              <View
                style={{
                  marginTop: 14,
                  padding: 4,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.10)',
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  flexDirection: 'row',
                  gap: 4,
                }}
              >
                <SegmentButton
                  label="Standard"
                  active={mode === 'standard'}
                  onPress={() => handleSelectMode('standard')}
                />
                <SegmentButton
                  label="Aviation"
                  active={mode === 'aviation'}
                  onPress={() => handleSelectMode('aviation')}
                />
                <SegmentButton
                  label="Astronomy"
                  active={false}
                  onPress={() => handleSelectMode('astronomy')}
                />
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} />

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 + insets.bottom }}
              nestedScrollEnabled
              bounces
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <LayerSheet
                state={state}
                mode={mode}
                onToggleLayer={onToggleLayer}
                onSetOpacity={onSetOpacity}
                onOpenLegend={onOpenLegend}
                onOpenSourceInfo={onOpenSourceInfo}
              />
            </ScrollView>
          </Glass>
        </View>
      </View>
    </Modal>
  );
}

function SegmentButton(props: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        flex: 1,
        minHeight: 38,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: props.active ? 'rgba(125,211,252,0.24)' : 'transparent',
        backgroundColor: props.active ? 'rgba(96,165,250,0.16)' : 'transparent',
      }}
    >
      <Text style={{ color: props.active ? 'white' : 'rgba(255,255,255,0.76)', fontSize: 12, fontWeight: '900' }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

function Pill(props: { label: string; subtle?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: props.subtle ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
      }}
    >
      <Text
        style={{
          color: props.subtle ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.94)',
          fontSize: 11,
          fontWeight: '900',
          letterSpacing: 0.6,
        }}
      >
        {props.label}
      </Text>
    </View>
  );
}
