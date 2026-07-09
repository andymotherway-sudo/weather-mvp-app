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

function previewKind(layer: LayerCatalogItem) {
  const id = String(layer.id);
  const text = `${layer.title} ${layer.subtitle ?? ''}`.toLowerCase();
  if (id.includes('radar') || text.includes('radar')) return 'radar';
  if (id.includes('sat') || text.includes('cloud') || text.includes('infrared') || text.includes('vapor')) return 'satellite';
  if (id.includes('wind')) return 'wind';
  if (id.includes('marine') || id.includes('water') || text.includes('tide') || text.includes('buoy')) return 'marine';
  if (id.includes('aviation') || text.includes('airport') || text.includes('flight')) return 'aviation';
  if (id.includes('fire') || text.includes('smoke') || text.includes('fire')) return 'fire';
  if (id.includes('air') || text.includes('aqi')) return 'air';
  if (id.includes('astro') || id.includes('space') || text.includes('sky')) return 'astro';
  if (id.includes('front') || text.includes('front')) return 'fronts';
  if (id.includes('rain') || text.includes('rain') || text.includes('precip')) return 'rain';
  if (id.includes('tropic') || text.includes('hurricane')) return 'tropical';
  return 'default';
}

function LayerPreview(props: { layer: LayerCatalogItem; enabled: boolean }) {
  const kind = previewKind(props.layer);
  const activeOpacity = props.enabled ? 1 : 0.56;

  const shellStyle = {
    width: 58,
    height: 46,
    borderRadius: 14,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: props.enabled ? 'rgba(125,211,252,0.42)' : 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15,23,42,0.72)',
    opacity: activeOpacity,
  };

  if (kind === 'radar') {
    const colors = ['#2563eb', '#38bdf8', '#34d399', '#fde047', '#fb923c', '#ef4444'];
    return (
      <View style={shellStyle}>
        <View style={{ flex: 1, justifyContent: 'center', gap: 3, padding: 7 }}>
          {colors.map((color, index) => (
            <View
              key={color}
              style={{
                width: `${34 + index * 9}%`,
                height: 4,
                borderRadius: 999,
                backgroundColor: color,
                opacity: 0.82,
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  if (kind === 'satellite') {
    return (
      <View style={shellStyle}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.64)' }}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: 6 + i * 10,
                top: 8 + (i % 2) * 10,
                width: 30,
                height: 10,
                borderRadius: 999,
                backgroundColor: 'rgba(226,232,240,0.48)',
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  if (kind === 'wind') {
    return (
      <View style={shellStyle}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: 7 + i * 8,
              top: 8 + i * 7,
              width: 34,
              height: 2,
              borderRadius: 999,
              transform: [{ rotate: '-16deg' }],
              backgroundColor: i % 2 ? 'rgba(125,211,252,0.78)' : 'rgba(255,255,255,0.72)',
            }}
          />
        ))}
      </View>
    );
  }

  if (kind === 'marine') {
    return (
      <View style={shellStyle}>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: -6 + i * 3,
              right: -6,
              top: 14 + i * 8,
              height: 2,
              borderRadius: 999,
              backgroundColor: i === 1 ? 'rgba(34,211,238,0.78)' : 'rgba(45,212,191,0.44)',
            }}
          />
        ))}
        <View style={{ position: 'absolute', right: 10, top: 9, width: 10, height: 10, borderRadius: 999, backgroundColor: '#38bdf8' }} />
      </View>
    );
  }

  if (kind === 'aviation') {
    return (
      <View style={shellStyle}>
        <View style={{ position: 'absolute', left: 8, right: 8, top: 22, height: 2, backgroundColor: 'rgba(147,197,253,0.50)', transform: [{ rotate: '-20deg' }] }} />
        <View style={{ position: 'absolute', left: 22, top: 14, width: 14, height: 4, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.86)', transform: [{ rotate: '-20deg' }] }} />
        <View style={{ position: 'absolute', left: 26, top: 10, width: 5, height: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.60)', transform: [{ rotate: '-20deg' }] }} />
      </View>
    );
  }

  if (kind === 'fire') {
    return (
      <View style={shellStyle}>
        <View style={{ position: 'absolute', left: 7, bottom: 7, width: 18, height: 18, borderRadius: 999, backgroundColor: 'rgba(239,68,68,0.72)' }} />
        <View style={{ position: 'absolute', right: 8, top: 8, width: 32, height: 10, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.42)' }} />
        <View style={{ position: 'absolute', right: 14, top: 21, width: 24, height: 8, borderRadius: 999, backgroundColor: 'rgba(148,163,184,0.28)' }} />
      </View>
    );
  }

  if (kind === 'air') {
    return (
      <View style={shellStyle}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 4, padding: 8 }}>
          {['#22c55e', '#eab308', '#f97316', '#ef4444'].map((color, i) => (
            <View key={color} style={{ width: 7, height: 10 + i * 6, borderRadius: 999, backgroundColor: color, opacity: 0.78 }} />
          ))}
        </View>
      </View>
    );
  }

  const tint =
    kind === 'astro' ? 'rgba(129,140,248,0.78)' :
    kind === 'fronts' ? 'rgba(96,165,250,0.78)' :
    kind === 'rain' ? 'rgba(56,189,248,0.78)' :
    kind === 'tropical' ? 'rgba(251,191,36,0.78)' :
    'rgba(125,211,252,0.72)';

  return (
    <View style={shellStyle}>
      <View style={{ position: 'absolute', left: 10, top: 10, width: 16, height: 16, borderRadius: 999, backgroundColor: tint }} />
      <View style={{ position: 'absolute', right: 9, bottom: 9, width: 24, height: 2, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.40)' }} />
    </View>
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
                    <LayerPreview layer={layer} enabled={enabled} />
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
