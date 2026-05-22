import React from 'react';
import { Text, View } from 'react-native';

type LegendStyle = 'rainviewer' | 'generic' | 'reflectivity' | 'velocity' | 'echoTops';

const RV_RAMP = ['#1d4ed8', '#38bdf8', '#34d399', '#fde047', '#fb923c', '#dc2626'];
const REFLECTIVITY_RAMP = ['#1f2937', '#2563eb', '#22c55e', '#84cc16', '#facc15', '#f97316', '#dc2626', '#7e22ce'];
const VELOCITY_RAMP = ['#1d4ed8', '#38bdf8', '#93c5fd', '#e5e7eb', '#fca5a5', '#ef4444', '#991b1b'];
const ECHO_TOPS_RAMP = ['#07111f', '#0f766e', '#22c55e', '#bef264', '#facc15', '#fb923c', '#e11d48', '#f5d0fe'];

export function RadarLegend(props: {
  style?: LegendStyle;
  title?: string;
  leftLabel?: string;
  midLabel?: string;
  rightLabel?: string;
  compact?: boolean;
}) {
  const style = props.style ?? 'rainviewer';
  const compact = !!props.compact;
  const normalizedStyle = style === 'generic' ? 'reflectivity' : style;
  const ramp =
    normalizedStyle === 'rainviewer'
      ? RV_RAMP
      : normalizedStyle === 'echoTops'
        ? ECHO_TOPS_RAMP
      : normalizedStyle === 'velocity'
        ? VELOCITY_RAMP
        : REFLECTIVITY_RAMP;

  const title =
    props.title ??
    (normalizedStyle === 'rainviewer'
      ? 'Radar intensity'
      : normalizedStyle === 'echoTops'
        ? 'Echo Tops'
      : normalizedStyle === 'velocity'
        ? 'Radial velocity'
        : 'Reflectivity');
  const leftLabel =
    props.leftLabel ??
    (normalizedStyle === 'rainviewer'
      ? 'Light'
      : normalizedStyle === 'echoTops'
        ? 'Low'
      : normalizedStyle === 'velocity'
        ? 'Away'
        : 'Light');
  const midLabel =
    props.midLabel ??
    (normalizedStyle === 'rainviewer'
      ? 'Moderate'
      : normalizedStyle === 'echoTops'
        ? 'Storm top height'
      : normalizedStyle === 'velocity'
        ? 'Neutral'
        : 'Moderate');
  const rightLabel =
    props.rightLabel ??
    (normalizedStyle === 'rainviewer'
      ? 'Heavy'
      : normalizedStyle === 'echoTops'
        ? 'High'
      : normalizedStyle === 'velocity'
        ? 'Toward'
        : 'Severe');
  const helperLabel =
    normalizedStyle === 'rainviewer'
      ? 'Provider colors'
      : normalizedStyle === 'echoTops'
        ? 'Height'
      : normalizedStyle === 'velocity'
        ? 'Wind motion'
        : 'Precip intensity';

  return (
    <View style={{ gap: compact ? 5 : 8 }}>
      {!compact ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>{title}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.54)', fontSize: 10, fontWeight: '800' }}>
            {helperLabel}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          height: compact ? 18 : 12,
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
        <Text
          style={{
            color: 'rgba(255,255,255,0.76)',
            fontSize: compact ? 9 : 10,
            fontWeight: '900',
            letterSpacing: 0.4,
          }}
        >
          {leftLabel.toUpperCase()}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.56)', fontSize: compact ? 9 : 10, fontWeight: '800' }}>
          {midLabel}
        </Text>
        <Text
          style={{
            color: 'rgba(255,255,255,0.76)',
            fontSize: compact ? 9 : 10,
            fontWeight: '900',
            letterSpacing: 0.4,
          }}
        >
          {rightLabel.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
