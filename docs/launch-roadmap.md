# OMNIwx Launch Roadmap

Last reviewed: November 14, 2026

This roadmap uses evidence gates, not promised dates. It supplements the canonical
[production readiness plan](production-readiness-plan.md).

## Phase 0: Foundation In Progress

- Central feature catalog, server entitlement resolver, unit tests and event/deletion
  migration scaffold.
- Privacy-safe analytics boundary and event catalog.
- Membership/feedback Settings surface with billing explicitly disabled.
- Freemium, commercial, marketing and blocker documentation.
- Map zoom/locate controls move the camera without routine map remounts.

Exit: static checks pass and changes receive Sentry review.

## Phase 1: Reliable Free Beta

- Close Maps cold-open, camera, playback, sharpness and freshness acceptance.
- Resolve Open-Meteo commercial access before monetized distribution.
- Resolve standard-radar provider strategy and attribution.
- Run accessibility checks and five-to-eight task-based usability sessions.
- Instrument only approved, non-location analytics and feedback triage.

Exit: seven-day operational observation, representative-device evidence, no P0
provider-rights blocker for the Free catalog, published accurate privacy/support.

## Phase 2: Private Accounts Beta

- Configure development identity provider and verify tokens server-side.
- Apply versioned migrations to development only.
- Implement private profile, preferences, three-location sync, sign-out, recovery
  and deletion. Test account switching and ownership attacks.
- Update Data safety/privacy/deletion pages before opening signup.

Exit: two-account/two-device test matrix passes; backup/export and deletion proof.

## Phase 3: Billing Sandbox

- Configure Play monthly/annual base plans and RevenueCat sandbox after approval.
- Implement authenticated webhook receipt, dedupe/reconciliation and server policy.
- Add paywall, purchase, restore, manage-subscription and status UI.
- Exercise pending through refund/expiry and support runbooks using license testers.

Exit: server entitlements match verified store state under duplicates, delays,
reinstall and account switching; no production charge can be triggered by test code.

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
