// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TabBarIcon from '../../components/ui/TabBarIcon';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { useSettings } from '../context/SettingsContext';
import { appChrome } from '../lib/theme/appAppearance';

function TabLabel({ color, label }: { color: string; label: string }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.72}
      style={{ color, fontWeight: '800', fontSize: 10, marginTop: -2, marginBottom: 1, textAlign: 'center' }}
    >
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const insets = useSafeAreaInsets();
  const { appColorMode } = useSettings();
  const chrome = useMemo(() => appChrome(appColorMode), [appColorMode]);

  const tabBarStyle = useMemo(() => {
    const baseHeight = Platform.select({ ios: 58, android: 54, default: 54 }) as number;
    const padTop = 6;
    const padBottom = Math.max(8, insets.bottom);

    return {
      backgroundColor: chrome.tabBar,
      borderTopColor: chrome.border,
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
  }, [chrome.border, chrome.tabBar, insets.bottom]);

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: 'transparent' },
        headerShown: false,
        headerTransparent: true,

        tabBarLabelStyle: { fontWeight: '800', fontSize: 10, marginTop: -2, marginBottom: 1 },
        tabBarIconStyle: { marginTop: 1, marginBottom: -1 },
        tabBarItemStyle: { paddingHorizontal: 0, minWidth: 0 },

        // ✅ use the computed style
        tabBarStyle,

        tabBarActiveTintColor: 'white',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',

        tabBarActiveBackgroundColor: chrome.tabActiveBg,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Land',
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Land" />,
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
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Hourly" />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'time' : 'time-outline'} color={color} />
          ),
        }}
      />

     <Tabs.Screen
  name="almanac"
  options={{
    title: 'Almanac',
    tabBarLabel: ({ color }) => <TabLabel color={color} label="Almanac" />,
    tabBarIcon: ({ color, focused }) => (
      <TabBarIcon name={focused ? 'thermometer' : 'thermometer-outline'} color={color} />
    ),
  }}
/>

      <Tabs.Screen
        name="maps"
        options={{
          title: 'Maps',
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Maps" />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'map' : 'map-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="solar"
        options={{
          title: 'Space',
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Space" />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'sunny' : 'sunny-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="nautical"
        options={{
          title: 'Nautical',
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Nautical" />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'boat' : 'boat-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="aviation"
        options={{
          title: 'Aviation',
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Aviation" />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'airplane' : 'airplane-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="extremes"
        options={{
          title: 'Extremes',
          tabBarLabel: ({ color }) => <TabLabel color={color} label="Extremes" />,
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name={focused ? 'thunderstorm' : 'thunderstorm-outline'} color={color} />
          ),
        }}
      />

      <Tabs.Screen name="mariner" options={{ href: null }} />
      <Tabs.Screen name="astronomer" options={{ href: null }} />
      <Tabs.Screen name="nautical-map" options={{ href: null }} />
      <Tabs.Screen name="aviation-map" options={{ href: null, unmountOnBlur: true } as any} />
      <Tabs.Screen name="astro-map" options={{ href: null, unmountOnBlur: true } as any} />
    </Tabs>
  );
}
