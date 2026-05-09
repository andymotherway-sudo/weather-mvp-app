import React from 'react';
import { StyleSheet, View } from 'react-native';

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
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: props.bottomOffset ?? 96 }]}>
      <Glass style={styles.tray}>
        <AviationLayerChips
          title="Products"
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
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 78, right: 12 },
  tray: { borderRadius: 18, paddingHorizontal: 10, paddingVertical: 8, gap: 8 },
});
