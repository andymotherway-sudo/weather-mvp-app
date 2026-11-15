# OMNIwx Accounts And Freemium Plan

Last reviewed: November 14, 2026

Status: proposed product and provider choices, not an enabled billing system.
The owner is being asked to confirm Free + Plus and Firebase Authentication.
Prices and limits below are hypotheses to validate, not approved store products.

This is the canonical commercial design. Execution gates remain in
[production-readiness-plan.md](production-readiness-plan.md); builds and Play
distribution follow [full-release-path.md](full-release-path.md).

## Current Foundation

Verified from the repository on November 14:

- `app/profile.tsx` is a local Settings screen backed by AsyncStorage, not an
  authenticated profile. Existing preferences must survive account onboarding.
- `src/middleware/authentication.ts` returns no authenticated user; reserved
  `/v1/user`, `/v1/devices`, and `/v1/subscriptions` routes fail closed with 501.
- `src/services/subscriptions.ts` is a placeholder, not purchase verification.
- `src/database/schema.sql` defines users, preferences, saved locations, devices,
  and entitlements. Parameterized ownership-scoped location queries exist.
- No Firebase, Clerk, RevenueCat, or Play Billing client SDK is installed.
- D1 dev/prod bindings exist. Live schema and provider configuration must be
  inspected before migrations; old provisioning notes are not current evidence.
- The privacy policy describes account-free, local-only preferences. It must be
  updated and published before collecting account data, not merely before billing.

Paths beginning with `src/` above are within `omniwx-api/`.

## Proposed Launch Levels

Start with two product levels, not separate paid plans for every specialty.
A free registered account is an identity state, not a third subscription tier.

| Capability | Free | OMNIwx Plus |
| --- | --- | --- |
| Daily/hourly forecasts, current conditions, official safety alerts | Included | Included |
| Basic radar and basic specialty summaries | Included, with honest source/freshness labels | Included |
| Browse without an account | Yes | Free browsing still available when signed out |
| Personal profile, units, preferences | Optional free account | Same account |
| Saved-location sync | Proposed 3 locations after sign-in | Proposed 25 locations |
| Advanced wxLab analysis and specialty planning tools | Preview at the point of use | Included only for launch-accepted features |
| Advanced map layers/presets and GeoColor playback | Limited preview, only if cost-safe | Included only after device/cost acceptance |
| High-resolution animation export and advanced customization | Not included in proposed paid launch | Included after provider/export review |
| Basic widgets | Included | Included; advanced customization can be Plus |
| Advertising | No ad network planned for initial launch | No ad network planned |

Keep existing free capabilities intact during account development. The table is
not permission to introduce paywalls immediately. Audit the exact features and
provider rights, communicate the transition to testers, then approve the final
catalog. Do not sell a known-broken map feature, unbuilt forecasts, unlimited
rendering, a promised longer archive, or unreviewed professional safety claims.

Test-price hypothesis: USD 5.99/month or USD 49.99/year for the same Plus
entitlement. Store-localized prices, renewal terms, and actual offers must come
from Play/RevenueCat, not hard-coded UI strings. Do not create live products or
start a recurring charge without owner approval. Defer lifetime plans, ads,
family plans, and auto-renewing trials until basic retention/cost data exists.

On downgrade, preserve saved data and let the user choose which locations remain
active within the free allowance. Never silently delete excess locations or
withhold official safety warnings behind a purchase prompt.

## Proposed Service Responsibilities

| Service | Responsibility | Not its responsibility |
| --- | --- | --- |
| Firebase Authentication | Google sign-in, email/password, verification, recovery, session lifecycle | Weather profiles, subscription authority, our card storage |
| Google Play Billing | Android checkout, payment processing, store subscription management | OMNIwx settings or profile database |
| RevenueCat | Store integration, verified subscription state, lifecycle notifications, restores | Authenticating an OMNIwx login |
| Cloudflare Worker | Verify identity, authorize profile access, enforce premium API access, process authenticated billing events | Trusting client-supplied paid flags |
| Cloudflare D1 | Profiles/preferences, ownership, compact entitlement projection and event deduplication | Reading/writing on every weather tile |
| R2 / existing Cloud Run renderer | Existing bounded weather imagery pipeline | A new per-user profile or billing pipeline |
| GitHub | Source, reviews, tests, deployment workflows | Handling customer login or payment at runtime |

Firebase is proposed because OMNIwx already operates in Google's ecosystem.
Choose dedicated development/production authentication projects deliberately;
do not silently enable services or broaden IAM in the renderer project. Clerk
is a viable alternative, but installing two identity systems is not the plan.
No phone/SMS login in v1, to avoid another abuse and per-message cost surface.
Do not introduce Firestore: keep application-owned profile data in D1.

For Play-distributed digital features, use Play Billing as the initial standard
checkout path. Regional alternative-billing programs have specific eligibility
and requirements; do not assume a Stripe web link is a compliant replacement.
Web checkout is a later, separately reviewed project.

## Profile V1

A profile is private personal configuration, not a public social account.

- Internal random user ID mapped uniquely to verified provider issuer/subject.
- Optional display name, verified sign-in contact from the provider, preferred
  units, theme, Simple/wxLab preference, and optional default saved location.
- Interest selections such as everyday weather, astronomy, marine, or aviation
  can personalize navigation; do not infer qualifications or eligibility.
- Saved locations and explicit sync status. Import existing local favorites
  once with consent and stable IDs; do not overwrite them on first sign-in.
- Current plan, purchase/renewal status, Restore purchases, Manage subscription,
  Sign out, and account deletion entry points.

Exclude birth date, address, phone, background location history, public handles,
social graphs, and uploaded avatars from v1. Use a local/generated avatar if
desired. Store neither passwords nor card details in D1 or app logs.

Google sign-in must use the correct package and signing configuration for the
Play-installed app. Keep development and production identities separate. Email
accounts require verification before cloud sync or paid-account binding.

## Authentication And Ownership Contract

1. Use a maintained provider SDK for sign-in and secure credential persistence.
   Do not persist raw session/refresh tokens in general-purpose AsyncStorage.
2. The Worker verifies signed ID tokens against the configured provider's keys,
   issuer, audience, algorithm, expiry, and subject. A decoded JWT is not proof.
   Cache signing keys using provider guidance; never fetch them for every tile.
3. Resolve the internal user ID server-side. Scope every profile/location query
   to it; ignore/reject user IDs, paid flags, and ownership fields in request JSON.
4. Validate bounded bodies and strict schemas. Do not permit profile updates to
   alter provider IDs, email-verification state, roles, or subscription fields.
5. Token signature checks alone do not detect revocation. Define and test a
   bounded revocation/disabled-account policy; deletion and sensitive actions
   require recent authentication and immediate application-side blocking.
6. Account APIs use `Cache-Control: no-store` and a deliberate authenticated
   CORS policy. Current public CORS placeholders are not a finished boundary.
7. Sign-out clears account-specific cached state; guest weather remains usable.
   Switching accounts must not show the previous user's locations or entitlement.

Suggested initial routes, not live endpoints:

| Route | Purpose |
| --- | --- |
| `GET /v1/user` | Own profile, or explicit setup-required response |
| `POST /v1/user` | Idempotent own-profile creation from verified identity |
| `PATCH /v1/user` | Update allowed display/profile fields |
| `GET/PUT /v1/user/preferences` | Read/update bounded preferences with revision checks |
| `GET/POST /v1/user/locations` | Read/add bounded saved locations |
| `PATCH/DELETE /v1/user/locations/:id` | Update/remove an owned location |
| `DELETE /v1/user` | Start verified, idempotent account/data deletion |
| `GET /v1/subscriptions/entitlements` | Server-derived feature access |
| `POST /v1/subscriptions/refresh` | Rate-limited server reconciliation after purchase/restore |
| `POST /v1/subscriptions/webhook` | Provider-authenticated lifecycle notifications |

Keep feature authorization separate from marketing labels. Use stable capability
keys, for example `advanced_maps`, `wxlab_tools`, and `video_export`, and a bounded
saved-location allowance. Monthly and annual products unlock the same entitlement
`omniwx_plus`. Product IDs are proposed, not yet registered in the store.

## Billing And Entitlement Lifecycle

Require sign-in before Plus purchase so the purchase has a stable owner. Identify
the RevenueCat SDK using the internal opaque user ID issued by the Worker, not an
email or a locally invented identity. Client SDK state can drive presentation,
but is not authorization for a premium API.

The store remains the transaction authority; RevenueCat supplies verified store
state; D1 stores the Worker's compact access projection. These are not three
independent sources of truth. A purchase success callback alone grants no server
access. Reconcile verified subscription state after purchase/restore, with
bounded retries and an understandable pending state.

Webhook implementation must:

- Require a configured authorization secret, HTTPS, strict schema/body bounds,
  approved app/product/environment, and constant-time secret comparison.
- Keep sandbox events out of production access. No client-controlled test bypass.
- Use a unique provider event ID and transaction-safe durable receipt/projection
  update. Acknowledge success only after durable acceptance, not before writes.
- Tolerate duplicates, out-of-order delivery, cancellation before expiry,
  renewals, refunds/revocations, grace periods, account hold, pauses, and expiry.
- Reconcile current provider state rather than blindly toggling paid/free from
  event names. Bound per-customer refreshes, retries, and reconciliation work.
- Provide a retry/dead-letter or equivalent recovery path and visible sync lag.
  Provider retries are finite; missed events need bounded recovery.
- Preserve purchase ownership across reinstall/restore. Do not auto-merge by
  email or silently transfer purchases to a different OMNIwx account. Approve and
  test RevenueCat restore/transfer behavior before launch, with a support path.

Enforce premium access before returning a shared cached premium response. Shared
weather bytes may remain cached across users; authentication must not be skipped
on cache hits or cause every image to acquire a user-specific cache key. Avoid
bearer tokens in URLs. Protected image delivery needs a tested native-map header
or short-lived scoped authorization design before it is advertised as gated.

Migrate the scaffold with versioned, additive, dev-tested D1 migrations. Add
provider/environment uniqueness, subscription-to-account ownership, event
deduplication, and sync revision fields deliberately. Do not run the entire
historical schema as an assumed migration. Inspect the live schema first.

## Cost And Abuse Controls

- Account sync is event-driven: on sign-in, deliberate changes, and debounced
  foreground refresh, not per rendered screen, animation frame, or map tile.
- Batch changed preferences and use revisions to avoid overwriting another
  device's edits. Cap locations and body sizes; paginate future collections.
- Validate tokens locally using cached public keys. Short-lived verified access
  snapshots can avoid a D1/provider lookup on every premium image; set an explicit
  revocation window and refresh policy before implementation.
- Apply limits by authenticated user and IP/device abuse signals, separately
  from the existing global expensive-render limiter. Paid does not mean unlimited.
- Do not write `last_seen` or analytics on every request. Sample/batch operational
  telemetry without retaining raw credentials, receipts, email, or location trails.
- No new R2 writes, image archives, always-on jobs, or per-user Cloud Run instances
  are required for profiles or billing. Keep existing renderer cost guards.
- Track auth users, subscription revenue, refunds, D1 rows read/written, webhook
  retries, reconciliation lag, and imagery cost per active/free/paid user.
- Preserve free-tier safety access during a billing outage. Do not grant new
  premium access on unverifiable state; honor only an explicitly bounded,
  previously verified access window, never beyond verified expiry/revocation.

RevenueCat currently advertises no charge up to USD 2,500 monthly tracked revenue,
then 1% of tracked revenue at the threshold. This is separate from store fees and
hosting/provider costs. Firebase pricing depends on authentication configuration;
its Identity Platform pricing lists a 50,000-MAU no-cost tier for the standard
category, not unlimited free authentication. Recheck prices at activation.

## Privacy And Deletion Gate

Before public account signup, publish accurate account/provider/sync disclosures,
update the Play Data safety form, and provide in-app and external web account-
deletion request paths. Implement reauthentication, ownership checks, idempotent
deletion, retries across the identity provider and D1, and an auditable completion
state. Block a pending/deleted user from automatically recreating a profile with
an old still-valid token.

Explain that deleting an OMNIwx profile is not by itself a guarantee that a Play
subscription is canceled. Provide Manage subscription and clear confirmation;
do not obstruct account deletion merely because a subscription exists. Specify
which transaction records must be retained, why, and for how long before launch.
Retain minimal legally required records separately from active profile data.

Privileged provider operations such as deletion must use a reviewed server-only,
least-privilege credential path, preferably keyless under the existing Google
organization policy. Never disable service-account-key restrictions just to make
signup or billing integration easier. SDK public configuration is different from
service-account credentials and RevenueCat secret API keys.

## Delivery Phases And Acceptance

1. **Approve catalog and providers.** Confirm two tiers, test-price hypothesis,
   launch feature matrix, Firebase versus alternative, and account ownership.
   Create only development/test configuration initially; keep billing disabled.
2. **Private account beta.** Add SDK/config, verified Worker auth, versioned D1
   migrations, personal profile, settings/location sync, recovery, sign-out,
   deletion, and privacy disclosures. Test two accounts/devices, rejected/expired
   tokens, ownership attacks, sync conflicts, deletion and provider outage.
3. **Billing sandbox.** Configure Play subscription/base plans and RevenueCat;
   add server verification/events and app purchase/restore/manage screens. Test
   pending/success/cancel, renew, grace/hold, refund, expiry, reinstall, account
   switching, duplicates/out-of-order events and sandbox/production separation.
4. **Internal Play release.** Use the full release path, a new unused version
   code, test purchases and real-device acceptance. Verify store-localized prices,
   renewal disclosures, purchase acknowledgments, support and deletion paths.
5. **Paid launch decision.** Only enable approved working paid capabilities after
   reliability, provider rights, security and cost gates pass. Monitor a limited
   cohort before expanding. A successful checkout is not launch acceptance.

Account design and sandbox engineering can proceed alongside Maps reliability
work. Public account collection requires its own security/privacy/deletion gates;
charging remains blocked on the broader production-readiness gates.

## Owner Setup Checklist (After Provider Approval)

- Confirm the organization that owns Play/Firebase/RevenueCat and support access.
- Register the Android package `com.anonymous.weatherapp` in the chosen auth
  development project. For Google sign-in, obtain the correct Play app-signing
  fingerprints; do not confuse the upload key with the device-installed signer.
- Enable Google and email/password providers with verification/recovery settings.
  Supply public app configuration through the normal environment setup; do not
  paste admin keys, session tokens, or passwords into chat.
- Create RevenueCat development configuration and a Play app connection using
  only the documented required permissions. Keep credentials out of the app/git.
- Approve price and product IDs before configuring the Plus subscription and
  monthly/annual base plans; identify license testers and test purchase accounts.
- Set provider secrets via the Worker secret mechanism. Verify keyless compatibility
  before choosing any integration that requires a Google service-account JSON key.
- Review/publish privacy, support, deletion page and store disclosures before signup.

## Official References

Checked November 14, 2026; verify again before configuring live products:

- [Google Play payments policy](https://support.google.com/googleplay/android-developer/answer/9858738)
- [Google Play purchase verification and integration](https://developer.android.com/google/play/billing/integrate)
- [Google Play subscription lifecycle](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
- [Google Play account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
- [Firebase pricing](https://firebase.google.com/pricing)
- [RevenueCat Expo integration](https://www.revenuecat.com/docs/getting-started/installation/expo)
- [RevenueCat customer identity](https://www.revenuecat.com/docs/customers/identifying-customers)
- [RevenueCat webhook authorization and delivery](https://www.revenuecat.com/docs/integrations/webhooks)
- [RevenueCat pricing](https://www.revenuecat.com/pricing)
