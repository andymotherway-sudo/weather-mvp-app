import { describe, expect, it } from "vitest";

import { OMNIWX_PLUS_ENTITLEMENT, resolveEntitlementSnapshot } from "../src/services/subscriptions";

const NOW = new Date("2026-11-14T18:00:00.000Z");

describe("subscription entitlement resolution", () => {
  it("keeps a user free when no verified record exists", () => {
    const snapshot = resolveEntitlementSnapshot("user-1", [], NOW);
    expect(snapshot.tier).toBe("free");
    expect(snapshot.active).toBe(false);
    expect(snapshot.activeEntitlements).toEqual([]);
  });

  it("grants the single Plus entitlement for an active unexpired record", () => {
    const snapshot = resolveEntitlementSnapshot("user-1", [{
      entitlement_key: OMNIWX_PLUS_ENTITLEMENT,
      status: "active",
      expires_at: "2026-12-14T18:00:00.000Z",
      latest_event_at: "2026-11-14T17:00:00.000Z",
    }], NOW);

    expect(snapshot.tier).toBe("plus");
    expect(snapshot.activeEntitlements).toEqual([OMNIWX_PLUS_ENTITLEMENT]);
    expect(snapshot.features).toContain("advanced_storm_scope");
  });

  it("honors a cancellation only through its verified expiry", () => {
    const current = resolveEntitlementSnapshot("user-1", [{
      entitlement_key: OMNIWX_PLUS_ENTITLEMENT,
      status: "canceled",
      expires_at: "2026-11-15T18:00:00.000Z",
      latest_event_at: "2026-11-14T17:00:00.000Z",
    }], NOW);
    const expired = resolveEntitlementSnapshot("user-1", [{
      entitlement_key: OMNIWX_PLUS_ENTITLEMENT,
      status: "canceled",
      expires_at: "2026-11-13T18:00:00.000Z",
      latest_event_at: "2026-11-12T17:00:00.000Z",
    }], NOW);

    expect(current.active).toBe(true);
    expect(expired.active).toBe(false);
  });

  it("does not grant unknown, revoked, or malformed records", () => {
    const snapshot = resolveEntitlementSnapshot("user-1", [
      { entitlement_key: "other", status: "active", expires_at: null, latest_event_at: null },
      { entitlement_key: OMNIWX_PLUS_ENTITLEMENT, status: "revoked", expires_at: null, latest_event_at: null },
      { entitlement_key: OMNIWX_PLUS_ENTITLEMENT, status: "active", expires_at: "invalid", latest_event_at: null },
      { entitlement_key: OMNIWX_PLUS_ENTITLEMENT, status: "active", expires_at: null, latest_event_at: null },
    ], NOW);
    expect(snapshot.active).toBe(false);
  });
});
