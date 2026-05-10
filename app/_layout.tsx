// app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppBoot } from '../components/boot/AppBoot';
import { AlmanacWarmupProvider } from '../components/boot/AlmanacWarmup';

// ✅ NEW: app-wide locations provider (last-known coords + GPS warmup)
import { LocationsProvider } from './lib/locations/useLocations';

import { PlaceProvider } from './context/PlaceContext';
import { SettingsProvider } from './context/SettingsContext';
import { WxLabProvider } from './context/WxLabContext';

const APP_BG = '#020617';

export default function RootLayout() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(APP_BG).catch(() => {});
  }, []);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: APP_BG }}>
        <StatusBar style="light" translucent={false} backgroundColor={APP_BG} />

      <SettingsProvider>
        {/* ✅ replaces LocationProvider */}
        <LocationsProvider>
          <PlaceProvider>
            <WxLabProvider>
              <AppBoot>
                <AlmanacWarmupProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: APP_BG },
                    }}
                  >
                    <Stack.Screen name="(onboarding)" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                  </Stack>
                </AlmanacWarmupProvider>
              </AppBoot>
            </WxLabProvider>
          </PlaceProvider>
        </LocationsProvider>
        </SettingsProvider>
      </View>
    </SafeAreaProvider>
  );
}
