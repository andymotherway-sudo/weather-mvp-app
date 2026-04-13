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

  onOpenAstroMap?: () => void;
  onOpenNauticalMap?: () => void;
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
    onOpenAstroMap,
    onOpenNauticalMap,
  } = props;

  const activeLayers = useMemo(() => {
    const entries = Object.entries(state.layers ?? {})
      .filter(([, runtime]) => runtime?.enabled)
      .map(([layerId, runtime]) => {
        const catalog = LAYER_CATALOG.find((l) => l.id === layerId);
        if (!catalog) return null;
        if (allowedGroups?.length && !allowedGroups.includes(catalog.group)) return null;

        return {
          id: catalog.id,
          title: catalog.title,
          subtitle: catalog.subtitle,
          opacity: runtime?.opacity ?? catalog.defaultOpacity ?? 1,
        };
      })
      .filter(Boolean) as { id: LayerId; title: string; subtitle?: string; opacity: number }[];

    return entries.sort((a, b) => a.title.localeCompare(b.title));
  }, [allowedGroups, state.layers]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.62)',
        }}
      >
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

        <View
          style={{
            paddingHorizontal: 10,
            paddingTop: 12,
            paddingBottom: 10 + Math.max(insets.bottom, 6),
          }}
        >
          <Glass
            style={{
              borderRadius: 28,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 0,
              maxHeight: '92%',
              minHeight: '64%',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 44,
                height: 5,
                borderRadius: 999,
                backgroundColor: 'rgba(255,255,255,0.18)',
                marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Pill label="LAYERS" />
                  {activeLayers.length ? <Pill label={`${activeLayers.length} active`} subtle /> : null}
                </View>

                <Text style={{ color: 'white', fontWeight: '900', fontSize: 20 }}>Map layers</Text>
                <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 4, lineHeight: 18 }}>
                  Toggle individual overlays and keep the combinations you want on-screen.
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
              <Section title="Special maps" subtitle="Open dedicated astronomy or nautical experiences">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <QuickCard
                    title="Astronomy Map"
                    subtitle="Sky conditions"
                    onPress={onOpenAstroMap}
                  />
                  <QuickCard
                    title="Nautical Map"
                    subtitle="Marine view"
                    onPress={onOpenNauticalMap}
                  />
                </View>
              </Section>

              <Section
                title="Active now"
                badge={activeLayers.length ? `${activeLayers.length}` : undefined}
                subtitle="Tap a chip to turn that layer off quickly"
              >
                {activeLayers.length ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {activeLayers.map((layer) => (
                      <Pressable
                        key={layer.id}
                        onPress={() => onToggleLayer(layer.id, false)}
                        style={{
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.14)',
                          backgroundColor: 'rgba(255,255,255,0.08)',
                        }}
                      >
                        <Text style={{ color: 'white', fontWeight: '800' }}>
                          {layer.title}
                          {layer.subtitle ? ` · ${layer.subtitle}` : ''}
                          {` · ${Math.round(layer.opacity * 100)}%`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.65)' }}>
                    No overlays are currently enabled.
                  </Text>
                )}
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
          <Text style={{ color: 'rgba(255,255,255,0.86)', fontWeight: '900', fontSize: 15 }}>
            {props.title}
          </Text>
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
