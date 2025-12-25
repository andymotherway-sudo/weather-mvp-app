// hooks/use-color-scheme.ts
import { useColorScheme as useNativeColorScheme } from 'react-native';
import type { ColorScheme } from '../constants/theme';

export function useColorScheme(): ColorScheme {
  const scheme = useNativeColorScheme();
  return (scheme ?? 'light') as ColorScheme;
}
