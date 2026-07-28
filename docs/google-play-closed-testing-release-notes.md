# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.237**
Android version code: **10254**
Track: **Closed testing / internal testing candidate**
Date: **July 28, 2026**

## Play Console Paste Notes

This build adds an internal-testing MRMS radar preview toggle backed by the production OMNIwx Worker and a tiny owned NOAA MRMS/R2 tile set. RainViewer remains the default wide radar source, Storm Scope/local NEXRAD products remain on the existing local radar path, and MRMS is manual opt-in for comparison only.

## Tester Notes

Please focus testing on the MRMS preview toggle and regression safety around the existing radar experience:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm the normal radar legend shows an `MRMS preview` toggle when Storm Scope is off.
- Confirm RainViewer remains the default until `MRMS preview` is manually enabled.
- Confirm enabling `MRMS preview` shows the owned MRMS mosaic tile where echoes exist, with no crash or blank-map regression.
- Confirm disabling `MRMS preview` returns to RainViewer behavior.
- Confirm Storm Scope/local radar products still use the existing local radar controls and are not replaced by MRMS.
- Confirm the MRMS preview currently behaves as a latest-frame comparison layer, not a full historical loop.
- Confirm this Play build points at the production Worker and does not show dev-only backend mistakes or missing worker-backed content.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.237`
- Android version code: `10254`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `EXPO_PUBLIC_MRMS_RADAR_PREVIEW=1` before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: `cd omniwx-api && wrangler deploy --env production --keep-vars`
- Android build: `npm run build:android:prod`
