# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.236**
Android version code: **10253**
Track: **Closed testing / internal testing candidate**
Date: **July 25, 2026**

## Play Console Paste Notes

This build widens the live owned local radar footprint for Phoenix-area Storm Scope from the earlier tight starter slice to a broader 90-mile local reflectivity posture, keeps stale `HREFL` sessions from stranding users away from `REFL`, and updates the local radar HUD so users can tell when local owned coverage is narrower than the broader mosaic view.

## Tester Notes

Please focus testing on Phoenix-area local radar visibility, owned local coverage, and general radar stability:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm national radar context and local radar views still behave the same visually as before this build.
- Confirm zooming into Phoenix/Mesa radar now shows a broader local reflectivity footprint that better matches nearby echoes seen in mosaic.
- Confirm users upgrading from the previous build no longer get stranded on stale `HREFL` sessions when `REFL` is the better local path.
- Confirm Storm Scope `REFL` clearly communicates when the owned local coverage footprint is smaller than the broader mosaic context.
- Confirm local radar history still behaves acceptably even when older single-site frames are weak or missing upstream.
- Confirm this Play build behaves like a real production-targeted build and does not show dev-only backend mistakes or missing worker-backed content.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.236`
- Android version code: `10253`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production` and the production API URL before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: `cd omniwx-api && wrangler deploy --env production --keep-vars`
- Android build: `npm run build:android:prod`
