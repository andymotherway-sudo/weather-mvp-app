// app/_layout.tsx
import { Stack } from 'expo-router';

import { LocationProvider } from './context/LocationContext';
import { PlaceProvider } from './context/PlaceContext';
import { SettingsProvider } from './context/SettingsContext';
import { WxLabProvider } from './context/WxLabContext';

import { AppBoot } from '../components/boot/AppBoot';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <LocationProvider>
        <PlaceProvider>
          <WxLabProvider>
            <AppBoot>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              </Stack>
            </AppBoot>
          </WxLabProvider>
        </PlaceProvider>
      </LocationProvider>
    </SettingsProvider>
  );
}