# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.151**
Android version code: **10168**
Track: **Closed testing / internal testing candidate**
Date: **June 30, 2026**

## Play Console Paste Notes

This build restores the radar behavior testers expected before the original zoom-button regression. Zoomed-out radar returns to the national animated mosaic, zooming in hands off to the nearest local NEXRAD with radar rings, and Storm Scope is back to the pre-zoom radar toggle behavior instead of changing the whole map workflow.

Follow-up fix: the close-zoom NEXRAD threshold is back to the pre-button value, Storm Scope no longer switches into a separate map view, and radar playback state now matches the known-good baseline from before the zoom buttons were added.

## Tester Notes

Please focus testing on Maps radar behavior. The important expectation is that broad zoom shows the national mosaic, close zoom shows the nearest local NEXRAD/radar rings, Storm Scope on shows the local NEXRAD product selector immediately, and Storm Scope off returns to regular radar without forcing the user back to the saved/current location.

### What Changed

- Restored national radar as the broad-zoom animated mosaic.
- Restored automatic close-zoom handoff to nearest local NEXRAD with radar rings.
- Restored Storm Scope as the local NEXRAD workstation: base reflectivity, velocity, storm total precip, echo tops, and hail tracks.
- Removed the accidental `National Radar` entry from the station product selector.
- Fixed sticky Storm Scope state by restoring the pre-zoom radar toggle behavior.
- Removed the separate Storm Scope view-switch path that was disrupting mosaic/local radar handoff.
- Restored the pre-zoom automatic NEXRAD handoff threshold.
- Restored the national mosaic zoom cap so broad radar does not disappear during handoff.
- Restored RainViewer mosaic visibility while overzooming between broad mosaic and local NEXRAD modes.

### What To Test

- Open Land and Hourly and confirm forecast cards still load normally.
- Open Almanac and confirm record building/cached records still progress normally.
- Open Maps at national scale and confirm national radar appears and animates.
- Zoom toward a local area and confirm nearest NEXRAD detail/products are available without camera snap-back.
- Zoom back out and confirm the broad national radar mosaic returns.
- Toggle Storm Scope on and confirm local NEXRAD, radar rings, and the product selector appear immediately.
- Toggle Storm Scope off and confirm the broad national mosaic returns without recentering to the saved/current location.
- In Storm Scope, choose base reflectivity, velocity, storm total precip, echo tops, and hail tracks and confirm single-site products appear when available.
- Confirm the map never displays a large "Zoom Level Not Supported" radar tile.
- Open Nautical and confirm sea state, tides, wxLab rows, and official forecast unsupported states still render cleanly.
- Open Space and confirm SWPC/DONKI fallback content still loads when available.
- Try Android Auto radar and confirm failures show friendly UI instead of crashing.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope is intentionally a local NEXRAD workstation toggle now, not a separate forced camera view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.151`
- Android version code: `10168`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
