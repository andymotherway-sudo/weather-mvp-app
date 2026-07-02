# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.166**
Android version code: **10183**
Track: **Closed testing / internal testing candidate**
Date: **July 2, 2026**

## Play Console Paste Notes

This build keeps the radar restoration work focused. The old `MapRenderer` was compared with the current renderer and matched, confirming that the remaining radar issue is in radar orchestration rather than the map renderer.

The release keeps RainViewer as the broad mosaic path and local NEXRAD for Storm Scope / close-range radar. It also preserves the latest Storm Scope toggle and provider handoff cleanup work for continued tester validation.

## Tester Notes

Please focus testing on Maps radar. The expected behavior is: broad zoom shows the RainViewer mosaic, close/storm use local NEXRAD, and Storm Scope can be turned on/off without leaving stale station imagery behind.

### What Changed

- Confirm current map renderer matches the older working renderer.
- Keep RainViewer as the broad mosaic path.
- Keep local NEXRAD isolated to Storm Scope / close-range radar.
- Continue validating Storm Scope toggle and provider handoff behavior.

### What To Test

- Open Maps at national scale and confirm the RainViewer national mosaic appears and animates.
- Toggle Storm Scope on and confirm local NEXRAD appears without national mosaic clutter underneath.
- Toggle Storm Scope off and confirm the RainViewer mosaic returns without stale local radar imagery.
- Let both radar modes play and confirm they do not repeatedly jump back to frame one.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback or leaving stale imagery behind.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.166`
- Android version code: `10183`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
