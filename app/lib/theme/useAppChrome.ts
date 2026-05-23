import { useMemo } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { appChrome } from './appAppearance';

export function useAppChrome() {
  const { appColorMode } = useSettings();
  const chrome = useMemo(() => appChrome(appColorMode), [appColorMode]);
  return { appColorMode, chrome };
}
