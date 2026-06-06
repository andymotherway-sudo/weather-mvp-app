import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useSettings } from './SettingsContext';

type WxLabContextValue = {
  wxLab: boolean;
  setWxLab: (v: boolean) => void;
  toggleWxLab: () => void;
};

const WxLabContext = createContext<WxLabContextValue | null>(null);

export function WxLabProvider({ children }: { children: React.ReactNode }) {
  const { alwaysUseWxLab } = useSettings();
  const [wxLab, setWxLab] = useState(false);

  useEffect(() => {
    if (alwaysUseWxLab) setWxLab(true);
  }, [alwaysUseWxLab]);

  const value = useMemo(
    () => ({
      wxLab,
      setWxLab,
      toggleWxLab: () => setWxLab((v) => !v),
    }),
    [wxLab]
  );

  return <WxLabContext.Provider value={value}>{children}</WxLabContext.Provider>;
}

export function useWxLab() {
  const ctx = useContext(WxLabContext);
  if (!ctx) throw new Error('useWxLab must be used within WxLabProvider');
  return ctx;
}
