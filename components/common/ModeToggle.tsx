// components/common/ModeToggle.tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../styles/theme';

export type Mode = 'simple' | 'nerdy';

type ModeToggleProps = {
  mode: Mode;
  onChange: (mode: Mode) => void;
};

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.chip, mode === 'simple' && styles.chipActive]}
        onPress={() => onChange('simple')}
      >
        <Text
          style={[
            styles.text,
            mode === 'simple' && styles.textActive,
          ]}
        >
          Simple
        </Text>
      </Pressable>

      <Pressable
        style={[styles.chip, mode === 'nerdy' && styles.chipActive]}
        onPress={() => onChange('nerdy')}
      >
        <Text
          style={[
            styles.text,
            mode === 'nerdy' && styles.textActive,
          ]}
        >
          Nerdy
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: theme.radius.pill,
    backgroundColor: '#0B1120',
    padding: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
  },
  chipActive: {
    backgroundColor: '#111827',
  },
  text: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  textActive: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
});
