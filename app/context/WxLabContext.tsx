import React, { createContext, useContext, useMemo, useState } from 'react';

type WxLabContextValue = {
  wxLab: boolean;
  setWxLab: (v: boolean) => void;
  toggleWxLab: () => void;
};

const WxLabContext = createContext<WxLabContextValue | null>(null);

export function WxLabProvider({ children }: { children: React.ReactNode }) {
  const [wxLab, setWxLab] = useState(false);

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