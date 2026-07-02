# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.168**
Android version code: **10185**
Track: **Closed testing / internal testing candidate**
Date: **July 2, 2026**

## Play Console Paste Notes

Radar stability pass for Maps. Broad radar remains on the RainViewer mosaic path, while close-range and Storm Scope radar use the local NEXRAD path. Provider, product, zoom, and Storm Scope transitions now preserve the nearest radar timestamp instead of snapping back to the first frame. This also prevents RainViewer frames from falling back into NEXRAD/IEM frame lists while RainViewer data is loading.

## Tester Notes

Please focus testing on Maps radar. Broad zoom should show the RainViewer mosaic, close zoom / Storm Scope should show local NEXRAD, and transitions should not flash or restart at frame one.

### What Changed

- Preserve radar playback position by timestamp during provider and product handoffs.
- Keep RainViewer and NEXRAD/IEM frame lists separated.
- Remove remaining UI actions that forced radar playback back to frame one.

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

- App version: `1.1.168`
- Android version code: `10185`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
