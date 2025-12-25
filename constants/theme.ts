// constants/theme.ts
const tintColorLight = '#0a7ea4';
const tintColorDark = '#ffffff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#ffffff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
    tabBarBackground: '#f5f5f5',
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
    tabBarBackground: '#000000',
  },
} as const;

export type ColorScheme = keyof typeof Colors; // "light" | "dark"
