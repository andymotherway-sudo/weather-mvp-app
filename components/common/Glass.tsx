import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useAppChrome } from '../../app/lib/theme/useAppChrome';

export function Glass(props: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { chrome } = useAppChrome();

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
