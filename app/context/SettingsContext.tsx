// app/context/SettingsContext.tsx

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type TempUnit = 'F' | 'C';
export type BaseMapStyle = 'dark' | 'light';
export type RadarProvider = 'iem' | 'rainviewer';
export type ForecastModel = 'best_match' | 'gfs' | 'ecmwf' | 'dwd_icon';

const TEMP_UNIT_KEY = 'omniwx:settings:tempUnit';
const BASE_MAP_STYLE_KEY = 'omniwx:settings:baseMapStyle';
const RADAR_PROVIDER_KEY = 'omniwx:settings:radarProvider';
const FORECAST_MODEL_KEY = 'omniwx:settings:forecastModel';

interface SettingsContextValue {
  tempUnit: TempUnit;
  setTempUnit: (unit: TempUnit) => void;
  baseMapStyle: BaseMapStyle;
  setBaseMapStyle: (style: BaseMapStyle) => void;
  radarProvider: RadarProvider;
  setRadarProvider: (provider: RadarProvider) => void;
  forecastModel: ForecastModel;
  setForecastModel: (model: ForecastModel) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [tempUnit, setTempUnit] = useState<TempUnit>('F'); // default to F
  const [baseMapStyle, setBaseMapStyle] = useState<BaseMapStyle>('dark');
  const [radarProvider, setRadarProvider] = useState<RadarProvider>('iem');
  const [forecastModel, setForecastModel] = useState<ForecastModel>('best_match');

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const [storedTempUnit, storedBaseMapStyle, storedRadarProvider, storedForecastModel] = await Promise.all([
          AsyncStorage.getItem(TEMP_UNIT_KEY),
          AsyncStorage.getItem(BASE_MAP_STYLE_KEY),
          AsyncStorage.getItem(RADAR_PROVIDER_KEY),
          AsyncStorage.getItem(FORECAST_MODEL_KEY),
        ]);

        if (!mounted) return;

        if (storedTempUnit === 'F' || storedTempUnit === 'C') {
          setTempUnit(storedTempUnit);
        }
        if (storedBaseMapStyle === 'dark' || storedBaseMapStyle === 'light') {
          setBaseMapStyle(storedBaseMapStyle);
        }
        if (storedRadarProvider === 'iem' || storedRadarProvider === 'rainviewer') {
          setRadarProvider(storedRadarProvider);
        }
        if (
          storedForecastModel === 'best_match' ||
          storedForecastModel === 'gfs' ||
          storedForecastModel === 'ecmwf' ||
          storedForecastModel === 'dwd_icon'
        ) {
          setForecastModel(storedForecastModel);
        }
      } catch {
        // Ignore storage failures and keep defaults.
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(TEMP_UNIT_KEY, tempUnit).catch(() => {});
  }, [tempUnit]);

  useEffect(() => {
    AsyncStorage.setItem(BASE_MAP_STYLE_KEY, baseMapStyle).catch(() => {});
  }, [baseMapStyle]);

  useEffect(() => {
    AsyncStorage.setItem(RADAR_PROVIDER_KEY, radarProvider).catch(() => {});
  }, [radarProvider]);

  useEffect(() => {
    AsyncStorage.setItem(FORECAST_MODEL_KEY, forecastModel).catch(() => {});
  }, [forecastModel]);

  return (
    <SettingsContext.Provider
      value={{
        tempUnit,
        setTempUnit,
        baseMapStyle,
        setBaseMapStyle,
        radarProvider,
        setRadarProvider,
        forecastModel,
        setForecastModel,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return ctx;
}
