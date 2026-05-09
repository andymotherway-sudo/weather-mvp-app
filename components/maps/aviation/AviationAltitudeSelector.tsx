import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AVIATION_ALTITUDE_LEVELS } from '../../../app/lib/aviation/filters';

export function AviationAltitudeSelector(props: {
  selectedAltitudeFt: number | null;
  showUnknownAltitude: boolean;
  onSelectAltitude: (feet: number | null) => void;
  onToggleUnknown: () => void;
}) {
  return (
    <View style={styles.rail}>
      <Text style={styles.title}>FL</Text>
      {AVIATION_ALTITUDE_LEVELS.map((level) => {
        const active = props.selectedAltitudeFt === level.feet;
        return (
          <Pressable
            key={level.label}
            onPress={() => props.onSelectAltitude(level.feet)}
            style={[styles.level, active ? styles.levelActive : null]}
          >
            <Text style={[styles.levelText, active ? styles.levelTextActive : null]}>{level.label}</Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={props.onToggleUnknown}
        style={[styles.unknown, props.showUnknownAltitude ? styles.levelActive : null]}
      >
        <Text style={[styles.unknownText, props.showUnknownAltitude ? styles.levelTextActive : null]}>UNK</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: 'absolute',
    left: 10,
    top: 118,
    width: 58,
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(2,6,23,0.70)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    gap: 3,
  },
  title: {
    color: 'rgba(125,211,252,0.9)',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 2,
  },
  level: {
    height: 25,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelActive: {
    backgroundColor: 'rgba(125,211,252,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(186,230,253,0.44)',
  },
  levelText: { color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '900' },
  levelTextActive: { color: 'white' },
  unknown: {
    height: 25,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  unknownText: { color: 'rgba(255,255,255,0.52)', fontSize: 10, fontWeight: '900' },
});
