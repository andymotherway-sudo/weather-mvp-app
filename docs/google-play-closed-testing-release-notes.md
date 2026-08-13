# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.242**
Android version code: **10259**
Track: **Closed testing / internal testing candidate**
Date: **August 13, 2026**

## Play Console Paste Notes

This build advances the owned MRMS radar beta path and fixes wildfire perimeter reliability. Wide radar now defaults to `MRMS auto` inside the US beta footprint: the app displays owned NOAA MRMS tiles when the MRMS timeline is healthy, while keeping RainViewer warm as a fallback if MRMS is stale, warming, missing, or outside coverage. MRMS still uses the production Worker tile route so clear-air/missing sparse MRMS tiles return transparent PNGs instead of noisy tile errors. Storm Scope now has explicit `Auto`, `Mosaic`, and `Local` source controls so testers can move back to broad radar or force local NEXRAD without relying on zoom heuristics. MRMS playback also uses a smoother app-side animation profile. Wildfire perimeter requests are trimmed and geometry-simplified by viewport so broad wildfire views should load much more reliably on mobile.

## Tester Notes

Please focus testing on Maps and regression safety:

- Confirm wide radar opens as `MRMS auto` in US test locations when MRMS is healthy.
- Confirm the radar toggle can cycle to RainViewer fallback and forced MRMS preview for comparison.
- Confirm MRMS timestamps look current and are not shown as future local times.
- Confirm MRMS no longer creates blank/error behavior when panning over clear-air areas.
- Confirm MRMS playback feels smoother and less like a hard tile/frame flip when multiple frames are available.
- Confirm RainViewer fallback appears when MRMS is unavailable, stale, warming, or outside the US beta footprint.
- Confirm Storm Scope can switch between `Auto`, `Mosaic`, and `Local`, and that `Exit Scope` returns to the broad mosaic path.
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
