# OMNIwx Commercial Readiness Audit

Last reviewed: November 22, 2026

## Assessment

OMNIwx has a credible differentiated product shape, but it is not ready to
collect subscription revenue. The app already has unusual breadth, a real
Android release path, bounded GeoColor rendering, and account-oriented D1
scaffolding. The current blockers are provider commercial rights, Maps device
reliability, real identity configuration, billing lifecycle verification,
privacy/deletion operations, and evidence that users retain and convert.

This sprint is on branch `codex/freemium-launch-readiness`. It does not deploy,
migrate production data, create store products, or activate payment collection.

## Audit Findings

### P0: Blocks public freemium or paid launch

- Open-Meteo's free service is expressly non-commercial. A paid commercial plan
  or approved replacement is required before subscriptions or advertising.
- RainViewer's free terms target personal/educational/small-community use and
  direct commercial/high-volume users to arrange terms. Keep it a fallback only
  under approved terms; do not make a paid promise around it yet.
- Maps/GeoColor has unresolved real-device loading and animation acceptance.
  Paid positioning cannot rely on it until cold-open, frame freshness, controls,
  camera stability, sharpness, and fallback behavior pass on representative phones.
- Owned MRMS/Level III publishers are paused and their timelines were stale in
  the last recorded health check. Fallback labels must remain honest.
- Authentication is a fail-closed placeholder. No Firebase/Clerk SDK, verified
  user session, account recovery, or production identity configuration exists.
- No live Play/RevenueCat product, purchase verification, event reconciliation,
  restore/transfer policy, account deletion operation, Terms of Service, or
  updated account-aware privacy disclosure exists.

### P1: Required before a limited paid beta

- Finish versioned D1 migrations, ownership tests, backup/export and deletion
  recovery. Do not treat the monolithic schema file as migration history.
- Verify every paid feature's provider rights, attribution, caching, derived-data
  and export rights. NOAA public-domain status does not transfer to third-party
  content surfaced through NOAA or ArcGIS.
- Establish analytics with a reviewed processor/consent posture. The code now has
  a typed, no-op event boundary; no data leaves the app yet.
- Exercise purchase pending, success, cancel, renewal, grace, hold, refund,
  revocation, expiration, reinstall, account switching and webhook recovery.
- Establish support procedures for purchase not recognized, restore conflicts,
  cancellation, refunds, deletion and provider outages.
- Notification settings currently provide permission, category storage, Expo token
  acquisition, a local test, and one local solar-capture notice only. There is no
  deployed token-registration endpoint, server-side event watcher, deduplication,
  delivery sender, or operational delivery evidence. Do not market weather-alert
  notifications as live until that pipeline exists.
- Android widgets are implemented, but their weather and aviation paths can fetch
  providers directly from devices. Route high-volume widget reads through the
  Worker/cache before broad promotion so commercial-provider, rate-limit, and
  cost controls remain centralized. Android JobScheduler timing is best-effort;
  it is not a 30-minute freshness guarantee.

### P2: Growth and polish

- Reduce eight-tab navigation pressure through evidence-backed testing rather
  than an immediate rewrite. Simple must stay genuinely quick; wxLab keeps depth.
- Improve freshness labels and unavailable states consistently across specialty
  surfaces. Do not display stale data as current.
- Run accessibility checks at increased Android font/display sizes and TalkBack.
- Validate onboarding, profile language, value proposition and paywall messaging
  with users before investing in acquisition.

## What Exists Versus What Is Planned

| Area | Implemented | Planned or needs verification |
| --- | --- | --- |
| Releases | Signed AAB process, production target checks, internal Play testing | Repeated reproducibility and real-device acceptance per release |
| Weather API | Cloudflare Worker, caching/fallbacks, request safety | Commercial Open-Meteo access and full provider contract inventory |
| Maps | Broad layer catalog, radar/satellite playback, cost limiter | Smooth device playback, freshness acceptance, owned radar pilot |
| Accounts | D1 schema scaffold and fail-closed routes | Identity SDK/config, verified JWTs, sync, recovery and deletion |
| Entitlements | Central client catalog and server resolver | Authenticated snapshots, provider reconciliation and enforcement |
| Billing | Architecture and event migration scaffold | Play/RevenueCat sandbox, webhooks, products and support operations |
| Analytics | Typed privacy-safe no-op event boundary | Provider decision, consent/disclosures and instrumentation rollout |
| Feedback | Settings email feedback entry point | Structured intake/triage and response targets |
| Notifications | Permission, category preferences, Expo token attempt, local test/capture notice | Worker registration, server watcher, dedupe, sender, delivery observability and device proof |
| Android widgets | Eight native home-screen widgets, local cache, manual/reboot/job refresh paths | Worker-routed provider access, freshness/cost telemetry and representative-device reliability evidence |
| Marketing | Launch documents and landing-page source | Approved links/assets, published site and measured campaigns |

## Cost Posture

Profiles and billing should be low-volume D1 work and must not sit in map tile or
animation hot paths. Free and Plus users share cacheable weather bytes; identity
checks happen before premium authorization without producing per-user image cache
keys. GeoColor remains bounded by Worker limiting and Cloud Run capacity. Paid
does not mean unlimited rendering or archive growth.

Track cost per monthly active user and per subscriber across Worker requests, D1
rows, R2 operations/storage, Cloud Run requests/runtime, mapping services and paid
data providers. Budget alerts are warning systems, not hard caps.

## Evidence Needed For Go/No-Go

- Seven-day Maps/radar acceptance window without a known blank-open regression.
- Commercial agreements/accounts for all features included in Plus.
- Successful private account beta with two devices and account deletion proof.
- A production notification acceptance test: opt-in/out, one real server-sent
  official alert, duplicate suppression, expired-token handling, and no alert
  delivery without user permission.
- Widget evidence for fresh, cached, offline, reboot, manual-refresh and
  battery-constrained states, including measured provider request volume.
- Complete Play license-test subscription lifecycle and server entitlement proof.
- Published privacy, deletion and terms pages matching actual behavior.
- First cohort retention, premium-interest and support-load results.
- A measured gross-margin model at 100, 1,000 and 10,000 active users.
