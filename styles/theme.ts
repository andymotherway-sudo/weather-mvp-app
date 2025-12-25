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
