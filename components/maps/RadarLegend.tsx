import React from 'react';
import { Text, View } from 'react-native';

type LegendStyle = 'rainviewer' | 'generic';

const RV_RAMP = ['#60a5fa', '#22d3ee', '#34d399', '#fde047', '#fb923c', '#ef4444'];
const GENERIC_DBZ_RAMP = ['#0f172a', '#22c55e', '#84cc16', '#f59e0b', '#ef4444'];

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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{title}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.54)', fontSize: 10, fontWeight: '800' }}>
          {style === 'rainviewer' ? 'Provider colors' : 'Reflectivity'}
        </Text>
      </View>

      <View
        style={{
          height: 12,
          borderRadius: 999,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.12)',
          flexDirection: 'row',
          backgroundColor: 'rgba(255,255,255,0.05)',
        }}
      >
        {ramp.map((c, idx) => (
          <View key={idx} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: 'rgba(255,255,255,0.76)', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 }}>
          {leftLabel.toUpperCase()}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.56)', fontSize: 10, fontWeight: '800' }}>{midLabel}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.76)', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 }}>
          {rightLabel.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
