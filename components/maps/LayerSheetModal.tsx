// components/maps/LayerSheetModal.tsx
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Glass } from '../common/Glass';
import { LayerSheet } from './LayerSheet';

import type { LayerId, MapRuntimeState } from '../../app/lib/maps/types';

export type LayerSheetValue = {
  baseMapStyle: 'dark' | 'light';
  radarProvider: 'rainviewer' | 'iem';
};

export function LayerSheetModal(props: {
  visible: boolean;
  onClose: () => void;

  state: MapRuntimeState;

  nerdy: boolean;

  value: LayerSheetValue;
  onChange: (next: LayerSheetValue) => void;

  // quick toggles
  radarEnabled: boolean;
  wildfireEnabled: boolean;
  onToggleRadar: (enabled: boolean) => void;
  onToggleWildfire: (enabled: boolean) => void;

  // layer catalog controls (for LayerSheet)
  onToggleLayer: (layerId: LayerId, enabled: boolean) => void;
  onSetOpacity: (layerId: LayerId, opacity: number) => void;

  // optional drill-ins
  onOpenLegend?: (layerId: LayerId) => void;
  onOpenSourceInfo?: (layerId: LayerId) => void;
}) {
  const {
    visible,
    onClose,
    state,
    nerdy,
    value,
    onChange,
    radarEnabled,
    wildfireEnabled,
    onToggleRadar,
    onToggleWildfire,
    onToggleLayer,
    onSetOpacity,
    onOpenLegend,
    onOpenSourceInfo,
  } = props;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Sheet */}
        <Pressable onPress={() => {}} style={{ padding: 12 }}>
          <Glass style={{ borderRadius: 22, padding: 14, maxHeight: '88%' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: 'white', fontWeight: '900', fontSize: 16 }}>Layers</Text>

              <Pressable
                onPress={onClose}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.14)',
                  backgroundColor: 'rgba(255,255,255,0.06)',
                }}
              >
                <Text style={{ color: 'white', fontWeight: '900' }}>Done</Text>
              </Pressable>
            </View>

            {/* Quick toggles */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
              <PillToggle label="Radar" enabled={radarEnabled} onChange={onToggleRadar} />
              <PillToggle label="Wildfire" enabled={wildfireEnabled} onChange={onToggleWildfire} />
              {nerdy ? <Badge text="Nerdy mode" /> : <Badge text="Simple mode" />}
            </View>

            {/* Base map style */}
            <Section title="Base map">
              <Segmented
                options={[
                  { id: 'dark', label: 'Dark' },
                  { id: 'light', label: 'Light' },
                ]}
                value={value.baseMapStyle}
                onChange={(id) => onChange({ ...value, baseMapStyle: id })}
              />
            </Section>

            {/* Radar provider */}
            <Section title="Radar provider">
              <Segmented
                options={[
                  { id: 'rainviewer', label: 'RainViewer' },
                  { id: 'iem', label: 'IEM' },
                ]}
                value={value.radarProvider}
                onChange={(id) => onChange({ ...value, radarProvider: id })}
              />
              <Text style={{ color: 'rgba(255,255,255,0.70)', marginTop: 8, fontSize: 12 }}>
                (Provider switching can be wired later; this just stores the choice.)
              </Text>
            </Section>

            {/* Divider */}
            <View
              style={{
                height: 1,
                backgroundColor: 'rgba(255,255,255,0.10)',
                marginTop: 14,
                marginBottom: 10,
              }}
            />

            {/* Full Layer Catalog */}
            <ScrollView
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ paddingBottom: 18 }}
              showsVerticalScrollIndicator={false}
            >
              <LayerSheet
                state={state}
                onToggleLayer={onToggleLayer}
                onSetOpacity={onSetOpacity}
                onOpenLegend={onOpenLegend}
                onOpenSourceInfo={onOpenSourceInfo}
              />
            </ScrollView>
          </Glass>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: 'rgba(255,255,255,0.80)', fontWeight: '800', marginBottom: 8 }}>
        {props.title}
      </Text>
      {props.children}
    </View>
  );
}

function Badge(props: { text: string }) {
  return (
    <View
      style={{
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(255,255,255,0.04)',
      }}
    >
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontWeight: '800', fontSize: 12 }}>
        {props.text}
      </Text>
    </View>
  );
}

function PillToggle(props: { label: string; enabled: boolean; onChange: (enabled: boolean) => void }) {
  const enabled = props.enabled;
  return (
    <Pressable
      onPress={() => props.onChange(!enabled)}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        backgroundColor: enabled ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
      }}
    >
      <Text style={{ color: 'white', fontWeight: '900' }}>
        {props.label} {enabled ? 'On' : 'Off'}
      </Text>
    </Pressable>
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
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              backgroundColor: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
            }}
          >
            <Text style={{ color: 'white', fontWeight: active ? '900' : '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
