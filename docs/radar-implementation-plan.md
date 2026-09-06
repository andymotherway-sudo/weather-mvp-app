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
- Keep a bounded R2 storage-status history sample after applied cycle/maintenance runs.
- Fail the workflow if the MRMS prefix exceeds 5 GB or cleanup leaves stale objects behind.
- Cleanup safety caps must be high enough to remove stale z10 experiment objects, while still scoped to `radar/mrms/proof/<product>/` and retained-frame manifests.

Cost posture:

- 12 frames at current measured size is roughly 220 MB.

Operational note:

- MRMS is kept fresh by the scheduled `MRMS radar cycle` GitHub workflow.
- The intended beta cadence is three times per hour on staggered cron slots (`:07`, `:27`, `:47`) with `target_env=production`, `apply=true`, `max_zoom=8`, `retain_frames=12`, and `backfill_frames=2`.
- GitHub scheduled workflow timing can vary, so MRMS freshness must be validated from the live timeline rather than assumed from the cron expression.
- Scheduled runs fail if the live timeline does not expose the expected zoom or minimum frame count after publish.
- Scheduled runs fail if the newest live MRMS frame is more than 90 minutes old after publish.
- Manual z10 publishes remain available for QA, but scheduled z10 should wait for upload retry/resume protection because one z10 frame can require 6k+ R2 object writes.
- Use the `MRMS z10 safety check` workflow for dry-run z10 render sizing before applying any z10 publish to R2.
- If the production timeline is older than the app freshness window, `MRMS auto` intentionally falls back to RainViewer.
- For beta testing deeper history, manually run the `MRMS radar cycle` GitHub workflow against `production` with `apply=true`, `max_zoom=10`, `retain_frames=12`, and `backfill_frames=2-3`, then verify the production timeline newest frame age.
- Do not confuse a healthy fallback with MRMS rendering: if the status says `Auto fallback`, MRMS is stale or warming and users are seeing RainViewer.
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

## Phase 2B: Dedicated Radar Runner

Goal: replace GitHub Actions as the long-term radar scheduler/renderer before paid customers depend on owned radar freshness.

Why this matters:

- GitHub Actions is good for beta automation, proof publishing, and manual recovery, but scheduled jobs can drift or skip.
- Radar needs boring cadence: fetch, decode, render, upload, cleanup, and health checks should run continuously without waiting for a manually triggered workflow.
- A dedicated runner lets us add z10, more MRMS products, and Level III station products with retry/resume protection instead of restarting a whole workflow after partial progress.

Production runner requirements:

- Containerized Node + Python runtime with MRMS GRIB2 and Level III dependencies preinstalled.
- S3-compatible R2 uploader with resumable/retryable object writes.
- Product/station queues so MRMS, Level III reflectivity, velocity, and echo tops can run independently.
- Per-product locks so two jobs never publish the same prefix at once.
- Retention cleanup after every successful publish, scoped to each product/station prefix.
- Storage guardrails that fail closed before R2 approaches the beta ceiling.
- Health output that reports newest frame age, retained frames, retained bytes, stale objects, and last failure.
- Worker/app fallback preserved until the runner has proven several days of fresh timelines.

Cost posture:

- Do not add a paid runner only to solve today's internal testing if GitHub Actions is good enough after cadence hardening.
- Add the dedicated runner when we need production-grade freshness, z10 by default, multiple MRMS products, or reliable recurring Level III products.
- Keep D1 out of the radar hot path; use R2 manifests and object prefixes as the radar source of truth.

## Phase 3: MRMS Product Expansion

Goal: add radar tools RainViewer does not give us, without multiplying storage blindly.

Candidate product order:

- Composite reflectivity: already first.
- Lowest-altitude reflectivity.
- Echo tops or height/echo-top style products.
- Surface precipitation rate.
- Short-duration precipitation accumulation.
- Severe/rotation guidance only after the basic user experience is trusted.

Implementation:

- Add one MRMS product at a time.
- Start each product at low zoom or low retention.
- The MRMS cycle workflow can now be manually run for `MergedReflectivityQCComposite`, `ReflectivityAtLowestAltitude`, `EchoTop_18`, or `PrecipRate`.
- The renderer has product-aware palettes for reflectivity, echo tops, and precip rate.
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

Measured September 5, 2026 dry-runs:

- Composite reflectivity z3-z10: 6,552 non-empty tiles, about 13.78 MB, 6,554 would-be uploads for one frame.
- EchoTop_18 z3-z8: 686 non-empty tiles, about 0.94 MB for one frame.
- PrecipRate z3-z8: 750 non-empty tiles, about 2.07 MB for one frame.

Interpretation:

- z10 composite is plausible for occasional/manual QA, but it is not boring enough yet to make the default scheduled production ceiling.
- EchoTop_18 and PrecipRate are storage-light enough to continue as dry-run/QA product candidates.
- Product UI should wait until each product has a validated legend, fallback behavior, and retained timeline quality.

Done when:

- The app offers 2-3 MRMS products that feel useful and distinct.
- Each product has a clear legend and timestamp.
- Product storage remains separately inspectable and bounded.

## Phase 4: RainViewer Replacement Hardening

Goal: make the new MRMS-auto default dependable enough that RainViewer is a fallback dependency, not the product foundation.

Requirements:

- MRMS reflectivity has a reliable rolling timeline.
- MRMS timestamps are correct locally and UTC-safe.
- MRMS is visually acceptable at common beta zooms.
- MRMS gracefully handles clear air.
- Worker/app fallback selects RainViewer only when MRMS is unavailable, stale, warming, or outside scope.
- We have tested several regions, not just Phoenix.

Implementation:

- Maintain source priority:
  - US + MRMS healthy: MRMS default.
  - MRMS stale/missing: RainViewer fallback.
  - outside US: RainViewer or other fallback remains.
- Keep stale threshold:
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

- NOAA NEXRAD Level III first for operational station products, then Level II only when we need raw moments/dual-pol detail that Level III cannot provide cleanly.
- The current public Level III source is the Unidata/NOAA-style real-time S3 bucket at `https://unidata-nexrad-level3.s3.amazonaws.com`.
- The Level III bucket uses 3-character station IDs, such as `IWA`, not `KIWA`, with object keys like `IWA_N0B_2026_08_13_03_58_32`.
- Start with Level III products that actually have recent frames at target stations. Do not assume every historical IEM/RIDGE product code exists for every site.
- Specialty products such as correlation coefficient, differential reflectivity, velocity, echo tops, and storm-relative tools require a real decoder/renderer path before they become owned app layers.

What we need to build:

- Product inventory by station/product.
- Read-only NOAA Level III discovery tool.
- One-frame local download/decode proof for the highest-value available products.
- Decoder pipeline, starting with MetPy `Level3File`.
- Local tile renderer that samples station polar radar into Web Mercator XYZ tiles.
- Station coverage model.
- Product-specific legends.
- Retention/cost model per station and product.
- Fallback when a station/product is unavailable.

Beta approach:

- Keep local NEXRAD exploratory work read-only until the product inventory and decoder proof are known.
- Pick a small paid-tier pilot set:
  - Phoenix/Mesa
  - Minnesota sites `MPX` and `DLH`
  - one storm-active central/southeast market
- Start with one or two Level III products that are proven available by station, not five.
- Keep the app's existing external Storm Scope fallback until owned station rendering is visibly better.

Done when:

- Local product rendering is good enough to be a paid differentiator.
- It does not break the national MRMS backbone.
- It has a separate storage and retention policy from MRMS.

Current proof status:

- `N0B` reflectivity and `EET` echo tops decode from NOAA Level III files locally.
- z6-z7 local XYZ tile proofs have been generated without R2 writes.
- The first measured local station tile outputs are tens of KB per frame at z6-z7 because clear-air tiles are skipped.
- z8-z10 remains plausible for targeted station products: the first `IWA N0B` proof was about 1.17 MB for one frame, and `MPX EET` was about 270 KB for one frame.
- 2x supersampling improves visual smoothness but increases tile bytes significantly, so it should not be the early default.
- This is promising, but it is not production-ready until smoothing, z8-z10 sizing, publish retention, and app fallback rules are implemented.
- September 5, 2026 inventory confirmed current N0B/N0S/EET availability for IWA, MPX, DLH, TLX, and CAE. This supports moving to a small owned Level III tile-publish proof, still without replacing IEM/RIDGE in the app.
- A bounded Level III publish path now exists for one station/product proof at a time. It writes to `radar/level3/proof/<site>/<product>/<frame>/...`, updates `radar/level3/latest/<site>/<product>.json`, and exposes the result through Worker routes.
- The app can now expose owned Level III as an explicit Storm Scope beta source for comparison, while keeping IEM/RIDGE as the default and fallback.
- Owned Level III should not become the default Storm Scope local source until at least one pilot station/product has repeated retained frames, clean animation, product-specific legends, and IEM/RIDGE fallback preserved.

First publish proof target:

- Workflow: `NEXRAD Level III proof cycle`
- Starting site/product: `IWA N0B`
- Starting zoom range: z7-z10
- Starting retention: 3 frames
- Starting safety cap: 2,000 tiles per frame
- Worker timeline: `/v1/radar/level3/timeline?site=IWA&product=N0B`
- Worker tile route: `/v1/radar/level3/tiles/{z}/{x}/{y}.png?site=IWA&product=N0B`

First production proof result:

- `IWA N0B` published successfully through GitHub Actions on September 5, 2026.
- The live Worker timeline reports z7-z10, one retained frame, 179 non-empty sparse tiles, and about 0.52 MB for the frame.
- A known tile returned `200 OK`, `image/png`, and `x-omni-radar-source: r2-level3`.
- Level III publishing now deletes stale objects under the same station/product proof prefix after applied runs, capped by `--max-deletes`.
- This proves the owned local Level III R2/Worker path works, but it is still a backend proof rather than a Storm Scope replacement.
- `IWA EET` also published successfully as a tiny z7-z10 proof, giving us one local non-reflectivity product path.
- `IWA N0S` velocity now publishes successfully after adding legacy 16-level velocity-bin decoding. The September 5, 2026 production proof produced 153 non-empty z7-z10 sparse tiles, about 0.46 MB, and a live `worker-r2` timeline.
- Storm Scope now has an `Owned L3` source toggle for supported proof products (`N0B`, `N0S`, `EET`). If the owned timeline is missing, stale, unsupported, or still loading, the app keeps the IEM local radar path alive instead of going blank.

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
- Prefer the dedicated radar runner path before relying on paid GitHub Actions for production freshness.
- Consider Workers Paid if Worker-served tile traffic approaches the free request ceiling before public R2/CDN delivery is ready.

## Immediate Next Steps

1. Let the scheduled z8 MRMS cycle run several times and verify the timeline keeps at least two fresh same-quality frames.
2. Run `MRMS z10 safety check` for composite reflectivity, then only apply z10 if tile count/runtime/storage remain safe.
3. Run manual MRMS cycle dry-runs for `EchoTop_18` and `PrecipRate`; inspect render output before publishing them.
4. Run `NEXRAD Level III inventory` for `IWA`, `MPX`, `DLH`, and one storm-active central/southeast station before building any owned local cache.
5. Keep local NEXRAD fallback reliable in the current release line so testers are not stuck on broken station products while owned Level III work continues.
6. Run `MRMS radar maintenance` after canceled or interrupted publish runs to clean stale objects and report retained storage.
7. Verify MRMS-auto across several US regions in internal testing.
8. Keep RainViewer fallback active until Phase 4 hardening gates pass.
9. Design the dedicated radar runner before making z10/multi-product radar a paid-customer dependency.

## Decision Log

- MRMS is the owned US national radar path.
- RainViewer remains fallback, not the future core dependency.
- Public R2 tile templates are not the app path yet; Worker-served tiles remain safer because sparse MRMS tiles need transparent empty responses.
- NOAA Level III is the first owned local NEXRAD candidate path because it is smaller and more product-oriented than Level II.
- Local NEXRAD specialty products are a premium-path investment. They should not block the MRMS beta backbone.
