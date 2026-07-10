# OMNIwx Paid-User Architecture Foundation

Last updated: July 2026

This document captures the backend foundation for future paid OMNIwx users. It is intentionally not a production billing launch plan. The current app still runs without accounts, RevenueCat, Clerk, or a required login.

## Current Goal

Prepare the Cloudflare Worker so future account, subscription, and cross-device features can be added without rewriting the weather API.

The first foundation pass adds:

- Shared request context with stable request IDs.
- Structured API errors.
- Security headers on Worker responses.
- Explicit CORS helpers.
- Reserved `/v1/user`, `/v1/devices`, and `/v1/subscriptions` route families.
- Authentication and entitlement placeholders that fail closed.
- Zod validation helpers for future user-controlled inputs.
- D1-ready SQL schema for future users, preferences, saved locations, devices, and subscription entitlements.

## What Is Not Enabled Yet

The following are not active:

- User accounts.
- Login, OAuth, email magic links, or Clerk.
- RevenueCat or Play Billing entitlement sync.
- Cross-device saved locations.
- Server-side user preference storage.
- Live account routes that read or write D1 data.

Reserved account routes currently return a structured `NOT_IMPLEMENTED` response until real auth is connected.

## D1 Provisioning

D1 is now provisioned and bound, but it is not yet serving live account behavior.

- Development database: `omniwx-dev`
- Production database: `omniwx-prod`
- Worker binding name: `DB`
- Default Wrangler binding points to `omniwx-dev`.
- `env.production` binding points to `omniwx-prod`.

Both databases have the current schema from `omniwx-api/src/database/schema.sql`.

## Verification Status

The Worker test harness now runs through Cloudflare's current Vitest integration:

- `vitest.config.mts` uses `defineConfig` from `vitest/config`.
- Worker tests use `cloudflareTest` from `@cloudflare/vitest-pool-workers`.
- Runtime requests are made through `SELF.fetch` from `cloudflare:test`.
- A test-only Bortle lookup fixture keeps the large production Bortle grid out of the Worker test transport while preserving production behavior.

Verified locally:

- `npx tsc --noEmit` passes in `omniwx-api`.
- `npx vitest run` passes in `omniwx-api` under Ubuntu/WSL.
- `/health` and `/v1/health` return successful responses from local Wrangler dev.
- `/v1/user` fails closed with `NOT_IMPLEMENTED`.
- Smoke-test responses include `X-Request-ID`, `X-Content-Type-Options`, and `Referrer-Policy`.

## Worker Layout

The Worker is still served by `omniwx-api/src/index.ts`, but new paid-user infrastructure lives in smaller modules:

- `src/middleware/requestId.ts` creates request context.
- `src/middleware/errorHandler.ts` formats failures safely.
- `src/middleware/authentication.ts` holds the auth boundary.
- `src/middleware/rateLimit.ts` holds the future rate-limit boundary.
- `src/security/cors.ts` centralizes CORS behavior.
- `src/security/headers.ts` applies common safety headers.
- `src/routes/health.ts` exposes `/health` and `/v1/health`.
- `src/routes/user.ts` reserves future account/subscription/device routes.
- `src/validation/schemas.ts` provides reusable Zod input schemas.
- `src/database/schema.sql` defines the future D1 schema.
- `src/database/queries.ts` keeps SQL parameterized.

## D1 Binding

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "omniwx-dev",
    "database_id": "configured-in-wrangler-jsonc"
  }
]
```

Apply or refresh the schema from:

```sh
cd omniwx-api
npx wrangler d1 execute omniwx-dev --remote --file=./src/database/schema.sql
npx wrangler d1 execute omniwx-prod --remote --file=./src/database/schema.sql
```

## Secrets

Current secrets should stay in Cloudflare Worker secrets, not committed files:

```sh
cd omniwx-api
npx wrangler secret put NOAA_NCEI_TOKEN
npx wrangler secret put NASA_API_KEY
npx wrangler secret put NASA_FIRMS_MAP_KEY
```

Future paid-user work will likely add provider secrets for auth and subscription verification. Add those through Wrangler secrets as well.

## Entitlements Direction

The intended model is:

1. App stores purchase state through the chosen billing provider.
2. Worker verifies entitlement state server-side.
3. Worker stores compact entitlement records in D1.
4. Premium API features check entitlements through `services/subscriptions.ts`.

Until that is implemented, all account-gated routes fail closed.

## Operational Rules

- Do not put provider secrets in the mobile app.
- Do not trust client-provided subscription flags.
- Keep weather endpoints public unless a feature explicitly requires a paid entitlement.
- Keep request IDs in every account/billing-related response.
- Prefer Worker-side caching, validation, and normalization for messy external APIs.
- Keep personally identifiable information out of logs.
