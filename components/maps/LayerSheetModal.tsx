import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from '../common/Glass';
import { LayerSheet } from './LayerSheet';

import {
  LAYER_CATALOG,
  type LayerGroupId,
} from '../../app/lib/maps/layerCatalog';
import type { LayerId, MapRuntimeState } from '../../app/lib/maps/types';

export type LayerSheetValue = {
  baseMapStyle: 'dark' | 'light';
  radarProvider: 'iem' | 'rainviewer';
};

export function LayerSheetModal(props: {
  visible: boolean;
  onClose: () => void;
  state: MapRuntimeState;
  nerdy: boolean;
  allowedGroups?: LayerGroupId[];
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;
  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
  onOpenStandardMap?: () => void;
  onOpenAstroMap?: () => void;
  onOpenNauticalMap?: () => void;
  onOpenAviationMap?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const {
    visible,
    onClose,
    state,
    allowedGroups,
    onToggleLayer,
    onSetOpacity,
    onOpenLegend,
    onOpenSourceInfo,
    onOpenStandardMap,
    onOpenAstroMap,
    onOpenNauticalMap,
    onOpenAviationMap,
  } = props;

  const activeCount = useMemo(() => {
    return Object.entries(state.layers ?? {})
      .filter(([, runtime]) => runtime?.enabled)
      .filter(([layerId]) => {
        const catalog = LAYER_CATALOG.find((l) => l.id === layerId);
        return catalog ? !allowedGroups?.length || allowedGroups.includes(catalog.group) : false;
      }).length;
  }, [allowedGroups, state.layers]);

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
              paddingHorizontal: 14,
              paddingTop: 14,
              paddingBottom: 0,
              overflow: 'hidden',
            }}
          >

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Pill label="OVERLAYS" />
                  {activeCount ? <Pill label={`${activeCount} active`} subtle /> : null}
                </View>

                <Text style={{ color: 'white', fontWeight: '900', fontSize: 22 }}>Overlay selector</Text>
                <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 4, lineHeight: 18 }}>
                  Toggle map layers directly, then close this menu when you are done.
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

            <ScrollView
              style={{ flex: 1, marginTop: 14 }}
              contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}
              nestedScrollEnabled
              bounces
              alwaysBounceVertical
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <Section title="Special maps" subtitle="Switch between the standard weather map and focused map experiences">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <QuickCard title="Standard Map" subtitle="Weather radar" onPress={onOpenStandardMap} />
                  <QuickCard title="Astronomy Map" subtitle="Sky conditions" onPress={onOpenAstroMap} />
                  <QuickCard title="Nautical Map" subtitle="Marine view" onPress={onOpenNauticalMap} />
                  <QuickCard title="Aviation Map" subtitle="Flight weather" onPress={onOpenAviationMap} />
                </View>
              </Section>

              <View
                style={{
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.10)',
                  marginTop: 16,
                  marginBottom: 14,
                }}
              />

              <LayerSheet
                state={state}
                allowedGroups={allowedGroups}
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

function Section(props: {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={{ color: 'rgba(255,255,255,0.86)', fontWeight: '900', fontSize: 15 }}>{props.title}</Text>
          {props.subtitle ? (
            <Text style={{ color: 'rgba(255,255,255,0.60)', marginTop: 3, fontSize: 12, lineHeight: 17 }}>
              {props.subtitle}
            </Text>
          ) : null}
        </View>

        {props.badge ? <Pill label={props.badge} subtle /> : null}
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 20,
          padding: 12,
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

function QuickCard(props: { title: string; subtitle: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        minWidth: 132,
        paddingVertical: 12,
        paddingHorizontal: 13,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.05)',
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{props.title}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 11, marginTop: 2 }}>
        {props.subtitle}
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
