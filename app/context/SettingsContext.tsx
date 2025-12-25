// app/context/SettingsContext.tsx

import React, {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from 'react';

export type TempUnit = 'F' | 'C';

interface SettingsContextValue {
  tempUnit: TempUnit;
  setTempUnit: (unit: TempUnit) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(
  undefined,
);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [tempUnit, setTempUnit] = useState<TempUnit>('F'); // default to F

  return (
    <SettingsContext.Provider value={{ tempUnit, setTempUnit }}>
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
