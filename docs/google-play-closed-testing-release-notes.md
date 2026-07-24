# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.235**
Android version code: **10252**
Track: **Closed testing / internal testing candidate**
Date: **July 24, 2026**

## Play Console Paste Notes

This build fixes Phoenix-area local radar showing no visible reflectivity by aligning Storm Scope's default reflectivity product with the owned local radar path, migrating older saved local-radar preferences forward, and keeping the recent owned-radar stability improvements in place.

## Tester Notes

Please focus testing on Phoenix-area local radar visibility and general radar stability:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm national radar context and local radar views still behave the same visually as before this build.
- Confirm zooming into Phoenix/Mesa radar now shows visible reflectivity immediately instead of opening to an empty local-radar view.
- Confirm users upgrading from the previous build no longer reopen Storm Scope on a stale saved local-radar product that renders blank.
- Confirm local radar history still behaves acceptably even when older single-site frames are weak or missing upstream.
- Confirm this Play build behaves like a real production-targeted build and does not show dev-only backend mistakes or missing worker-backed content.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.235`
- Android version code: `10252`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production` and the production API URL before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: `cd omniwx-api && wrangler deploy --env production --keep-vars`
- Android build: `npm run build:android:prod`
