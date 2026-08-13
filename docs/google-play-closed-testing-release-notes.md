# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.246**
Android version code: **10263**
Track: **Closed testing / internal testing candidate**
Date: **August 13, 2026**

## Play Console Paste Notes

Fixes Storm Scope local reflectivity visibility while keeping the owned NOAA MRMS preview, production z10 radar tiles, source controls, and wildfire reliability improvements.

## Tester Notes

Please focus testing on Maps and regression safety:

- Confirm wide radar opens as `MRMS auto` in US test locations when MRMS is healthy.
- Confirm the radar buttons can explicitly select `Auto`, `MRMS`, and `RainViewer`.
- Confirm MRMS timestamps look current and are not shown as future local times.
- Confirm MRMS no longer creates blank/error behavior when panning over clear-air areas.
- Confirm MRMS playback feels smoother and less like a hard tile/frame flip when multiple frames are available.
- Confirm MRMS loads production Worker/R2 tiles through z10 inside the US beta footprint.
- Confirm RainViewer fallback appears when MRMS is unavailable, stale, warming, or outside the US beta footprint.
- Confirm Storm Scope can switch between `Auto`, `Mosaic`, and `Local`, and that Mosaic continues to show broad radar while inside Storm Scope.
- Confirm Storm Scope local `HREFL` / `N0B` visibly shows reflectivity in active Phoenix-area weather instead of opening to a blank map.
- Confirm Storm Scope local `HREFL` / `N0B` still reports local radar history where station scan history is available.
- Confirm Storm Scope local velocity can fall back to storm-relative velocity history when base velocity history is unavailable.
- Confirm WMS/latest-image fallback keeps reflectivity visible when local animated station tiles are unreliable.
- Confirm Storm Scope/local radar products still use the existing local radar controls and are not replaced by MRMS.
- Confirm the Wildfire view loads perimeters/incidents/smoke without hanging or silently disappearing on broad western-US views.
- Confirm wildfire labels/details still show names, acres, containment, source, and update timing where available.
- Confirm Astro map / Sky map still renders after panning and zooming.
- Confirm Land and Hourly still show current conditions and forecast details after refresh/relaunch.
- Confirm this Play build points at the production Worker and does not show dev-only backend behavior.

## Internal Release Checklist

- App version: `1.1.246`
- Android version code: `10263`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: GitHub Actions -> `Deploy Cloudflare Worker`
- MRMS maintenance: GitHub Actions -> `MRMS radar maintenance`
- Android build: `npm run build:android:prod`
