import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

type OmniMetricTileProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
  style?: StyleProp<ViewStyle>;
};

export function OmniMetricTile({ label, value, hint, tone, style }: OmniMetricTileProps) {
  const { chrome } = useAppChrome();
  const accent = tone ?? chrome.borderStrong;

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: chrome.cardStrong,
          borderColor: chrome.border,
        },
        style,
      ]}
    >
      <Text style={[styles.label, { color: chrome.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: accent }]} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color: chrome.textSecondary }]} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: 118,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
  },
  label: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    marginTop: theme.spacing.xs,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
  },
  hint: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
});
