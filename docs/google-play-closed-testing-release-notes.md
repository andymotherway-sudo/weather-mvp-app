# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.144**
Android version code: **10161**
Track: **Closed testing / internal testing candidate**
Date: **June 30, 2026**

## Play Console Paste Notes

This build restores the previous radar workflow after the zoom-control pass. National radar is again the broad-view mosaic, local NEXRAD products return when using station or Storm Scope context, Storm Scope behaves as a radar mode instead of forcing a separate map view, and zoom controls remain simple camera controls.

## Tester Notes

Please focus testing on Maps radar behavior. The important expectation is that the map should not force the camera to a radar site or active location, national radar should still appear at broad zoom, and zooming/local Storm Scope use should expose NEXRAD detail without removing the normal radar product picker.

### What Changed

- Restored national radar as the broad-zoom animated mosaic rather than a selectable station radar product.
- Restored Storm Scope as an in-place radar mode toggle, so it no longer switches the map into a separate forced view.
- Restored NEXRAD station product controls for station/Storm Scope contexts.
- Kept the new zoom buttons, but constrained them to zoom-only camera behavior.
- Kept nearest NEXRAD behavior available at local zoom without forcing the user's map position.

### What To Test

- Open Land and Hourly and confirm forecast cards still load normally.
- Open Almanac and confirm record building/cached records still progress normally.
- Open Maps at national scale and confirm national radar appears and animates.
- Zoom toward a local area and confirm nearest NEXRAD detail/products are available without camera snap-back.
- Toggle Storm Scope on/off and confirm it does not trap the map in Storm Scope or force recentering.
- Use the radar product selector and confirm base reflectivity, velocity, storm total precip, echo tops, and hail tracks still appear when available.
- Open Nautical and confirm sea state, tides, wxLab rows, and official forecast unsupported states still render cleanly.
- Open Space and confirm SWPC/DONKI fallback content still loads when available.
- Try Android Auto radar and confirm failures show friendly UI instead of crashing.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope should not become a separate map workflow again unless that is a deliberate future design change.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.144`
- Android version code: `10161`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
