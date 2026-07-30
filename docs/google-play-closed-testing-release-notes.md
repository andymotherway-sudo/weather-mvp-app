# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.239**
Android version code: **10256**
Track: **Closed testing / internal testing candidate**
Date: **July 30, 2026**

## Play Console Paste Notes

This build advances the owned NOAA MRMS radar preview. The MRMS preview now reads a rolling retained-frame playlist from the production OMNIwx Worker, supports explicit frame tile requests, and includes a z5 latest-frame tile set for better broad-map detail while keeping R2 storage bounded. RainViewer remains the default wide radar source, Storm Scope/local NEXRAD products remain on the existing local radar path, and MRMS is manual opt-in for comparison only.

## Tester Notes

Please focus testing on the MRMS preview toggle and regression safety around the existing radar experience:

- Confirm radar still loads normally on first open and after app relaunch, without blank frames or provider-limit style errors.
- Confirm radar animation still advances smoothly and recent frames look current.
- Confirm the normal radar legend shows an `MRMS preview` toggle when Storm Scope is off.
- Confirm RainViewer remains the default until `MRMS preview` is manually enabled.
- Confirm enabling `MRMS preview` shows the owned MRMS mosaic tile where echoes exist, with no crash or blank-map regression.
- Confirm MRMS preview now has multiple retained frames available in the radar timeline when the production Worker has fresh frames.
- Confirm broad-map MRMS detail looks improved around z5 compared with the previous low-zoom-only proof.
- Confirm disabling `MRMS preview` returns to RainViewer behavior.
- Confirm Storm Scope/local radar products still use the existing local radar controls and are not replaced by MRMS.
- Confirm the MRMS preview remains clearly opt-in and gracefully falls back to the normal radar path if retained MRMS tiles are unavailable.
- Confirm this Play build points at the production Worker and does not show dev-only backend mistakes or missing worker-backed content.
- Confirm the Land home screen still shows current conditions and forecast details correctly after refreshes and app relaunches.
- Confirm favorite place previews and location search still return sensible results without blank/error states.
- Confirm Astro map / Sky map still renders after panning and zooming and does not regress cloud or visibility overlays.

## Internal Release Checklist

- App version: `1.1.239`
- Android version code: `10256`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: `cd omniwx-api && wrangler deploy --env production --keep-vars`
- Android build: `npm run build:android:prod`
