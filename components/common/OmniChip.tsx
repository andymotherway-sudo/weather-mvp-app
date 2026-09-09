import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

type OmniChipProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  size?: 'compact' | 'default';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function OmniChip({ label, active = false, disabled = false, icon, size = 'default', onPress, style }: OmniChipProps) {
  const { chrome } = useAppChrome();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[
        styles.chip,
        size === 'compact' ? styles.compact : null,
        {
          backgroundColor: active ? chrome.pillActive : chrome.pill,
          borderColor: active ? chrome.borderStrong : chrome.border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text style={[styles.label, size === 'compact' ? styles.compactLabel : null, { color: active ? chrome.textPrimary : chrome.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  compact: {
    minHeight: 28,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '900',
  },
  compactLabel: {
    fontSize: 9,
  },
});
