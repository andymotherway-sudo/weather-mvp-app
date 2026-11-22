# OMNIwx Current Status

Release preparation updated: November 22, 2026 (Arizona time).
Infrastructure observations below retain their original verification scope unless noted.

This is the factual operating snapshot. It is not a backlog. For priority and
sequencing, use [production-readiness-plan.md](production-readiness-plan.md).

## Product And Release

- Current internal-testing candidate: `1.1.276` / Android version code `10294`.
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
  prefetch queue. A fresh `1.1.276` AAB was built and inspected on November 22;
  the artifact evidence is recorded in the release notes.
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
- GeoColor frames and rendered images are cached at the Worker. Production
  render misses are bounded by the `GEOCOLOR_RENDER_LIMITER`; cached responses
  do not consume that allowance.
- `omniwx-goes-renderer` is capped at two Cloud Run instances with concurrency
  four. This is a deliberate cost and upstream-protection limit, not a scale
  target. See [scaling-and-cost-controls.md](scaling-and-cost-controls.md).
- The live GeoColor frame catalog returned 11 frames from NOAA STAR / CIRA in
  the verified two-hour window after the `1.1.276` build on November 22. Device
  acceptance remains required for cold-start, sharpness, and animation behavior.

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
  runner now skips that incompatible cleanup for packed delivery; deploy and
  dry-run the corrected image before any further applied publish or schedule.

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
