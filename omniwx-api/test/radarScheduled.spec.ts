import { createExecutionContext, createScheduledController, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index";

function createMockDb() {
  const manifests: unknown[][] = [];
  const frames: unknown[][] = [];
  const deletedFrames: string[] = [];
  const deletedManifests: string[] = [];
  const staleManifestRows = [{ id: "stale-manifest-1" }, { id: "stale-manifest-2" }];

  return {
    manifests,
    frames,
    deletedFrames,
    deletedManifests,
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
                deletedFrames.push(String(manifestId));
                for (let index = frames.length - 1; index >= 0; index -= 1) {
                  if (frames[index]?.[1] === manifestId) frames.splice(index, 1);
                }
                return {};
              }
              if (normalized.startsWith("DELETE FROM radar_manifests")) {
                const [manifestId] = values as [string];
                deletedManifests.push(String(manifestId));
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
              if (normalized.startsWith("SELECT id FROM radar_manifests")) {
                return { results: staleManifestRows as T[] };
              }
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
    expect(db.deletedManifests).toEqual(["stale-manifest-1", "stale-manifest-2"]);
  });

  it("does not publish to R2 unless explicitly enabled", async () => {
    const db = createMockDb();
    const ctx = createExecutionContext();
    const put = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          host: "https://tilecache.rainviewer.com",
          radar: {
            past: [
              { time: 1_784_476_800, path: "/v2/radar/frame-a" },
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
        RADAR_ASSETS: { put } as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
        RADAR_MANIFEST_INGEST_ENABLED: "1",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
  });

  it("publishes only the latest timeline object when explicitly enabled", async () => {
    const db = createMockDb();
    const ctx = createExecutionContext();
    const put = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
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
        RADAR_ASSETS: { put } as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
        RADAR_MANIFEST_INGEST_ENABLED: "1",
        RADAR_R2_PUBLISH_ENABLED: "1",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0]).toBe("radar/timeline/latest.json");
  });

  it("publishes owned overview radar tiles when image publishing is enabled", async () => {
    const db = createMockDb();
    const ctx = createExecutionContext();
    const put = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("weather-maps.json")) {
        return new Response(
          JSON.stringify({
            host: "https://tilecache.rainviewer.com",
            radar: {
              past: [{ time: 1_784_476_800, path: "/v2/radar/frame-a" }],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });

    await worker.scheduled?.(
      createScheduledController({ cron: "*/5 * * * *" }),
      {
        DB: db as any,
        RADAR_ASSETS: { put } as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
        RADAR_MANIFEST_INGEST_ENABLED: "1",
        RADAR_R2_PUBLISH_ENABLED: "1",
        RADAR_R2_IMAGE_PUBLISH_ENABLED: "1",
        RADAR_R2_IMAGE_HISTORY_FRAMES: "1",
        RADAR_R2_IMAGE_MAX_ZOOM: "1",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(put).toHaveBeenCalledTimes(2);
    expect(put.mock.calls[0]?.[0]).toBe("radar/timeline/latest.json");
    expect(String(put.mock.calls[1]?.[0])).toContain("radar/images/rainviewer/v2__radar__frame-a/256/1/");
  });

  it("publishes owned local ridge radar tiles for configured PHX-area sites", async () => {
    const db = createMockDb();
    const ctx = createExecutionContext();
    const put = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("weather-maps.json")) {
        return new Response(
          JSON.stringify({
            host: "https://tilecache.rainviewer.com",
            radar: {
              past: [{ time: 1_784_476_800, path: "/v2/radar/frame-a" }],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("mesonet.agron.iastate.edu/json/radar.py")) {
        return new Response(
          JSON.stringify({
            scans: [{ ts: "202607192145" }],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });

    await worker.scheduled?.(
      createScheduledController({ cron: "*/5 * * * *" }),
      {
        DB: db as any,
        RADAR_ASSETS: { put } as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
        RADAR_MANIFEST_INGEST_ENABLED: "1",
        RADAR_R2_PUBLISH_ENABLED: "1",
        RADAR_R2_LOCAL_IMAGE_PUBLISH_ENABLED: "1",
        RADAR_R2_LOCAL_SITE_IDS: "KIWA",
        RADAR_R2_LOCAL_IMAGE_HISTORY_FRAMES: "1",
        RADAR_R2_LOCAL_IMAGE_MIN_ZOOM: "7",
        RADAR_R2_LOCAL_IMAGE_MAX_ZOOM: "7",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(put.mock.calls.some((call) => String(call?.[0]).includes("radar/images/ridge/IWA/N0Q/202607192145/7/"))).toBe(true);
    expect(put.mock.calls.some((call) => String(call?.[0]).includes("radar/images/ridge/IWA/N0Q/0/7/"))).toBe(true);
  });

  it("publishes latest-only owned local ridge tiles when scans are unavailable", async () => {
    const db = createMockDb();
    const ctx = createExecutionContext();
    const put = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("weather-maps.json")) {
        return new Response(
          JSON.stringify({
            host: "https://tilecache.rainviewer.com",
            radar: {
              past: [{ time: 1_784_476_800, path: "/v2/radar/frame-a" }],
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      if (url.includes("mesonet.agron.iastate.edu/json/radar.py")) {
        return new Response(
          JSON.stringify({
            scans: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return new Response("png", {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    });

    await worker.scheduled?.(
      createScheduledController({ cron: "*/5 * * * *" }),
      {
        DB: db as any,
        RADAR_ASSETS: { put } as any,
        NOAA_NCEI_TOKEN: "test",
        NASA_API_KEY: "test",
        RADAR_MANIFEST_INGEST_ENABLED: "1",
        RADAR_R2_PUBLISH_ENABLED: "1",
        RADAR_R2_LOCAL_IMAGE_PUBLISH_ENABLED: "1",
        RADAR_R2_LOCAL_SITE_IDS: "KIWA",
        RADAR_R2_LOCAL_IMAGE_HISTORY_FRAMES: "1",
        RADAR_R2_LOCAL_IMAGE_MIN_ZOOM: "7",
        RADAR_R2_LOCAL_IMAGE_MAX_ZOOM: "7",
      } as any,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    expect(put.mock.calls.some((call) => String(call?.[0]).includes("radar/images/ridge/IWA/N0Q/0/7/"))).toBe(true);
  });
});
