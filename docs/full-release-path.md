# Full Release Path

This is the standard OMNIwx release path as of August 13, 2026.

It exists to prevent one easy mistake:

- uploading an internal-testing AAB that still points at a dev backend

Because OMNIwx can only be fully validated through Google Play internal testing, the internal-testing release should be treated as the real staging gate. That means backend and app environment choices must be deliberate.

## Environment Roles

- `dev`
  - Used for active worker/infrastructure development.
  - Safe place for experimental D1/R2/cron changes.
  - Can back local verification and throwaway internal builds only.
- `production`
  - Used for tester-facing and release-candidate app builds.
  - Must be explicitly deployed.
  - Must be the backend target for any AAB uploaded to internal testing unless there is an intentionally separate staging backend later.

## Current Rule

OMNIwx now resolves its backend target at build time.

That resolution comes from:

- `OMNIWX_API_ENV`
- EAS build profile environment variables
- [app.config.js](C:/Users/andym_au640pp/weather-app/app.config.js)

If the AAB is going to testers, the resolved environment must be `production`, not `development`.

## Hard Rules

- Never deploy to production implicitly.
- Always use explicit production worker commands.
- Never upload a tester build that points at dev.
- Always verify worker bindings in deploy output before moving on.
- Always verify both backend control-plane and data-plane behavior after production deploy.
- Always build the AAB only after the matching production backend is live.

## Full Release Path

### 1. Finish The Change In Dev

Do all worker, app, D1, and R2 work in dev first.

Examples:

- deploy worker changes to top-level/dev
- validate new routes
- verify D1 and R2 posture
- run app and backend checks locally

Typical checks:

```powershell
npx tsc --noEmit
```

```powershell
cd omniwx-api
npm test -- --run
```

### 2. Verify The Dev Behavior Thoroughly

Before promoting anything, verify the actual behavior you changed.

Examples:

- `/v1/radar/backend/status` returns healthy values without doing default D1 reads
- live tile or API probes show the expected source/header behavior
- app flows most likely to regress still behave normally

For radar/infrastructure work, verify both:

- control plane
  - status route, manifest/timeline posture, bindings, retention, D1 read/write guardrails
- data plane
  - real tile fetches, real timeline responses, real headers

### 3. Prepare The Release Metadata

Update the release surfaces together:

- [package.json](C:/Users/andym_au640pp/weather-app/package.json)
- [app.json](C:/Users/andym_au640pp/weather-app/app.json)
- [android/app/build.gradle](C:/Users/andym_au640pp/weather-app/android/app/build.gradle)
- [docs/google-play-closed-testing-release-notes.md](C:/Users/andym_au640pp/weather-app/docs/google-play-closed-testing-release-notes.md)

Keep these aligned:

- app version
- Android version code
- build label
- release notes summary

Docs are part of the release surface. If behavior, infrastructure posture, testing instructions, or user-facing capability changed, update the relevant docs in the same release slice before building the AAB.

At minimum for radar/infrastructure releases, check:

- [docs/google-play-closed-testing-release-notes.md](C:/Users/andym_au640pp/weather-app/docs/google-play-closed-testing-release-notes.md)
- [docs/radar-phase-done-checklist.md](C:/Users/andym_au640pp/weather-app/docs/radar-phase-done-checklist.md)
- [docs/mrms-owned-radar-plan.md](C:/Users/andym_au640pp/weather-app/docs/mrms-owned-radar-plan.md)
- [docs/cloudflare-radar-storage-rollout.md](C:/Users/andym_au640pp/weather-app/docs/cloudflare-radar-storage-rollout.md)

If none of those docs need a change, say that explicitly in the release notes or commit message so the omission is intentional.

### 4. Promote The Worker To Production

Do not assume the last deploy was prod.

Preferred path: use the manual GitHub Action so production deploys do not depend on local WSL.

1. Open GitHub Actions.
2. Select `Deploy Cloudflare Worker`.
3. Run workflow with:

- `target_env=production`
- `smoke_base_url=https://omniwx-api-production.omniwx.workers.dev`
- `message=<short release note>`

The workflow type-checks the Worker, deploys with `--env production --keep-vars`, and smoke-tests `/v1/health` plus `/v1/radar/backend/status`.

Required GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional MRMS direct-tile cutover:

- After the public R2 tile domain is attached, run GitHub Actions -> `Configure Worker Variables`.
- Use `target_env=production`.
- Set `mrms_public_tile_base_url` to the HTTPS R2 tile origin, for example `https://radar-assets.omniwx.com`.
- The workflow writes `MRMS_PUBLIC_TILE_BASE_URL` as a normal Worker environment variable, verifies `/v1/radar/backend/status` reports `publicTileDeliveryEnabled=true`, confirms the MRMS timeline emits `public-r2` templates, and smoke-tests a direct public PNG tile.

Fallback path: if GitHub Actions is unavailable and WSL is healthy, use an explicit production deploy command from `omniwx-api/`:

```powershell
wsl bash -lc 'cd /mnt/c/Users/andym_au640pp/weather-app/omniwx-api && node ./node_modules/wrangler/bin/wrangler.js deploy --env production --keep-vars --message "your release message"'
```

Then confirm the deploy output shows the production bindings you expect, for example:

- `env.DB (omniwx-prod)`
- `env.RADAR_ASSETS (omniwx-radar-assets-prod)`

### 5. Verify Production Before Building The AAB

This is the most important release gate.

Verify the production worker directly before building the app artifact.

Examples:

- production status route is healthy
- production tile or API probes return expected behavior
- the production backend is serving the data path needed by the release

If the backend is wrong, stop here and fix it before building.

### 6. Confirm The App Resolves To Production

Before building the AAB, verify the resolved Expo config points at the intended production API.

Check:

```powershell
$env:OMNIWX_API_ENV='production'
$env:EXPO_PUBLIC_API_BASE='https://omniwx-api-production.omniwx.workers.dev'
$env:EXPO_PUBLIC_OMNIWX_API_BASE='https://omniwx-api-production.omniwx.workers.dev'
$env:EXPO_PUBLIC_MRMS_RADAR_PREVIEW='1'
npx expo config --json
```

Confirm:

- `extra.apiEnvironment` is `production`
- `extra.apiBaseUrl` is `https://omniwx-api-production.omniwx.workers.dev`

If the resolved config is wrong, do not build the release AAB yet.

Also confirm the native Android Gradle metadata matches the release. Google Play reads
the native bundle metadata, not just `app.json`.

```powershell
Select-String -Path android/app/build.gradle -Pattern 'versionCode|versionName'
```

Confirm:

- `versionCode` matches `expo.android.versionCode` in `app.json`
- `versionName` matches `expo.version` in `app.json`

### 7. Build The Release AAB

Run the production-targeted release build:

```powershell
npm run build:android:prod
```

Artifact:

- [android/app/build/outputs/bundle/release/app-release.aab](C:/Users/andym_au640pp/weather-app/android/app/build/outputs/bundle/release/app-release.aab)

### 8. Upload To Internal Testing

Internal testing is the real end-to-end staging gate for OMNIwx.

That means this upload should represent:

- the production backend you intend to test
- the exact app build wired to that backend
- the release notes and tester asks for this slice

### 9. Validate Through Internal Testing

Use internal testing to validate what cannot be proven locally.

Examples:

- app behavior on real devices
- Play-distributed release behavior
- end-to-end map/radar behavior after install/update
- regression checks for high-sensitivity features like Astro and Maps

### 10. Only Then Consider Wider Release

If internal testing passes, the same backend/app pairing becomes the candidate for wider rollout.

## Release Checklist

- Dev work validated locally
- Worker tests passed
- TypeScript passed
- Versions/docs bumped
- Release notes and affected docs updated or explicitly marked unchanged
- Worker explicitly deployed to production
- Production bindings confirmed
- Production backend probes passed
- `npx expo config --json` confirmed production resolution
- Release AAB built
- Internal-testing notes updated
- Commit pushed after the release slice is coherent

## Anti-Patterns

- Deploying worker changes without knowing whether the target was dev or prod
- Building the AAB first and planning to fix backend later
- Uploading an internal-testing build that still points at dev
- Treating internal testing as disposable when it is actually the only real end-to-end gate
- Changing app and backend separately without verifying the pair

## Build Targets

The app now has explicit Android bundle commands:

- `npm run build:android:dev`
- `npm run build:android:prod`

Use the production command for any internal-testing AAB you intend to trust.
