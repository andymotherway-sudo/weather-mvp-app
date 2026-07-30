# Cloudflare Radar Storage Rollout

This is the storage foundation for moving OMNIwx radar off IEM and RainViewer without changing app behavior first.

Current direction: owned national radar should move through MRMS, not the older RainViewer-backed national overview image cache. Keep the tiny timeline manifest path available for compatibility, but do not publish legacy overview image tiles unless we intentionally re-enable that experiment.

Cost guardrail:

- zero-cost is the default target right now
- no archive should be created automatically
- publish only a single rolling timeline object first, not a history set

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
- D1 manifest ingest is live on a 5-minute cron.
- R2 timeline publishing is live at `radar/timeline/latest.json`.
- A tiny owned-image publish path is live:
  - latest frame only
  - zoom-1 national overview tiles only
  - fallback to upstream when an owned tile is not present

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

## Immediate next code milestone after R2 is enabled

The current live posture is still intentionally conservative:

- D1 is the source of truth for the rolling manifest.
- R2 stores one latest timeline object.
- R2 can store a tiny owned-image slice for national overview radar, but that legacy RainViewer-backed publisher is disabled during the MRMS pivot.
- The worker decides when to serve owned tiles and when to fall back.

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
- R2 stores one latest timeline object instead of growing an archive
- owned national MRMS proof/latest PNGs are bounded and manually promoted
- legacy national overview PNG publishing is off
- owned local single-site radar is bounded to a small hot-site roster, not a national archive
- future expansion should increase one axis at a time

During the MRMS pivot, local single-site tile accumulation stays off by default. The app can still request local radar through the worker and external fallback path, but exploratory local radar use should not write RIDGE tiles into R2 unless `RADAR_R2_LOCAL_TILE_CACHE_ENABLED=1` is intentionally enabled.

Legacy overview image publishing is also off by default. MRMS is the preferred owned national reflectivity path; RainViewer remains the default user-facing broad radar fallback until MRMS has rolling history, visual QA, and retention exercised.

## Hot-site path under 10 GB

If the goal is responsive local radar across the U.S. without turning R2 into a giant archive, use a hot-site roster instead of trying to pre-cache every NEXRAD site.

- Keep the national timeline manifest hot for compatibility, but keep legacy national overview image tiles disabled while MRMS is being built.
- Publish owned local tiles only for a bounded list of hot sites.
- Keep the local site list small at first, then grow it slowly based on real usage.
- Keep local coverage radius and zoom range intentionally narrow.

Suggested starter policy:

- `RADAR_R2_LOCAL_SITE_IDS=IWA,TLX,VTX,FWS,LOT,FFC,LWX,OKX,AMX,TBW,HGX,SFX,MPX,DLH`
- `RADAR_R2_LOCAL_SITE_LIMIT=14`
- `RADAR_R2_LOCAL_COVERAGE_RADIUS_MI=90`
- `RADAR_R2_LOCAL_IMAGE_HISTORY_FRAMES=2`
- `RADAR_R2_LOCAL_IMAGE_MIN_ZOOM=7`
- `RADAR_R2_LOCAL_IMAGE_MAX_ZOOM=8`

At this stage, the owned local publish path is intended to cover both:

- `N0Q` reflectivity
- `N0B` hi reflectivity

That keeps owned local radar focused on the sites most likely to matter first, now including Minnesota coverage through `MPX` and `DLH`, while leaving room for national radar and future GOES work.

The worker status route now reports the hot-site posture directly, including:

- configured local site IDs
- local site limit
- local coverage radius
- owned local product set
- estimated tile/object count for the current local cache policy
- rough estimated storage in MB for the owned local rolling slice
- rolling storage posture after old local timestamps are evicted from R2
