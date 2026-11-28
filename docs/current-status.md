# OMNIwx Current Status

Release preparation updated: November 27, 2026 (Arizona time).
Infrastructure observations below retain their original verification scope unless noted.

This is the factual operating snapshot. It is not a backlog. For priority and
sequencing, use [production-readiness-plan.md](production-readiness-plan.md).

## Product And Release

- Current release candidate: `1.1.297` / Android version code `10315`.
- This app-only release redesigns the native Sky Score home-screen widget as a
  compact astronomy instrument across compact, wide, and expanded sizes. It
  uses only the canonical Space score/cache, never invents a score or a
  time-specific observing window, and hides the detailed cloud profile when
  cloud-layer data is unavailable. It also includes the ongoing Android
  foreground-service work for resilient user-initiated video exports. No Worker
  deployment, D1 migration, radar publisher change, or production configuration
  change is part of this release.
- This app-only export correction draws label-free country, continent, and U.S.
  state boundaries from geographic geometry in the same map projection as the
  imagery. It removes city, ocean, country, and state labels from saved video
  exports while preserving border alignment and the fast chronological export
  preparation path. The renderer now maps boundaries directly to the imagery's
  exact Mercator bounding box rather than a separately centered approximation.
- This app-only export reliability update matches Android's concurrent image
  preparation to the GeoColor renderer's two-image decode capacity and gives
  cold source renders a bounded 35-second read window with retries. It keeps
  the existing safeguard that refuses to save sparse or fabricated loops.
- This app-only video-export correction accepts a useful two-thirds prepared
  chronological timeline instead of discarding an 8-of-12 export, while still
  rejecting sparse, duplicated, or partial-composite animation scenes.
- This app-only video-export update schedules an Android local notification
  when a user-initiated MP4 save completes or fails, allowing the user to
  navigate through OMNIwx while the native export worker runs.
- This app-only layout and export-progress update makes shared map sheets clear
  system edges consistently, moves Storm Scope exit to the controller header,
  and improves Settings spacing on narrow and large displays. It also keeps
  video-export progress visible while Maps remains usable.
- This app-only animation hotfix preserves the currently displayed timestamp
  while an atmospheric frame catalog refreshes, so playback does not jump back
  to an edge frame merely because the buffer is still filling.
- This app-only export hotfix no longer pads a sparse satellite catalog by
  replaying it. It makes one chronological pass through the selected window,
  waits longer on each source frame when needed, retries bounded transient
  image failures, and refuses to save a video when fewer than two-thirds of
  the required source scenes are ready.
- This hotfix corrects the map-projection units used to request buffered
  atmospheric frames, preventing infrared and GeoColor imagery from rendering
  as vertically stretched stripes.
- This candidate keeps the current-location marker above buffered atmospheric
  imagery, removes duplicate live satellite overlays after the buffered frame
  is ready, and uses deliberate default blends for GeoColor, infrared, clouds,
  and radar. The same per-layer opacity values now feed Android video export.
- A signed production-targeted AAB is pending for this candidate. Artifact
  size, hash, embedded production configuration, version code, and signing
  certificate will be recorded after the release build completes.
- This candidate keeps the overlay catalog stationary when
  layers are toggled and makes map zoom buttons change zoom only, never center
  or location-follow state. The aviation filter now retains PIREP metadata and
  exposes CWA/observation categories; Land and Hourly now honor Celsius display
  selection. It also retries a focused GeoColor catalog fetch once after a
  transient failure, keeps zoom controls aligned with pinch gestures, and
  separates advisory validity times from PIREP observation reports. GeoColor no
  longer paints the temporary 1808px preview: the map waits for the sharp
  renderer output so state-scale
  imagery is never presented as ready while soft. GeoColor now retries failed
  sharp-frame downloads before skipping them and serializes its expensive
  prefetch queue. This release additionally bounds each NOAA source request at
  20 seconds so the renderer can use all four retries within its 120-second
  service deadline. GeoColor now always renders from NOAA's 5424px source, and
  cache version 4 prevents lower-resolution frames from being reused. Its Land
  summary now shares the bounded hourly forecast cache rather than making a
  separate upstream forecast call on each home-summary cache miss; rate-limit
  responses remain concise and never expose nested upstream payloads. Artifact
  evidence is recorded in the release notes.
- Artifact evidence, signing caveat, and tester steps are recorded in
  [release notes](google-play-closed-testing-release-notes.md).
- Internal testing is the active release channel. A build is not release-ready
  until it is uploaded, installed from Play, and accepted on physical devices.
- Maps and GeoColor remain the highest-risk user-facing area. Validate blank
  first-open behavior, imagery availability, sharpness at state zoom, timeline
  controls, and seamless frame motion on every maps-related release.
- The fresh Windows build used the documented Java local-TCP fallback
  (`jdk.net.unixdomain.tmpdir=NUL`) through `npm run build:android:prod`.
  Direct raw Gradle invocations can still fail on this host's local IPC path;
  use the documented release script rather than treating that direct failure as
  an application build failure.
- The authoritative release procedure is
  [full-release-path.md](full-release-path.md).

## Request-Serving Infrastructure

- The production Cloudflare Worker is the app-facing backend. It serves cached
  and normalized weather/radar endpoints; it is not a radar publisher.
- Production Worker version `2eb6b3fc-9fa4-484d-8f76-d3e60a4634da` serves the
  `1.1.280` cache-reuse release. A live Mesa home-summary probe returned `200`
  after deployment.
- GeoColor frames and rendered images are cached at the Worker. Production
  render misses are bounded by the `GEOCOLOR_RENDER_LIMITER`; cached responses
  do not consume that allowance.
- `omniwx-goes-renderer` is capped at two Cloud Run instances with concurrency
  four. This is a deliberate cost and upstream-protection limit, not a scale
  target. See [scaling-and-cost-controls.md](scaling-and-cost-controls.md).
- On November 22, the production GeoColor frame catalog returned 11 frames and
  a fresh cache-v4 512px render returned `200 image/png` through the production
  Worker after the sharp-source deployment. Device acceptance remains required
  for cold-start, sharpness, and animation behavior.
- The user confirmed MRMS imagery is visible in the app. This is device
  acceptance of the retained pilot data path, not authorization to resume a
  radar publisher.

## Radar And Automation

- MRMS is the owned national radar path for supported US coverage. RainViewer
  remains its fallback; IEM/RIDGE remains the local Storm Scope fallback.
- On November 22, 2026, the packed MRMS pilot rendered and published one fresh
  `MergedReflectivityQCComposite` frame (`20261122T180800`) at zooms 3-8. The
  artifact was about 1.81 MB and the bounded publish used three Class A writes:
  the pack, latest manifest, and rollback manifest.
- The production Worker served the published packed artifact through the real
  MRMS tile route with `200 image/png` and
  `x-omni-radar-source: r2-mrms-pack`. This proves the compact delivery path,
  not a continuously operating national radar service.
- Cloud Scheduler radar jobs are paused. The checked GitHub variables were
  `MRMS_SCHEDULE_ENABLED=false` and `LEVEL3_SCHEDULE_ENABLED=false`; no queued
  or running publisher job was observed in the verification window.
- The production MRMS job was restored to `RADAR_RUNNER_APPLY=false` and
  `RADAR_RUNNER_CONFIRM=disabled` immediately after the pilot. Level III was
  not included in this pilot and its legacy frames remain stale.
- Do not re-enable a publisher based only on a green build or old frame data.
  Use the containment and re-enablement evidence in
  [radar-cost-safety-runbook.md](radar-cost-safety-runbook.md).
- Packed artifacts are the only acceptable direction for resumed owned-radar
  writes. Legacy tile-per-object publishing is not an approved scheduled path.
- The pilot execution's final status was failed because it invoked the old
  tile-prefix cleanup after the packed publish had already succeeded. The
  runner now skips that incompatible cleanup for packed delivery. On November
  22, the corrected image
  `sha256:19f02873936342b23893afaae70128ca53c3b192c97776c918fe8b2e9f2c77cf`
  was deployed with writes disabled and its one-task dry-run succeeded. No
  follow-up publish, Level III run, or scheduler activation is authorized by
  that verification alone.
- A second, manually approved packed MRMS publish then succeeded at
  `20261122T190000` while bounded by the four-operation cap. The live timeline
  retained both that newest frame and the prior `20261122T180800` frame; Worker
  probes for each returned `200 image/png` with `r2-mrms-pack`. The MRMS job
  was restored to no-write mode immediately afterward, and all five scheduler
  jobs were rechecked as `PAUSED`.

## Active Gates

1. Complete Maps/GeoColor device acceptance with evidence from a Play-installed
   build before expanding imagery scope or marketing the feature.
2. Existing GCP budget alerts were shown in the user's November 14 screenshot.
   Confirm recipients and delivery before raising Cloud Run capacity or enabling
   shared-source caching; alerts must not be treated as a hard spending cap.
3. Re-enable any radar writer only through a corrected one-publisher packed
   pilot with a measured aggregate operations and runtime budget. The November
   22 single-frame MRMS pilot is evidence, not authorization for a schedule.
4. Complete security, provider-use, account ownership, and entitlement gates
   before paid subscriptions.

## Evidence Discipline

Record release version, production deployment version, test device/OS, route or
job, UTC timestamp, outcome, and relevant frame age/cache/delivery metadata.
If a console, scheduler, billing, or provider state has not been checked, mark
it unknown rather than carrying forward a previous claim.
