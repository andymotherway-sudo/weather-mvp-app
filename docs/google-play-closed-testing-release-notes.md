# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.164**
Android version code: **10181**
Track: **Closed testing / internal testing candidate**
Date: **July 1, 2026**

## Play Console Paste Notes

This build tightens radar handoff between the RainViewer national mosaic and local NEXRAD Storm Scope. Turning Storm Scope off now clears the local radar handoff cleanly instead of leaving NEXRAD imagery behind the national mosaic.

Radar playback also avoids unnecessary frame-one resets during Storm Scope toggles, location changes, and normal RainViewer timeline refreshes. The buffered mosaic layer now keeps its visible frame while refreshed frames download, reducing flashing and jumpy playback.

## Tester Notes

Please focus testing on Maps radar. The important expectation is that mosaic and local NEXRAD never remain visible at the same time after leaving Storm Scope, and that radar animation keeps advancing without repeatedly jumping back to frame one.

### What Changed

- Clear stale NEXRAD playback when returning to the RainViewer mosaic.
- Avoid frame-zero resets during Storm Scope toggles and radar anchor updates.
- Keep the visible buffered mosaic frame on screen while refreshed frames download.
- Restore RainViewer buffered playback as the broad radar path.

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

- App version: `1.1.164`
- Android version code: `10181`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
