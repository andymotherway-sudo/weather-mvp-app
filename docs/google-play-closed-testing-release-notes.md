# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.194**
Android version code: **10211**
Track: **Closed testing / internal testing candidate**
Date: **July 10, 2026**

## Play Console Paste Notes

Backend foundation update. This build prepares OMNIwx for future paid-user features by adding safer Worker request handling, health checks, reserved account routes that fail closed, and a repaired Cloudflare Worker test harness. No paid features are enabled yet.

## Tester Notes

Please focus normal app testing on existing weather, maps, widgets, and navigation behavior. Account/subscription routes are backend-only placeholders and should not change the mobile experience.

### What Changed

- Added Worker health responses at `/health` and `/v1/health`.
- Reserved future account routes behind safe `NOT_IMPLEMENTED` responses.
- Added request IDs and security headers to Worker responses.
- Repaired Cloudflare Worker Vitest runtime tests.

### What To Test

- Confirm current weather and existing tabs still load normally.
- Confirm maps, widgets, and Android Auto still behave as before.
- Confirm there are no new login prompts or paid gates.

## Internal Release Checklist

- App version: `1.1.194`
- Android version code: `10211`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
