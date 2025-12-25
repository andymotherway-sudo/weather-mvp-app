// components/maps/RadarLegend.tsx
import React from 'react';
import { Text, View } from 'react-native';

type LegendStyle = 'rainviewer' | 'generic';

const RV_RAMP = [
  '#60a5fa', // blue (light)
  '#22d3ee', // cyan
  '#34d399', // green
  '#fde047', // yellow
  '#fb923c', // orange
  '#ef4444', // red (heavy)
];

const GENERIC_DBZ_RAMP = [
  '#0f172a', // very low
  '#22c55e', // green
  '#84cc16', // yellow-green
  '#f59e0b', // orange
  '#ef4444', // red
];

export function RadarLegend(props: {
  style?: LegendStyle;
  title?: string;
  leftLabel?: string;
  midLabel?: string;
  rightLabel?: string;
}) {
  const style = props.style ?? 'rainviewer';
  const ramp = style === 'rainviewer' ? RV_RAMP : GENERIC_DBZ_RAMP;

  const title = props.title ?? (style === 'rainviewer' ? 'Radar intensity' : 'Reflectivity');
  const leftLabel = props.leftLabel ?? (style === 'rainviewer' ? 'Light' : '<5');
  const midLabel = props.midLabel ?? (style === 'rainviewer' ? 'Mod' : '30');
  const rightLabel = props.rightLabel ?? (style === 'rainviewer' ? 'Heavy' : '60+');

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{title}</Text>

      {/* Thin ramp */}
      <View
        style={{
          height: 10,
          borderRadius: 999,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          flexDirection: 'row',
        }}
      >
        {ramp.map((c, idx) => (
          <View key={idx} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>

      {/* Minimal labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800' }}>
          {leftLabel}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11, fontWeight: '800' }}>
          {midLabel}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '800' }}>
          {rightLabel}
        </Text>
      </View>

      <Text style={{ color: 'rgba(255,255,255,0.60)', fontSize: 11 }}>
        {style === 'rainviewer'
          ? 'Colors match provider styling'
          : 'dBZ-ish scale · varies by product/source'}
      </Text>
    </View>
  );
}
