// app/_layout.tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { View } from 'react-native';

import { AppBoot } from '../components/boot/AppBoot';
import { LocationProvider } from './context/LocationContext';
import { PlaceProvider } from './context/PlaceContext';
import { SettingsProvider } from './context/SettingsContext';
import { WxLabProvider } from './context/WxLabContext';

const APP_BG = '#020617';

export default function RootLayout() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(APP_BG).catch(() => {});
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: APP_BG }}>
      <StatusBar style="light" translucent={false} backgroundColor={APP_BG} />

      <SettingsProvider>
        <LocationProvider>
          <PlaceProvider>
            <WxLabProvider>
              <AppBoot>
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: APP_BG }, // <-- KEY
                  }}
                >
                  <Stack.Screen name="(onboarding)" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
                </Stack>
              </AppBoot>
            </WxLabProvider>
          </PlaceProvider>
        </LocationProvider>
      </SettingsProvider>
    </View>
  );
}