# Radar Implementation Plan

This is the practical plan for getting OMNIwx from the current MRMS preview to a beta-ready owned radar stack, without taking on RainViewer commercial cost before we have paying customers.

## North Star

OMNIwx should use owned NOAA-backed radar for the US beta experience, with RainViewer as a temporary fallback rather than the product foundation.

The end state has three layers:

- MRMS national radar backbone for US users.
- MRMS product expansion for richer national weather tools.
- Local NEXRAD specialty products for premium storm-scope depth.

The cost rule is simple: stay rolling, bounded, and sparse. Do not build an archive.

## Current Guardrails

As of August 12, 2026:

- Cloudflare R2 free tier includes 10 GB-month storage, 1M Class A operations, 10M Class B operations, and free egress for Standard storage: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/).
- Cloudflare Workers Free has a 100,000 requests/day limit: [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- GitHub Actions usage is free for public repositories and quota-based for private repositories; private repositories can bill after included minutes/storage: [GitHub Actions billing](https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions).
- R2 object operations at scale should use the S3-compatible API rather than per-object Cloudflare REST/Wrangler operations: [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/).

OMNIwx implementation rules:

- Keep R2 under 5 GB during beta unless deliberately approved.
- Keep the absolute emergency ceiling under R2's 10 GB free tier.
- Store only non-empty rendered tiles.
- Retain only recent frames.
- Serve MRMS tiles through the Worker until fallback/cache behavior is fully proven.
- Keep RainViewer fallback enabled until MRMS is default-quality.
- Do not schedule high-cadence z10 publishes until storage and GitHub Actions usage are measured.

## Phase 0: Stabilize What Works

Status: mostly done.

Goal: make the current MRMS preview reliable enough for tester use.

Implementation:

- Keep MRMS product: `MergedReflectivityQCComposite`.
- Keep zoom range: z3-z10.
- Keep tile serving: Worker route `/v1/radar/mrms/tiles/{z}/{x}/{y}.png`.
- Keep missing sparse tiles as transparent PNGs, not 404s.
- Keep app label explicit: `MRMS auto`, `MRMS preview`, or `Auto fallback`.
- Default the wide radar app path to MRMS-auto in the US beta footprint, while keeping RainViewer preloaded as fallback.

Done when:

- Production timeline returns `tileDelivery=worker-r2`.
- Production timeline returns at least 3 same-quality z10 frames after a backfill.
- Missing clear-air tiles return cacheable transparent PNGs.
- The app does not show `Frame 1 of 1` after a successful backfill.

Current measured production signal:

- One z3-z10 frame is roughly 17-18 MB for the current weather pattern.
- Four retained z10 frames are roughly 71 MB of tile payload before object metadata overhead.

## Phase 1: Beta MRMS Backbone

Goal: make MRMS the primary US national radar candidate while staying near zero cost.

Implementation:

- Run manual MRMS backfills when testing:
  - `backfill_frames=3` for routine verification.
  - `backfill_frames=2` when a faster top-up is enough.
- Keep `retain_frames=12`.
- Keep `max_frame_age_minutes=360`.
- Keep `max_zoom=10`.
- Keep `max_tiles=12000` per frame.
- Add production verification after each run:
  - timeline frame count
  - newest frame age
  - per-frame tile count
  - per-frame bytes
  - live tile response header
  - R2 bucket size check
- Require the MRMS workflow to report retained R2 object count, retained bytes, stale object count, and stale bytes after every applied run.
- Fail the workflow if the MRMS prefix exceeds 5 GB or cleanup leaves stale objects behind.

Cost posture:

- 12 frames at current measured size is roughly 220 MB.
- 60 frames at current measured size is roughly 1.1 GB.
- 5 hours at 2-minute cadence is roughly 150 frames and could be around 2.5-3 GB in sparse weather, but can be higher during widespread storms.
- Stay at 3-12 frames until we have repeated storage measurements across several weather patterns.

Done when:

- MRMS-auto consistently shows a useful 30-60 minute loop where owned coverage exists.
- R2 cleanup leaves only retained frame prefixes.
- RainViewer fallback still works when MRMS is disabled, stale, missing, warming, or outside the US beta footprint.
- The app can explain MRMS as "US national radar preview" honestly.
- The app refuses stale MRMS timelines instead of silently showing old radar.

## Phase 2: Controlled Automation

Goal: make MRMS update without manual babysitting, but do not blow up GitHub Actions or R2.

Implementation:

- Add a scheduled workflow only after manual runs are boring.
- Start schedule at low cadence:
  - every 30 minutes for z3-z10, or
  - every 15 minutes during active testing windows only.
- Keep concurrency cancellation enabled.
- Keep duplicate-frame detection enabled.
- Keep cleanup after publish.
- Add workflow output summary:
  - frames retained
  - total retained bytes
  - stale objects deleted
  - bucket estimate

Escalation triggers:

- If GitHub Actions minutes become annoying, move rendering to a cheap external job runner or a paid runner later.
- If Worker requests approach 100k/day, move hot tile delivery toward public R2/custom-domain CDN with a safe fallback strategy.
- If R2 approaches 5 GB, reduce retention or cadence before adding products.

Done when:

- MRMS stays fresh during beta without manual clicks.
- Storage remains bounded after several days.
- The app has stable fallback behavior if a scheduled run fails.

## Phase 3: MRMS Product Expansion

Goal: add radar tools RainViewer does not give us, without multiplying storage blindly.

Candidate product order:

- Composite reflectivity: already first.
- Echo tops or height/echo-top style products.
- Surface precipitation rate.
- Short-duration precipitation accumulation.
- Severe/rotation guidance only after the basic user experience is trusted.

Implementation:

- Add one MRMS product at a time.
- Start each product at low zoom or low retention.
- Use separate prefixes:
  - `radar/mrms/proof/<product>/<frame>/...`
  - `radar/mrms/latest/<product>.json`
- Add UI toggles only for products that have current, retained, same-quality frames.
- Keep product-specific legends.
- Use product-specific storage budgets.

Storage rule:

- Do not multiply the reflectivity storage budget by 5 products.
- Each new MRMS product must have an explicit max retained frames and max zoom.
- If a product is mostly informational, start z3-z7 or z3-z8 instead of z10.

Done when:

- The app offers 2-3 MRMS products that feel useful and distinct.
- Each product has a clear legend and timestamp.
- Product storage remains separately inspectable and bounded.

## Phase 4: RainViewer Replacement Gate

Goal: make MRMS the default US radar path.

Requirements:

- MRMS reflectivity has a reliable rolling timeline.
- MRMS timestamps are correct locally and UTC-safe.
- MRMS is visually acceptable at common beta zooms.
- MRMS gracefully handles clear air.
- Worker fallback selects RainViewer only when MRMS is unavailable or outside scope.
- We have tested several regions, not just Phoenix.

Implementation:

- Add source priority:
  - US + MRMS healthy: MRMS default.
  - MRMS stale/missing: RainViewer fallback.
  - outside US: RainViewer or other fallback remains.
- Add stale threshold:
  - MRMS older than 20-30 minutes should warn/fallback.
- Add app copy:
  - "MRMS radar"
  - "Fallback radar"
  - avoid exposing backend names unless useful in wxLab.

Done when:

- A beta user opening Maps in the US sees MRMS without knowing any of this infrastructure exists.
- RainViewer can be treated as a fallback dependency instead of a commercial must-have.

## Phase 5: Local NEXRAD Premium Path

Goal: add high-value local storm products that MRMS/RainViewer do not fully cover.

Likely source:

- NOAA NEXRAD Level II or Level III products, not RainViewer.
- Specialty products such as correlation coefficient, differential reflectivity, velocity, echo tops, and storm-relative tools require a real decoder/renderer path.

What we need to build:

- Product inventory by station/product.
- Decoder pipeline.
- Local tile renderer.
- Station coverage model.
- Product-specific legends.
- Retention/cost model per station and product.
- Fallback when a station/product is unavailable.

Beta approach:

- Do not start nationwide local NEXRAD specialty rendering yet.
- Pick a small paid-tier pilot set:
  - Phoenix/Mesa
  - Minnesota sites `MPX` and `DLH`
  - one storm-active central/southeast market
- Start with one specialty product, not five.

Done when:

- Local product rendering is good enough to be a paid differentiator.
- It does not break the national MRMS backbone.
- It has a separate storage and retention policy from MRMS.

## Operating Cadences

Zero-cost beta cadence:

- Manual MRMS backfill before tester sessions.
- Single-frame MRMS publishes as needed.
- Keep retained frames at 3-12.
- Check R2 bucket size after every heavier run.

Low-risk automated beta cadence:

- z3-z10 every 30 minutes.
- Retain 12 frames.
- Keep one MRMS product.
- Review storage weekly.

Paid-customer cadence:

- z3-z10 every 5-10 minutes for reflectivity.
- Add selected MRMS products.
- Consider Workers Paid if tile requests approach the free limit.
- Consider paid GitHub Actions, a cheap job runner, or self-hosted runner if rendering cadence exceeds included minutes.

## Immediate Next Steps

1. Use `backfill_frames=3` as the current maximum z10 backfill until render performance improves.
2. Run `MRMS radar maintenance` after canceled or interrupted publish runs to clean stale objects and report retained storage.
3. Add retained-byte/object trend logging across multiple workflow runs.
4. Add MRMS source-priority fallback rules for US default readiness.
5. Add the first MRMS product candidate research spike: echo tops vs precipitation rate.
6. Keep RainViewer fallback active until Phase 4 gates pass.

## Decision Log

- MRMS is the owned US national radar path.
- RainViewer remains fallback, not the future core dependency.
- Public R2 tile templates are not the app path yet; Worker-served tiles remain safer because sparse MRMS tiles need transparent empty responses.
- Local NEXRAD specialty products are a later premium-path investment, not the beta foundation.
