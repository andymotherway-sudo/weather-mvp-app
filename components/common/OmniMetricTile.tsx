import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

type OmniMetricTone = 'default' | 'good' | 'fair' | 'poor' | 'danger' | 'info';

type OmniMetricTileProps = {
  label: string;
  value: string | number;
  helper?: string;
  icon?: ReactNode;
  tone?: OmniMetricTone;
  style?: StyleProp<ViewStyle>;
};

function toneColor(tone: OmniMetricTone) {
  if (tone === 'good') return theme.semantic.state.good;
  if (tone === 'fair') return theme.semantic.state.fair;
  if (tone === 'poor') return theme.semantic.state.poor;
  if (tone === 'danger') return theme.semantic.state.danger;
  if (tone === 'info') return theme.semantic.state.info;
  return '#FFFFFF';
}

export function OmniMetricTile({ label, value, helper, icon, tone = 'default', style }: OmniMetricTileProps) {
  const { chrome } = useAppChrome();
  const color = toneColor(tone);

  return (
    <View style={[styles.tile, { backgroundColor: chrome.pill, borderColor: chrome.border }, style]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{value}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 92,
    borderWidth: 1,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    justifyContent: 'center',
  },
  icon: {
    marginBottom: theme.spacing.xs,
  },
  label: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    marginTop: theme.spacing.xs,
    fontSize: 22,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  helper: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    fontWeight: '700',
  },
});
