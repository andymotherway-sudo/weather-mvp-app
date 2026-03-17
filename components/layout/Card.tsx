// components/layout/Card.tsx
import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { theme } from '../../styles/theme';

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Glassier / more transparent cards so animated sky backgrounds show through.
 * Keep borders subtle and add a soft shadow for depth.
 */
const styles = StyleSheet.create({
  card: {
    // Let the background animation breathe through
    backgroundColor: 'rgba(18, 28, 45, 0.60)',

    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,

    // Softer "glass rim"
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',

    // Depth without heaviness (RN iOS shadow)
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },

    // Android shadow
    elevation: 6,
  },
});