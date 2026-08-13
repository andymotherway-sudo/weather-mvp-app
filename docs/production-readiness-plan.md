# OMNIwx Production Readiness Plan

Last updated: August 13, 2026

This plan organizes the security, paid-customer, infrastructure, and Storm Scope notes into one execution path. It is intentionally practical: protect what exists, keep the app lovable, and add commercial capability only after the trust foundation is real.

## North Star

OMNIwx should become a credible paid weather workstation without pretending to be a giant enterprise platform on day one.

The product should be:

- Secure enough to handle accounts, preferences, and premium entitlements.
- Operationally recoverable if a provider, deploy, database, or cache path fails.
- Honest about source coverage and limitations.
- Smooth and beautiful enough that radar-heavy users want to keep using it.
- Structured so a future acquirer or senior engineering reviewer can understand the architecture quickly.

## Current Strategic Choice

Do not add RevenueCat, Clerk, or production billing yet.

Build the foundation in this order:

1. Secure the existing Cloudflare Worker and deployment posture.
2. Add D1 migration/schema support for future user data.
3. Keep radar work focused on MRMS-auto broad radar and Storm Scope UX.
4. Add accounts only after backend security and D1 are ready.
5. Add paid subscriptions only after account sync works.

## Track A: Security Foundation

Goal: make the existing backend safe to evolve before accounts, payments, or premium APIs exist.

### A1. Account And Platform Security

Owner split:

- You: enable MFA and review active sessions in Cloudflare, GitHub, Expo, Google Play Console, domain registrar, and later Apple/RevenueCat/Clerk.
- Codex: document required security posture and avoid storing secrets in source-controlled files.

Done when:

- Cloudflare account MFA is enabled.
- GitHub account MFA is enabled.
- Expo and Google Play Console access are reviewed.
- Recovery codes are stored outside the repo.
- Unknown sessions/tokens are removed.

### A2. Secrets Audit

Goal: prove we have not committed private credentials or placed server secrets in the app.

Scope:

- `.env`, `.dev.vars`, app config, Worker config, GitHub workflows, Android files, scripts, and docs.
- Git history scan for tokens, API keys, passwords, private URLs, and Cloudflare credentials.
- Mobile bundle exposure review for public versus private variables.

Rules:

- Do not display secret values in chat or docs.
- Private values belong in Cloudflare Worker Secrets, GitHub Actions secrets, or local ignored files.
- Expo public variables are not secret.
- Rotate anything private that was ever committed.

Done when:

- Findings list includes location, likely sensitivity, and remediation.
- `.gitignore` covers local secret files.
- Worker secret names are documented without values.
- GitHub Actions secrets required by MRMS/R2 are documented without values.

### A3. Worker Security Foundation

Goal: keep existing API behavior working while adding secure structure.

Implementation shape:

- Central request ID generation.
- Safe error response helpers.
- Central CORS policy helpers.
- Security headers for JSON/API responses.
- Input validation for coordinates, query params, route params, and JSON bodies.
- Authentication middleware placeholder that fails closed.
- Entitlement middleware placeholder that fails closed.
- Rate-limit abstraction that can use Cloudflare-supported controls later.
- Structured logging that avoids secrets, auth headers, tokens, full user records, payment data, and unnecessary exact location history.

Non-goals:

- Do not add fake production authentication.
- Do not trust client-provided user IDs.
- Do not add RevenueCat yet.
- Do not break current weather/radar routes.
- Do not deploy automatically from local work.

Done when:

- `GET /health` returns only safe status information.
- Protected future account routes return clear not-configured/auth-required responses.
- Production errors do not expose stack traces, query text, internal paths, env vars, or upstream secret details.
- Validation failures return structured client-safe errors.
- Request IDs appear in error responses and response headers.

## Track B: D1 And Account Readiness

Goal: prepare cross-device user data without enabling accounts prematurely.

### B1. D1 Schema And Migrations

Create migration-friendly schema for:

- `users`
- `user_preferences`
- `saved_locations`
- `device_installations`
- `subscription_entitlements`

Database rules:

- Use D1 prepared statements and `.bind()` for all user-controlled values.
- Never interpolate user input into SQL.
- User-owned update/delete queries must include both object ID and authenticated user ID.
- Do not store passwords, card data, Apple/Google payment credentials, or raw payment secrets.

Done when:

- Dev and production D1 databases are separate.
- Migrations apply locally and to development before production.
- Schema docs describe ownership and retention assumptions.
- Queries are written around trusted authenticated user IDs, not app-supplied `userId`.

### B2. Account Provider Integration

Candidate: Clerk, after D1/security foundation is ready.

Rules:

- Start with a development Clerk app.
- Publishable key may be app-visible.
- Secret key must be Worker-only.
- Worker validates signed auth tokens server-side.
- D1 user records map to trusted provider IDs.

Done when:

- `GET /v1/me` works for authenticated users.
- Unauthenticated protected routes fail closed.
- Sign-out clears local account state safely.

### B3. Cross-Device Sync

Activate only after authentication works:

- `GET /v1/me/preferences`
- `PUT /v1/me/preferences`
- `GET /v1/me/locations`
- `POST /v1/me/locations`
- `DELETE /v1/me/locations/:id`

Done when:

- A user can sign in, save a place, change preferences, sign out, sign back in, and recover the same data.
- The same account syncs across two devices.
- Different accounts on the same phone do not leak data between each other.

## Track C: Paid Subscription Readiness

Goal: enable paid tiers only after accounts and sync are stable.

### C1. Product And Entitlement Design

Start simple:

- One entitlement: `omniwx_plus`.
- One subscription family: OMNIwx Plus.
- Monthly and annual billing choices.

Avoid creating many niche plans before launch.

Done when:

- Free user experience still feels useful.
- Plus value is clear and not just "everything that used to be free."
- Backend premium routes are designed to verify entitlements server-side.

### C2. RevenueCat And Store Setup

Sequence:

1. Create RevenueCat project.
2. Add Android app.
3. Create `omniwx_plus` entitlement.
4. Create Google Play subscription/base plans.
5. Connect Google Play to RevenueCat.
6. Integrate RevenueCat SDK in a development/internal-testing build.
7. Add purchase, restore, status, cancellation, loading, and error states.

Rules:

- Do not put RevenueCat secret keys in the app.
- Do not trust app-supplied premium status.
- Test through Google Play closed testing and RevenueCat sandbox/test flows.

Done when:

- Purchase and restore work.
- Canceled, expired, renewed, interrupted, refunded, and no-network states are tested.
- Worker-side premium endpoints check trusted identity and entitlement.

## Track D: Radar And Storm Scope Product Quality

Goal: make radar a product strength without blowing up R2, Worker requests, or GitHub Actions usage.

### D1. MRMS Broad Radar

Current direction:

- MRMS-auto is the US beta broad-radar default.
- RainViewer stays warm as fallback.
- Worker-served MRMS tiles remain safest while sparse empty-tile handling is still important.
- R2 storage remains rolling and bounded.
- Applied MRMS workflows record a bounded storage trend so we can verify cleanup is stabilizing instead of silently accumulating objects.

Done when:

- US beta users see useful MRMS broad radar when MRMS is healthy.
- RainViewer fallback works when MRMS is stale, warming, missing, or outside scope.
- Retention cleanup prevents accidental archive growth.
- Storage stays below the approved beta ceiling.
- MRMS history is long enough to feel useful without pretending we have commercial-grade global radar yet.

### D2. Storm Scope Redesign

Goal: make Storm Scope the dedicated storm-chaser and advanced radar workspace.

Non-negotiables:

- Storm Scope must never unexpectedly move, lock, recenter, zoom, or fight the map camera.
- Product switches must preserve camera and playback state where technically possible.
- The previous radar image should remain visible while the next product/frame loads.
- No invented meteorological values. Hide unavailable beam height, tilt, storm motion, hail, or rotation unless we can calculate/retrieve them reliably.

Phase 1 deliverables:

- Compact Storm Scope HUD.
- Minimized HUD state.
- Persistent product strip: `REFL`, `VEL`, `LVEL`, `SRV`, `CC`, `ZDR`, `ET`, `VIL`.
- Product-aware compact legend.
- Tactical quick controls for warnings, rings, sites, and lightning when supported.
- Bottom-sheet radar console replacing the large always-open panel.
- Tighter playback dock with clearer `LIVE` and `HISTORY` states.
- Loading, stale, unavailable, and radar-site-unavailable states.

Phase 2 deliverables:

- Better nearby-radar picker.
- Manual selected-site model versus automatic suggested-site model.
- Non-blocking better-radar suggestions.
- Improved range-ring behavior.
- Valid tilt, distance, bearing, and site-status display where available.

Phase 3 deliverables:

- Inspect/crosshair mode only with validated sampled data.
- Product A/B comparison state.
- Beam height only with validated geometry.
- Pinned/favorite products after account persistence exists.

Done when:

- Storm Scope opens with a compact HUD and leaves the map dominant.
- `REFL`, `VEL`, `SRV`, and `CC` are reachable with one tap.
- Legend, product label, timestamp, and visible raster stay synchronized.
- Pinch, pan, zoom buttons, playback, product switching, and site switching work in any order without camera snapback.
- Unavailable products explain why they are unavailable.
- Debug logging is development-only.

## Track E: App Polish And Release Trust

Goal: fix issues users feel immediately before broader promotion.

Priority items:

- Error boundary and user-visible reset/retry path.
- Storm cones and clearer NHC explanations.
- Legend consistency across radar, fire, aviation, marine, and satellite layers.
- Fire consistency, including duplicate event labels.
- Countrywide fire restrictions.
- True Color, Clouds, and Infrared alignment with radar playback.
- Land/Hourly background-video preload so the wrong condition video does not flash.
- Better model-selection toggle.
- UI consistency pass.
- Update user guide, store screenshots, and website.
- Android Auto performance pass.
- Ambient weather station integration.
- Astronomy hourly slider with sky score and cloud percentages.

Done when:

- Internal testers can use core flows without raw backend errors, blank radar confusion, or obvious visual mismatch.
- Store listing screenshots match the current app.
- User-facing docs explain source limits honestly.

## Track F: Operations, Backup, And Scale

Goal: know what happens when things fail.

Required policies:

- Backup strategy.
- Retention policy.
- Business continuity plan.
- Cache validation.
- Cache stampede protection.
- Multi-layer coherence.
- Event-driven invalidation where it materially helps.

Cache mental model:

- Edge/CDN cache: fastest and short-lived.
- Shared cache such as Redis: coordination and hot data if/when needed.
- Durable storage/database: source of record.

Current Redis stance:

- Do not add Redis yet unless we have a specific coordination problem Cloudflare cache/D1/R2 cannot handle cleanly.
- Revisit Redis for entitlement/session hot paths, cache stampede prevention, or shared job coordination only when actual scale pressure appears.

Done when:

- We can answer what data is backed up, how often, how long it is retained, and how to restore.
- We know which cached layer is authoritative for each major data type.
- Failed upstreams degrade gracefully instead of causing raw errors or broken UI.

## Recommended Build Order

### Now

1. Complete secrets audit and remediation.
2. Add Worker security foundation.
3. Add backend security docs and D1 schema/migration groundwork.
4. Continue MRMS-auto validation and retention cleanup.
5. Fix user-visible error boundary/reset path.

### Next

1. Build Storm Scope Phase 1 UI extraction/redesign.
2. Improve NHC/storm-cone clarity.
3. Fix fire duplicate labels and legend consistency.
4. Add backup/retention/BCP docs.
5. Verify production release path remains boring.

### Later

1. Create Clerk development app.
2. Add account login.
3. Add cross-device saved locations and preferences.
4. Create RevenueCat project and Google Play subscription.
5. Add server-side entitlement enforcement.
6. Add more MRMS products.
7. Add local NEXRAD specialty renderer only after MRMS broad radar is stable.

## Definition Of Done For This Plan

This plan is done when:

- Existing users do not lose working weather/radar behavior.
- Backend errors are safe, structured, and traceable by request ID.
- Secret handling is documented and verified.
- D1/account/subscription architecture is prepared without prematurely enabling billing.
- MRMS-auto and RainViewer fallback are stable enough for internal testing.
- Storm Scope has a clear implementation path and acceptance criteria.
- Backup, retention, and recovery responsibilities are explicit.
- The full release path is documented, repeatable, and followed for production builds.
