// app/_layout.tsx
import { Stack } from 'expo-router';
import { LocationProvider } from './context/LocationContext';
import { SettingsProvider } from './context/SettingsContext';

export default function RootLayout() {
  return (
    <SettingsProvider>
      <LocationProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </LocationProvider>
    </SettingsProvider>
  );
}
