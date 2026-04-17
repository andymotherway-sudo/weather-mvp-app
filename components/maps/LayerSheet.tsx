import { useMemo, useState } from 'react';
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
  allowedGroups?: LayerGroupId[];

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
              paddingVertical: 7,
              paddingHorizontal: 11,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.12)',
              backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <Text style={{ fontWeight: active ? '900' : '800', color: 'white' }}>
              {Math.round(s * 100)}%
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function resolveSupports(layer: LayerCatalogItem) {
  const supportsOpacity = layer.supportsOpacity ?? true;
  const supportsLegend = layer.supportsLegend ?? !!layer.legendKey;
  const supportsSourceInfo = layer.supportsSourceInfo ?? !!layer.source;
  return { supportsOpacity, supportsLegend, supportsSourceInfo };
}

function emptyGrouped(): Record<LayerGroupId, LayerCatalogItem[]> {
  return {
    weather: [],
    fireAir: [],
    aviation: [],
    marine: [],
    astronomy: [],
    reference: [],
  };
}

function Switch(props: { enabled: boolean; onPress: () => void }) {
  const { enabled, onPress } = props;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: 52,
        height: 30,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: enabled ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.14)',
        backgroundColor: enabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
        alignItems: enabled ? 'flex-end' : 'flex-start',
        justifyContent: 'center',
        paddingHorizontal: 4,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.18)',
          backgroundColor: enabled ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
        }}
      />
    </Pressable>
  );
}

function ActionPill(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: 'rgba(255,255,255,0.05)',
      }}
    >
      <Text style={{ fontWeight: '900', color: 'white' }}>{props.label}</Text>
    </Pressable>
  );
}

export function LayerSheet(props: Props) {
  const state = props?.state;
  const isNerdy = !!state?.nerdy;

  const [expanded, setExpanded] = useState<Partial<Record<LayerId, boolean>>>({});

  const grouped = useMemo(() => {
    if (!state) return emptyGrouped();

    const visible = LAYER_CATALOG.filter((layer) => {
      if (layer.visibility === 'nerdy' && !isNerdy) return false;
      if (props.allowedGroups?.length && !props.allowedGroups.includes(layer.group)) return false;
      return true;
    });

    const map = emptyGrouped();

    for (const item of visible) {
      map[item.group].push(item);
    }

    (Object.keys(map) as LayerGroupId[]).forEach((k) => {
      map[k] = [...map[k]].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
    });

    return map;
  }, [state, isNerdy, props.allowedGroups]);

  const visibleGroupOrder = useMemo(() => {
    if (!props.allowedGroups?.length) return LAYER_GROUPS;
    return LAYER_GROUPS.filter((g) => props.allowedGroups?.includes(g.id));
  }, [props.allowedGroups]);

  const toggleExpanded = (id: LayerId) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (!state) {
    return (
      <View style={{ padding: 12 }}>
        <Text style={{ fontWeight: '900', color: 'white' }}>Overlays</Text>
        <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 6 }}>Loading map state…</Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: 2, paddingTop: 2, paddingBottom: 6, gap: 16 }}>
      {visibleGroupOrder.map((group) => {
        const items = grouped[group.id] ?? [];
        if (!items.length) return null;

        return (
          <View key={group.id} style={{ gap: 10 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '900',
                color: 'rgba(255,255,255,0.82)',
                paddingHorizontal: 2,
              }}
            >
              {group.title}
            </Text>

            {items.map((layer) => {
              const runtime = state.layers?.[layer.id];
              const enabled = runtime?.enabled ?? false;
              const opacity = runtime?.opacity ?? layer.defaultOpacity ?? 1;

              const { supportsOpacity, supportsLegend, supportsSourceInfo } = resolveSupports(layer);
              const canLegend = supportsLegend && !!layer.legendKey;
              const canSource = supportsSourceInfo && !!layer.source;
              const hasExpandableContent = supportsOpacity || canLegend || canSource;
              const isExpanded = !!expanded[layer.id];

              return (
                <View
                  key={layer.id}
                  style={{
                    borderWidth: 1,
                    borderRadius: 18,
                    padding: 12,
                    borderColor: enabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)',
                    backgroundColor: enabled ? 'rgba(2,6,23,0.52)' : 'rgba(2,6,23,0.34)',
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        if (hasExpandableContent) toggleExpanded(layer.id);
                      }}
                      style={{ flex: 1 }}
                    >
                      <View style={{ paddingRight: 4 }}>
                        <Text
                          style={{
                            fontWeight: '900',
                            fontSize: 15,
                            color: 'white',
                            opacity: enabled ? 1 : 0.92,
                          }}
                        >
                          {layer.title}
                        </Text>

                        {layer.subtitle ? (
                          <Text
                            style={{
                              color: 'rgba(255,255,255,0.68)',
                              marginTop: 3,
                              lineHeight: 18,
                            }}
                          >
                            {layer.subtitle}
                          </Text>
                        ) : null}

                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 8,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Text
                            style={{
                              color: enabled ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.55)',
                              fontWeight: '700',
                            }}
                          >
                            {enabled ? `On · ${Math.round(opacity * 100)}%` : 'Off'}
                          </Text>

                          {hasExpandableContent ? (
                            <Text
                              style={{
                                color: 'rgba(255,255,255,0.50)',
                                fontSize: 12,
                                fontWeight: '700',
                              }}
                            >
                              {isExpanded ? 'Hide details' : 'Show details'}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    </Pressable>

                    <Switch
                      enabled={enabled}
                      onPress={() => props.onToggleLayer(layer.id, !enabled)}
                    />
                  </View>

                  {isExpanded ? (
                    <View
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: 'rgba(255,255,255,0.08)',
                      }}
                    >
                      {supportsOpacity ? (
                        <View>
                          <Text style={{ fontWeight: '900', color: 'rgba(255,255,255,0.85)' }}>
                            Opacity
                          </Text>
                          <OpacityRow
                            value={opacity}
                            onChange={(v) => props.onSetOpacity(layer.id, v)}
                          />
                        </View>
                      ) : null}

                      {canLegend || canSource ? (
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                          {canLegend ? (
                            <ActionPill
                              label="Legend"
                              onPress={() => props.onOpenLegend?.(layer.id)}
                            />
                          ) : null}

                          {canSource ? (
                            <ActionPill
                              label="Source"
                              onPress={() => props.onOpenSourceInfo?.(layer.id)}
                            />
                          ) : null}
                        </View>
                      ) : null}

                      {canSource && layer.source ? (
                        <View style={{ marginTop: 12 }}>
                          <Text style={{ fontWeight: '900', color: 'white' }}>
                            {layer.source.name}
                          </Text>
                          {layer.source.details ? (
                            <Text
                              style={{
                                color: 'rgba(255,255,255,0.68)',
                                marginTop: 3,
                                lineHeight: 18,
                              }}
                            >
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
