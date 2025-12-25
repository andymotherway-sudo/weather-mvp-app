import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  LAYER_CATALOG,
  LAYER_GROUPS,
  type LayerCatalogItem,
  type LayerGroupId,
} from '../../app/lib/maps/layerCatalog';
import type { LayerId, MapRuntimeState } from '../../app/lib/maps/types';

type Props = {
  state: MapRuntimeState;
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;

  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
};

function OpacityRow(props: { value: number; onChange: (v: number) => void }) {
  const steps = [0.25, 0.4, 0.55, 0.7, 0.85, 1] as const;
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
      {steps.map((s) => {
        const active = Math.abs(props.value - s) < 0.01;
        return (
          <Pressable
            key={s}
            onPress={() => props.onChange(s)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
              opacity: active ? 1 : 0.9,
            }}
          >
            <Text style={{ fontWeight: '900', color: 'white' }}>{Math.round(s * 100)}%</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function resolveSupports(layer: LayerCatalogItem) {
  const supportsOpacity = layer.supportsOpacity ?? true;

  const supportsLegend = layer.supportsLegend ?? (layer.legendKey ? true : false);

  const supportsSourceInfo = layer.supportsSourceInfo ?? (layer.source ? true : false);

  return { supportsOpacity, supportsLegend, supportsSourceInfo };
}

export function LayerSheet(props: Props) {
  if (!props?.state) {
    return (
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: '900', color: 'white' }}>Layers</Text>
        <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 6 }}>
          Loading map state…
        </Text>
      </View>
    );
  }

  const isNerdy = props.state.nerdy;

  const [expanded, setExpanded] = useState<Partial<Record<LayerId, boolean>>>({});

  const grouped = useMemo(() => {
    const visible = LAYER_CATALOG.filter((l) => {
      if (l.visibility === 'nerdy') return isNerdy;
      return true;
    });

    const map: Record<LayerGroupId, LayerCatalogItem[]> = {
      weather: [],
      fire: [],
      storm: [],
      aviation: [],
    };

    for (const item of visible) map[item.group].push(item);

    (Object.keys(map) as LayerGroupId[]).forEach((k) => {
      map[k] = [...map[k]].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
    });

    return map;
  }, [isNerdy]);

  const toggleExpanded = (id: LayerId) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <View style={{ padding: 12, gap: 14 }}>
      {LAYER_GROUPS.map((g) => {
        const items = grouped[g.id] ?? [];
        if (!items.length) return null;

        return (
          <View key={g.id} style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '900', color: 'rgba(255,255,255,0.85)' }}>
              {g.title}
            </Text>

            {items.map((layer) => {
              const runtime = props.state.layers?.[layer.id];
              const enabled = runtime?.enabled ?? false;
              const opacity = runtime?.opacity ?? layer.defaultOpacity;

              const { supportsOpacity, supportsLegend, supportsSourceInfo } = resolveSupports(layer);

              const canLegend = supportsLegend && !!layer.legendKey;
              const canSource = supportsSourceInfo && !!layer.source;
              const anySettings = supportsOpacity || canLegend || canSource;

              const isExpanded = !!expanded[layer.id];

              return (
                <View
                  key={layer.id}
                  style={{
                    borderWidth: 1,
                    borderRadius: 16,
                    padding: 12,
                    borderColor: 'rgba(255,255,255,0.10)',
                    backgroundColor: 'rgba(2,6,23,0.45)',
                  }}
                >
                  {/* Primary row */}
                  <Pressable
                    onPress={() => props.onToggleLayer(layer.id, !enabled)}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 10 }}>
                      <Text style={{ fontWeight: '900', fontSize: 15, color: 'white' }}>
                        {layer.title}
                      </Text>
                      {layer.subtitle ? (
                        <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 2 }}>
                          {layer.subtitle}
                        </Text>
                      ) : null}
                    </View>

                    <View
                      style={{
                        width: 52,
                        height: 30,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.16)',
                        backgroundColor: enabled ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                        alignItems: enabled ? 'flex-end' : 'flex-start',
                        justifyContent: 'center',
                        paddingHorizontal: 4,
                        opacity: enabled ? 1 : 0.9,
                      }}
                    >
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.18)',
                          backgroundColor: enabled ? 'rgba(255,255,255,0.18)' : 'transparent',
                        }}
                      />
                    </View>
                  </Pressable>

                  {/* Secondary row */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      marginTop: 10,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: 'rgba(255,255,255,0.70)' }}>
                      {enabled ? `On · ${Math.round(opacity * 100)}%` : 'Off'}
                    </Text>

                    {anySettings ? (
                      <Pressable
                        onPress={() => toggleExpanded(layer.id)}
                        style={{
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.14)',
                          backgroundColor: 'rgba(255,255,255,0.04)',
                        }}
                      >
                        <Text style={{ fontWeight: '900', color: 'white' }}>
                          {isExpanded ? 'Hide' : 'Settings'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {/* Expanded settings */}
                  {isExpanded ? (
                    <View style={{ marginTop: 12 }}>
                      {supportsOpacity ? (
                        <>
                          <Text style={{ fontWeight: '900', color: 'rgba(255,255,255,0.85)' }}>
                            Opacity
                          </Text>
                          <OpacityRow
                            value={opacity}
                            onChange={(v) => props.onSetOpacity(layer.id, v)}
                          />
                        </>
                      ) : null}

                      {(canLegend || canSource) ? (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                          {canLegend ? (
                            <Pressable
                              onPress={() => props.onOpenLegend?.(layer.id)}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.14)',
                                backgroundColor: 'rgba(255,255,255,0.04)',
                              }}
                            >
                              <Text style={{ fontWeight: '900', color: 'white' }}>Legend</Text>
                            </Pressable>
                          ) : null}

                          {canSource ? (
                            <Pressable
                              onPress={() => props.onOpenSourceInfo?.(layer.id)}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.14)',
                                backgroundColor: 'rgba(255,255,255,0.04)',
                              }}
                            >
                              <Text style={{ fontWeight: '900', color: 'white' }}>Source</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}

                      {canSource && layer.source ? (
                        <View style={{ marginTop: 10 }}>
                          <Text style={{ fontWeight: '900', color: 'white' }}>{layer.source.name}</Text>
                          {layer.source.details ? (
                            <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 2 }}>
                              {layer.source.details}
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
