# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.213**
Android version code: **10230**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build packages the follow-up map interaction fix for hands-on testing. The focus is still Maps: radar baseline behavior, Storm Scope handoff, and the button-to-pinch zoom handoff. This release specifically makes zoom buttons act like one-shot camera zoom commands without immediately feeding optimistic zoom state or non-user region updates back through React, so the next pinch can take over cleanly. Wind Particles remain disabled so testing stays centered on radar behavior and general map responsiveness.

## Tester Notes

Please focus testing on Maps:

- Verify standard radar mosaic behavior on first open.
- Confirm Storm Scope can still be entered and exited cleanly.
- Confirm zoom buttons behave like simple zoom controls during normal map use.
- Confirm pinch zoom and map dragging still work right after using the zoom buttons.
- Confirm repeated button taps followed by an immediate pinch or drag still feels natural.
- Confirm a pure two-finger pinch no longer jumps between zoom levels or shifts position unexpectedly.
- Confirm using `+` or `-` and then immediately pinching does not cause the map to freak out or fight the gesture.

## Internal Release Checklist

- App version: `1.1.213`
- Android version code: `10230`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
