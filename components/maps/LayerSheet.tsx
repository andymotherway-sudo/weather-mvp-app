import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import {
  LAYER_CATALOG,
  type LayerCatalogItem,
} from '../../app/lib/maps/layerCatalog';
import { LAYER_THUMBNAILS, LAYER_THUMBNAIL_SIZE } from '../../app/lib/maps/layerThumbnails';
import type { LayerId, MapRuntimeState } from '../../app/lib/maps/types';

export type LayerSheetMode = 'standard' | 'aviation';

type Props = {
  state: MapRuntimeState;
  mode: LayerSheetMode;
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;
  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
};

type StandardCategoryId = 'alertsHazards' | 'radarSatellite' | 'fireAir' | 'marine';
type CategoryId = StandardCategoryId | 'aviation';

type CategoryDefinition = {
  id: CategoryId;
  title: string;
  subtitle: string;
};

const STANDARD_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'alertsHazards',
    title: 'Alerts & Forecast Hazards',
    subtitle: 'Warnings, fronts, outlooks, flood, heat, lightning, and tropical context.',
  },
  {
    id: 'radarSatellite',
    title: 'Radar & Satellite',
    subtitle: 'Reflectivity, clouds, true color, infrared, and water vapor.',
  },
  {
    id: 'fireAir',
    title: 'Fire & Air',
    subtitle: 'Restrictions, smoke, perimeters, hotspots, and fire weather.',
  },
  {
    id: 'marine',
    title: 'Marine',
    subtitle: 'Marine zones, buoy conditions, and water temperatures.',
  },
] as const;

const AVIATION_CATEGORY: CategoryDefinition = {
  id: 'aviation',
  title: 'Aviation',
  subtitle: 'Flight-focused hazards and reports.',
};

function clampOpacity(value: number) {
  return Math.max(0.25, Math.min(1, value));
}

function resolveSupports(layer: LayerCatalogItem) {
  const supportsOpacity = layer.supportsOpacity ?? true;
  const supportsLegend = layer.supportsLegend ?? !!layer.legendKey;
  const supportsSourceInfo = layer.supportsSourceInfo ?? !!layer.source;
  return { supportsOpacity, supportsLegend, supportsSourceInfo };
}

function previewKind(layer: LayerCatalogItem) {
  const id = String(layer.id);
  const text = `${layer.title} ${layer.subtitle ?? ''}`.toLowerCase();
  if (id.includes('radar') || text.includes('radar')) return 'radar';
  if (id.includes('sat') || text.includes('cloud') || text.includes('infrared') || text.includes('vapor')) return 'satellite';
  if (id.includes('wind')) return 'wind';
  if (id.includes('marine') || id.includes('water') || text.includes('tide') || text.includes('buoy')) return 'marine';
  if (id.includes('aviation') || text.includes('airport') || text.includes('flight')) return 'aviation';
  if (id.includes('fire') || text.includes('smoke')) return 'fire';
  if (id.includes('air') || text.includes('aqi')) return 'air';
  if (id.includes('astro') || id.includes('space') || text.includes('sky')) return 'astro';
  if (id.includes('front') || text.includes('front')) return 'fronts';
  if (id.includes('rain') || text.includes('rain') || text.includes('precip')) return 'rain';
  if (id.includes('tropic') || text.includes('hurricane')) return 'tropical';
  return 'default';
}

function stateLabel(layer: LayerCatalogItem, enabled: boolean, opacity: number) {
  if (!enabled) return layer.subtitle ?? '';
  const base = layer.subtitle?.trim() ? layer.subtitle.trim() : 'Active';
  return `${base} · ${Math.round(clampOpacity(opacity) * 100)}%`;
}

function standardCategoryForLayer(layer: LayerCatalogItem): StandardCategoryId {
  if (layer.group === 'marine') return 'marine';
  if (layer.group === 'fireAir') return 'fireAir';
  if (layer.id === 'radar.reflectivity' || String(layer.id).startsWith('sat.')) return 'radarSatellite';
  return 'alertsHazards';
}

function compactStateLabel(layer: LayerCatalogItem, enabled: boolean, opacity: number) {
  if (!enabled) return layer.subtitle ?? '';
  const base = layer.subtitle?.trim() ? layer.subtitle.trim() : 'Active';
  return `${base} - ${Math.round(clampOpacity(opacity) * 100)}%`;
}

function visibleLayersForMode(state: MapRuntimeState, mode: LayerSheetMode) {
  const isNerdy = !!state.nerdy;
  return LAYER_CATALOG.filter((layer) => {
    if (layer.visibility === 'nerdy' && !isNerdy) return false;
    if (mode === 'aviation') return layer.group === 'aviation';
    return ['weather', 'fireAir', 'marine', 'reference'].includes(layer.group);
  }).sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0));
}

function LayerPreview(props: { layer: LayerCatalogItem; enabled: boolean }) {
  const kind = previewKind(props.layer);
  const activeOpacity = props.enabled ? 1 : 0.58;
  const shellStyle = {
    width: LAYER_THUMBNAIL_SIZE.width,
    height: LAYER_THUMBNAIL_SIZE.height,
    borderRadius: LAYER_THUMBNAIL_SIZE.radius,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: props.enabled ? 'rgba(125,211,252,0.36)' : 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(15,23,42,0.72)',
    opacity: activeOpacity,
  };

  const thumbnail = LAYER_THUMBNAILS[props.layer.id];
  if (thumbnail) {
    return (
      <View style={shellStyle}>
        <Image source={thumbnail} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }

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

function Switch(props: { enabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      hitSlop={8}
      style={{
        width: 52,
        height: 30,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: props.enabled ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.14)',
        backgroundColor: props.enabled ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)',
        alignItems: props.enabled ? 'flex-end' : 'flex-start',
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
          backgroundColor: props.enabled ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
        }}
      />
    </Pressable>
  );
}

function SmallIconButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      hitSlop={6}
      style={{
        width: 24,
        height: 24,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.05)',
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '900' }}>{props.label}</Text>
    </Pressable>
  );
}

function OpacityRow(props: { value: number; onChange: (v: number) => void }) {
  const steps = [0.25, 0.4, 0.55, 0.7, 0.85, 1] as const;
  return (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {steps.map((step) => {
        const active = Math.abs(props.value - step) < 0.01;
        return (
          <Pressable
            key={step}
            onPress={() => props.onChange(step)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: active ? 'rgba(125,211,252,0.28)' : 'rgba(255,255,255,0.10)',
              backgroundColor: active ? 'rgba(96,165,250,0.16)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <Text style={{ color: 'white', fontSize: 11, fontWeight: active ? '900' : '800' }}>{Math.round(step * 100)}%</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ActionChip(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(255,255,255,0.04)',
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '900' }}>{props.label}</Text>
    </Pressable>
  );
}

function DetailBlock(props: {
  layer: LayerCatalogItem;
  opacity: number;
  onSetOpacity: (opacity: number) => void;
  onOpenLegend?: () => void;
  onOpenSourceInfo?: () => void;
}) {
  const { supportsOpacity, supportsLegend, supportsSourceInfo } = resolveSupports(props.layer);
  const canLegend = supportsLegend && !!props.layer.legendKey;
  const canSource = supportsSourceInfo && !!props.layer.source;

  return (
    <View
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.08)',
        gap: 10,
      }}
    >
      {supportsOpacity ? (
        <View>
          <Text style={{ color: 'rgba(255,255,255,0.74)', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 }}>
            OPACITY
          </Text>
          <OpacityRow value={props.opacity} onChange={props.onSetOpacity} />
        </View>
      ) : null}

      {canLegend || canSource ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {canLegend ? <ActionChip label="Legend" onPress={() => props.onOpenLegend?.()} /> : null}
          {canSource ? <ActionChip label="Source" onPress={() => props.onOpenSourceInfo?.()} /> : null}
        </View>
      ) : null}

      {canSource && props.layer.source?.details ? (
        <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11, lineHeight: 16 }}>
          {props.layer.source.details}
        </Text>
      ) : null}
    </View>
  );
}

function LayerRow(props: {
  layer: LayerCatalogItem;
  state: MapRuntimeState;
  expanded: boolean;
  forceDetails?: boolean;
  onToggleExpanded: () => void;
  onToggleLayer: (enabled: boolean) => void;
  onSetOpacity: (opacity: number) => void;
  onOpenLegend?: () => void;
  onOpenSourceInfo?: () => void;
}) {
  const runtime = props.state.layers?.[props.layer.id];
  const enabled = runtime?.enabled ?? false;
  const opacity = runtime?.opacity ?? props.layer.defaultOpacity ?? 1;
  const { supportsOpacity, supportsLegend, supportsSourceInfo } = resolveSupports(props.layer);
  const canExpand = supportsOpacity || supportsLegend || supportsSourceInfo;
  const showDetails = props.forceDetails || props.expanded;

  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
      <View
        style={{
          minHeight: 68,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <LayerPreview layer={props.layer} enabled={enabled} />

        <Pressable
          onPress={() => {
            if (canExpand) props.onToggleExpanded();
          }}
          style={{ flex: 1, minWidth: 0, justifyContent: 'center' }}
        >
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }} numberOfLines={1}>
            {props.layer.title}
          </Text>
          <Text style={{ color: enabled ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
            {compactStateLabel(props.layer, enabled, opacity)}
          </Text>
        </Pressable>

        {canExpand ? (
          <SmallIconButton label={showDetails ? 'v' : '>'} onPress={props.onToggleExpanded} />
        ) : null}

        <Switch enabled={enabled} onPress={() => props.onToggleLayer(!enabled)} />
      </View>

      {showDetails ? (
        <DetailBlock
          layer={props.layer}
          opacity={opacity}
          onSetOpacity={props.onSetOpacity}
          onOpenLegend={props.onOpenLegend}
          onOpenSourceInfo={props.onOpenSourceInfo}
        />
      ) : null}
    </View>
  );
}

function CategorySection(props: {
  category: CategoryDefinition;
  items: LayerCatalogItem[];
  state: MapRuntimeState;
  expanded: boolean;
  activeCount: number;
  expandedLayers: Partial<Record<LayerId, boolean>>;
  onToggleCategory: () => void;
  onToggleLayerExpanded: (layerId: LayerId) => void;
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;
  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={props.onToggleCategory}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>{props.category.title}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '700', marginTop: 2 }} numberOfLines={2}>
            {props.category.subtitle}
          </Text>
        </View>

        {props.activeCount > 0 ? (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(125,211,252,0.22)',
              backgroundColor: 'rgba(96,165,250,0.14)',
            }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '900' }}>{props.activeCount} active</Text>
          </View>
        ) : null}

        <SmallIconButton label={props.expanded ? 'v' : '>'} onPress={props.onToggleCategory} />
      </Pressable>

      {props.expanded ? (
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
          {props.items.map((layer, index) => (
            <View key={layer.id}>
              {index > 0 ? <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 12 }} /> : null}
              <LayerRow
                layer={layer}
                state={props.state}
                expanded={!!props.expandedLayers[layer.id]}
                onToggleExpanded={() => props.onToggleLayerExpanded(layer.id)}
                onToggleLayer={(enabled) => props.onToggleLayer(layer.id, enabled)}
                onSetOpacity={(opacity) => props.onSetOpacity(layer.id, opacity)}
                onOpenLegend={props.onOpenLegend ? () => props.onOpenLegend?.(layer.id) : undefined}
                onOpenSourceInfo={props.onOpenSourceInfo ? () => props.onOpenSourceInfo?.(layer.id) : undefined}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function LayerSheet(props: Props) {
  const [expandedLayers, setExpandedLayers] = useState<Partial<Record<LayerId, boolean>>>({});
  const [expandedCategories, setExpandedCategories] = useState<Partial<Record<CategoryId, boolean>>>({});

  const visibleLayers = useMemo(() => visibleLayersForMode(props.state, props.mode), [props.mode, props.state]);

  const categoryMap = useMemo(() => {
    const map: Record<CategoryId, LayerCatalogItem[]> = {
      alertsHazards: [],
      radarSatellite: [],
      fireAir: [],
      marine: [],
      aviation: [],
    };

    visibleLayers.forEach((layer) => {
      if (props.mode === 'aviation') {
        map.aviation.push(layer);
        return;
      }
      map[standardCategoryForLayer(layer)].push(layer);
    });

    return map;
  }, [props.mode, visibleLayers]);

  const categories = props.mode === 'aviation' ? [AVIATION_CATEGORY] : STANDARD_CATEGORIES;

  const activeLayers = useMemo(
    () => visibleLayers.filter((layer) => props.state.layers?.[layer.id]?.enabled),
    [props.state.layers, visibleLayers],
  );

  const activeCounts = useMemo(() => {
    const counts: Partial<Record<CategoryId, number>> = {};
    categories.forEach((category) => {
      counts[category.id] = (categoryMap[category.id] ?? []).filter((layer) => props.state.layers?.[layer.id]?.enabled).length;
    });
    return counts;
  }, [categories, categoryMap, props.state.layers]);

  useEffect(() => {
    setExpandedCategories((current) => {
      const next = { ...current };
      categories.forEach((category) => {
        if ((activeCounts[category.id] ?? 0) > 0) next[category.id] = true;
        else if (next[category.id] == null) next[category.id] = true;
      });
      return next;
    });
  }, [activeCounts, categories]);

  const toggleLayerExpanded = (layerId: LayerId) => {
    setExpandedLayers((current) => ({ ...current, [layerId]: !current[layerId] }));
  };

  const toggleCategoryExpanded = (categoryId: CategoryId) => {
    setExpandedCategories((current) => ({ ...current, [categoryId]: !current[categoryId] }));
  };

  return (
    <View style={{ gap: 14, paddingBottom: 8 }}>
      {activeLayers.length ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: 'rgba(125,211,252,0.22)',
            backgroundColor: 'rgba(96,165,250,0.08)',
            borderRadius: 22,
            overflow: 'hidden',
          }}
        >
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 }}>
            <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>Active Layers</Text>
            <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
              Quick access to layers that are already on.
            </Text>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
            {activeLayers.map((layer, index) => (
              <View key={`active-${layer.id}`}>
                {index > 0 ? <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 12 }} /> : null}
                <LayerRow
                  layer={layer}
                  state={props.state}
                  expanded
                  forceDetails
                  onToggleExpanded={() => {}}
                  onToggleLayer={(enabled) => props.onToggleLayer(layer.id, enabled)}
                  onSetOpacity={(opacity) => props.onSetOpacity(layer.id, opacity)}
                  onOpenLegend={props.onOpenLegend ? () => props.onOpenLegend?.(layer.id) : undefined}
                  onOpenSourceInfo={props.onOpenSourceInfo ? () => props.onOpenSourceInfo?.(layer.id) : undefined}
                />
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {categories.map((category) => {
        const items = categoryMap[category.id] ?? [];
        if (!items.length) return null;

        return (
          <CategorySection
            key={category.id}
            category={category}
            items={items}
            state={props.state}
            expanded={expandedCategories[category.id] !== false}
            activeCount={activeCounts[category.id] ?? 0}
            expandedLayers={expandedLayers}
            onToggleCategory={() => toggleCategoryExpanded(category.id)}
            onToggleLayerExpanded={toggleLayerExpanded}
            onToggleLayer={props.onToggleLayer}
            onSetOpacity={props.onSetOpacity}
            onOpenLegend={props.onOpenLegend}
            onOpenSourceInfo={props.onOpenSourceInfo}
          />
        );
      })}
    </View>
  );
}
