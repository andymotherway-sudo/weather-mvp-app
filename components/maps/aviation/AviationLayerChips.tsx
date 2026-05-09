import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function AviationLayerChips<T extends string>(props: {
  title?: string;
  options: Array<{ key: T; label: string }>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {props.title ? <Text style={styles.title}>{props.title}</Text> : null}
      <View style={styles.row}>
        {props.options.map((option) => {
          const active = props.selected.includes(option.key);
          return (
            <Pressable
              key={option.key}
              onPress={() => props.onToggle(option.key)}
              style={[styles.chip, active ? styles.chipActive : null]}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  title: { color: 'rgba(255,255,255,0.54)', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingRight: 4 },
  chip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    borderColor: 'rgba(125,211,252,0.46)',
    backgroundColor: 'rgba(14,165,233,0.20)',
  },
  chipText: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '900' },
  chipTextActive: { color: 'white' },
});
