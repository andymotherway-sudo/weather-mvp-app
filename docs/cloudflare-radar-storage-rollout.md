# Cloudflare Radar Storage Rollout

This is the storage foundation for moving OMNIwx radar toward owned NOAA/MRMS assets while keeping third-party fallback paths available.

Current direction: owned national radar should move through MRMS, not the older RainViewer-backed national overview image cache. Keep the tiny timeline manifest path available for compatibility, but do not publish legacy overview image tiles unless we intentionally re-enable that experiment.

Cost guardrail:

- zero-cost is the default target right now
- no archive should be created automatically
- publish only bounded rolling history, not an archive

## What we have today

- Cloudflare Worker: `omniwx-api`
- D1 databases:
  - dev: `omniwx-dev`
  - prod: `omniwx-prod`
- Scheduled ingest scaffold already writing radar manifests into D1

## What is live now

- R2 is enabled on the Cloudflare account.
- Public buckets created:
  - `omniwx-radar-assets-dev`
  - `omniwx-radar-assets-prod`
- Worker bindings are active for `RADAR_ASSETS`.
- D1 manifest ingest exists for compatibility.
- MRMS tile publishing uses R2 for rendered non-empty tiles.
- MRMS timeline/control-plane reads remain Worker-mediated.
- Legacy RainViewer-backed overview image publishing is disabled during the MRMS pivot.

## Recommended bucket layout

Use two buckets per environment:

- `RADAR_ASSETS`
  - Public-ready radar assets such as manifest JSON snapshots, rendered tiles, and future national mosaic frame artifacts.
- `RADAR_ASSETS_PRIVATE`
  - Internal-only blobs such as intermediate ingest files, station packages, or pre-publish render inputs.

Recommended names:

- dev public: `omniwx-radar-assets-dev`
- dev private: `omniwx-radar-private-dev`
- prod public: `omniwx-radar-assets-prod`
- prod private: `omniwx-radar-private-prod`

This keeps public delivery separate from internal ingest/output staging, which is cleaner once we add caching and lifecycle rules.

## Public MRMS tile delivery

MRMS frame tiles are public weather imagery, so the scalable delivery path is direct static delivery from the public radar assets bucket instead of routing every map tile through the Worker.

Current safe cutover shape:

- Keep MRMS timeline/control-plane reads on the Worker at `/v1/radar/mrms/timeline`.
- Attach a Cloudflare public/custom domain to the production `RADAR_ASSETS` bucket, for example `https://radar-assets.omniwx.com`.
- Set `MRMS_PUBLIC_TILE_BASE_URL` to that HTTPS origin after the domain is live. Preferred path: run the manual GitHub Action `Configure Worker Variables` with `target_env=production` and the public tile base URL.
- The Worker timeline will then emit each frame with `tileTemplate` pointing directly at R2, such as `https://radar-assets.omniwx.com/radar/mrms/proof/MergedReflectivityQCComposite/<frame>/{z}/{x}/{y}.png`.
- The app currently uses the Worker MRMS tile route because sparse MRMS tiles need transparent empty responses instead of noisy 404s.
- Public R2/custom-domain tile delivery remains the future scale path after fallback and empty-tile behavior are proven.

Guardrails:

- Put only public-safe radar artifacts in `RADAR_ASSETS`; never store secrets, user data, logs, private manifests, or paid-only assets in this public bucket.
- Keep timestamped MRMS frame tiles immutable or long-cacheable.
- Keep latest/timeline responses short-cacheable.
- Keep RainViewer fallback active until MRMS freshness, cleanup, and storage limits are boring in production.

## The order to do this in

1. Keep D1 as the rolling manifest control plane.
2. Keep R2 timeline publishing on the stable latest key.
3. Expand owned image coverage cautiously:
   - first by zoom level
   - then by history-frame depth
4. Move more national radar tile delivery behind owned URLs.
5. Later, add single-site radar and export/render artifacts.

## Why this is the right shape

- D1 remains the fast metadata/control plane.
- R2 becomes the cheap blob store for radar artifacts.
- The Worker stays the stable API edge for the app.
- This supports thousands of users now and gives a real path toward much larger scale later without forcing Open-Meteo commercial just to fix radar infrastructure.

## Current posture

The current live posture is intentionally bounded:

- D1 remains the metadata/control-plane layer where needed.
- R2 stores bounded MRMS frame tiles and a stable latest manifest.
- The app requests MRMS-auto in the US beta footprint.
- The Worker decides when to serve owned MRMS tiles and when fallback is needed.

## Current safe defaults

The worker should stay near these defaults unless intentionally changed:

- `RADAR_MANIFEST_INGEST_ENABLED=1`
- `RADAR_MANIFEST_INGEST_MAX_FRAMES=60`
- `RADAR_MANIFEST_RETENTION_COUNT=12`
- `RADAR_R2_PUBLISH_ENABLED=1`
- `RADAR_R2_PUBLISH_KEY=radar/timeline/latest.json`
- `RADAR_R2_IMAGE_PUBLISH_ENABLED=0`
- `RADAR_R2_IMAGE_HISTORY_FRAMES=1`
- `RADAR_R2_IMAGE_MAX_ZOOM=1`
- `RADAR_R2_LOCAL_IMAGE_PUBLISH_ENABLED=1`
- `RADAR_R2_LOCAL_TILE_CACHE_ENABLED=0`
- `RADAR_R2_LOCAL_CRON_PUBLISH_ENABLED=0`
- `RADAR_R2_LOCAL_SITE_IDS=IWA`
- `RADAR_R2_LOCAL_SITE_LIMIT=14`
- `RADAR_R2_LOCAL_COVERAGE_RADIUS_MI=90`
- `RADAR_R2_LOCAL_IMAGE_HISTORY_FRAMES=2`
- `RADAR_R2_LOCAL_IMAGE_MIN_ZOOM=7`
- `RADAR_R2_LOCAL_IMAGE_MAX_ZOOM=8`

That means:

- D1 keeps only a small rolling manifest set
- R2 stores bounded rolling MRMS frames instead of growing an archive
- owned national MRMS PNGs are bounded and manually/operationally promoted
- legacy national overview PNG publishing is off
- owned local single-site radar cache is off unless intentionally enabled
- future expansion should increase one axis at a time

During the MRMS pivot, local single-site tile accumulation stays off by default. The app can still request local radar through the worker and external fallback path, but exploratory local radar use should not write RIDGE tiles into R2 unless `RADAR_R2_LOCAL_TILE_CACHE_ENABLED=1` is intentionally enabled.

Legacy overview image publishing is also off by default. MRMS is the preferred owned national reflectivity path in the US beta footprint; RainViewer remains fallback when MRMS is stale, warming, missing, or outside scope.

To delete old legacy overview objects, temporarily enable `RADAR_R2_LEGACY_OVERVIEW_CLEANUP_ENABLED=1` and call `POST /v1/radar/maintenance/r2/cleanup-legacy-overview?confirm=delete-radar-images-rainviewer&dryRun=0&limit=1000` repeatedly until `matchedCount` is `0`. The route is hard-coded to `radar/images/rainviewer/` so it cannot delete MRMS, timeline manifests, or local RIDGE tiles.

## Local hot-site path

Local hot-site caching is not the current beta foundation. If it is re-enabled later, use a hot-site roster instead of trying to pre-cache every NEXRAD site.

- Keep legacy national overview image tiles disabled while MRMS is being built.
- Publish owned local tiles only for a bounded list of explicit pilot sites.
- Keep local coverage radius, zoom range, product count, and retained history intentionally narrow.
- Require a separate storage budget from MRMS before enabling local station products such as `N0Q`, `N0B`, velocity, correlation coefficient, or echo tops.
