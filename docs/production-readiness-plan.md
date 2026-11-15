# OMNIwx Production Readiness Plan

Last updated: November 14, 2026

## Purpose

This is the single execution plan for taking OMNIwx from internal testing to a
trustworthy beta and, later, paid customers. It uses gates rather than dates:
work is complete only when the required evidence exists in production and on
real devices.

The current operating facts live in [current-status.md](current-status.md).
Release steps live in [full-release-path.md](full-release-path.md). Radar
incident actions live in [radar-cost-safety-runbook.md](radar-cost-safety-runbook.md).

## Operating Principles

1. Product honesty beats feature breadth. A visible fallback is better than a
   broken or mislabeled owned layer.
2. No uncontrolled writers. Every job, schedule, retry, and manual recovery
   path must be known, bounded, and stoppable.
3. A successful build is engineering evidence, not release evidence. Device
   acceptance and production probes are separate gates.
4. Scale only after measuring a narrower configuration. Storage size alone does
   not prove request, operation, or compute cost safety.
5. Account design and billing sandbox engineering may proceed alongside
   reliability work. Public account collection requires security/privacy/deletion
   gates; charging remains downstream of reliability and provider-use acceptance.

## Gate 1: Reliable Release And Maps Experience

**Goal:** an internal tester can install a Play build and use every core map
path without blank opens, missing controls, false source claims, or degraded
animation.

Required evidence:

- A unique version is synchronized in `app.json`, Gradle, and package metadata.
- The signed AAB is built, inspected, uploaded to the intended Play track, and
  installed from Play on at least one representative physical Android device.
- Maps is opened from a cold app launch and after background/foreground cycles.
- GeoColor reports a real source state, remains sharp at the supported zoom,
  exposes playback controls, and advances frames without obvious blank flashes
  or stretched imagery.
- Fallback, unavailable, and slow-network states are understandable and leave
  the base map usable.
- The release record names the app version, Worker deployment version, device,
  Android version, test result, and unresolved known issues.

**Owner documents:** [full-release-path.md](full-release-path.md),
[google-play-closed-testing-release-notes.md](google-play-closed-testing-release-notes.md),
and [current-status.md](current-status.md).

## Gate 2: Bounded Infrastructure And Cost Controls

**Goal:** normal usage and a single buggy client cannot silently create an
unbounded Worker, Cloud Run, or R2 bill.

Required evidence:

- Cloud Run maximum instances, concurrency, request timeout, and renderer
  cache behavior are explicitly reviewed before capacity changes.
- GeoColor cache misses have a production limiter; cache hits are verified to
  bypass expensive rendering.
- GCP billing budget alerts at 50%, 75%, 90%, and 100% name active recipients.
- Cloud Run, Cloudflare Worker/R2, and MapTiler monitoring is reviewed for the
  current usage window.
- Source-frame caching, if added, uses short retention, a dedicated least-
  privilege credential in Secret Manager, and a measured load test.

**Owner document:** [scaling-and-cost-controls.md](scaling-and-cost-controls.md).

## Gate 3: Safe Owned Radar Operations

**Goal:** owned radar is more dependable than its fallback for its supported
scope without creating an uncontrolled write pipeline.

Required evidence:

- Every GitHub workflow, Cloud Scheduler job, Cloud Run execution path, and
  local publisher has been inventoried and has a tested stop path.
- Scheduled writes default to disabled until deliberately enabled.
- A single packed MRMS product and a single packed Level III product/station
  pass a production pilot: fresh data, real tile headers, bounded retention,
  rollback proof, operation count, runtime, and cost observation.
- No legacy tile-per-object publisher competes for the same live manifest.
- A seven-day observation window meets declared freshness and cost targets.
- Product labels, source switches, and fallbacks match the imagery actually
  shown to the user.

**Owner documents:** [radar-architecture.md](radar-architecture.md),
[radar-implementation-plan.md](radar-implementation-plan.md),
[radar-phase-done-checklist.md](radar-phase-done-checklist.md), and
[radar-cost-safety-runbook.md](radar-cost-safety-runbook.md).

## Gate 4: Security, Data, And Commercial Foundation

**Goal:** account and paid-feature work begins on an explicit, supportable
foundation rather than becoming a new bypass around the Worker or D1.

Required evidence:

- Secrets, service credentials, deployments, and production route protections
  are reviewed; no secret is committed, logged, or embedded in the app.
- Provider terms, attribution, caching limits, and commercial-use constraints
  are recorded for the data that supports a paid promise.
- D1 ownership rules and migrations are ready, but radar traffic does not use
  D1 as its hot path.
- Authentication and entitlement enforcement are server-side; the app does not
  decide a paid entitlement on its own.
- Privacy policy, support contact, backup/recovery procedure, and incident
  ownership are ready before broader beta onboarding.

**Owner documents:** [paid-user-architecture.md](paid-user-architecture.md),
[privacy-policy.md](privacy-policy.md), and [app-architecture.md](app-architecture.md).

The commercial document now contains the proposed Free + Plus catalog, profile
scope, Firebase/Play Billing/RevenueCat responsibilities, ownership and billing
lifecycle design, and phased acceptance. Those choices are proposals pending
owner confirmation; no login, paywall, or recurring charge is enabled by the plan.

## Gate 5: Paid Beta Decision

**Goal:** decide deliberately whether to invite a broader or paid beta.

Proceed only when Gates 1-4 have evidence, the release path has been exercised,
known defects have owners and dates, and support can explain source/fallback
behavior to a user.

Do not proceed merely because a payment SDK, D1 table, or subscription product
exists.

## Execution Order

1. Close the Maps/GeoColor device-acceptance loop and repair reproduced defects.
2. Finish billing alerts, observability review, and a measured GeoColor load
   baseline before raising capacity or adding a shared source cache.
3. Keep radar automation paused while proving one packed publisher at a time.
4. Complete security/provider-use/backup review alongside the controlled radar
   observation window.
5. Design and develop accounts/sync in a private environment alongside reliability
   work; open signup only after account security, privacy and deletion gates pass.
6. Add subscription sandbox flows after account ownership works; enable real
   charges only after reliability, provider-use and payment lifecycle acceptance.
7. Make the paid-beta go/no-go decision from evidence, not the calendar.

## Plan Maintenance

- Update this plan only when a dependency, gate, or priority changes.
- Put live observations in `current-status.md` with a date.
- Put detailed commands in the relevant runbook, not here.
- Replace superseded plans with redirects to this document. Do not maintain
  parallel roadmaps.
