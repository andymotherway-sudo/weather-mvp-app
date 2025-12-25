// styles/typography.ts
import { TextStyle } from 'react-native';
import { theme } from './theme';

type Typography = {
  title: TextStyle;
  subtitle: TextStyle;
  body: TextStyle;
  label: TextStyle;
  small: TextStyle;
};

export const typography: Typography = {
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
};
