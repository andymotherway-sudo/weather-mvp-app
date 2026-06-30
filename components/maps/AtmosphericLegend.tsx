import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Glass } from '../common/Glass';

type Props = {
  title?: string;
  compact?: boolean;
  sliver?: boolean;
};

export function AtmosphericLegend({
  title = 'Atmospheric Quality',
  compact = false,
  sliver = false,
}: Props) {
  if (compact) {    // Sliver mode renders only the color ramp for compact map chrome.
    if (sliver) {
      return (
        <Glass style={styles.sliver}>
          <View style={styles.sliverRow}>
            <SliverSwatch color="transparent" />
            <SliverSwatch color="rgba(120,255,210,0.35)" />
            <SliverSwatch color="rgba(90,160,255,0.40)" />
            <SliverSwatch color="rgba(120,70,180,0.55)" />
          </View>
        </Glass>
      );
    }

    // existing compact card
    return (
      <Glass style={styles.bar}>
        <Text style={styles.barTitle}>{title}</Text>

        <View style={styles.barStops}>
          <Stop label="Ex" range="85–100" color="transparent" />
          <Stop label="Good" range="70–85" color="rgba(120,255,210,0.35)" />
          <Stop label="Fair" range="50–70" color="rgba(90,160,255,0.40)" />
          <Stop label="Poor" range="0–50" color="rgba(120,70,180,0.55)" />
        </View>

        <Text style={styles.barNote}>Darker = clearer</Text>
      </Glass>
    );
  }

  // full card (optional)
  return (
    <Glass style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.row}>
        <LegendStop label="Excellent" range="85–100" color="transparent" />
        <LegendStop label="Good" range="70–85" color="rgba(120,255,210,0.35)" />
        <LegendStop label="Fair" range="50–70" color="rgba(90,160,255,0.40)" />
        <LegendStop label="Poor" range="0–50" color="rgba(120,70,180,0.55)" />
      </View>
      <Text style={styles.note}>Color shows interference — clearer skies appear darker</Text>
    </Glass>
  );
}

function Stop({ label, range, color }: { label: string; range: string; color: string }) {
  return (
    <View style={styles.stopBar}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.stopLabel}>{label}</Text>
      <Text style={styles.stopRange}>{range}</Text>
    </View>
  );
}

function LegendStop({ label, range, color }: { label: string; range: string; color: string }) {
  return (
    <View style={styles.stopFull}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.stopLabel}>{label}</Text>
      <Text style={styles.stopRange}>{range}</Text>
    </View>
  );
}

function SliverSwatch({ color }: { color: string }) {
  return <View style={[styles.sliverSwatch, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({  // Compact sliver styles keep the legend from competing with map controls.
  sliver: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  sliverRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  sliverSwatch: {
    width: 56,
    height: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },

  // compact bottom bar
  bar: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignSelf: 'flex-start',
  },
  barTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 12,
    marginBottom: 6,
  },
  barStops: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
  },
  stopBar: { alignItems: 'center' },
  swatch: {
    width: 44,
    height: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 3,
  },
  stopLabel: { color: 'white', fontSize: 10, fontWeight: '900' },
  stopRange: { color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '800' },
  barNote: { marginTop: 5, color: 'rgba(255,255,255,0.55)', fontSize: 9, fontWeight: '800' },

  // full card (optional)
  card: { paddingVertical: 10, paddingHorizontal: 12 },
  title: { color: 'white', fontWeight: '900', fontSize: 13, marginBottom: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stopFull: { alignItems: 'center', width: 70 },
  note: { marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.6)' },
});
