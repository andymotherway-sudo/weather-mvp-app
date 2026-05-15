import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

type WeatherKind =
  | 'clear'
  | 'partly'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

type MetricKind = 'precip' | 'cloud' | 'dew' | 'humidity' | 'wind';
type IconVariant = 'hero' | 'inline';

type Palette = {
  primary: string;
  secondary: string;
  tertiary: string;
  accent: string;
  glow: string;
  backingTop: string;
  backingBottom: string;
  backingRim: string;
};

function weatherKindFromCode(code: number | null | undefined): WeatherKind {
  if (code == null) return 'partly';
  if (code === 0) return 'clear';
  if (code === 1 || code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloudy';
}

const WEATHER_PALETTES: Record<WeatherKind, Palette> = {
  clear: {
    primary: '#FFF7DB',
    secondary: '#F6D27A',
    tertiary: '#F0E7C9',
    accent: '#F7C15C',
    glow: 'rgba(247, 205, 121, 0.18)',
    backingTop: 'rgba(255,255,255,0.18)',
    backingBottom: 'rgba(156,188,226,0.10)',
    backingRim: 'rgba(255,255,255,0.26)',
  },
  partly: {
    primary: '#F9FBFF',
    secondary: '#C9D8F0',
    tertiary: '#AFC2E0',
    accent: '#F5CF7B',
    glow: 'rgba(182, 207, 238, 0.18)',
    backingTop: 'rgba(255,255,255,0.18)',
    backingBottom: 'rgba(143,177,221,0.10)',
    backingRim: 'rgba(255,255,255,0.26)',
  },
  cloudy: {
    primary: '#F7FAFF',
    secondary: '#D7E2F0',
    tertiary: '#AABDD6',
    accent: '#E8F1FF',
    glow: 'rgba(180, 200, 227, 0.15)',
    backingTop: 'rgba(255,255,255,0.16)',
    backingBottom: 'rgba(129,152,189,0.10)',
    backingRim: 'rgba(255,255,255,0.24)',
  },
  fog: {
    primary: '#F8FBFF',
    secondary: '#D9E4EF',
    tertiary: '#A3B5CA',
    accent: '#EEF4FB',
    glow: 'rgba(203, 216, 232, 0.15)',
    backingTop: 'rgba(255,255,255,0.16)',
    backingBottom: 'rgba(132,149,174,0.10)',
    backingRim: 'rgba(255,255,255,0.24)',
  },
  drizzle: {
    primary: '#F5FAFF',
    secondary: '#D5E7FA',
    tertiary: '#8FB1D7',
    accent: '#A9D4FF',
    glow: 'rgba(151, 190, 233, 0.16)',
    backingTop: 'rgba(255,255,255,0.16)',
    backingBottom: 'rgba(112,148,201,0.10)',
    backingRim: 'rgba(255,255,255,0.24)',
  },
  rain: {
    primary: '#F5FAFF',
    secondary: '#D3E5F8',
    tertiary: '#7EA3CC',
    accent: '#8CC7FF',
    glow: 'rgba(138, 181, 227, 0.18)',
    backingTop: 'rgba(255,255,255,0.16)',
    backingBottom: 'rgba(99,132,183,0.10)',
    backingRim: 'rgba(255,255,255,0.24)',
  },
  snow: {
    primary: '#FFFFFF',
    secondary: '#E4EFF9',
    tertiary: '#B3C8DE',
    accent: '#F7FBFF',
    glow: 'rgba(218, 235, 251, 0.18)',
    backingTop: 'rgba(255,255,255,0.18)',
    backingBottom: 'rgba(152,180,211,0.10)',
    backingRim: 'rgba(255,255,255,0.26)',
  },
  storm: {
    primary: '#F8FAFF',
    secondary: '#D5DDF2',
    tertiary: '#8E9FC7',
    accent: '#E6D59A',
    glow: 'rgba(159, 175, 212, 0.18)',
    backingTop: 'rgba(255,255,255,0.16)',
    backingBottom: 'rgba(112,126,170,0.10)',
    backingRim: 'rgba(255,255,255,0.24)',
  },
};

const METRIC_PALETTES: Record<MetricKind, Palette> = {
  precip: WEATHER_PALETTES.rain,
  cloud: WEATHER_PALETTES.cloudy,
  dew: WEATHER_PALETTES.drizzle,
  humidity: WEATHER_PALETTES.partly,
  wind: WEATHER_PALETTES.fog,
};

function resolveVariant(size: number, variant?: IconVariant): IconVariant {
  if (variant) return variant;
  return size >= 40 ? 'hero' : 'inline';
}

function cloudPath(scale = 1) {
  const s = scale;
  return `M ${10 * s} ${28 * s}
    C ${10 * s} ${21 * s}, ${16 * s} ${16 * s}, ${23 * s} ${16 * s}
    C ${26 * s} ${10 * s}, ${32 * s} ${7 * s}, ${39 * s} ${7 * s}
    C ${48 * s} ${7 * s}, ${55 * s} ${13 * s}, ${57 * s} ${21 * s}
    C ${63 * s} ${22 * s}, ${68 * s} ${27 * s}, ${68 * s} ${33 * s}
    C ${68 * s} ${40 * s}, ${62 * s} ${46 * s}, ${55 * s} ${46 * s}
    L ${22 * s} ${46 * s}
    C ${15 * s} ${46 * s}, ${10 * s} ${40 * s}, ${10 * s} ${33 * s}
    C ${10 * s} ${31 * s}, ${10 * s} ${29 * s}, ${10 * s} ${28 * s}
    Z`;
}

function renderWeatherGlyph(kind: WeatherKind, palette: Palette, night: boolean) {
  const cloudBase = (
    <>
      <Path d={cloudPath()} fill={palette.primary} />
      <Path d={cloudPath(0.94)} fill="rgba(255,255,255,0.12)" transform="translate(2.2 1.2)" />
    </>
  );

  if (kind === 'clear') {
    return night ? (
      <G>
        <Path
          d="M42 11c-7 2-12 8-12 16 0 9 7 16 16 16 4 0 7-1 10-3-2 8-10 14-19 14-11 0-20-9-20-20 0-11 9-20 20-20 2 0 4 0 5 1z"
          fill={palette.primary}
        />
        <Circle cx="49" cy="18" r="2" fill={palette.accent} opacity="0.85" />
      </G>
    ) : (
      <G>
        <Circle cx="36" cy="36" r="14" fill={palette.primary} />
        <Circle cx="36" cy="36" r="19" stroke={palette.accent} strokeOpacity="0.5" strokeWidth="2.2" fill="none" />
        {[
          [36, 8, 36, 16],
          [36, 56, 36, 64],
          [8, 36, 16, 36],
          [56, 36, 64, 36],
          [16, 16, 22, 22],
          [50, 50, 56, 56],
          [16, 56, 22, 50],
          [50, 22, 56, 16],
        ].map(([x1, y1, x2, y2], index) => (
          <Line
            key={`ray-${index}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={palette.accent}
            strokeOpacity="0.72"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </G>
    );
  }

  if (kind === 'partly') {
    return (
      <G>
        {night ? (
          <Path
            d="M43 12c-5 1-9 6-9 12 0 7 6 12 13 12 2 0 5-1 7-2-2 6-8 10-15 10-9 0-16-7-16-16s7-16 16-16c1 0 3 0 4 0z"
            fill={palette.accent}
          />
        ) : (
          <>
            <Circle cx="46" cy="24" r="10" fill={palette.accent} />
            <Circle cx="46" cy="24" r="14" stroke={palette.accent} strokeOpacity="0.38" strokeWidth="2" fill="none" />
          </>
        )}
        <G transform="translate(4 12)">{cloudBase}</G>
      </G>
    );
  }

  if (kind === 'cloudy') {
    return <G transform="translate(2 10)">{cloudBase}</G>;
  }

  if (kind === 'fog') {
    return (
      <G transform="translate(2 7)">
        {cloudBase}
        {[0, 1, 2].map((i) => (
          <Line
            key={`fog-${i}`}
            x1="14"
            y1={50 + i * 6}
            x2="58"
            y2={50 + i * 6}
            stroke={palette.secondary}
            strokeWidth="3"
            strokeLinecap="round"
            strokeOpacity={0.9 - i * 0.18}
          />
        ))}
      </G>
    );
  }

  if (kind === 'drizzle' || kind === 'rain') {
    const drops = kind === 'drizzle' ? [24, 36, 48] : [20, 32, 44, 56];
    return (
      <G transform="translate(2 6)">
        {cloudBase}
        {drops.map((x, index) => (
          <Path
            key={`rain-${x}`}
            d={`M ${x} 48 C ${x + 2} 52, ${x + 3} 55, ${x + 3} 58 C ${x + 3} 61, ${x + 1} 64, ${x - 2} 64 C ${x - 5} 64, ${x - 7} 61, ${x - 7} 58 C ${x - 7} 55, ${x - 5} 52, ${x} 48 Z`}
            fill={kind === 'drizzle' ? palette.secondary : palette.accent}
            opacity={kind === 'drizzle' ? 0.82 : 0.92}
            transform={kind === 'drizzle' && index % 2 === 0 ? 'translate(0 -2)' : undefined}
          />
        ))}
      </G>
    );
  }

  if (kind === 'snow') {
    return (
      <G transform="translate(2 6)">
        {cloudBase}
        {[24, 36, 48].map((x) => (
          <G key={`snow-${x}`} transform={`translate(${x} 57)`}>
            <Line x1="-4" y1="0" x2="4" y2="0" stroke={palette.accent} strokeWidth="2.2" strokeLinecap="round" />
            <Line x1="0" y1="-4" x2="0" y2="4" stroke={palette.accent} strokeWidth="2.2" strokeLinecap="round" />
            <Line x1="-3" y1="-3" x2="3" y2="3" stroke={palette.accent} strokeWidth="1.8" strokeLinecap="round" />
            <Line x1="-3" y1="3" x2="3" y2="-3" stroke={palette.accent} strokeWidth="1.8" strokeLinecap="round" />
          </G>
        ))}
      </G>
    );
  }

  return (
    <G transform="translate(2 6)">
      {cloudBase}
      <Path
        d="M36 47l-8 15h7l-3 10 14-18h-7l4-7z"
        fill={palette.accent}
      />
    </G>
  );
}

function renderWeatherGlyphOutline(kind: WeatherKind, palette: Palette, night: boolean) {
  const cloudStroke = (
    <>
      <Path
        d={cloudPath()}
        fill="none"
        stroke={palette.primary}
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={cloudPath(0.94)}
        fill="none"
        stroke="rgba(255,255,255,0.26)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(2.2 1.2)"
      />
    </>
  );

  if (kind === 'clear') {
    return night ? (
      <G>
        <Path
          d="M42 11c-7 2-12 8-12 16 0 9 7 16 16 16 4 0 7-1 10-3-2 8-10 14-19 14-11 0-20-9-20-20 0-11 9-20 20-20 2 0 4 0 5 1z"
          fill="none"
          stroke={palette.primary}
          strokeWidth="3.2"
          strokeLinejoin="round"
        />
        <Circle cx="49" cy="18" r="1.8" fill={palette.accent} opacity="0.85" />
      </G>
    ) : (
      <G>
        <Circle cx="36" cy="36" r="14" fill="none" stroke={palette.primary} strokeWidth="3.2" />
        {[ [36, 8, 36, 16], [36, 56, 36, 64], [8, 36, 16, 36], [56, 36, 64, 36], [16, 16, 22, 22], [50, 50, 56, 56], [16, 56, 22, 50], [50, 22, 56, 16] ].map(([x1, y1, x2, y2], index) => (
          <Line
            key={`outline-ray-${index}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={palette.accent}
            strokeOpacity="0.8"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        ))}
      </G>
    );
  }

  if (kind === 'partly') {
    return (
      <G>
        {night ? (
          <Path
            d="M43 12c-5 1-9 6-9 12 0 7 6 12 13 12 2 0 5-1 7-2-2 6-8 10-15 10-9 0-16-7-16-16s7-16 16-16c1 0 3 0 4 0z"
            fill="none"
            stroke={palette.accent}
            strokeWidth="3"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <Circle cx="46" cy="24" r="10" fill="none" stroke={palette.accent} strokeWidth="3" />
            <Circle cx="46" cy="24" r="14" stroke={palette.accent} strokeOpacity="0.26" strokeWidth="1.6" fill="none" />
          </>
        )}
        <G transform="translate(4 12)">{cloudStroke}</G>
      </G>
    );
  }

  if (kind === 'cloudy') {
    return <G transform="translate(2 10)">{cloudStroke}</G>;
  }

  if (kind === 'fog') {
    return (
      <G transform="translate(2 7)">
        {cloudStroke}
        {[0, 1, 2].map((i) => (
          <Line
            key={`outline-fog-${i}`}
            x1="14"
            y1={50 + i * 6}
            x2="58"
            y2={50 + i * 6}
            stroke={palette.secondary}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeOpacity={0.9 - i * 0.18}
          />
        ))}
      </G>
    );
  }

  if (kind === 'drizzle' || kind === 'rain') {
    const drops = kind === 'drizzle' ? [24, 36, 48] : [20, 32, 44, 56];
    return (
      <G transform="translate(2 6)">
        {cloudStroke}
        {drops.map((x, index) => (
          <Line
            key={`outline-rain-${x}`}
            x1={x}
            y1={49 + (kind === 'drizzle' && index % 2 === 0 ? -2 : 0)}
            x2={x - 3}
            y2={59 + (kind === 'drizzle' && index % 2 === 0 ? -2 : 0)}
            stroke={kind === 'drizzle' ? palette.secondary : palette.accent}
            strokeWidth={kind === 'drizzle' ? 2.1 : 2.6}
            strokeLinecap="round"
          />
        ))}
      </G>
    );
  }

  if (kind === 'snow') {
    return (
      <G transform="translate(2 6)">
        {cloudStroke}
        {[24, 36, 48].map((x) => (
          <G key={`outline-snow-${x}`} transform={`translate(${x} 57)`}>
            <Line x1="-4" y1="0" x2="4" y2="0" stroke={palette.accent} strokeWidth="1.8" strokeLinecap="round" />
            <Line x1="0" y1="-4" x2="0" y2="4" stroke={palette.accent} strokeWidth="1.8" strokeLinecap="round" />
            <Line x1="-3" y1="-3" x2="3" y2="3" stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round" />
            <Line x1="-3" y1="3" x2="3" y2="-3" stroke={palette.accent} strokeWidth="1.5" strokeLinecap="round" />
          </G>
        ))}
      </G>
    );
  }

  return (
    <G transform="translate(2 6)">
      {cloudStroke}
      <Path
        d="M36 47l-8 15h7l-3 10 14-18h-7l4-7z"
        fill="none"
        stroke={palette.accent}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </G>
  );
}

function renderMetricGlyph(kind: MetricKind, palette: Palette) {
  switch (kind) {
    case 'precip':
      return <Path d="M36 10C29 20 22 27 22 38c0 8 6 16 14 16s14-8 14-16c0-11-7-18-14-28z" fill={palette.accent} />;
    case 'cloud':
      return <G transform="translate(2 10)"><Path d={cloudPath()} fill={palette.primary} /></G>;
    case 'dew':
      return (
        <G>
          <Path d="M36 12C29 21 24 28 24 38c0 7 5 12 12 12s12-5 12-12c0-10-5-17-12-26z" fill={palette.accent} />
          <Circle cx="36" cy="39" r="4" fill={palette.primary} opacity="0.35" />
        </G>
      );
    case 'humidity':
      return (
        <G>
          <Path d="M30 12C23 21 18 28 18 38c0 10 8 18 18 18s18-8 18-18c0-10-5-17-12-26z" fill={palette.accent} />
          <Path d="M45 17c4 5 9 10 9 18 0 10-8 18-18 18-2 0-4 0-6-1 7-2 12-8 12-16 0-7-3-12-7-19 3 0 7 0 10 0z" fill={palette.primary} opacity="0.35" />
        </G>
      );
    case 'wind':
    default:
      return (
        <G>
          <Path d="M14 29h24c6 0 8-3 8-6 0-4-3-6-6-6-3 0-5 2-5 5" stroke={palette.primary} strokeWidth="4" strokeLinecap="round" fill="none" />
          <Path d="M10 40h34c6 0 10 3 10 8 0 4-3 7-7 7-3 0-5-2-5-5" stroke={palette.secondary} strokeWidth="4" strokeLinecap="round" fill="none" />
          <Path d="M20 51h18" stroke={palette.tertiary} strokeWidth="4" strokeLinecap="round" fill="none" />
        </G>
      );
  }
}

function renderMetricGlyphOutline(kind: MetricKind, palette: Palette) {
  switch (kind) {
    case 'precip':
      return <Path d="M36 10C29 20 22 27 22 38c0 8 6 16 14 16s14-8 14-16c0-11-7-18-14-28z" fill="none" stroke={palette.accent} strokeWidth="3" />;
    case 'cloud':
      return <G transform="translate(2 10)"><Path d={cloudPath()} fill="none" stroke={palette.primary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></G>;
    case 'dew':
      return (
        <G>
          <Path d="M36 12C29 21 24 28 24 38c0 7 5 12 12 12s12-5 12-12c0-10-5-17-12-26z" fill="none" stroke={palette.accent} strokeWidth="3" />
          <Circle cx="36" cy="39" r="4" fill="none" stroke={palette.primary} strokeWidth="2" opacity="0.55" />
        </G>
      );
    case 'humidity':
      return (
        <G>
          <Path d="M30 12C23 21 18 28 18 38c0 10 8 18 18 18s18-8 18-18c0-10-5-17-12-26z" fill="none" stroke={palette.accent} strokeWidth="3" />
          <Path d="M45 17c4 5 9 10 9 18 0 10-8 18-18 18-2 0-4 0-6-1 7-2 12-8 12-16 0-7-3-12-7-19 3 0 7 0 10 0z" fill="none" stroke={palette.primary} strokeWidth="2" opacity="0.45" />
        </G>
      );
    case 'wind':
    default:
      return (
        <G>
          <Path d="M14 29h24c6 0 8-3 8-6 0-4-3-6-6-6-3 0-5 2-5 5" stroke={palette.primary} strokeWidth="3" strokeLinecap="round" fill="none" />
          <Path d="M10 40h34c6 0 10 3 10 8 0 4-3 7-7 7-3 0-5-2-5-5" stroke={palette.secondary} strokeWidth="3" strokeLinecap="round" fill="none" />
          <Path d="M20 51h18" stroke={palette.tertiary} strokeWidth="3" strokeLinecap="round" fill="none" />
        </G>
      );
  }
}

function WeatherGlyph({
  kind,
  palette,
  night,
  size,
  variant,
}: {
  kind: WeatherKind;
  palette: Palette;
  night: boolean;
  size: number;
  variant: IconVariant;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      {renderWeatherGlyphOutline(kind, palette, night)}
    </Svg>
  );
}

function MetricGlyph({
  kind,
  palette,
  size,
  variant,
}: {
  kind: MetricKind;
  palette: Palette;
  size: number;
  variant: IconVariant;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72">
      {variant === 'inline' ? renderMetricGlyphOutline(kind, palette) : renderMetricGlyph(kind, palette)}
    </Svg>
  );
}

export function PremiumWeatherIcon({
  code,
  size = 28,
  night = false,
  style,
  variant,
}: {
  code: number | null | undefined;
  size?: number;
  night?: boolean;
  style?: ViewStyle;
  variant?: IconVariant;
}) {
  const kind = weatherKindFromCode(code);
  const palette = WEATHER_PALETTES[kind];
  const resolvedVariant = resolveVariant(size, variant);
  const shellSize = resolvedVariant === 'hero' ? size : Math.round(size * 0.96);

  return (
    <View
      style={[
        styles.base,
        resolvedVariant === 'hero'
          ? {
              width: size,
              height: size,
            }
          : { width: shellSize, height: shellSize },
        style,
      ]}
    >
      <WeatherGlyph kind={kind} palette={palette} night={night} size={resolvedVariant === 'hero' ? Math.round(size * 0.76) : size} variant={resolvedVariant} />
    </View>
  );
}

export function PremiumMetricIcon({
  kind,
  size = 24,
  style,
  variant = 'inline',
}: {
  kind: MetricKind;
  size?: number;
  style?: ViewStyle;
  variant?: IconVariant;
}) {
  const palette = METRIC_PALETTES[kind];
  const resolvedVariant = resolveVariant(size, variant === 'inline' && size >= 40 ? 'hero' : variant);

  return (
    <View
      style={[
        styles.base,
        resolvedVariant === 'hero'
          ? {
              width: size,
              height: size,
            }
          : { width: size, height: size },
        style,
      ]}
    >
      <MetricGlyph kind={kind} palette={palette} size={resolvedVariant === 'hero' ? Math.round(size * 0.72) : size} variant={resolvedVariant} />
    </View>
  );
}

export function PremiumMoonIcon({
  size = 34,
  style,
  variant,
  illuminationPct,
  phaseDegrees,
}: {
  size?: number;
  style?: ViewStyle;
  label?: string | null;
  variant?: IconVariant;
  illuminationPct?: number | null;
  phaseDegrees?: number | null;
}) {
  const palette = {
    primary: '#FFF8E6',
    secondary: '#E5DDFF',
    tertiary: '#B4BDE3',
    accent: '#EED588',
    glow: 'rgba(191, 199, 255, 0.18)',
    backingTop: 'rgba(255,255,255,0.18)',
    backingBottom: 'rgba(122,138,198,0.11)',
    backingRim: 'rgba(255,255,255,0.26)',
  };
  const resolvedVariant = resolveVariant(size, variant);
  const glyphSize = resolvedVariant === 'hero' ? Math.round(size * 0.72) : size;
  const illum01 =
    typeof illuminationPct === 'number' && Number.isFinite(illuminationPct)
      ? Math.max(0, Math.min(1, illuminationPct / 100))
      : 0.55;
  const phase =
    typeof phaseDegrees === 'number' && Number.isFinite(phaseDegrees)
      ? ((phaseDegrees % 360) + 360) % 360
      : 120;
  const waxing = phase > 0 && phase < 180;
  const litSideLeft = phase >= 180;
  const absFromFull = Math.abs(illum01 - 1);
  const shadowWidth = illum01 >= 0.98 ? 0 : illum01 >= 0.5 ? Math.max(3, absFromFull * 52) : 54 - illum01 * 40;
  const shadowX = waxing ? 9 : 63 - shadowWidth;
  const terminatorCx = waxing ? shadowX + shadowWidth : shadowX;
  const crescentShadowOffset = Math.max(2, illum01 * 34);
  const crescentShadowCx = litSideLeft ? 36 + crescentShadowOffset : 36 - crescentShadowOffset;

  return (
    <View
      style={[
        styles.base,
        resolvedVariant === 'hero'
          ? {
              width: size,
              height: size,
            }
          : { width: size, height: size },
        style,
      ]}
    >
      <Svg width={glyphSize} height={glyphSize} viewBox="0 0 72 72">
        <Defs>
          <RadialGradient id="moonLitReal" cx="35%" cy="28%" r="72%">
            <Stop offset="0" stopColor="#fff9e8" stopOpacity="1" />
            <Stop offset="0.5" stopColor="#d9d2ba" stopOpacity="1" />
            <Stop offset="1" stopColor="#8f8b7d" stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id="moonShadowReal" cx="40%" cy="32%" r="72%">
            <Stop offset="0" stopColor="#313947" stopOpacity="1" />
            <Stop offset="1" stopColor="#080b12" stopOpacity="1" />
          </RadialGradient>
          <ClipPath id="moonClipReal">
            <Circle cx="36" cy="36" r="27" />
          </ClipPath>
        </Defs>
        <Circle cx="36" cy="36" r="27" fill="url(#moonShadowReal)" />
        <G clipPath="url(#moonClipReal)">
          {illum01 < 0.5 ? (
            <>
              <Circle cx="36" cy="36" r="27" fill="url(#moonLitReal)" />
              <Circle cx={crescentShadowCx} cy="36" r="27.7" fill="url(#moonShadowReal)" opacity="0.96" />
            </>
          ) : (
            <>
              <Circle cx="36" cy="36" r="27" fill="url(#moonLitReal)" />
              {shadowWidth > 0 ? (
                <>
                  <Rect x={shadowX} y="9" width={shadowWidth} height="54" fill="url(#moonShadowReal)" opacity="0.9" />
                  <Ellipse
                    cx={terminatorCx}
                    cy="36"
                    rx={Math.max(6, shadowWidth * 0.34)}
                    ry="28"
                    fill="url(#moonLitReal)"
                    opacity="0.72"
                  />
                </>
              ) : null}
            </>
          )}
          <Circle cx="27" cy="25" r="4.8" fill="#6f6b61" opacity={0.28 + illum01 * 0.18} />
          <Circle cx="44" cy="30" r="3.8" fill="#6b665c" opacity={0.24 + illum01 * 0.16} />
          <Circle cx="32" cy="47" r="5.2" fill="#746f65" opacity={0.22 + illum01 * 0.14} />
          <Circle cx="50" cy="45" r="2.5" fill="#5f5e58" opacity={0.24 + illum01 * 0.12} />
          <Path
            d="M21 39c5 2 10 2 15-1M39 21c4 3 8 4 13 3M41 54c4-2 8-2 13-1"
            fill="none"
            stroke="#f4ecd5"
            strokeWidth="1.1"
            strokeOpacity={0.08 + illum01 * 0.12}
          />
        </G>
        <Circle cx="36" cy="36" r="27" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
