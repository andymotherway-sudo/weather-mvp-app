import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export function Glass(props: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: 'rgba(2,6,23,0.72)',
          borderColor: 'rgba(255,255,255,0.10)',
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
