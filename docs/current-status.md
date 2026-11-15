# OMNIwx Current Status

Release preparation updated: November 15, 2026 (Arizona time).
Infrastructure observations below retain their original verification scope unless noted.

This is the factual operating snapshot. It is not a backlog. For priority and
sequencing, use [production-readiness-plan.md](production-readiness-plan.md).

## Product And Release

- Current internal-testing candidate: `1.1.272` / Android version code `10290`.
- Release metadata and tester notes are aligned. Fresh production AAB build,
  embedded-config inspection, signature verification, Play upload, and
  physical-device acceptance are pending.
- Artifact evidence, signing caveat, and tester steps are recorded in
  [release notes](google-play-closed-testing-release-notes.md).
- Internal testing is the active release channel. A build is not release-ready
  until it is uploaded, installed from Play, and accepted on physical devices.
- Maps and GeoColor remain the highest-risk user-facing area. Validate blank
  first-open behavior, imagery availability, sharpness at state zoom, timeline
  controls, and seamless frame motion on every maps-related release.
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
- The live GeoColor frame catalog returned 12 frames in the verified two-hour
  window. A render followed by the same request returned a Worker cache hit.

## Radar And Automation

- MRMS is the owned national radar path for supported US coverage. RainViewer
  remains its fallback; IEM/RIDGE remains the local Storm Scope fallback.
- Cloud Scheduler radar jobs are paused. The checked GitHub variables were
  `MRMS_SCHEDULE_ENABLED=false` and `LEVEL3_SCHEDULE_ENABLED=false`; no queued
  or running publisher job was observed in the verification window.
- Do not re-enable a publisher based only on a green build or old frame data.
  Use the containment and re-enablement evidence in
  [radar-cost-safety-runbook.md](radar-cost-safety-runbook.md).
- Packed artifacts are the only acceptable direction for resumed owned-radar
  writes. Legacy tile-per-object publishing is not an approved scheduled path.

## Active Gates

1. Complete Maps/GeoColor device acceptance with evidence from a Play-installed
   build before expanding imagery scope or marketing the feature.
2. Existing GCP budget alerts were shown in the user's November 14 screenshot.
   Confirm recipients and delivery before raising Cloud Run capacity or enabling
   shared-source caching; alerts must not be treated as a hard spending cap.
3. Re-enable any radar writer only through a one-publisher packed pilot with a
   measured aggregate operations and runtime budget.
4. Complete security, provider-use, account ownership, and entitlement gates
   before paid subscriptions.

## Evidence Discipline

Record release version, production deployment version, test device/OS, route or
job, UTC timestamp, outcome, and relevant frame age/cache/delivery metadata.
If a console, scheduler, billing, or provider state has not been checked, mark
it unknown rather than carrying forward a previous claim.
