# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.211**
Android version code: **10228**
Track: **Closed testing / internal testing candidate**
Date: **July 16, 2026**

## Play Console Paste Notes

This build packages the follow-up map interaction fix for hands-on testing. The focus is still Maps: radar baseline behavior, Storm Scope handoff, and the zoom-button interaction path. This release specifically replaces the button zoom path with a non-flying camera stop so pinch zoom and drag no longer fight the zoom controls immediately after a tap. Wind Particles remain disabled so testing stays centered on radar behavior and general map responsiveness.

## Tester Notes

Please focus testing on Maps:

- Verify standard radar mosaic behavior on first open.
- Confirm Storm Scope can still be entered and exited cleanly.
- Confirm zoom buttons behave like simple zoom controls during normal map use.
- Confirm pinch zoom and map dragging still work right after using the zoom buttons.
- Confirm repeated button taps followed by an immediate pinch or drag still feels natural.

## Internal Release Checklist

- App version: `1.1.211`
- Android version code: `10228`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
