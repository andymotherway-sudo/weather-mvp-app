// styles/typography.ts
import { Platform, TextStyle } from 'react-native';
import { theme } from './theme';

type Typography = {
  title: TextStyle;
  subtitle: TextStyle;
  body: TextStyle;
  label: TextStyle;
  small: TextStyle;

  // Optional "data-ish" helpers (use where it helps, ignore otherwise)
  metric?: TextStyle;
  chartLabel?: TextStyle;
  primaryNumber?: TextStyle; 
};

function systemFontFamily(): string | undefined {
  // RN: leaving undefined also uses the system font, but being explicit is fine.
  return Platform.select({
    ios: 'System',
    android: 'Roboto',
    default: undefined,
  });
}

function withWxLabBase(s: TextStyle, wxLab: boolean): TextStyle {
  if (!wxLab) return s;

  return {
    ...s,
    fontFamily: systemFontFamily(),
    // Makes numbers align vertically in lists/charts
    fontVariant: (s.fontVariant ?? []).includes('tabular-nums')
      ? s.fontVariant
      : ([...(s.fontVariant ?? []), 'tabular-nums'] as any),
  };
}

// Your original “general” tokens
const general: Typography = {
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  body: {
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  label: {
    fontSize: 11,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  small: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },

  metric: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  chartLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  primaryNumber: {
  fontSize: 20,
  color: theme.colors.textPrimary,
  fontWeight: '600',
  fontVariant: ['tabular-nums'],
  },
};

function makeWxLabVariant(base: Typography): Typography {
  // Keep sizes mostly the same, but make it feel “system / instrument”
  return {
    ...base,
    title: {
      ...base.title,
      fontWeight: '600', // less “marketing bold”
      letterSpacing: 0.2,
    },
    subtitle: {
      ...base.subtitle,
      // slightly quieter
      opacity: 0.85,
    },
    body: {
      ...base.body,
      fontWeight: '400',
    },
    label: {
      ...base.label,
      // more “panel label”
      letterSpacing: 1.2,
      opacity: 0.8,
    },
    small: {
      ...base.small,
      opacity: 0.8,
    },
    metric: {
      ...(base.metric ?? {}),
      fontSize: 12,
      fontWeight: '400',
      color: theme.colors.textSecondary,
      opacity: 0.85,
    },
    chartLabel: {
      ...(base.chartLabel ?? {}),
      fontSize: 11,
      color: theme.colors.textMuted,
      opacity: 0.65,
    },
    primaryNumber: {
      ...(base.primaryNumber ?? {}),
      fontWeight: '500',
      letterSpacing: 0.1,
    },
  };
}

// ✅ Backwards compatible export (what you use today)
export const typography: Typography = general;

// ✅ New: getter for screens/components that need Wx Lab styling
export function getTypography(opts?: { wxLab?: boolean }): Typography {
  const wxLab = !!opts?.wxLab;
  const base = wxLab ? makeWxLabVariant(general) : general;

  // Apply system font + tabular nums to everything in Wx Lab
  return {
    title: withWxLabBase(base.title, wxLab),
    subtitle: withWxLabBase(base.subtitle, wxLab),
    body: withWxLabBase(base.body, wxLab),
    label: withWxLabBase(base.label, wxLab),
    small: withWxLabBase(base.small, wxLab),
    metric: base.metric ? withWxLabBase(base.metric, wxLab) : undefined,
    chartLabel: base.chartLabel ? withWxLabBase(base.chartLabel, wxLab) : undefined,
    primaryNumber: base.primaryNumber ? withWxLabBase(base.primaryNumber, wxLab) : undefined,
  };
}