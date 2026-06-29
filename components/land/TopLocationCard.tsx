import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import TabBarIcon from '../../components/ui/TabBarIcon';

type Props = {
  locationTitle: string;      // e.g. "Phoenix, AZ"
  locationSubtitle?: string;  // e.g. "Change location"
  onChangeLocation: () => void;
  onSave: () => void;
  onWxLab: () => void;
  saved?: boolean;
  wxLabEnabled?: boolean;
};

export function TopLocationCard({
  locationTitle,
  locationSubtitle = 'Change location',
  onChangeLocation,
  onSave,
  onWxLab,
  saved,
  wxLabEnabled,
}: Props) {
  const OMNI_MARK = useMemo(() => require('../../assets/brand/omniwx-logo-transparent.png'), []);

  return (
    <View style={styles.shell}>
      <View style={styles.card}>
        {/* Row 1 */}
        <View style={styles.rowTop}>
          <View style={styles.brandRow}>
            <Image source={OMNI_MARK} style={styles.mark} resizeMode="contain" />
            <View>
              <Text style={styles.kicker}>Current location</Text>
            </View>
          </View>

          {/* Tertiary: Settings */}
          <Pressable
            onPress={() => router.push('/profile')}
            hitSlop={12}
            style={styles.iconButton}
          >
            <TabBarIcon name="settings-outline" color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>

        {/* Row 2 (Primary CTA) */}
        <Pressable onPress={onChangeLocation} style={styles.locationCta} hitSlop={6}>
          <Text numberOfLines={1} style={styles.locationTitle}>
            {locationTitle}
          </Text>
          <View style={styles.changeRow}>
            <TabBarIcon name="location-outline" color="rgba(255,255,255,0.70)" />
            <Text style={styles.changeText}>{locationSubtitle}</Text>
          </View>
        </Pressable>

        {/* Row 3 (Secondary actions) */}
        <View style={styles.actionsRow}>
          <Pressable onPress={onSave} style={[styles.pill, saved && styles.pillOn]}>
            <TabBarIcon
              name={saved ? 'star' : 'star-outline'}
              color={saved ? 'white' : 'rgba(255,255,255,0.85)'}
            />
            <Text style={styles.pillText}>{saved ? 'Saved' : 'Save'}</Text>
          </Pressable>

          <Pressable
            onPress={onWxLab}
            style={[styles.pill, styles.pillPrimary, wxLabEnabled && styles.pillPrimaryOn]}
          >
            <TabBarIcon name="flask-outline" color="white" />
            <Text style={[styles.pillText, { color: 'white' }]}>wxLab</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  card: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    overflow: 'hidden',
  },

  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  mark: { width: 38, height: 44 },

  kicker: {
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '900',
    letterSpacing: 0.4,
    fontSize: 12,
    textTransform: 'uppercase',
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  locationCta: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  locationTitle: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 6,
  },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  changeText: { color: 'rgba(255,255,255,0.70)', fontWeight: '800' },

  actionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: 16,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  pillOn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.18)',
  },
  pillPrimary: {
    backgroundColor: 'rgba(37, 99, 235, 0.72)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  pillPrimaryOn: {
    backgroundColor: 'rgba(72, 201, 176, 0.22)',
    borderColor: 'rgba(109, 236, 198, 0.34)',
  },
  pillText: {
    color: 'rgba(255,255,255,0.90)',
    fontWeight: '900',
  },
});
