import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

type OmniSectionHeaderProps = {
  title: string;
  subtitle?: string;
  kicker?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function OmniSectionHeader({ title, subtitle, kicker, action, style }: OmniSectionHeaderProps) {
  const { chrome } = useAppChrome();

  return (
    <View style={[styles.header, style]}>
      <View style={styles.copy}>
        {kicker ? <Text style={[styles.kicker, { color: chrome.textMuted }]}>{kicker}</Text> : null}
        <Text style={[styles.title, { color: chrome.textPrimary }]}>{title}</Text>
        {subtitle ? <Text style={[styles.subtitle, { color: chrome.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  copy: {
    flex: 1,
  },
  kicker: {
    marginBottom: 4,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    marginBottom: 4,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  action: {
    flexShrink: 0,
  },
});
