import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useSettings } from '../../app/context/SettingsContext';
import { appChrome } from '../../app/lib/theme/appAppearance';

export function Glass(props: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { appColorMode } = useSettings();
  const chrome = appChrome(appColorMode);

  return (
    <View
      style={[
        {
          backgroundColor: chrome.card,
          borderColor: chrome.border,
          borderWidth: 1,
          borderRadius: 18,
          padding: 10,
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowRadius: 16,
          elevation: 10,
        },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}
