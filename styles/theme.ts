// styles/theme.ts
export const theme = {
  colors: {
    background: '#020617',      // app background (dark navy)
    surface: '#020617',         // main card background
    surfaceElevated: '#020617', // tweak later if you want layered depth
    border: '#1E293B',

    textPrimary: '#F9FAFB',
    textSecondary: '#9CA3AF',
    textMuted: '#6B7280',

    accent: '#38BDF8',          // cyan-ish accent
    accentSoft: '#0EA5E9',

    errorBg: '#7F1D1D',
    errorText: '#FECACA',
  },
  semantic: {
    glass: {
      default: 'rgba(11,18,32,0.78)',
      strong: 'rgba(18,28,45,0.86)',
      floating: 'rgba(8,13,24,0.88)',
      subtle: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.10)',
      borderStrong: 'rgba(147,197,253,0.55)',
    },
    state: {
      good: '#65F08A',
      fair: '#FACC15',
      poor: '#FB923C',
      danger: '#EF4444',
      stale: '#F59E0B',
      info: '#38BDF8',
    },
    score: {
      excellent: '#65F08A',
      good: '#9BE564',
      fair: '#FACC15',
      poor: '#FB923C',
      bad: '#EF4444',
    },
    feature: {
      land: '#60A5FA',
      hourly: '#93C5FD',
      almanac: '#FBBF24',
      maps: '#38BDF8',
      space: '#22D3EE',
      nautical: '#2DD4BF',
      aviation: '#A78BFA',
      extremes: '#F472B6',
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    pill: 999,
  },
  shadow: {
    // you can tune this as you go
    elevation: 3,
  },
} as const;

export type Theme = typeof theme;
