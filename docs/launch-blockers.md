# OMNIwx Launch Blockers

Last reviewed: November 22, 2026

## Public Free Beta Blockers

| Priority | Blocker | Required evidence |
| --- | --- | --- |
| P0 | Open-Meteo free endpoint is non-commercial | Approved paid plan/replacement, production endpoint, attribution and measured cost |
| P0 | Maps/GeoColor reliability unresolved | Cold-open/playback/camera/freshness acceptance on representative Play-installed devices |
| P0 | Standard radar commercial/freshness posture | RainViewer terms or reliable owned alternative; explicit fallback labels |
| P0 | Provider rights incomplete | Signed-off matrix for every publicly promoted feature and export |
| P1 | Privacy/support text predates accounts/analytics | Published accurate policy and Play Data safety answers before collection |
| P1 | Accessibility and responsive QA incomplete | Large font/display and TalkBack task results on small/large Android screens |
| P1 | Notification UI implies live weather alerts without a delivery backend | Clearly limited UI now, then permission/token registration, server watcher, dedupe, sender, and physical-device evidence before promotion |
| P1 | Android widgets bypass central provider controls in some paths | Worker-cached widget data, rate/cost evidence, and fresh/cached/offline/reboot acceptance on representative devices |

## Account Beta Blockers

- Identity provider/project choice and owner configuration.
- Play app-signing SHA fingerprints and separate development/production setup.
- Worker ID-token verification, revocation/deletion policy and authenticated CORS.
- Versioned D1 migration application in dev, ownership tests and backup/export.
- Profile sync conflict, account switching, recovery and deletion acceptance.
- External deletion-request page and updated privacy/Data safety disclosure.

## Paid Beta Blockers

- Explicit approval to create/activate Play products at $5.99/month and $49.99/year.
- RevenueCat project/store connection, secret configuration and restore-transfer policy.
- Authenticated webhook processing and bounded reconciliation, with duplicate and
  out-of-order event proof. This sprint adds only resolver/event table foundations.
- Purchase, pending, restore, cancel, renew, grace/hold, refund/revoke, expiry and
  reinstall test evidence from Play license testers.
- Premium backend authorization and cost limits for each enabled capability.
- Terms of Service, subscription disclosures and support/refund procedures.
- Gross-margin and incident-response review before increasing capacity.

The Terms of Service must cover auto-renewal and cancellation disclosures,
weather-data limitations and official-source guidance, acceptable use, provider
attribution, account termination/deletion, refund routing, limitation of
liability, governing law and contact details. It must match the final store
products and actual app behavior; a template is not launch evidence.

## Manual Decisions

- Confirm Firebase Authentication versus an alternative identity provider.
- Approve the final feature matrix and saved-location limits.
- Approve analytics processor/consent posture or keep analytics disabled.
- Decide whether exported videos are included in Plus after provider-rights review.
- Decide notification scope, quiet hours, and which alert classes are suitable
  for the first opt-in release; begin with official alerts rather than every
  proposed category.
- Decide whether Android widgets remain beta-only until Worker-routed reads and
  device reliability evidence are complete.
- Decide the initial paid cohort size and go/no-go metrics.

No blocker here authorizes a production migration, deployment, store change,
message campaign, website publication or real charge.
