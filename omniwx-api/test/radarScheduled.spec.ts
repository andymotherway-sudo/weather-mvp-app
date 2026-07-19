import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

function createMockDb() {
  const manifests: unknown[][] = [];
  const frames: unknown[][] = [];

  return {
    manifests,
    frames,
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (normalized.startsWith("INSERT INTO radar_manifests")) {
                manifests.push(values);
                return {};
              }
              if (normalized.startsWith("DELETE FROM radar_frames")) {
                const [manifestId] = values as [string];
                for (let index = frames.length - 1; index >= 0; index -= 1) {
                  if (frames[index]?.[1] === manifestId) frames.splice(index, 1);
                }
                return {};
              }
              if (normalized.startsWith("INSERT INTO radar_frames")) {
                frames.push(values);
              }
              return {};
            },
            async first<T>() {
              return null as T | null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("radar scheduled ingest", () => {
  it("skips writes when ingest is disabled", async () => {
    const db = createMockDb();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ctx = createExecutionContext();

    await worker.scheduled?.(
      createScheduledController({ cron: "*/5 * * * *" }),
      {
        DB: db as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.manifests).toHaveLength(0);
    expect(db.frames).toHaveLength(0);
  });

  it("ingests a national radar manifest into D1 when enabled", async () => {
    const db = createMockDb();
    const ctx = createExecutionContext();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          host: "https://tilecache.rainviewer.com",
          radar: {
            past: [
              { time: 1_784_476_800, path: "/v2/radar/frame-a" },
              { time: 1_784_477_400, path: "/v2/radar/frame-b" },
            ],
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await worker.scheduled?.(
      createScheduledController({ cron: "*/5 * * * *" }),
      {
        DB: db as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
        RADAR_MANIFEST_INGEST_ENABLED: "1",
        RADAR_MANIFEST_INGEST_MAX_FRAMES: "12",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(db.manifests).toHaveLength(1);
    expect(db.frames).toHaveLength(2);
    expect(String(db.manifests[0]?.[1])).toBe("national-mosaic");
    expect(String(db.manifests[0]?.[2])).toBe("precipitation");
  });
});
