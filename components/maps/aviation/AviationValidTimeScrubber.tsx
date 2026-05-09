import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

function label(value: string) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'Time';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function AviationValidTimeScrubber(props: {
  validTimes: string[];
  selectedValidTime: Date;
  onSelect: (value: Date) => void;
}) {
  const selectedMs = props.selectedValidTime.getTime();

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Valid time</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {props.validTimes.slice(0, 12).map((time) => {
          const ms = Date.parse(time);
          const active = Number.isFinite(ms) && Math.abs(ms - selectedMs) < 60 * 1000;
          return (
            <Pressable key={time} onPress={() => onSafeSelect(time, props.onSelect)} style={[styles.tick, active ? styles.tickActive : null]}>
              <Text style={[styles.tickText, active ? styles.tickTextActive : null]}>{label(time)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function onSafeSelect(value: string, onSelect: (value: Date) => void) {
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) onSelect(d);
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  title: { color: 'rgba(255,255,255,0.54)', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  row: { gap: 6, paddingRight: 8 },
  tick: {
    minWidth: 62,
    minHeight: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  tickActive: { backgroundColor: 'rgba(125,211,252,0.22)', borderColor: 'rgba(186,230,253,0.48)' },
  tickText: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '900' },
  tickTextActive: { color: 'white' },
});
