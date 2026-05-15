import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Glass } from '../../common/Glass';

function fmt(value?: string | Date | null) {
  if (!value) return 'pending';
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return 'pending';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AviationStatusStrip(props: {
  updatedAt?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <Glass style={styles.strip}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>AVIATION WEATHER</Text>
        <Text style={styles.meta}>
          {props.loading
            ? 'Loading AWC products'
            : props.error
              ? 'Partial aviation data'
              : `Updated ${fmt(props.updatedAt)} · Valid ${fmt(props.validFrom)}-${fmt(props.validTo)}`}
        </Text>
        <Text style={styles.products}>G-AIRMET · SIGMET · Conv SIGMET · PIREP</Text>
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    left: 12,
    right: 84,
    top: 8,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(2,6,23,0.90)',
    borderColor: 'rgba(148,163,184,0.20)',
  },
  title: { color: 'white', fontSize: 12, fontWeight: '900' },
  meta: { color: 'rgba(255,255,255,0.74)', fontSize: 11, fontWeight: '800', marginTop: 2 },
  products: { color: 'rgba(125,211,252,0.78)', fontSize: 10, fontWeight: '900', marginTop: 3 },
});
