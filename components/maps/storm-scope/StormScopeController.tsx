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
}) {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(timeout);
  }, [notice]);

  const hudTone = props.stale
    ? 'rgba(251,191,36,0.16)'
    : props.loadingMessage
      ? 'rgba(96,165,250,0.14)'
      : 'rgba(15,23,42,0.08)';

  const modeBadge = props.mode === 'local' ? 'LOCAL NEXRAD' : 'MOSAIC OVERVIEW';

  const minimizedLabel = useMemo(() => {
    const productCode = props.products.find((item) => item.active)?.shortLabel ?? 'REFL';
    const age = props.productLine.split('·').slice(-1)[0]?.trim() ?? props.statusLabel;
    return `${props.siteTitle} · ${productCode} · ${age}`;
  }, [props.productLine, props.products, props.siteTitle, props.statusLabel]);

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
      <View pointerEvents="box-none" style={{ gap: 8 }}>
        <Glass
          style={{
            paddingHorizontal: 12,
            paddingVertical: props.hudMinimized ? 10 : 12,
            borderRadius: 22,
            backgroundColor: hudTone,
            width: '100%',
          }}
        >
          {props.hudMinimized ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => props.onSetHudMinimized(false)} style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }} numberOfLines={1}>
                  {minimizedLabel}
                </Text>
              </Pressable>
              <SmallPill label={props.stale ? 'STALE' : modeBadge} accent={props.stale ? 'amber' : 'cyan'} />
              <IconButton label="..." onPress={() => props.onSetConsoleOpen(true)} />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <Eyebrow label="STORM SCOPE" />
                    <SmallPill label={modeBadge} accent={props.mode === 'local' ? 'cyan' : 'slate'} />
                    {props.stale ? <SmallPill label="STALE" accent="amber" /> : null}
                  </View>
                  <Text style={{ color: 'white', fontSize: 20, fontWeight: '900', marginTop: 8 }} numberOfLines={1}>
                    {props.siteTitle}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                    {props.productLine}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: '700', marginTop: 6 }} numberOfLines={2}>
                    {props.metadataLine}
                  </Text>
                </View>

                <View style={{ gap: 8 }}>
                  <IconButton
                    label="-"
                    onPress={() => props.onSetHudMinimized(true)}
                  />
                  <IconButton label="..." onPress={() => props.onSetConsoleOpen(true)} />
                </View>
              </View>

              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.09)',
                  backgroundColor: 'rgba(255,255,255,0.035)',
                }}
              >
                <Text style={{ color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '800' }}>
                  {props.loadingMessage ?? props.warningMessage ?? props.sourceLine}
                </Text>
              </View>
            </View>
          )}
        </Glass>

        <Glass style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {props.products.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => handleProductPress(item)}
                style={{
                  minWidth: 64,
                  paddingHorizontal: 10,
                  paddingVertical: 10,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: item.active ? 'rgba(125,211,252,0.28)' : 'rgba(255,255,255,0.09)',
                  backgroundColor: item.active ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
                  opacity: item.available ? 1 : 0.58,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ color: 'white', fontSize: 12, fontWeight: '900' }}>{item.shortLabel}</Text>
                  {item.loading ? <ActivityIndicator size="small" color="#bae6fd" /> : null}
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '700', marginTop: 3 }} numberOfLines={1}>
                  {item.loading ? item.statusLabel ?? 'Loading...' : item.available ? item.subtitle : item.statusLabel ?? 'Unavailable'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {notice ? (
            <View
              style={{
                marginTop: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: 'rgba(251,191,36,0.22)',
                backgroundColor: 'rgba(120,53,15,0.18)',
              }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.90)', fontSize: 11, fontWeight: '700' }}>{notice}</Text>
            </View>
          ) : null}
        </Glass>

        <Glass style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {props.quickToggles.map((item) => (
              <Pressable
                key={item.id}
                onPress={item.onPress}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 9,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: item.active ? 'rgba(125,211,252,0.28)' : 'rgba(255,255,255,0.09)',
                  backgroundColor: item.active ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
                }}
              >
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '900' }}>{item.label}</Text>
              </Pressable>
            ))}
            <SmallPill label={props.statusLabel} accent="slate" />
          </View>
        </Glass>

        <Glass style={{ borderRadius: 20, paddingHorizontal: 12, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <Text style={{ color: 'white', fontSize: 12, fontWeight: '900' }}>Legend</Text>
            <Text style={{ color: 'rgba(255,255,255,0.54)', fontSize: 10, fontWeight: '800' }}>{props.legend.title}</Text>
          </View>
          <RadarLegend
            style={props.legend.style}
            leftLabel={props.legend.leftLabel}
            midLabel={props.legend.midLabel}
            rightLabel={props.legend.rightLabel}
            compact
          />
          <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '700', marginTop: 8 }}>
            {props.legend.note}
          </Text>
        </Glass>
      </View>

      <Modal visible={props.consoleOpen} animationType="slide" transparent onRequestClose={() => props.onSetConsoleOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2,6,23,0.52)' }}>
          <Glass
            style={{
              borderBottomLeftRadius: 0,
              borderBottomRightRadius: 0,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingHorizontal: 14,
              paddingTop: 12,
              paddingBottom: 18,
              maxHeight: '82%',
            }}
          >
            <View style={{ alignItems: 'center', marginBottom: 10 }}>
              <View style={{ width: 48, height: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' }} />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: 'white', fontSize: 20, fontWeight: '900' }}>Storm Scope Console</Text>
                <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                  Radar details, quick product access, and radar-site selection without taking over the map.
                </Text>
              </View>
              <Pressable onPress={() => props.onSetConsoleOpen(false)} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <Text style={{ color: 'white', fontWeight: '900' }}>Done</Text>
              </Pressable>
            </View>

            <ScrollView style={{ marginTop: 14 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 12 }}>
              <SectionCard title="Current Radar" subtitle={props.mode === 'local' ? 'Local radar context' : 'Broad mosaic context'}>
                <ConsoleMetric label="Site" value={props.siteTitle} />
                <ConsoleMetric label="Product" value={props.productLine} />
                <ConsoleMetric label="Source" value={props.sourceLine} />
                <ConsoleMetric label="Status" value={props.warningMessage ?? props.loadingMessage ?? props.statusLabel} />
              </SectionCard>

              <SectionCard title="Products" subtitle="Switch products without reopening the HUD">
                <View style={{ gap: 8 }}>
                  {props.products.map((item) => (
                    <Pressable
                      key={`console-product-${item.id}`}
                      onPress={() => handleProductPress(item)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: item.active ? 'rgba(125,211,252,0.28)' : 'rgba(255,255,255,0.09)',
                        backgroundColor: item.active ? 'rgba(96,165,250,0.18)' : 'rgba(255,255,255,0.04)',
                        opacity: item.available ? 1 : 0.64,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }}>{item.title}</Text>
                          <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
                            {item.loading
                              ? item.statusLabel ?? 'Loading current scans...'
                              : item.available
                                ? item.subtitle
                                : item.unavailableReason ?? item.statusLabel ?? 'Unavailable right now.'}
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          {item.loading ? <ActivityIndicator size="small" color="#bae6fd" /> : null}
                          <SmallPill label={item.shortLabel} accent={item.active ? 'cyan' : 'slate'} />
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </SectionCard>

              <SectionCard title="Nearby Radars" subtitle="Use a different radar without recentering the map">
                <View style={{ gap: 8 }}>
                  {props.radarSites.map((site) => (
                    <View
                      key={`storm-site-${site.id}`}
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
                          <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }}>{site.title}</Text>
                          <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11, fontWeight: '700', marginTop: 3 }} numberOfLines={2}>
                            {site.subtitle}
                          </Text>
                        </View>
                        <SmallPill label={site.distanceLabel} accent="slate" />
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: 11, fontWeight: '800' }}>
                          {site.selected ? 'Current radar' : 'Available nearby'}
                        </Text>
                        <Pressable onPress={site.onUse} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                          <Text style={{ color: 'white', fontSize: 11, fontWeight: '900' }}>{site.selected ? 'Using radar' : 'Use radar'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </SectionCard>

              <SectionCard title="Learn" subtitle="Keep product education nearby, not floating over the map">
                <Pressable onPress={props.onOpenLearn} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                  <Text style={{ color: 'white', fontWeight: '900' }}>Open wxLearn for active product</Text>
                </Pressable>
              </SectionCard>
            </ScrollView>
          </Glass>
        </View>
      </Modal>
    </>
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
        <Text style={{ color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '700', marginTop: 3 }}>
          {props.subtitle}
        </Text>
      </View>
      {props.children}
    </View>
  );
}

function ConsoleMetric(props: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={{ color: 'rgba(255,255,255,0.48)', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>{props.label.toUpperCase()}</Text>
      <Text style={{ color: 'white', fontSize: 13, fontWeight: '800' }}>{props.value}</Text>
    </View>
  );
}

function Eyebrow(props: { label: string }) {
  return <Text style={{ color: 'rgba(255,255,255,0.56)', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>{props.label}</Text>;
}

function IconButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={props.onPress}
      style={{
        width: 34,
        height: 34,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.10)',
        backgroundColor: 'rgba(255,255,255,0.04)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: 'white', fontSize: 13, fontWeight: '900' }}>{props.label}</Text>
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
