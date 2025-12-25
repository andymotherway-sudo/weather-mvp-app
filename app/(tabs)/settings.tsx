// app/(tabs)/settings.tsx
// Settings screen with temperature unit toggle (F / C)

import React from 'react';
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings, type TempUnit } from '../context/SettingsContext';

function TempOption({
  label,
  unit,
  selected,
  onSelect,
}: {
  label: string;
  unit: TempUnit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable onPress={onSelect} style={styles.optionRow}>
      <View
        style={[
          styles.radioOuter,
          selected && styles.radioOuterSelected,
        ]}
      >
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
      <Text style={styles.optionUnit}>{unit}</Text>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { tempUnit, setTempUnit } = useSettings();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={typography.title}>Settings</Text>
        <Text style={typography.subtitle}>
          Personalize how Omni Wx displays data
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Temperature Unit</Text>
        <Text style={styles.sectionSubtitle}>
          Choose how temperatures are displayed across the app.
        </Text>

        <TempOption
          label="Fahrenheit"
          unit="F"
          selected={tempUnit === 'F'}
          onSelect={() => setTempUnit('F')}
        />

        <TempOption
          label="Celsius"
          unit="C"
          selected={tempUnit === 'C'}
          onSelect={() => setTempUnit('C')}
        />
      </Card>

      {/* Future settings (wind units, theme, etc.) can go in more cards here */}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },
  header: {
    marginBottom: theme.spacing.lg,
  },
  card: {
    marginBottom: theme.spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4B5563',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  radioOuterSelected: {
    borderColor: '#38bdf8',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#38bdf8',
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  optionUnit: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
});
