# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.165**
Android version code: **10182**
Track: **Closed testing / internal testing candidate**
Date: **July 1, 2026**

## Play Console Paste Notes

This build restores the known-good radar architecture: broad radar uses the RainViewer national mosaic path, while Storm Scope and local NEXRAD use the station radar path.

Storm Scope remains a toggle, but leaving it no longer keeps station radar in the broad mosaic workflow. The radar controller now clears provider handoffs directly again, reducing stale NEXRAD imagery, stuck mosaic playback, and provider cross-contamination.

## Tester Notes

Please focus testing on Maps radar. The expected behavior is: broad zoom shows the RainViewer mosaic, close/storm use local NEXRAD, and Storm Scope can be turned on/off without leaving stale station imagery behind.

### What Changed

- Restore RainViewer as the broad mosaic path.
- Stop routing RainViewer through the buffered radar compositor.
- Restore direct radar playlist clearing on provider handoff.
- Keep advanced product controls limited to Storm Scope/manual station mode.

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

- App version: `1.1.165`
- Android version code: `10182`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
