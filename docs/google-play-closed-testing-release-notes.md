# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.169**
Android version code: **10186**
Track: **Closed testing / internal testing candidate**
Date: **July 2, 2026**

## Play Console Paste Notes

Radar correction for Maps. Storm Scope now has one source of truth and can turn off cleanly. Broad radar stays on the RainViewer mosaic path, while close-range and Storm Scope radar stay on the animated NEXRAD tile path. The static WMS image fallback that could show giant "Zoom Level Not Supported" text has been removed from normal radar playback.

## Tester Notes

Please focus testing on Maps radar. Broad zoom should show RainViewer mosaic, close zoom / Storm Scope should show local NEXRAD, and Storm Scope should toggle off reliably.

### What Changed

- Make Storm Scope use `radarTime.stormMode` as the single source of truth.
- Turn Storm view off by returning to normal radar view.
- Disable the static WMS radar image path that could leave stale or unsupported imagery.

### What To Test

- Open Maps at national scale and confirm the RainViewer national mosaic appears and animates.
- Toggle Storm Scope on and confirm local NEXRAD appears without national mosaic clutter underneath.
- Toggle Storm Scope off and confirm the RainViewer mosaic returns without stale local radar imagery.
- Let both radar modes play and confirm transitions do not repeatedly jump back to frame one.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback or leaving stale imagery behind.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.169`
- Android version code: `10186`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
