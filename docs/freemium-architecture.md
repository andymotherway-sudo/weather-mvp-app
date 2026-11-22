# OMNIwx Freemium Architecture

Last reviewed: November 14, 2026

The detailed identity, ownership, lifecycle, deletion and setup design lives in
[paid-user-architecture.md](paid-user-architecture.md). This document records the
implemented product boundary and prevents paywall logic from spreading through
screens.

## Product Contract

- Free weather works without creating an account.
- One paid entitlement exists: `omniwx_plus`.
- Proposed prices are USD 5.99/month and USD 49.99/year. Both products unlock the
  same entitlement; prices shown in app must come from the store offering.
- Official safety alerts and the basic daily weather loop are never paywalled.
- Feature assignments remain provisional until the provider/cost matrix and user
  validation approve them.
- High-resolution map-animation recording and MP4 export are designated as a
  Plus capability. The existing export path remains ungated until verified
  account, purchase, and provider-rights work is complete; a client-only lock
  would be both bypassable and unfair to existing testers.

## Centralized Access Model

Client feature IDs are defined in `app/lib/entitlements/catalog.ts` and exposed
through `EntitlementProvider`. Its current state is deliberately guest/Free and
has no local premium override. Future authenticated builds may replace that state
only with a Worker-verified snapshot.

The Worker resolves D1 entitlement records in
`omniwx-api/src/services/subscriptions.ts`. Expired, revoked, unknown, and malformed
records fail closed. Cancellation retains access only until verified expiry. This
resolver is the future API authorization source; client UI state is never enough
to unlock premium server resources.

```text
Google Play checkout
        |
RevenueCat verified store state
        |
authenticated, idempotent lifecycle events
        |
Cloudflare Worker -> D1 compact entitlement projection
        |
GET /v1/subscriptions/entitlements
        |
client presentation + server-side feature enforcement
```

No payment credentials enter OMNIwx. Authentication, store billing, subscription
state and application profiles remain separate responsibilities.

## Implemented In This Sprint

- Central Free/Plus capability catalog and saved-location limits.
- App-wide entitlement provider defaulting to guest/Free.
- Server resolver for `omniwx_plus`, including canceled-through-expiry behavior.
- Platform-neutral lifecycle unit tests.
- Versioned, unapplied D1 migration scaffold for idempotent subscription event
  receipts and account deletion workflows.
- Truthful Settings membership/feedback surface. It cannot purchase or sign in.

## Not Yet Enabled

- Identity SDK or token validation.
- User profile/saved-location sync.
- RevenueCat SDK, webhook route or product configuration.
- Paywalls, purchases, restores, cancellation or account deletion execution.
- Premium API enforcement or feature locks.

Those remain disabled until credentials, commercial rights and lifecycle tests
exist. Do not add isolated checks such as `if (isPremium)` to screens. New gated
features must enter the catalog, matrix, Worker policy and tests together.
