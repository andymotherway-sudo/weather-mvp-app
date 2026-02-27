// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TabBarIcon from '../../components/ui/TabBarIcon';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const insets = useSafeAreaInsets();

  const tabBarStyle = useMemo(() => {
    const baseHeight = Platform.select({ ios: 60, android: 56, default: 56 }) as number;
    const padTop = 8;
    const padBottom = Math.max(10, insets.bottom);

    return {
      backgroundColor: 'rgba(20,24,38,0.98)',
      borderTopColor: 'rgba(255,255,255,0.06)',
      borderTopWidth: 1,

      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,

      height: baseHeight + padBottom + padTop,
      paddingTop: padTop,
      paddingBottom: padBottom,

      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -6 },
      elevation: 18,
    } as const;
  }, [insets.bottom]);

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: 'transparent' },
        headerShown: false,
        headerTransparent: true,

        tabBarLabelStyle: { fontWeight: '800', fontSize: 11, marginTop: -2, marginBottom: 2 },
        tabBarIconStyle: { marginTop: 2 },

        // ✅ use the computed style
        tabBarStyle,

        tabBarActiveTintColor: 'white',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',

        tabBarActiveBackgroundColor: 'rgba(255,255,255,0.06)',
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Land',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'partly-sunny' : 'partly-sunny-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="hourly"
        options={{
          headerTitle: '',
          title: 'Hourly',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'time' : 'time-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="climo"
        options={{
          title: 'Almanac',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'thermometer' : 'thermometer-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="maps"
        options={{
          title: 'Maps',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'map' : 'map-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="solar"
        options={{
          title: 'Space',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'sunny' : 'sunny-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="nautical"
        options={{
          title: 'Nautical',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'boat' : 'boat-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="extremes"
        options={{
          title: 'Extremes',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'thunderstorm' : 'thunderstorm-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen name="mariner" options={{ href: null }} />
      <Tabs.Screen name="astronomer" options={{ href: null }} />
      <Tabs.Screen name="nautical-map" options={{ href: null }} />
      <Tabs.Screen name="astro-map" options={{ href: null, unmountOnBlur: true } as any} />
    </Tabs>
  );
}