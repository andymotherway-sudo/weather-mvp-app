# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.146**
Android version code: **10163**
Track: **Closed testing / internal testing candidate**
Date: **June 30, 2026**

## Play Console Paste Notes

This build fixes the Storm Scope control regression from the radar restore pass. Storm Scope controls are visible at broad zoom again, National Radar uses the broad animated mosaic by default, and single-site NEXRAD products are opt-in from the Storm Scope product panel.

## Tester Notes

Please focus testing on Maps radar behavior. The important expectation is that Storm Scope should behave like an overlay/control mode, not a trap: broad zoom should show the national mosaic with Storm Scope controls available, product buttons should opt into local NEXRAD detail, and zooming back out should return to the broad mosaic without camera snap-back.

### What Changed

- Restored national radar as the broad-zoom animated mosaic rather than a selectable station radar product.
- Restored Storm Scope as an in-place radar mode toggle, so it no longer switches the map into a separate forced view.
- Restored Storm Scope product controls at broad zoom instead of hiding them until local NEXRAD zoom.
- Added a Storm Scope `National Radar` choice that returns the mode to the broad animated mosaic.
- Restored NEXRAD station product controls as opt-in single-site products inside Storm Scope.
- Fixed sticky Storm Scope state by redirecting legacy Storm Scope view selection back into the normal radar workflow.
- Fixed broad-zoom Storm Scope so it uses national mosaic unless the user chooses a station product.
- Kept the new zoom buttons, but constrained them to zoom-only camera behavior.
- Moved the nearest-NEXRAD handoff slightly earlier so RainViewer does not show unsupported-zoom messaging before NEXRAD appears.

### What To Test

- Open Land and Hourly and confirm forecast cards still load normally.
- Open Almanac and confirm record building/cached records still progress normally.
- Open Maps at national scale and confirm national radar appears and animates.
- Zoom toward a local area and confirm nearest NEXRAD detail/products are available without camera snap-back.
- Zoom back out and confirm the broad national radar mosaic returns.
- Toggle Storm Scope on/off and confirm it does not trap the map in Storm Scope, force recentering, or hide controls at broad zoom.
- In Storm Scope, choose `National Radar` and confirm the broad animated mosaic returns.
- In Storm Scope, choose base reflectivity, velocity, storm total precip, echo tops, and hail tracks and confirm single-site products appear when available.
- Open Nautical and confirm sea state, tides, wxLab rows, and official forecast unsupported states still render cleanly.
- Open Space and confirm SWPC/DONKI fallback content still loads when available.
- Try Android Auto radar and confirm failures show friendly UI instead of crashing.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope is intentionally a radar mode toggle now, not a separate view. Its controls should stay visible at broad zoom.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.146`
- Android version code: `10163`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
