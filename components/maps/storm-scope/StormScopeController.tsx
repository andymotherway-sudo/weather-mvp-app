import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Glass } from '../../common/Glass';
import { RadarLegend } from '../RadarLegend';

type StormScopeMode = 'mosaic' | 'local';

type ProductOption = {
  id: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  statusLabel?: string;
  available: boolean;
  unavailableReason?: string | null;
  active: boolean;
  loading: boolean;
};

type QuickToggle = {
  id: string;
  label: string;
  active: boolean;
  onPress: () => void;
};

type RadarSiteOption = {
  id: string;
  title: string;
  subtitle: string;
  distanceLabel: string;
  selected: boolean;
  onUse: () => void;
};

type LegendModel = {
  style: 'rainviewer' | 'generic' | 'reflectivity' | 'velocity' | 'echoTops';
  title: string;
  leftLabel: string;
  midLabel: string;
  rightLabel: string;
  note: string;
};

export function StormScopeController(props: {
  mode: StormScopeMode;
  hudMinimized: boolean;
  consoleOpen: boolean;
  onSetHudMinimized: (minimized: boolean) => void;
  onSetConsoleOpen: (open: boolean) => void;
  siteTitle: string;
  productLine: string;
  metadataLine: string;
  sourceLine: string;
  loadingMessage?: string | null;
  warningMessage?: string | null;
  stale: boolean;
  legend: LegendModel;
  quickToggles: QuickToggle[];
  statusLabel: string;
  products: ProductOption[];
  radarSites: RadarSiteOption[];
  onSelectProduct: (id: string) => void;
  onOpenLearn: () => void;
  onExitStormScope: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [legendExpanded, setLegendExpanded] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timeout);
  }, [notice]);

  const activeProduct = useMemo(
    () => props.products.find((item) => item.active) ?? props.products[0] ?? null,
    [props.products],
  );

  const sourceToggles = useMemo(
    () => props.quickToggles.filter((item) => item.id.startsWith('source-')),
    [props.quickToggles],
  );

  const localProviderToggles = useMemo(
    () => props.quickToggles.filter((item) => item.id.startsWith('local-')),
    [props.quickToggles],
  );

  const overlayToggles = useMemo(
    () => props.quickToggles.filter((item) => !item.id.startsWith('source-') && !item.id.startsWith('local-')),
    [props.quickToggles],
  );

  const ageLabel = useMemo(() => {
    const parts = props.productLine.split(/(?:Â·|·)/g).map((part) => part.trim()).filter(Boolean);
    return parts.at(-1) ?? props.statusLabel;
  }, [props.productLine, props.statusLabel]);

  const productLabel = activeProduct?.shortLabel ?? 'REFL';
  const modeLabel = props.mode === 'local' ? 'LOCAL' : 'MOSAIC';
  const attentionLine = props.loadingMessage ?? props.warningMessage ?? props.sourceLine;

  const handleProductPress = (item: ProductOption) => {
    if (item.active && item.loading) return;
    if (item.active && item.available) return;
    if (!item.available) {
      setNotice(item.unavailableReason ?? `${item.title} is unavailable right now.`);
      return;
    }
    props.onSelectProduct(item.id);
  };

  return (
    <>
      <CompactHud
        ageLabel={ageLabel}
        modeLabel={modeLabel}
        productLabel={productLabel}
        productLine={props.productLine}
        sourceLine={props.sourceLine}
        siteTitle={props.siteTitle}
        stale={props.stale}
        statusLabel={props.statusLabel}
        onOpen={() => props.onSetConsoleOpen(true)}
      />

      <Modal visible={props.consoleOpen} animationType="slide" transparent onRequestClose={() => props.onSetConsoleOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.42)' }}>
          <Glass
            style={{
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 18,
              maxHeight: '86%',
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 48, height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: 'rgba(255,255,255,0.56)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }}>
                  STORM SCOPE
                </Text>
                <Text style={{ color: 'white', fontSize: 20, fontWeight: '900', marginTop: 4 }} numberOfLines={1}>
                  {props.siteTitle}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', marginTop: 4 }} numberOfLines={2}>
                  {props.productLine} - {attentionLine}
                </Text>
              </View>
              <PillButton label="Done" onPress={() => props.onSetConsoleOpen(false)} />
            </View>

            <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
              <SectionCard title="Radar" subtitle={props.mode === 'local' ? props.metadataLine : 'Broad radar context'}>
                <SegmentedRow items={sourceToggles} />
                {localProviderToggles.length ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 }}>
                      LOCAL SOURCE
                    </Text>
                    <SegmentedRow items={localProviderToggles} />
                  </View>
                ) : null}
                <ConsoleMetric label="Status" value={props.warningMessage ?? props.loadingMessage ?? props.sourceLine} />
              </SectionCard>

              <SectionCard title="Product" subtitle="Horizontal picker keeps unsupported products out of the way">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
                  {props.products.map((item) => (
                    <ProductChip key={item.id} item={item} onPress={() => handleProductPress(item)} />
                  ))}
                </ScrollView>
                {notice ? <Notice text={notice} /> : null}
              </SectionCard>

              <SectionCard title="Overlays" subtitle="Map aids are toggles, separate from radar source">
                <ToggleWrap items={overlayToggles} />
              </SectionCard>

              <SectionCard title="Legend" subtitle={legendExpanded ? props.legend.note : `${props.legend.leftLabel} to ${props.legend.rightLabel}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '900' }}>{props.legend.title}</Text>
                  <PillButton label={legendExpanded ? 'Less' : 'More'} onPress={() => setLegendExpanded((current) => !current)} />
                </View>
                <RadarLegend
                  style={props.legend.style}
                  leftLabel={props.legend.leftLabel}
                  midLabel={props.legend.midLabel}
                  rightLabel={props.legend.rightLabel}
                  compact
                />
              </SectionCard>

              <SectionCard title="Nearby Radars" subtitle="Pick a station without losing the current map view">
                <View style={{ gap: 8 }}>
                  {props.radarSites.map((site) => (
                    <RadarSiteRow key={site.id} site={site} />
                  ))}
                </View>
              </SectionCard>

              <SectionCard title="More" subtitle="Secondary actions stay out of the normal storm view">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <PillButton label="wxLearn" onPress={props.onOpenLearn} />
                  <PillButton label="Exit Storm Scope" tone="danger" onPress={props.onExitStormScope} />
                </View>
              </SectionCard>
            </ScrollView>
          </Glass>
        </View>
      </Modal>
    </>
  );
}

function CompactHud(props: {
  ageLabel: string;
  modeLabel: string;
  productLabel: string;
  productLine: string;
  sourceLine: string;
  siteTitle: string;
  stale: boolean;
  statusLabel: string;
  onOpen: () => void;
}) {
  const sourceBadge =
    props.sourceLine.toLowerCase().includes('owned')
      ? 'OWNED L3'
      : props.sourceLine.toLowerCase().includes('iem') || props.sourceLine.toLowerCase().includes('ridge')
        ? 'IEM'
        : props.modeLabel;

  return (
    <Glass
      style={{
        minHeight: 74,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 22,
        backgroundColor: props.stale ? 'rgba(146,64,14,0.28)' : 'rgba(15,23,42,0.20)',
        width: '100%',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={props.onOpen} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }}>
              STORM SCOPE
            </Text>
            <SmallPill label={sourceBadge} accent={sourceBadge === 'OWNED L3' ? 'cyan' : 'slate'} />
            {props.stale ? <SmallPill label={`! ${props.ageLabel}`} accent="amber" /> : null}
          </View>
          <Text style={{ color: 'white', fontSize: 17, fontWeight: '900' }} numberOfLines={1}>
            {props.siteTitle}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '800', marginTop: 3 }} numberOfLines={1}>
            {props.productLabel} - {props.sourceLine}
          </Text>
        </Pressable>
        <PillButton label="..." onPress={props.onOpen} />
      </View>
    </Glass>
  );
}

function SectionCard(props: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        paddingHorizontal: 12,
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <View>
        <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>{props.title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
          {props.subtitle}
        </Text>
      </View>
      {props.children}
    </View>
  );
}

function SegmentedRow(props: { items: QuickToggle[] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(2,6,23,0.34)',
        overflow: 'hidden',
      }}
    >
      {props.items.map((item) => (
        <Pressable
          key={item.id}
          onPress={item.onPress}
          style={{
            flex: 1,
            paddingVertical: 10,
            paddingHorizontal: 8,
            alignItems: 'center',
            backgroundColor: item.active ? 'rgba(96,165,250,0.24)' : 'transparent',
          }}
        >
          <Text style={{ color: item.active ? 'white' : 'rgba(255,255,255,0.68)', fontSize: 11, fontWeight: '900' }}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function ToggleWrap(props: { items: QuickToggle[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {props.items.map((item) => (
        <Pressable
          key={item.id}
          onPress={item.onPress}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 9,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: item.active ? 'rgba(125,211,252,0.30)' : 'rgba(255,255,255,0.09)',
            backgroundColor: item.active ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
          }}
        >
          <Text style={{ color: 'white', fontSize: 11, fontWeight: '900' }}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function ProductChip(props: { item: ProductOption; onPress: () => void }) {
  const { item } = props;
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        width: 116,
        minHeight: 76,
        paddingHorizontal: 10,
        paddingVertical: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: item.active ? 'rgba(125,211,252,0.34)' : 'rgba(255,255,255,0.09)',
        backgroundColor: item.active ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
        opacity: item.available ? 1 : 0.54,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: 'white', fontSize: 14, fontWeight: '900' }}>{item.shortLabel}</Text>
        {item.loading ? <ActivityIndicator size="small" color="#bae6fd" /> : null}
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.66)', fontSize: 10, fontWeight: '800', marginTop: 6 }} numberOfLines={2}>
        {item.loading ? item.statusLabel ?? 'Loading...' : item.available ? item.subtitle : item.statusLabel ?? 'Unavailable'}
      </Text>
    </Pressable>
  );
}

function RadarSiteRow(props: { site: RadarSiteOption }) {
  const { site } = props;
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: site.selected ? 'rgba(125,211,252,0.28)' : 'rgba(255,255,255,0.09)',
        backgroundColor: site.selected ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.04)',
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }} numberOfLines={1}>
            {site.title}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
            {site.subtitle}
          </Text>
        </View>
        <SmallPill label={site.distanceLabel} accent="slate" />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <PillButton label={site.selected ? 'Using radar' : 'Use radar'} onPress={site.onUse} />
      </View>
    </View>
  );
}

function ConsoleMetric(props: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
        {props.label.toUpperCase()}
      </Text>
      <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>{props.value}</Text>
    </View>
  );
}

function Notice(props: { text: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(251,191,36,0.22)',
        backgroundColor: 'rgba(120,53,15,0.18)',
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.90)', fontSize: 11, fontWeight: '700' }}>{props.text}</Text>
    </View>
  );
}

function PillButton(props: { label: string; onPress: () => void; tone?: 'default' | 'danger' }) {
  const danger = props.tone === 'danger';
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: danger ? 'rgba(251,191,36,0.22)' : 'rgba(255,255,255,0.10)',
        backgroundColor: danger ? 'rgba(120,53,15,0.14)' : 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: 'white', fontSize: 12, fontWeight: '900' }}>{props.label}</Text>
    </Pressable>
  );
}

function SmallPill(props: { label: string; accent: 'cyan' | 'amber' | 'slate' }) {
  const colors =
    props.accent === 'cyan'
      ? {
          borderColor: 'rgba(125,211,252,0.24)',
          backgroundColor: 'rgba(96,165,250,0.16)',
        }
      : props.accent === 'amber'
        ? {
            borderColor: 'rgba(251,191,36,0.26)',
            backgroundColor: 'rgba(146,64,14,0.18)',
          }
        : {
            borderColor: 'rgba(255,255,255,0.10)',
            backgroundColor: 'rgba(255,255,255,0.05)',
          };

  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        ...colors,
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 10, fontWeight: '900' }}>{props.label}</Text>
    </View>
  );
}
