import type { AuthenticatedUser } from "../middleware/authentication";
import { ApiError } from "../middleware/errorHandler";

export const OMNIWX_PLUS_ENTITLEMENT = "omniwx_plus" as const;

export type EntitlementTier = "free" | "plus";

export type EntitlementRecord = {
  entitlement_key: string;
  provider: string;
  status: string;
  expires_at: string | null;
  latest_event_at: string | null;
};

export type EntitlementSnapshot = {
  userId: string;
  tier: EntitlementTier;
  active: boolean;
  activeEntitlements: string[];
  source: "verified-server";
  checkedAt: string;
  expiresAt: string | null;
  features: string[];
};

const PLUS_FEATURES = [
  "advanced_storm_scope",
  "advanced_radar_products",
  "detailed_astronomy",
  "sky_score_maps",
  "advanced_marine",
  "extended_climatology",
  "enhanced_saved_locations",
  "advanced_personalization",
  "video_export",
  "extremes",
] as const;

const ACCESS_STATUSES = new Set(["active", "trialing", "grace_period", "cancelled", "canceled"]);
const GRANDFATHER_PROVIDER = "omniwx_grandfather";
const GRANDFATHER_STATUS = "grandfathered";

function isFuture(value: string | null, nowMs: number) {
  if (!value) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed > nowMs;
}

function grantsPlusAccess(record: EntitlementRecord, nowMs: number) {
  const provider = record.provider.trim().toLowerCase();
  const status = record.status.trim().toLowerCase();

  // Lifetime access can only be issued by our server-side grandfathering process.
  // Ordinary active records must retain a verified expiry from the billing provider.
  if (provider === GRANDFATHER_PROVIDER && status === GRANDFATHER_STATUS) return true;
  return ACCESS_STATUSES.has(status) && isFuture(record.expires_at, nowMs);
}

export function resolveEntitlementSnapshot(
  userId: string,
  records: readonly EntitlementRecord[],
  now = new Date(),
): EntitlementSnapshot {
  const nowMs = now.getTime();
  const activePlus = records
    .filter((record) => record.entitlement_key === OMNIWX_PLUS_ENTITLEMENT)
    .filter((record) => grantsPlusAccess(record, nowMs))
    .sort((a, b) => Date.parse(b.expires_at ?? "9999-12-31") - Date.parse(a.expires_at ?? "9999-12-31"))[0];

  const active = Boolean(activePlus);
  return {
    userId,
    tier: active ? "plus" : "free",
    active,
    activeEntitlements: active ? [OMNIWX_PLUS_ENTITLEMENT] : [],
    source: "verified-server",
    checkedAt: now.toISOString(),
    expiresAt: activePlus?.expires_at ?? null,
    features: active ? [...PLUS_FEATURES] : [],
  };
}

export async function getEntitlementsForUser(
  user: AuthenticatedUser,
  db: D1Database | undefined,
): Promise<EntitlementSnapshot> {
  if (!db) {
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "Subscription verification is not configured.");
  }

  const result = await db.prepare(`
    SELECT entitlement_key, provider, status, expires_at, latest_event_at
    FROM subscription_entitlements
    WHERE user_id = ?
    ORDER BY updated_at DESC
  `).bind(user.id).all<EntitlementRecord>();

  return resolveEntitlementSnapshot(user.id, result.results ?? []);
}
