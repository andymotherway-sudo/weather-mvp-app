# OMNIwx Current Status

Last updated: September 5, 2026

This file is the short source of truth for where the product and infrastructure stand today. Deeper planning details live in the roadmap docs, but this file should stay factual and current.

## Product

- Current app release line: `1.1.247`
- Current Android version code: `10264`
- Internal testing is the active release channel.
- The latest local AAB is still the `10264` bundle unless a new full release path run builds a newer one.

## Backend

- Production Worker is live and is the app's stable backend edge.
- Home summary, alerts, wildfire, and radar backend routes are expected to work through the Worker.
- D1 exists for future account, entitlement, paid-tier, and saved-user-data work.
- D1 should not be used for radar traffic by default while Cloudflare free-tier daily limits are a concern.

## Radar

- MRMS is the owned NOAA-backed national radar path for the US beta footprint.
- RainViewer remains the fallback for stale, warming, missing, disabled, or out-of-scope MRMS.
- IEM/RIDGE remains the local Storm Scope/NEXRAD fallback until owned NOAA Level III rendering is production-ready.
- Production MRMS is currently bounded for cost: scheduled z3-z8, retained rolling frames, no archive.
- Scheduled MRMS runs publish a small backfill by default so the app can build a smoother short loop even when GitHub schedule timing drifts.
- Manual z10 MRMS publishes are useful for QA, but z10 should not become the routine production default until the `MRMS z10 safety check` workflow stays boring across several weather patterns.
- Owned Level III local radar now has a proof publish path for NOAA NEXRAD products (`N0B`, `N0S`, `EET`) using bounded R2 prefixes and Worker timeline/tile routes. It is not app-default yet.

## Cloudflare

- R2 stores bounded MRMS tile frames and latest timeline artifacts.
- R2 must stay rolling, not archival.
- The current target is zero cost, with a comfort ceiling well below the paid-overage threshold.
- Worker-served MRMS tiles remain the safer app path for now because sparse/empty MRMS tiles need transparent responses and fallback handling.
- Direct public R2/custom-domain tile delivery is the future scale path, but it needs careful cutover.

## GitHub Actions

- `MRMS radar cycle` is the current MRMS publisher.
- Scheduled runs use production, apply writes, z3-z8, a small backfill, retained frames, smoke checks, and cleanup.
- GitHub schedule timing can vary; do not assume every cron run executes exactly on the 20-minute mark.
- Manual runs are still used for z10 QA, backfill, and recovery.
- `MRMS z10 safety check` dry-runs z3-z10 without R2 writes.
- `NEXRAD Level III inventory` checks current NOAA Level III station/product availability without R2 writes.
- `NEXRAD Level III proof cycle` can dry-run or publish a tiny bounded station/product proof to R2 for Worker verification.

## Not Done Yet

- MRMS needs repeated production cycles to prove the richer multi-frame history actually stays fresh.
- z10 production posture is not fully settled.
- Echo tops and precip rate are now supported by workflow/product rendering paths, but they are not polished user-facing layers yet.
- Owned local NEXRAD/Level III rendering is not production-ready, but inventory and a first bounded R2 proof cycle can now be run repeatably in GitHub Actions.
- RainViewer and IEM should stay enabled until owned MRMS plus owned local products are visibly reliable.

## Latest Radar Evidence

- A bounded production MRMS cycle on September 5, 2026 published fresh z3-z8 composite reflectivity and left the live timeline with 5 retained frames.
- The fresh z8 composite frame measured 838 non-empty tiles and about 2.54 MB.
- The z10 safety dry-run for composite reflectivity passed without R2 writes: 6,552 non-empty tiles, about 13.78 MB, and 6,554 would-be uploads for one frame.
- EchoTop_18 z3-z8 dry-run passed without R2 writes: 686 non-empty tiles, about 0.94 MB.
- PrecipRate z3-z8 dry-run passed without R2 writes: 750 non-empty tiles, about 2.07 MB.
- Level III inventory confirmed current N0B/N0S/EET availability for IWA, MPX, DLH, TLX, and CAE.
- Level III Worker proof endpoints are `/v1/radar/level3/timeline?site=IWA&product=N0B` and `/v1/radar/level3/tiles/{z}/{x}/{y}.png?site=IWA&product=N0B`.
- First production Level III proof published `IWA N0B` at z7-z10 with 179 non-empty sparse tiles and about 0.52 MB. A live tile returned `200 OK`, `image/png`, and `x-omni-radar-source: r2-level3`.
