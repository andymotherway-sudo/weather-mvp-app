# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.212**
Android version code: **10229**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build packages the follow-up map interaction fix for hands-on testing. The focus is still Maps: radar baseline behavior, Storm Scope handoff, and pinch-to-zoom stability. This release specifically stops streaming live camera region updates back into parent React state during an active gesture, so native two-finger zoom can settle before map-dependent state refreshes run. Wind Particles remain disabled so testing stays centered on radar behavior and general map responsiveness.

## Tester Notes

Please focus testing on Maps:

- Verify standard radar mosaic behavior on first open.
- Confirm Storm Scope can still be entered and exited cleanly.
- Confirm zoom buttons behave like simple zoom controls during normal map use.
- Confirm pinch zoom and map dragging still work right after using the zoom buttons.
- Confirm repeated button taps followed by an immediate pinch or drag still feels natural.
- Confirm a pure two-finger pinch no longer jumps between zoom levels or shifts position unexpectedly.

## Internal Release Checklist

- App version: `1.1.212`
- Android version code: `10229`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
