# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.242**
Android version code: **10259**
Track: **Closed testing / internal testing candidate**
Date: **August 8, 2026**

## Play Console Paste Notes

This build advances the owned MRMS radar preview and fixes wildfire perimeter reliability. MRMS preview now uses the production Worker tile route so clear-air/missing sparse MRMS tiles return transparent PNGs instead of noisy tile errors, while fresh owned MRMS frames are published to production R2 through the GitHub pipeline. Wildfire perimeter requests are now trimmed and geometry-simplified by viewport so broad wildfire views should load much more reliably on mobile. RainViewer remains the default wide radar source, and MRMS remains opt-in for comparison.

## Tester Notes

Please focus testing on Maps and regression safety:

- Confirm RainViewer remains the default radar source until `MRMS preview` is enabled.
- Confirm enabling `MRMS preview` shows owned MRMS radar where echoes exist and stays visually clean where skies are clear.
- Confirm MRMS timestamps look current and are not shown as future local times.
- Confirm MRMS no longer creates blank/error behavior when panning over clear-air areas.
- Confirm disabling `MRMS preview` returns to the normal radar path.
- Confirm Storm Scope/local radar products still use the existing local radar controls and are not replaced by MRMS.
- Confirm the Wildfire view loads perimeters/incidents/smoke without hanging or silently disappearing on broad western-US views.
- Confirm wildfire labels/details still show names, acres, containment, source, and update timing where available.
- Confirm Astro map / Sky map still renders after panning and zooming.
- Confirm Land and Hourly still show current conditions and forecast details after refresh/relaunch.
- Confirm this Play build points at the production Worker and does not show dev-only backend behavior.

## Internal Release Checklist

- App version: `1.1.242`
- Android version code: `10259`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: GitHub Actions -> `Deploy Cloudflare Worker`
- Android build: `npm run build:android:prod`
