// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TabBarIcon from '../../components/ui/TabBarIcon';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { LocationProvider } from '../context/LocationContext';
import { PlaceProvider } from '../context/PlaceContext';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;
  const insets = useSafeAreaInsets();

  const bg = '#020617';
  const bgElev = '#0B1220';
  const border = 'rgba(255,255,255,0.10)';

  const tabBarStyle = useMemo(() => {
    const baseHeight = Platform.select({ ios: 60, android: 56, default: 56 }) as number;
    const padTop = 8;
    const padBottom = Math.max(10, insets.bottom); // ✅ key fix for Android gesture/nav bar
    return {
      backgroundColor: bg,
      borderTopColor: border,
      borderTopWidth: 1,
      height: baseHeight + padBottom + padTop,
      paddingTop: padTop,
      paddingBottom: padBottom,

      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: -6 },
      elevation: 18,
    } as const;
  }, [bg, border, insets.bottom]);

  return (
    <LocationProvider>
      <PlaceProvider>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: tint,
            tabBarInactiveTintColor: 'rgba(255,255,255,0.55)',
            tabBarLabelStyle: {
              fontWeight: '800',
              fontSize: 11,
              marginTop: -2,
              marginBottom: 2,
            },
            tabBarIconStyle: { marginTop: 2 },
            tabBarStyle: tabBarStyle,
            tabBarHideOnKeyboard: true,

            headerStyle: { backgroundColor: bgElev },
            headerTintColor: 'white',
            headerTitleStyle: { fontWeight: '900' },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Land Wx',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'partly-sunny' : 'partly-sunny-outline'} color={color} />
              ),
            }}
          />

          {/* ✅ These exist in your tree: hourly.tsx, climo.tsx */}
          <Tabs.Screen
            name="hourly"
            options={{
              title: 'Hourly',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'time' : 'time-outline'} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="climo"
            options={{
              title: 'Climo',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'thermometer' : 'thermometer-outline'} color={color} />
              ),
            }}
          />

          <Tabs.Screen
            name="maps"
            options={{
              title: 'Map',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'map' : 'map-outline'} color={color} />
              ),
            }}
          />

          <Tabs.Screen
            name="solar"
            options={{
              title: 'Solar Wx',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'sunny' : 'sunny-outline'} color={color} />
              ),
            }}
          />

          <Tabs.Screen
            name="explore"
            options={{
              title: 'Explore',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'search' : 'search-outline'} color={color} />
              ),
            }}
          />

          <Tabs.Screen
            name="nautical"
            options={{
              title: 'Nautical Wx',
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

          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color, focused }) => (
                <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} />
              ),
            }}
          />

          {/* Hidden deep-link helper routes */}
          <Tabs.Screen name="mariner" options={{ href: null }} />
          <Tabs.Screen name="astronomer" options={{ href: null }} />
          <Tabs.Screen name="buoy-map" options={{ href: null }} />
          <Tabs.Screen name="nautical-map" options={{ href: null }} />
          <Tabs.Screen
              name="astro-map"
              options={
                {
                  href: null,
                  unmountOnBlur: true, // ✅ runtime option, TS doesn't know it
                } as any
              }
            />
        </Tabs>
      </PlaceProvider>
    </LocationProvider>
  );
}
