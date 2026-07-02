# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.167**
Android version code: **10184**
Track: **Closed testing / internal testing candidate**
Date: **July 2, 2026**

## Play Console Paste Notes

This build restores more of the older working radar orchestration. Storm Scope no longer uses the sticky route/effect path that could re-enable station radar after being turned off.

The radar controller now matches the older RainViewer and Storm Scope behavior more closely: broad radar stays on the RainViewer mosaic path, while close-range / Storm Scope radar uses the local NEXRAD path with cleaner frame resets.

## Tester Notes

Please focus testing on Maps radar. The expected behavior is: broad zoom shows the RainViewer mosaic, close/storm use local NEXRAD, and Storm Scope can be turned on/off without leaving stale station imagery behind.

### What Changed

- Remove sticky Storm Scope route/effect reactivation.
- Restore the older direct Storm Scope toggle behavior.
- Restore radar frame reset when the radar anchor changes.
- Restore older RainViewer frame clearing and Storm Scope detection.

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

- App version: `1.1.167`
- Android version code: `10184`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
