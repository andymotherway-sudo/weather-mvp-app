import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../styles/theme';

type Props = {
  windMph?: number | null;
  gustMph?: number | null;
  windDirDeg?: number | null;

  dewpointF?: number | null;
  rhPct?: number | null;

  cloudsPct?: number | null;

  onPressWind?: () => void;
  onPressDew?: () => void;
  onPressClouds?: () => void;
};

function fmtInt(x?: number | null) {
  return x == null || !Number.isFinite(x) ? '—' : String(Math.round(x));
}
function fmtDeg(x?: number | null) {
  return x == null || !Number.isFinite(x) ? '—' : `${Math.round(x)}°`;
}

export function ConditionsStrip(props: Props) {
  const wind = fmtInt(props.windMph);
  const gust = fmtInt(props.gustMph);
  const dir = fmtDeg(props.windDirDeg);

  const dp = props.dewpointF == null ? '—' : `${Math.round(props.dewpointF)}°`;
  const rh = props.rhPct == null ? '—' : `${Math.round(props.rhPct)}%`;
  const clouds = props.cloudsPct == null ? '—' : `${Math.round(props.cloudsPct)}%`;

  return (
    <View style={styles.wrap}>
      <Pressable style={styles.item} onPress={props.onPressWind} android_ripple={{ color: '#ffffff10' }}>
        <Text style={styles.k}>🌬</Text>
        <Text style={styles.v}>{wind} mph</Text>
        <Text style={styles.s}>→ G {gust} · {dir}</Text>
      </Pressable>

      <View style={styles.div} />

      <Pressable style={styles.item} onPress={props.onPressDew} android_ripple={{ color: '#ffffff10' }}>
        <Text style={styles.k}>💧</Text>
        <Text style={styles.v}>{dp}</Text>
        <Text style={styles.s}>RH {rh}</Text>
      </Pressable>

      <View style={styles.div} />

      <Pressable style={styles.item} onPress={props.onPressClouds} android_ripple={{ color: '#ffffff10' }}>
        <Text style={styles.k}>☁️</Text>
        <Text style={styles.v}>{clouds}</Text>
        <Text style={styles.s}>Clouds</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  item: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    gap: 4,
  },
  div: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  k: {
    color: theme.colors.textMuted ?? '#AAB4C3',
    fontSize: 12,
    opacity: 0.9,
  },
  v: {
    color: theme.colors.textPrimary ?? '#EAF0FF',
    fontSize: 14,
    fontWeight: '800',
  },
  s: {
    color: theme.colors.textSecondary ?? '#AAB4C3',
    fontSize: 11,
    opacity: 0.9,
    fontWeight: '700',
  },
});
