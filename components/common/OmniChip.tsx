import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

type OmniChipProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function OmniChip({ label, active = false, disabled = false, icon, onPress, style }: OmniChipProps) {
  const { chrome } = useAppChrome();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? chrome.pillActive : chrome.pill,
          borderColor: active ? chrome.borderStrong : chrome.border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon}
      <Text style={[styles.label, { color: active ? '#FFFFFF' : 'rgba(255,255,255,0.78)' }]}>{label}</Text>
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
  label: {
    fontSize: 12,
    fontWeight: '900',
  },
});
