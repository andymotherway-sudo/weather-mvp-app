import { createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  canUseFeature,
  GUEST_ENTITLEMENTS,
  hasPlusEntitlement,
  savedLocationLimit,
  type EntitlementSnapshot,
  type OmniwxFeature,
} from '../lib/entitlements/catalog';

type EntitlementContextValue = {
  snapshot: EntitlementSnapshot;
  isPlus: boolean;
  canUse: (feature: OmniwxFeature) => boolean;
  savedLocationLimit: number;
};

const EntitlementContext = createContext<EntitlementContextValue | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  // Accounts and verified entitlement loading are intentionally not enabled yet.
  // Until the Worker can authenticate a user and return a verified snapshot,
  // every client is Free. Do not add a local "set premium" escape hatch here.
  const value = useMemo<EntitlementContextValue>(() => ({
    snapshot: GUEST_ENTITLEMENTS,
    isPlus: hasPlusEntitlement(GUEST_ENTITLEMENTS),
    canUse: (feature) => canUseFeature(GUEST_ENTITLEMENTS, feature),
    savedLocationLimit: savedLocationLimit(GUEST_ENTITLEMENTS),
  }), []);

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>;
}

export function useEntitlements() {
  const context = useContext(EntitlementContext);
  if (!context) throw new Error('useEntitlements() must be used inside EntitlementProvider.');
  return context;
}
