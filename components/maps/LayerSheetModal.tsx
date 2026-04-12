import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

type SatellitePickId = 'east' | 'west' | 'merged-truecolor' | 'east-ir' | 'west-ir' | 'east-wv' | 'west-wv';

type SatellitePick = {
  id: SatellitePickId;
  label: string;
  shortLabel: string;
  family: 'visible' | 'true-color' | 'infrared' | 'water-vapor';
  region: 'east' | 'west' | 'merged';
  layerIds: LayerId[];
};

const SATELLITE_PICKS: SatellitePick[] = [
  {
    id: 'east',
    label: 'GOES East Visible',
    shortLabel: 'East Visible',
    family: 'visible',
    region: 'east',
    layerIds: ['sat.goesEast.geocolor'],
  },
  {
    id: 'west',
    label: 'GOES West Visible',
    shortLabel: 'West Visible',
    family: 'visible',
    region: 'west',
    layerIds: ['sat.goesWest.geocolor'],
  },
  {
    id: 'merged-truecolor',
    label: 'GOES True Color',
    shortLabel: 'Merged GeoColor',
    family: 'true-color',
    region: 'merged',
    layerIds: ['sat.goes.truecolor'],
  },
  {
    id: 'east-ir',
    label: 'GOES East Infrared',
    shortLabel: 'East IR',
    family: 'infrared',
    region: 'east',
    layerIds: ['sat.goesEast.ir'],
  },
  {
    id: 'west-ir',
    label: 'GOES West Infrared',
    shortLabel: 'West IR',
    family: 'infrared',
    region: 'west',
    layerIds: ['sat.goesWest.ir'],
  },
  {
    id: 'east-wv',
    label: 'GOES East Water Vapor',
    shortLabel: 'East WV',
    family: 'water-vapor',
    region: 'east',
    layerIds: ['sat.goesEast.wv'],
  },
  {
    id: 'west-wv',
    label: 'GOES West Water Vapor',
    shortLabel: 'West WV',
    family: 'water-vapor',
    region: 'west',
    layerIds: ['sat.goesWest.wv'],
  },
];

const SATELLITE_LAYER_IDS: LayerId[] = [
  'sat.clouds',
  'sat.goesEast.geocolor',
  'sat.goesWest.geocolor',
  'sat.goes.truecolor',
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

  onOpenAstroMap?: () => void;
  onOpenNauticalMap?: () => void;
}) {
  const insets = useSafeAreaInsets();

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
    onOpenAstroMap,
    onOpenNauticalMap,
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
      .filter(Boolean) as { id: LayerId; title: string; subtitle?: string; opacity: number }[];

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

  const visiblePicks = useMemo(() => satellitePicks.filter((p) => p.family === 'visible'), [satellitePicks]);
  const trueColorPicks = useMemo(() => satellitePicks.filter((p) => p.family === 'true-color'), [satellitePicks]);
  const infraredPicks = useMemo(() => satellitePicks.filter((p) => p.family === 'infrared'), [satellitePicks]);
  const waterVaporPicks = useMemo(() => satellitePicks.filter((p) => p.family === 'water-vapor'), [satellitePicks]);

  const activeSatelliteCount = satellitePicks.filter((p) => p.active).length;
  const activePresetTitle = presetViews.find((v: any) => v.id === viewId)?.title ?? 'Map mode';

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

  const clearSatellite = () => {
    disableLayers(SATELLITE_LAYER_IDS);
  };

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
              minHeight: '68%',
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

            <View
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top: 16,
                height: 46,
                borderRadius: 18,
                backgroundColor: 'rgba(59,130,246,0.08)',
              }}
            />

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <Pill label="MAP CONTROLS" />
                  <Pill label={activePresetTitle.toUpperCase()} subtle />
                </View>

                <Text style={{ color: 'white', fontWeight: '900', fontSize: 20 }}>Map controls</Text>
                <Text style={{ color: 'rgba(255,255,255,0.68)', marginTop: 4, lineHeight: 18 }}>
                  Switch modes, manage layers, and jump into specialty maps.
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
              contentContainerStyle={{
                paddingBottom: 24 + insets.bottom,
              }}
              nestedScrollEnabled
              bounces
              alwaysBounceVertical
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <Section title="Special maps" subtitle="Open dedicated astronomy or nautical experiences">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Pressable
                    onPress={onOpenAstroMap}
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
                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>Astronomy Map</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 11, marginTop: 2 }}>
                      Sky conditions
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={onOpenNauticalMap}
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
                    <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>Nautical Map</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 11, marginTop: 2 }}>
                      Marine view
                    </Text>
                  </Pressable>
                </View>
              </Section>

              <Section
                title="Presets"
                badge={`${presetViews.length}`}
                subtitle="Quick weather map modes"
              >
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {presetViews.map((v: any) => {
                    const active = v.id === viewId;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => onChangeView(v.id)}
                        style={{
                          minWidth: 108,
                          paddingVertical: 12,
                          paddingHorizontal: 13,
                          borderRadius: 18,
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

              <Section
                title="Satellite"
                badge={activeSatelliteCount > 0 ? `${activeSatelliteCount} active` : undefined}
                subtitle="Choose one GOES product at a time"
              >
                <SatelliteFamily title="Visible">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {visiblePicks.map((pick) => (
                      <SatelliteCard key={pick.id} pick={pick} onPress={() => applySatellitePick(pick)} />
                    ))}
                  </View>
                </SatelliteFamily>

                <SatelliteFamily title="True color">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {trueColorPicks.map((pick) => (
                      <SatelliteCard key={pick.id} pick={pick} onPress={() => applySatellitePick(pick)} />
                    ))}
                  </View>
                </SatelliteFamily>

                <SatelliteFamily title="Infrared">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {infraredPicks.map((pick) => (
                      <SatelliteCard key={pick.id} pick={pick} onPress={() => applySatellitePick(pick)} />
                    ))}
                  </View>
                </SatelliteFamily>

                <SatelliteFamily title="Water vapor">
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {waterVaporPicks.map((pick) => (
                      <SatelliteCard key={pick.id} pick={pick} onPress={() => applySatellitePick(pick)} />
                    ))}
                  </View>
                </SatelliteFamily>

                <View style={{ marginTop: 12 }}>
                  <Pressable
                    onPress={clearSatellite}
                    style={{
                      alignSelf: 'flex-start',
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: 'rgba(255,255,255,0.12)',
                      backgroundColor: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>
                      Clear satellite layers
                    </Text>
                  </Pressable>
                </View>
              </Section>

              <Section title="Map style" subtitle="Base map appearance">
                <Segmented
                  options={[
                    { id: 'dark', label: 'Dark' },
                    { id: 'light', label: 'Light' },
                  ]}
                  value={value.baseMapStyle}
                  onChange={(id) => onChange({ ...value, baseMapStyle: id })}
                />
              </Section>

              <Section
                title="Active layers"
                badge={activeLayers.length ? `${activeLayers.length}` : undefined}
                subtitle="Tap any chip to turn that layer off"
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
                      borderRadius: 20,
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

function SatelliteFamily(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={{
          color: 'rgba(255,255,255,0.72)',
          fontWeight: '900',
          fontSize: 12,
          letterSpacing: 0.5,
          marginBottom: 8,
        }}
      >
        {props.title.toUpperCase()}
      </Text>
      {props.children}
    </View>
  );
}

function SatelliteCard(props: {
  pick: SatellitePick & { active?: boolean };
  onPress: () => void;
}) {
  const { pick, onPress } = props;
  const active = !!pick.active;

  return (
    <Pressable
      onPress={onPress}
      style={{
        minWidth: 130,
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: active ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.12)',
        backgroundColor: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{pick.shortLabel}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.62)', fontWeight: '700', fontSize: 11, marginTop: 2 }}>
        {pick.region === 'merged' ? 'East + West blend' : pick.region === 'east' ? 'Atlantic / East' : 'Pacific / West'}
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

function Segmented<T extends string>(props: {
  options: { id: T; label: string }[];
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
