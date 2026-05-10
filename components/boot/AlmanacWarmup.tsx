import React, { createContext, useContext, useMemo } from 'react';

import { usePlace } from '../../app/context/PlaceContext';
import { useSettings } from '../../app/context/SettingsContext';
import { useDailyRecords } from '../../app/lib/almanac/useDailyRecordsHook';
import { useClimatologyNormals } from '../../app/lib/climatology/hook';
import { useOpenMeteoForecast } from '../../app/lib/openmeteo/hooks';

const ALMANAC_FORECAST_DAYS = 15;

type AlmanacPreloadValue = {
  coords: { lat: number; lon: number };
  climo: ReturnType<typeof useClimatologyNormals>;
  forecast: ReturnType<typeof useOpenMeteoForecast>;
  records: ReturnType<typeof useDailyRecords>;
} | null;

const AlmanacPreloadContext = createContext<AlmanacPreloadValue>(null);

function finiteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function AlmanacWarmupForCoords({
  children,
  lat,
  lon,
}: {
  children: React.ReactNode;
  lat: number;
  lon: number;
}) {
  const { forecastModel } = useSettings();

  const climo = useClimatologyNormals({
    lat,
    lon,
    enabled: true,
    preferCache: true,
  });

  const forecast = useOpenMeteoForecast({
    lat,
    lon,
    days: ALMANAC_FORECAST_DAYS,
    model: forecastModel,
  });

  const records = useDailyRecords({
    lat,
    lon,
    enabled: true,
  });

  const value = useMemo(
    () => ({ coords: { lat, lon }, climo, forecast, records }),
    [lat, lon, climo, forecast, records]
  );

  return <AlmanacPreloadContext.Provider value={value}>{children}</AlmanacPreloadContext.Provider>;
}

export function AlmanacWarmupProvider({ children }: { children: React.ReactNode }) {
  const { active } = usePlace();

  const coords = useMemo(() => {
    if (!active) return null;
    if (!finiteCoord(active.lat) || !finiteCoord(active.lon)) return null;
    return { lat: active.lat, lon: active.lon };
  }, [active?.lat, active?.lon]);

  if (!coords) return <AlmanacPreloadContext.Provider value={null}>{children}</AlmanacPreloadContext.Provider>;

  return (
    <AlmanacWarmupForCoords lat={coords.lat} lon={coords.lon}>
      {children}
    </AlmanacWarmupForCoords>
  );
}

export function useAlmanacPreload() {
  return useContext(AlmanacPreloadContext);
}
