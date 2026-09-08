import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';

type OmniGlassCardVariant = 'default' | 'strong' | 'floating' | 'compact';

type OmniGlassCardProps = {
  children: ReactNode;
  variant?: OmniGlassCardVariant;
  style?: StyleProp<ViewStyle>;
};

export function OmniGlassCard({ children, variant = 'default', style }: OmniGlassCardProps) {
  const { chrome } = useAppChrome();
  const variantStyle = variant === 'compact' ? styles.compact : variant === 'floating' ? styles.floating : variant === 'strong' ? styles.strong : styles.card;
  const backgroundColor = variant === 'strong' ? chrome.cardStrong : variant === 'compact' ? chrome.pill : chrome.card;

  return (
    <View style={[styles.base, variantStyle, { backgroundColor, borderColor: chrome.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  card: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  strong: {
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  floating: {
    borderRadius: 28,
    padding: theme.spacing.md,
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 12,
  },
  compact: {
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 4,
  },
});
