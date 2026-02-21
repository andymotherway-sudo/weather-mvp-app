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

import { AppBoot } from '../../components/boot/AppBoot'; // ✅ add

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
    const padBottom = Math.max(10, insets.bottom);
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
    <AppBoot>
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
            {/* Land */}
            <Tabs.Screen
              name="index"
              options={{
                title: 'Land',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'partly-sunny' : 'partly-sunny-outline'} color={color} />
                ),
              }}
            />

            {/* Hourly */}
            <Tabs.Screen
              name="hourly"
              options={{
                title: 'Hourly',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'time' : 'time-outline'} color={color} />
                ),
              }}
            />

            {/* Almanac (keeps route name 'climo' to avoid renaming files) */}
            <Tabs.Screen
              name="climo"
              options={{
                title: 'Almanac',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'thermometer' : 'thermometer-outline'} color={color} />
                ),
              }}
            />

            {/* Maps */}
            <Tabs.Screen
              name="maps"
              options={{
                title: 'Maps',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'map' : 'map-outline'} color={color} />
                ),
              }}
            />

            {/* Space (uses existing 'solar' route) */}
            <Tabs.Screen
              name="solar"
              options={{
                title: 'Space',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'sunny' : 'sunny-outline'} color={color} />
                ),
              }}
            />

            {/* Nautical */}
            <Tabs.Screen
              name="nautical"
              options={{
                title: 'Nautical',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'boat' : 'boat-outline'} color={color} />
                ),
              }}
            />

            {/* Extremes */}
            <Tabs.Screen
              name="extremes"
              options={{
                title: 'Extremes',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'thunderstorm' : 'thunderstorm-outline'} color={color} />
                ),
              }}
            />

            {/* Settings */}
            <Tabs.Screen
              name="settings"
              options={{
                title: 'Settings',
                tabBarIcon: ({ color, focused }) => (
                  <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} />
                ),
              }}
            />

            {/* Keep hidden routes (still available by deep link/navigation) */}
            <Tabs.Screen name="mariner" options={{ href: null }} />
            <Tabs.Screen name="astronomer" options={{ href: null }} />
            <Tabs.Screen name="buoy-map" options={{ href: null }} />
            <Tabs.Screen name="nautical-map" options={{ href: null }} />
            <Tabs.Screen
              name="astro-map"
              options={
                {
                  href: null,
                  unmountOnBlur: true,
                } as any
              }
            />
          </Tabs>
        </PlaceProvider>
      </LocationProvider>
    </AppBoot>
  );
}