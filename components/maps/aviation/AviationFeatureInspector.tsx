import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AviationFeature } from '../../../app/lib/aviation/types';
import { Glass } from '../../common/Glass';

function fmt(value?: string | null) {
  if (!value) return 'Pending';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'Pending';
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function altitude(feature: AviationFeature) {
  const base = feature.baseFt == null ? null : feature.baseFt <= 0 ? 'SFC' : `FL${String(Math.round(feature.baseFt / 100)).padStart(3, '0')}`;
  const top = feature.topFt == null ? null : `FL${String(Math.round(feature.topFt / 100)).padStart(3, '0')}`;
  if (base && top) return `${base}-${top}`;
  if (top) return `TOP ${top}`;
  return base ?? 'Unknown';
}

export function AviationFeatureInspector(props: { feature: AviationFeature | null; onClose: () => void }) {
  if (!props.feature) return null;
  const feature = props.feature;
  const source = feature.properties.sourceProduct ?? feature.productType.toUpperCase();
  const hazard = feature.properties.hazardType ?? feature.hazardType.toUpperCase();

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Glass style={styles.card}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>{String(hazard).toUpperCase()} · {String(source).toUpperCase()}</Text>
            <Text style={styles.title}>{feature.label}</Text>
          </View>
          <Pressable onPress={props.onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <Row label="Valid" value={`${fmt(feature.validFrom)} - ${fmt(feature.validTo)}`} />
        <Row label="Altitude" value={altitude(feature)} />
        <Row label="Issued" value={fmt(feature.issuedAt)} />
        <Row label="Severity" value={feature.severity} />
        <Row label="Source" value={`AWC / ${source}`} />
        <Row label="Raw ID" value={feature.id} />
      </Glass>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, bottom: 118 },
  card: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: 'rgba(2,6,23,0.95)',
    borderColor: 'rgba(148,163,184,0.24)',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  eyebrow: { color: 'rgba(125,211,252,0.9)', fontSize: 10, fontWeight: '900' },
  title: { color: 'white', fontSize: 17, fontWeight: '900', marginTop: 3 },
  close: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.13)' },
  closeText: { color: 'white', fontSize: 11, fontWeight: '900' },
  row: {
    minHeight: 29,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: { color: 'rgba(255,255,255,0.52)', fontSize: 12, fontWeight: '800', flex: 0.8 },
  rowValue: { color: 'rgba(255,255,255,0.90)', fontSize: 12, fontWeight: '800', flex: 1.5, textAlign: 'right' },
});
