# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.145**
Android version code: **10162**
Track: **Closed testing / internal testing candidate**
Date: **June 30, 2026**

## Play Console Paste Notes

This build completes the radar restore after the zoom-control pass. National radar returns as the broad-view mosaic, zooming back out from local NEXRAD returns to that mosaic, Storm Scope can be turned off cleanly, and Storm Scope no longer traps the map in a single-site radar workflow.

## Tester Notes

Please focus testing on Maps radar behavior. The important expectation is that the map should not force the camera to a radar site or active location, national radar should appear at broad zoom, zooming in should reveal nearest NEXRAD detail, and zooming back out should return to the national mosaic.

### What Changed

- Restored national radar as the broad-zoom animated mosaic rather than a selectable station radar product.
- Restored Storm Scope as an in-place radar mode toggle, so it no longer switches the map into a separate forced view.
- Restored NEXRAD station product controls for station/Storm Scope contexts.
- Fixed sticky Storm Scope state by redirecting legacy Storm Scope view selection back into the normal radar workflow.
- Fixed broad-zoom Storm Scope so it uses national mosaic until local NEXRAD detail is appropriate.
- Kept the new zoom buttons, but constrained them to zoom-only camera behavior.
- Moved the nearest-NEXRAD handoff slightly earlier so RainViewer does not show unsupported-zoom messaging before NEXRAD appears.

### What To Test

- Open Land and Hourly and confirm forecast cards still load normally.
- Open Almanac and confirm record building/cached records still progress normally.
- Open Maps at national scale and confirm national radar appears and animates.
- Zoom toward a local area and confirm nearest NEXRAD detail/products are available without camera snap-back.
- Zoom back out and confirm the broad national radar mosaic returns.
- Toggle Storm Scope on/off and confirm it does not trap the map in Storm Scope or force recentering.
- Use the radar product selector and confirm base reflectivity, velocity, storm total precip, echo tops, and hail tracks still appear when available.
- Open Nautical and confirm sea state, tides, wxLab rows, and official forecast unsupported states still render cleanly.
- Open Space and confirm SWPC/DONKI fallback content still loads when available.
- Try Android Auto radar and confirm failures show friendly UI instead of crashing.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope is intentionally a radar mode toggle now, not a separate view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.145`
- Android version code: `10162`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
