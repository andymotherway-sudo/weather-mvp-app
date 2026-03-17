import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Glass } from '../common/Glass';
import { LayerSheet } from './LayerSheet';

import {
  LAYER_CATALOG,
  type LayerGroupId,
} from '../../app/lib/maps/layerCatalog';
import type { LayerId, MapRuntimeState, MapViewId } from '../../app/lib/maps/types';
import { MAP_VIEWS } from '../../app/lib/maps/views';

export type LayerSheetValue = {
  baseMapStyle: 'dark' | 'light';
  radarProvider: 'rainviewer' | 'iem';
};

type SatellitePickId = 'east' | 'west' | 'east-ir' | 'west-ir' | 'east-wv' | 'west-wv';

type SatellitePick = {
  id: SatellitePickId;
  label: string;
  layerIds: LayerId[];
};

const SATELLITE_PICKS: SatellitePick[] = [
  { id: 'east', label: 'East Visible', layerIds: ['sat.goesEast.geocolor'] },
  { id: 'west', label: 'West Visible', layerIds: ['sat.goesWest.geocolor'] },
  { id: 'east-ir', label: 'East IR', layerIds: ['sat.goesEast.ir'] },
  { id: 'west-ir', label: 'West IR', layerIds: ['sat.goesWest.ir'] },
  { id: 'east-wv', label: 'East WV', layerIds: ['sat.goesEast.wv'] },
  { id: 'west-wv', label: 'West WV', layerIds: ['sat.goesWest.wv'] },
];

const SATELLITE_LAYER_IDS: LayerId[] = [
  'sat.clouds',
  'sat.goesEast.geocolor',
  'sat.goesWest.geocolor',
  'sat.goesEast.ir',
  'sat.goesWest.ir',
  'sat.goesEast.wv',
  'sat.goesWest.wv',
];

const PRESET_IDS: MapViewId[] = [
  'radar',
  'clouds',
  'wildfire',
  'storm',
  'aviation',
  'mariner',
  'astronomer',
];

export function LayerSheetModal(props: {
  visible: boolean;
  onClose: () => void;

  state: MapRuntimeState;
  viewId: MapViewId;
  onChangeView: (viewId: MapViewId) => void;

  nerdy: boolean;

  value: LayerSheetValue;
  onChange: (next: LayerSheetValue) => void;

  allowedGroups?: LayerGroupId[];

  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;

  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
}) {
  const {
    visible,
    onClose,
    state,
    viewId,
    onChangeView,
    nerdy,
    value,
    onChange,
    allowedGroups,
    onToggleLayer,
    onSetOpacity,
    onOpenLegend,
    onOpenSourceInfo,
  } = props;

  const allowedCatalogIds = useMemo(() => {
    return new Set(
      LAYER_CATALOG
        .filter((item) => !allowedGroups?.length || allowedGroups.includes(item.group))
        .map((item) => item.id),
    );
  }, [allowedGroups]);

  const presetViews = useMemo(() => {
    return PRESET_IDS
      .map((id) => MAP_VIEWS.find((v) => v.id === id))
      .filter(Boolean)
      .filter((v: any) => {
        if (v.id === 'storm' && !nerdy) return false;
        return true;
      });
  }, [nerdy]);

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
      .filter(Boolean) as Array<{ id: LayerId; title: string; subtitle?: string; opacity: number }>;

    return entries.sort((a, b) => a.title.localeCompare(b.title));
  }, [state.layers, allowedGroups]);

  const satellitePicks = useMemo(() => {
    return SATELLITE_PICKS.map((pick) => {
      const enabledCount = pick.layerIds.filter((id) => state.layers?.[id]?.enabled).length;
      return {
        ...pick,
        active: enabledCount > 0,
      };
    });
  }, [state.layers]);

  const disableLayers = (ids: LayerId[]) => {
    for (const id of ids) {
      if (!allowedCatalogIds.has(id)) continue;
      if (!state.layers?.[id]?.enabled) continue;
      onToggleLayer(id, false);
    }
  };

  const enableLayers = (ids: LayerId[]) => {
    for (const id of ids) {
      if (!allowedCatalogIds.has(id)) continue;
      if (state.layers?.[id]?.enabled) continue;
      onToggleLayer(id, true);
    }
  };

  const applySatellitePick = (pick: SatellitePick) => {
  onChangeView('clouds');
  disableLayers(['radar.reflectivity']);
  disableLayers(SATELLITE_LAYER_IDS);
  enableLayers(pick.layerIds);
};

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.58)',
          justifyContent: 'flex-end',
        }}
      >
        <Pressable onPress={() => {}} style={{ padding: 12 }}>
          <Glass style={{ borderRadius: 24, padding: 16, maxHeight: '90%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: 'white', fontWeight: '900', fontSize: 20 }}>Map controls</Text>
                <Text style={{ color: 'rgba(255,255,255,0.72)', marginTop: 5, lineHeight: 19 }}>
                  Switch map modes, choose satellite products, and tune overlays.
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.14)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900' }}>Done</Text>
              </Pressable>
            </View>

            <Section title="Presets">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {presetViews.map((v: any) => {
                  const active = v.id === viewId;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => onChangeView(v.id)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: active ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.12)',
                        backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                      }}
                    >
                      <Text style={{ color: 'white', fontWeight: active ? '900' : '800', fontSize: 13 }}>
                        {v.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Section title="Satellite">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {satellitePicks.map((pick) => (
                  <Pressable
                    key={pick.id}
                    onPress={() => applySatellitePick(pick)}
                    style={{
                      minWidth: 104,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: pick.active ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.12)',
                      backgroundColor: pick.active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: pick.active ? '900' : '800', fontSize: 12 }}>
                      {pick.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Section>

            <Section title="Map style">
              <Segmented
                options={[
                  { id: 'dark', label: 'Dark' },
                  { id: 'light', label: 'Light' },
                ]}
                value={value.baseMapStyle}
                onChange={(id) => onChange({ ...value, baseMapStyle: id })}
              />
            </Section>

            <Section title="Active layers">
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
                marginTop: 14,
                marginBottom: 12,
              }}
            />

            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
            >
              <LayerSheet
                state={state}
                allowedGroups={allowedGroups}
                onToggleLayer={onToggleLayer}
                onSetOpacity={onSetOpacity}
                onOpenLegend={onOpenLegend}
                onOpenSourceInfo={onOpenSourceInfo}
              />

              {nerdy ? (
                <View style={{ marginTop: 18 }}>
                  <Text
                    style={{
                      color: 'rgba(255,255,255,0.82)',
                      fontWeight: '900',
                      fontSize: 13,
                      marginBottom: 8,
                    }}
                  >
                    Advanced
                  </Text>

                  <View
                    style={{
                      borderWidth: 1,
                      borderRadius: 18,
                      padding: 12,
                      borderColor: 'rgba(255,255,255,0.10)',
                      backgroundColor: 'rgba(2,6,23,0.40)',
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 15 }}>
                      Radar provider
                    </Text>
                    <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 4 }}>
                      Advanced setting for testing and comparison.
                    </Text>

                    <View style={{ marginTop: 10 }}>
                      <Segmented
                        options={[
                          { id: 'rainviewer', label: 'RainViewer' },
                          { id: 'iem', label: 'IEM' },
                        ]}
                        value={value.radarProvider}
                        onChange={(id) => onChange({ ...value, radarProvider: id })}
                      />
                    </View>
                  </View>
                </View>
              ) : null}
            </ScrollView>
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: 'rgba(255,255,255,0.82)', fontWeight: '900', marginBottom: 8 }}>
        {props.title}
      </Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.10)',
          backgroundColor: 'rgba(255,255,255,0.04)',
          borderRadius: 18,
          padding: 12,
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

function Segmented<T extends string>(props: {
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {props.options.map((o) => {
        const active = o.id === props.value;
        return (
          <Pressable
            key={o.id}
            onPress={() => props.onChange(o.id)}
            style={{
              paddingVertical: 9,
              paddingHorizontal: 13,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
              backgroundColor: active ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <Text style={{ color: 'white', fontWeight: active ? '900' : '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}