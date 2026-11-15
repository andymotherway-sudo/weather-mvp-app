import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { useAppChrome } from '../../app/lib/theme/useAppChrome';
import { theme } from '../../styles/theme';
import { Card } from '../layout/Card';

export type OmniStatusTone = 'loading' | 'error' | 'empty' | 'unavailable' | 'info';

type OmniStatusCardProps = {
  tone: OmniStatusTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

const TONE_COLORS: Record<OmniStatusTone, string> = {
  loading: theme.semantic.state.info,
  error: theme.semantic.state.danger,
  empty: '#94A3B8',
  unavailable: theme.semantic.state.stale,
  info: theme.semantic.state.info,
};

export function OmniStatusCard({
  tone,
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  style,
}: OmniStatusCardProps) {
  const { chrome } = useAppChrome();
  const accent = TONE_COLORS[tone];
  const isLoading = tone === 'loading';
  const isError = tone === 'error';

  return (
    <Card
      style={[
        styles.card,
        compact ? styles.cardCompact : null,
        { backgroundColor: chrome.cardStrong, borderColor: accent },
        style,
      ]}
    >
      <View
        accessibilityLiveRegion={isError ? 'assertive' : 'polite'}
        accessibilityRole={isError ? 'alert' : 'summary'}
        style={styles.content}
      >
        <View style={[styles.indicator, { backgroundColor: `${accent}22`, borderColor: `${accent}88` }]}>
          {isLoading ? <ActivityIndicator color={accent} size="small" /> : <View style={[styles.dot, { backgroundColor: accent }]} />}
        </View>

        <View style={styles.copy}>
          <Text style={[styles.title, { color: chrome.textPrimary }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: chrome.textSecondary }]}>{message}</Text> : null}
        </View>
      </View>

      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <View style={styles.actions}>
          {actionLabel && onAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              hitSlop={4}
              onPress={onAction}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: chrome.pillActive, borderColor: chrome.borderStrong, opacity: pressed ? 0.72 : 1 },
              ]}
            >
              <Text style={[styles.actionText, { color: chrome.textPrimary }]}>{actionLabel}</Text>
            </Pressable>
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={secondaryActionLabel}
              hitSlop={4}
              onPress={onSecondaryAction}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: chrome.pill, borderColor: chrome.border, opacity: pressed ? 0.72 : 1 },
              ]}
            >
              <Text style={[styles.actionText, { color: chrome.textPrimary }]}>{secondaryActionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  cardCompact: {
    padding: theme.spacing.md,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  indicator: {
    width: 38,
    height: 38,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: theme.radius.pill,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  message: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  actions: {
    marginTop: theme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  action: {
    flexGrow: 1,
    flexBasis: 120,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '900',
  },
});
