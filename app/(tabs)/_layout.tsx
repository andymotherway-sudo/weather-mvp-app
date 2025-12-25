// app/(tabs)/_layout.tsx

import { Tabs } from 'expo-router';
import React from 'react';

import TabBarIcon from '../../components/ui/TabBarIcon';
import { Colors } from '../../constants/theme';
import { useColorScheme } from '../../hooks/use-color-scheme';
import { LocationProvider } from '../context/LocationContext';

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const tint = Colors[colorScheme].tint;

  return (
  <LocationProvider>
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
        tabBarStyle: {
          backgroundColor: '#020617',
          borderTopColor: '#111827',
        },
        headerStyle: { backgroundColor: '#020617' },
        headerTintColor: 'white',
      }}
    >
      {/* LAND */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Land Wx',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'partly-sunny' : 'partly-sunny-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* SOLAR */}
      <Tabs.Screen
        name="solar"
        options={{
          title: 'Solar Wx',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'sunny' : 'sunny-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* EXPLORE */}
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'search' : 'search-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* NAUTICAL */}
      <Tabs.Screen
        name="nautical"
        options={{
          title: 'Nautical Wx',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'boat' : 'boat-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* BUOY MAP */}
      <Tabs.Screen
        name="buoy-map"
        options={{
          title: 'Buoy Map',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'radio' : 'radio-outline'}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
  name="nautical-map"
  options={{
    title: 'Nautical Map',
    tabBarIcon: ({ color, focused }) => (
      <TabBarIcon
        name={focused ? 'map' : 'map-outline'}
        color={color}
      />
    ),
  }}
/>


      {/* EXTREMES */}
      <Tabs.Screen
        name="extremes"
        options={{
          title: 'Extremes',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'thunderstorm' : 'thunderstorm-outline'}
              color={color}
            />
          ),
        }}
      />

      {/* SETTINGS */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon
              name={focused ? 'settings' : 'settings-outline'}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  </LocationProvider> 
  );
}
