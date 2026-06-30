// app/_layout.tsx
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { type ReactNode, useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppBoot } from '../components/boot/AppBoot';
import { AlmanacWarmupProvider } from '../components/boot/AlmanacWarmup';

// App-wide place state, last-known coordinates, and location warmup.
import { LocationsProvider } from './lib/locations/useLocations';

import { PlaceProvider } from './context/PlaceContext';
import { SettingsProvider, useSettings } from './context/SettingsContext';
import { WxLabProvider } from './context/WxLabContext';
import { appChrome } from './lib/theme/appAppearance';

const APP_BG = '#020617';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function AppChromeFrame({ children }: { children: ReactNode }) {
  const { appColorMode } = useSettings();
  const chrome = useMemo(() => appChrome(appColorMode), [appColorMode]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(chrome.background).catch(() => {});
  }, [chrome.background]);

  return (
    <View style={{ flex: 1, backgroundColor: chrome.background }}>
      <StatusBar style="light" translucent />
      {children}
    </View>
  );
}

export default function RootLayout() {
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(APP_BG).catch(() => {});
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <SettingsProvider>
        <AppChromeFrame>
        <LocationsProvider>
          <PlaceProvider>
            <WxLabProvider>
              <AppBoot>
                <AlmanacWarmupProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: 'transparent' },
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
        </AppChromeFrame>
      </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
