# OMNIwx Launch Roadmap

Last reviewed: November 27, 2026

This roadmap uses evidence gates, not promised dates. It supplements the canonical
[production readiness plan](production-readiness-plan.md).

## Phase 0: Foundation In Progress

- Central feature catalog, server entitlement resolver, unit tests and event/deletion
  migration scaffold.
- Privacy-safe analytics boundary and event catalog.
- Membership/feedback Settings surface with billing explicitly disabled.
- Freemium, commercial, marketing and blocker documentation.
- Map zoom/locate controls move the camera without routine map remounts.
- iOS bundle ID and EAS profiles exist; the detailed two-store release scope is
  recorded in [ios-release-plan.md](ios-release-plan.md).

Exit: static checks pass and changes receive Sentry review.

## Phase 1: Reliable Free Beta

- Close Maps cold-open, camera, playback, sharpness and freshness acceptance.
- Resolve Open-Meteo commercial access before monetized distribution.
- Resolve standard-radar provider strategy and attribution.
- Make notification settings truthful before broader beta: retain the local test
  and solar-capture notification, but label event alerts as unavailable until a
  server-side delivery pipeline exists.
- Audit Android widget traffic and route weather reads through the Worker/cache
  before promoting widgets. Verify freshness, manual refresh, reboot recovery,
  battery-constrained behavior, and provider-request volume on physical devices.
- Run accessibility checks and five-to-eight task-based usability sessions.
- Instrument only approved, non-location analytics and feedback triage.

Exit: seven-day operational observation, representative-device evidence, no P0
provider-rights blocker for the Free catalog, published accurate privacy/support.

### Widget Request-Control Gate: Before Public Launch

Target: complete before the planned public launch window, approximately February
2027. The current Android widget cache and serialized refresh worker reduce
duplicate calls, but widgets still have a direct Open-Meteo path. Move widget
weather reads to a Worker endpoint that uses the shared forecast cache before
public promotion or material user growth.

- The app must never make a direct Open-Meteo request from an Android widget in
  the production build; the Worker is the single app-facing weather boundary.
- The Worker must coalesce identical location/unit requests, serve a bounded
  stale response during an upstream failure, and expose a concise freshness age.
- Instrument aggregate cache hit rate, upstream response/failure count, refresh
  duration, and request count per active widget location. Do not record precise
  user locations in analytics.
- Exercise at least a current-conditions, radar, and Sky Score widget on a
  physical Samsung and Pixel device through add, resize, manual refresh, reboot,
  offline, and background-refresh paths.
- Accept only if normal refreshes produce one cacheable Worker read per active
  location per cadence, no uncontrolled provider fan-out, and stale/offline
  states are clearly labeled rather than shown as current.

## Phase 2: Private Accounts Beta

- Configure development identity provider for Android and iOS, including an
  Apple-review-compliant sign-in path on iPhone, and verify tokens server-side.
- Apply versioned migrations to development only.
- Implement private profile, preferences, three-location sync, sign-out, recovery
  and deletion. Test account switching and ownership attacks.
- Update Data safety/privacy/deletion pages before opening signup.

Exit: two-account/two-device test matrix passes on both platforms; backup/export
and deletion proof.

## Phase 2A: Notification Delivery And Widget Reliability

- Add a Worker-backed device-registration endpoint and D1 token model after
  identity is available. Never trust a client-selected user, location, or
  entitlement when delivering notifications.
- Build one bounded event pipeline for official alerts first: deduplicate by
  alert identifier, apply location/saved-place matching server-side, record
  delivery attempts, honor category opt-out, and send through Expo only after
  a token is verified.
- Add later categories one at a time (fire, aviation, Kp, sky score, extremes),
  each with a source, threshold, freshness rule, quiet-hours decision, duplicate
  policy, and device acceptance test. Do not schedule all categories at once.
- Keep the Android widget refresh cadence best-effort, not a promised SLA.
  Consolidate widget weather requests behind the Worker cache and measure cache
  hit rate, provider failures, refresh duration, and per-active-widget request
  volume before broader promotion.
- Decide iOS WidgetKit scope separately; iOS widgets are not currently built.

Exit: a physical-device test proves opt-in, opt-out, local test, one real
server-sent alert, duplicate suppression, expired-token cleanup, widget fresh
and offline states, and no uncontrolled direct provider fan-out.

## Phase 3: Billing Sandbox

- Configure Play and App Store monthly/annual products and RevenueCat sandbox
  after approval. Both stores unlock `omniwx_plus`; products remain store-specific.
- Implement authenticated webhook receipt, dedupe/reconciliation and server policy.
- Add paywall, purchase, restore, manage-subscription and status UI.
- Exercise pending through refund/expiry and support runbooks using license testers.

Exit: server entitlements match verified store state under duplicates, delays,
reinstall and account switching on both platforms; no production charge can be
triggered by test code.

## Phase 4: First 100 Testers

- Recruit in controlled cohorts, onboard personally, review issues weekly.
- Measure activation, week-one retention, Maps reliability, feature interest,
  support load, provider fallback and cost per active user.
- Keep Plus as preview or sandbox until paid launch gate is approved.

Exit: repeat use and value evidence supports the final feature catalog and price.

## Phase 5: Limited Paid Beta And First 1,000 Installs

- Obtain explicit approval to activate live products and paid feature enforcement.
- Roll out gradually, monitor entitlements/refunds/provider costs, and preserve
  free safety/weather access during billing incidents.
- Expand only after retention, gross margin and support quality meet targets.

Exit: stable conversion/retention and support operations, no unresolved P0 blocker.

## Parallel iOS Readiness Track

- Run the first physical-iPhone EAS development build before feature scope grows.
- Treat MapLibre map gestures, safe areas, location denial, notification prompts,
  and large text as device acceptance gates.
- Decide iOS parity explicitly for Android-native MP4 export, widgets, and
  Android Auto; do not market unavailable capabilities as cross-platform.
- Complete TestFlight sandbox subscription and App Review preparation before an
  iOS public or paid release. See [ios-release-plan.md](ios-release-plan.md).
