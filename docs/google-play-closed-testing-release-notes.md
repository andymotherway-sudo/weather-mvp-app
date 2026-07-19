# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.233**
Android version code: **10250**
Track: **Closed testing / internal testing candidate**
Date: **July 19, 2026**

## Play Console Paste Notes

This build adds build-time backend targeting so OMNIwx release builds resolve the production worker automatically instead of relying on a hand-edited API base, while preserving the owned-radar delivery path already moved behind the OMNIwx worker, D1, and R2.

## Tester Notes

Please focus testing on radar stability and the production-targeted release path:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm national radar context and local radar views still behave the same visually as before this build.
- Confirm zooming into Phoenix/Mesa radar still looks normal and does not introduce missing local tiles or strange station-switching behavior.
- Confirm this Play build behaves like a real production-targeted build and does not show dev-only backend mistakes or missing worker-backed content.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.233`
- Android version code: `10250`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production` and the production API URL before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: `cd omniwx-api && wrangler deploy --env production --keep-vars`
- Android build: `npm run build:android:prod`
