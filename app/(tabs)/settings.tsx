// app/(tabs)/settings.tsx
// Settings screen with temperature unit toggle (F / C)

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';
import { useSettings, type TempUnit } from '../context/SettingsContext';
import { useWxLab } from '../context/WxLabContext'; // ✅ add

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
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.optionLabel}>{label}</Text>
      <Text style={styles.optionUnit}>{unit}</Text>
    </Pressable>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.toggleRow}>
      <View style={styles.toggleTextCol}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {!!subtitle && <Text style={styles.toggleSubtitle}>{subtitle}</Text>}
      </View>

      <View style={[styles.switchTrack, value && styles.switchTrackOn]}>
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { tempUnit, setTempUnit } = useSettings();
  const { wxLab, toggleWxLab } = useWxLab(); // ✅ add

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={typography.title}>Settings</Text>
        <Text style={typography.subtitle}>Personalize how Omni Wx displays data</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Wx Lab</Text>
        <Text style={styles.sectionSubtitle}>
          Enable the instrument-style view with deeper atmospheric detail (system font, aligned numbers, extra metrics).
        </Text>

        <ToggleRow
          title="🧪 Wx Lab"
          subtitle="Advanced forecast analysis view"
          value={wxLab}
          onToggle={toggleWxLab}
        />
      </Card>

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
    lineHeight: 16,
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

  // ✅ Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  toggleTextCol: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  toggleSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: 'rgba(56,189,248,0.25)',
    borderColor: 'rgba(56,189,248,0.5)',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.70)',
    transform: [{ translateX: 0 }],
  },
  switchThumbOn: {
    backgroundColor: 'rgba(56,189,248,0.95)',
    transform: [{ translateX: 18 }],
  },
});