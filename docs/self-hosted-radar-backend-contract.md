# Self-Hosted Radar Backend Contract

This is the first owned-radar infrastructure checkpoint for OMNIwx.

The app already talks to the worker for radar. The next step is letting the worker prefer your own radar backend when it exists, while still falling back to IEM and RainViewer until each source is replaced.

## Worker env vars

Set these in the `omniwx-api` Worker when your backend endpoints are ready:

- `RADAR_BACKEND_MODE`
  - `external-fallback` (default): keep using IEM/RainViewer unless a route explicitly switches over.
  - `self-hosted-preferred`: prefer your owned backend URLs when present.
- `RADAR_BACKEND_BASE_URL`
  - Optional convenience base such as `https://radar.omniwx.com`.
- `RADAR_BACKEND_MANIFEST_URL`
  - Optional explicit manifest endpoint.
- `RADAR_BACKEND_TIMELINE_URL`
  - Optional explicit frame timeline endpoint.
- `RADAR_BACKEND_MOSAIC_TILES_URL`
  - Optional base for national mosaic tile fetches.
- `RADAR_BACKEND_RIDGE_TILES_URL`
  - Optional base for single-site radar tile fetches.
- `RADAR_BACKEND_WMS_URL`
  - Optional WMS-style render endpoint for storm rendering and exports.

If only `RADAR_BACKEND_BASE_URL` is set, the worker assumes these defaults:

- manifest: `{base}/manifest`
- timeline: `{base}/timeline`
- mosaic tiles: `{base}/tiles/mosaic`
- ridge tiles: `{base}/tiles/ridge`
- wms: `{base}/wms`

## Immediate smoke test

You can test the cutover contract now, before a separate radar service exists.

Set:

- `RADAR_BACKEND_MODE=self-hosted-preferred`
- `RADAR_BACKEND_BASE_URL=https://omniwx-api.omniwx.workers.dev/v1/radar/backend`

The worker now exposes backend-shaped routes at that base and proxies the current external radar sources behind them. That lets us validate the owned-radar contract end-to-end before we replace the internals with NOAA-fed ingest.

## First manifest ingest scaffold

You can also generate a D1-ready radar manifest today from the current RainViewer feed:

```bash
cd omniwx-api
npm run radar:manifest -- --format json --max-frames 24
```

Or emit SQL that can be loaded into D1:

```bash
cd omniwx-api
npm run radar:manifest -- --format sql --max-frames 24 --output tmp/radar-manifest.sql
```

Or generate and apply it directly with Wrangler:

```bash
cd omniwx-api
npm run radar:manifest -- --apply --db omniwx-dev --remote --max-frames 24
```

Production example:

```bash
cd omniwx-api
npm run radar:manifest -- --apply --db omniwx-prod --env production --remote --max-frames 24
```

To make the dev proof path repeatable inside the worker, enable scheduled ingest with Worker vars:

```text
RADAR_MANIFEST_INGEST_ENABLED=1
RADAR_MANIFEST_INGEST_MAX_FRAMES=24
RADAR_MANIFEST_INGEST_INCLUDE_NOWCAST=0
```

The current scheduled ingest path is intentionally conservative:

- It is disabled by default.
- It only writes the national RainViewer-backed manifest into D1.
- It does not change fetch behavior unless `RADAR_BACKEND_MODE=self-hosted-preferred` is also enabled.
- It is intended for dev validation first, then production rollout once freshness looks good.

Useful flags:

- `--include-nowcast`
- `--scope national-mosaic|single-site`
- `--site-id PHX`
- `--product precipitation|N0Q`
- `--host https://radar-assets.omniwx.com`
- `--output tmp/radar-manifest.sql`
- `--apply`
- `--db omniwx-dev|omniwx-prod`
- `--env production`
- `--remote`

This is the bridge between today's external timeline and tomorrow's owned ingest: the worker can now read the same manifest structure from D1 that this script generates.

## Expected backend endpoints

### `GET /manifest`

Purpose: tell the worker what the owned radar backend can serve.

Expected shape:

```json
{
  "ok": true,
  "backend": {
    "name": "omniwx-radar",
    "mode": "self-hosted"
  },
  "capabilities": {
    "timeline": true,
    "mosaicTiles": true,
    "ridgeTiles": true,
    "wms": true
  }
}
```

### `GET /timeline?includeNowcast=0|1&maxFrames=12`

Purpose: replace RainViewer frame discovery with your own frame manifest.

Expected shape:

```json
{
  "ok": true,
  "host": "https://radar-assets.omniwx.com",
  "frames": [
    {
      "time": 1784400000,
      "iso": "2026-07-19T00:00:00.000Z",
      "path": "/radar/conus/20260719/0000"
    }
  ]
}
```

Notes:

- `path` is currently used like the RainViewer path key.
- The worker only needs stable `time`, `iso`, and `path`.

### `GET /tiles/mosaic/{z}/{x}/{y}.png`

Purpose: replace national IEM/RainViewer tile fetches.

Expected query params from the worker:

- `product`
- `stamp`
- `ts`
- `size`
- `color`
- `smooth`
- `snow`
- `path`

Your backend can ignore params it does not use. The worker already normalizes them.

### `GET /tiles/ridge/{z}/{x}/{y}.png`

Purpose: replace IEM RIDGE single-site tiles.

Expected query params:

- `radar`
- `product`
- `ts`

### `GET /wms`

Purpose: replace IEM WMS rendering for local storm mode and image export.

Expected query params are the same ones the worker already sends to `/v1/radar/wms` and `/v2/radar/wms`, including:

- `product`
- `bbox`
- `width`
- `height`
- `time`
- `storm`
- `shrink`
- `dpr`
- `fmt`
- `bgcolor`

## Recommended real backend milestone order

1. Own the timeline manifest.
2. Own national mosaic tiles.
3. Own single-site ridge tiles.
4. Own WMS/render export.

That order matches the current OMNIwx radar UX and keeps cutover low-risk.
