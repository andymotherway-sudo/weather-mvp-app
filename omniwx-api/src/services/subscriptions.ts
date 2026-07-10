import type { AuthenticatedUser } from "../middleware/authentication";

export type EntitlementTier = "free" | "paid";

export type EntitlementSnapshot = {
  userId: string;
  tier: EntitlementTier;
  active: boolean;
  features: string[];
};

export async function getEntitlementsForUser(user: AuthenticatedUser): Promise<EntitlementSnapshot> {
  // RevenueCat or direct store verification should populate this later.
  return { userId: user.id, tier: "free", active: false, features: [] };
}

