// components/common/ModeToggle.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

export type Mode = 'simple' | 'nerdy';

type ModeToggleProps = {
  mode: Mode;
  onChange: (mode: Mode) => void;
  compact?: boolean;
};

export function ModeToggle({ mode, onChange, compact = false }: ModeToggleProps) {
  const { chrome } = useAppChrome();

  return (
    <View style={[styles.container, compact ? styles.containerCompact : null, { backgroundColor: chrome.pill, borderColor: chrome.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Use Simple weather view"
        accessibilityState={{ selected: mode === 'simple' }}
        hitSlop={2}
        style={({ pressed }) => [
          styles.chip,
          compact ? styles.chipCompact : null,
          mode === 'simple' ? { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong } : null,
          { opacity: pressed ? 0.74 : 1 },
        ]}
        onPress={() => onChange('simple')}
      >
        <Text
          style={[
            styles.text,
            mode === 'simple' && styles.textActive,
            { color: mode === 'simple' ? chrome.textPrimary : chrome.textSecondary },
          ]}
        >
          Simple
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Use wxLab weather view"
        accessibilityState={{ selected: mode === 'nerdy' }}
        hitSlop={2}
        style={({ pressed }) => [
          styles.chip,
          compact ? styles.chipCompact : null,
          mode === 'nerdy' ? { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong } : null,
          { opacity: pressed ? 0.74 : 1 },
        ]}
        onPress={() => onChange('nerdy')}
      >
        <Text
          style={[
            styles.text,
            mode === 'nerdy' && styles.textActive,
            { color: mode === 'nerdy' ? chrome.textPrimary : chrome.textSecondary },
          ]}
        >
          wxLab
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    padding: 4,
  },
  containerCompact: {
    padding: 3,
  },
  chip: {
    minHeight: 40,
    minWidth: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.pill,
  },
  chipCompact: {
    minHeight: 34,
    minWidth: 58,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
  },
  textActive: {
    fontWeight: '900',
  },
});
