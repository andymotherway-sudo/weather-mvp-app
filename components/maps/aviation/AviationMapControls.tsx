import React from 'react';
import {
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import type { AviationHazardType, AviationProductType } from '../../../app/lib/aviation/types';
import { Glass } from '../../common/Glass';
import { AviationLayerChips } from './AviationLayerChips';
import { AviationValidTimeScrubber } from './AviationValidTimeScrubber';

const PRODUCTS: Array<{ key: AviationProductType; label: string }> = [
  { key: 'gairmet', label: 'G-AIRMET' },
  { key: 'sigmet', label: 'SIGMET' },
  { key: 'convectiveSigmet', label: 'Conv SIGMET' },
  { key: 'pirep', label: 'PIREP' },
];

const HAZARDS: Array<{ key: AviationHazardType; label: string }> = [
  { key: 'ice', label: 'ICE' },
  { key: 'turb', label: 'TURB' },
  { key: 'llws', label: 'LLWS' },
  { key: 'ifr', label: 'IFR/MTN' },
  { key: 'mtnObscuration', label: 'MTN OBS' },
  { key: 'ts', label: 'TS' },
];

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export function AviationMapControls(props: {
  selectedProducts: AviationProductType[];
  selectedHazards: AviationHazardType[];
  validTimes: string[];
  selectedValidTime: Date;
  onToggleProduct: (value: AviationProductType) => void;
  onToggleHazard: (value: AviationHazardType) => void;
  onSelectValidTime: (value: Date) => void;
  bottomOffset?: number;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const drawerProgress = React.useRef(new Animated.Value(1)).current;
  const selectedCount = props.selectedProducts.length + props.selectedHazards.length;
  const contentStyle = React.useMemo(
    () => ({
      maxHeight: drawerProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 245],
      }),
      opacity: drawerProgress,
      transform: [
        {
          translateY: drawerProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [-8, 0],
          }),
        },
      ],
    }),
    [drawerProgress]
  );

  React.useEffect(() => {
    Animated.timing(drawerProgress, {
      toValue: collapsed ? 0 : 1,
      duration: collapsed ? 180 : 240,
      easing: collapsed ? Easing.out(Easing.cubic) : Easing.bezier(0.18, 0.82, 0.22, 1),
      useNativeDriver: false,
    }).start();
  }, [collapsed, drawerProgress]);

  const toggleDrawer = React.useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setCollapsed((value) => !value);
  }, []);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: props.bottomOffset ?? 96 }]}>
      <Glass style={[styles.tray, collapsed ? styles.trayCollapsed : null]}>
        <Pressable onPress={toggleDrawer} style={styles.drawerHeader}>
          <View>
            <Text style={styles.drawerTitle}>Products</Text>
            {collapsed ? <Text style={styles.drawerSubtitle}>{selectedCount} active layers</Text> : null}
          </View>
          <Text style={styles.drawerToggle}>{collapsed ? 'Show' : 'Hide'}</Text>
        </Pressable>

        <Animated.View
          pointerEvents={collapsed ? 'none' : 'auto'}
          style={[styles.drawerBody, contentStyle]}
        >
            <AviationLayerChips
              options={PRODUCTS}
              selected={props.selectedProducts}
              onToggle={props.onToggleProduct}
            />
            <AviationLayerChips
              title="Hazards"
              options={HAZARDS}
              selected={props.selectedHazards}
              onToggle={props.onToggleHazard}
            />
            <AviationValidTimeScrubber
              validTimes={props.validTimes}
              selectedValidTime={props.selectedValidTime}
              onSelect={props.onSelectValidTime}
            />
        </Animated.View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 4, right: 18, maxWidth: 620 },
  tray: {
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(2,6,23,0.92)',
    borderColor: 'rgba(148,163,184,0.22)',
  },
  trayCollapsed: { alignSelf: 'flex-start', minWidth: 150 },
  drawerHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  drawerTitle: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  drawerSubtitle: { color: 'rgba(255,255,255,0.54)', fontSize: 10, fontWeight: '800', marginTop: 2 },
  drawerBody: { gap: 8, overflow: 'hidden' },
  drawerToggle: {
    color: 'rgba(186,230,253,0.88)',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
});
