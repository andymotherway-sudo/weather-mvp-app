# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.162**
Android version code: **10179**
Track: **Closed testing / internal testing candidate**
Date: **July 1, 2026**

## Play Console Paste Notes

This build improves Maps radar handoff and Storm Scope product reliability. Radar now holds the last valid frame while switching between broad RainViewer mosaic and local NEXRAD, reducing blank/loading gaps during zoom and provider transitions. Storm Scope still blocks the national mosaic underneath local radar, so users should not see both products stacked together.

The Storm Scope product selector now shows only products OMNIwx can render with the current source: base reflectivity, base velocity, legacy velocity, storm-relative velocity, and echo tops. Echo tops now use the IEM NET latest-tile fallback when scan timelines are unavailable.

Zoom buttons remain zoom-only and should not recenter the map.

## Tester Notes

Please focus testing on radar transitions and Storm Scope products. The important expectation is that broad zoom shows the RainViewer national mosaic, close zooms can hand off to local NEXRAD without a blank gap, Storm Scope does not show the national mosaic underneath local products, and zoom buttons never pull the camera back to the saved/current location.

### What Changed

- Held the last valid radar frame during normal mosaic/NEXRAD handoff until replacement frames are ready.
- Swapped to new radar provider/product frames as soon as they load.
- Kept Storm Scope clearing behavior so the broad mosaic cannot remain underneath local storm products.
- Added the IEM `NET` latest-tile fallback for Echo Tops when scan timelines are unavailable.
- Removed inactive `CC`, `ZDR`, and `VIL` placeholders from the active Storm Scope product selector.
- Kept the selector focused on currently renderable products: base reflectivity, base velocity, legacy velocity, storm-relative velocity, and echo tops.

### What To Test

- Open Maps at national scale and confirm the RainViewer national radar mosaic appears and animates.
- Zoom toward a local area and confirm local NEXRAD/radar rings appear without a blank handoff.
- Zoom back out and confirm the broad RainViewer national radar mosaic returns.
- Toggle Storm Scope on and confirm the broad mosaic is not visible underneath local radar.
- Try every visible Storm Scope product: Base Reflectivity, Base Velocity, Legacy Velocity, Storm Relative Velocity, and Echo Tops.
- Use the `+` and `-` buttons and confirm they only zoom the current map view without recentering or changing radar mode.
- Confirm the map never displays a large "Zoom Level Not Supported" radar tile.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.162`
- Android version code: `10179`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
