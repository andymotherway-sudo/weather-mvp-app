import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glass } from '../common/Glass';
import type { WeatherAlertForecastTarget } from '../../app/lib/maps/useAlertMapLayer';
import { formatAlertDate } from '../../app/lib/maps/useAlertMapLayer';
import type { WeatherAlertDetail } from '../../app/lib/maps/useAlertMapData';

function Badge(props: { label: string; strong?: boolean }) {
  return (
    <View style={[styles.badge, props.strong ? styles.badgeStrong : null]}>
      <Text style={styles.badgeText} numberOfLines={1}>
        {props.label}
      </Text>
    </View>
  );
}

type Props = {
  alert: WeatherAlertDetail;
  error: string | null;
  forecastTarget: WeatherAlertForecastTarget;
  loading: boolean;
  officialText: string;
  onClose: () => void;
  onOpenForecast: () => void;
  bottom: number;
};

export function AlertDetailCard({
  alert,
  bottom,
  error,
  forecastTarget,
  loading,
  officialText,
  onClose,
  onOpenForecast,
}: Props) {
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <Glass style={styles.card}>
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eyebrow}>WEATHER ALERT</Text>
            <Text style={styles.title} numberOfLines={2}>
              {alert.event}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.pills}>
          {alert.severity ? <Badge label={alert.severity} strong /> : null}
          {alert.urgency ? <Badge label={alert.urgency} /> : null}
          {alert.certainty ? <Badge label={alert.certainty} /> : null}
        </View>

        {alert.headline ? <Text style={styles.meta}>{alert.headline}</Text> : null}

        <View style={styles.rows}>
          <View style={styles.row}>
            <Text style={styles.label}>Area</Text>
            <Text style={styles.value} numberOfLines={2}>
              {alert.areaDesc ?? 'Area pending'}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Effective</Text>
            <Text style={styles.value}>{formatAlertDate(alert.effective)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Ends</Text>
            <Text style={styles.value}>{formatAlertDate(alert.ends ?? alert.expires)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Source</Text>
            <Text style={styles.value} numberOfLines={1}>
              {alert.senderName ?? 'National Weather Service'}
            </Text>
          </View>
        </View>

        <View style={styles.textPanel}>
          <Text style={styles.textPanelTitle}>Official alert text</Text>
          {loading && !officialText ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#bfdbfe" />
              <Text style={styles.loadingText}>Loading full NWS bulletin...</Text>
            </View>
          ) : officialText ? (
            <ScrollView style={styles.textScroll} nestedScrollEnabled>
              <Text style={styles.instruction}>{officialText}</Text>
            </ScrollView>
          ) : (
            <Text style={styles.instruction}>{error ?? 'No detailed alert text was included with this bulletin.'}</Text>
          )}
          {loading && officialText ? (
            <Text style={styles.loadingText}>Refreshing official text...</Text>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}
        </View>

        {forecastTarget ? (
          <View style={styles.actionRow}>
            <Pressable style={[styles.close, styles.primary]} onPress={onOpenForecast}>
              <Text style={styles.closeText}>
                {forecastTarget.kind === 'marine' ? 'Open marine forecast' : 'Open NWS forecast'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 30,
  },
  card: {
    borderRadius: 24,
    padding: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  eyebrow: {
    color: '#bfdbfe',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    color: 'white',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  close: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(15,23,42,0.46)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  closeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '900',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  badge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(15,23,42,0.42)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  badgeStrong: {
    borderColor: 'rgba(191,219,254,0.45)',
    backgroundColor: 'rgba(37,99,235,0.25)',
  },
  badgeText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '900',
  },
  meta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 8,
  },
  rows: {
    marginTop: 12,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
  },
  value: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  textPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    backgroundColor: 'rgba(15,23,42,0.32)',
    padding: 12,
    gap: 8,
    marginTop: 12,
  },
  textPanelTitle: {
    color: 'rgba(191,219,254,0.96)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  textScroll: {
    maxHeight: 190,
  },
  instruction: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: 'rgba(203,213,225,0.78)',
    fontSize: 11,
    fontWeight: '800',
  },
  errorText: {
    color: 'rgba(254,202,202,0.92)',
    fontSize: 11,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
  },
  primary: {
    backgroundColor: 'rgba(14,165,233,0.22)',
    borderColor: 'rgba(125,211,252,0.36)',
  },
});
