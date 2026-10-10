import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import worker from "../src/index";

const cleanupUrl = "https://example.test/v1/radar/mrms/maintenance/cleanup-proof?confirm=cleanup-mrms-proof-dev";

function maintenanceEnv(overrides: Record<string, unknown> = {}) {
  return {
    NOAA_NCEI_TOKEN: "test",
    NASA_API_KEY: "test",
    MRMS_MAINTENANCE_ENABLED: "1",
    RADAR_MAINTENANCE_TOKEN: "maintenance-test-token",
    ...overrides,
  } as any;
}

describe("radar maintenance authorization", () => {
  it("rejects cleanup requests without a bearer token even when the feature flag is enabled", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(cleanupUrl, { method: "POST" }),
      maintenanceEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "radar-maintenance-unauthorized",
    });
  });

  it("does not accept an incorrect bearer token", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(cleanupUrl, {
        method: "POST",
        headers: { authorization: "Bearer not-the-maintenance-token" },
      }),
      maintenanceEnv(),
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });
});
