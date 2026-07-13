# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.208**
Android version code: **10225**
Track: **Closed testing / internal testing candidate**
Date: **July 13, 2026**

## Play Console Paste Notes

This build packages the current radar baseline for hands-on testing. The focus is still Maps: mosaic playback, Storm Scope handoff, and the zoom-button interaction path. Wind Particles remain disabled so testing stays centered on radar behavior and general map responsiveness.

## Tester Notes

Please focus testing on Maps:

- Verify standard radar mosaic behavior on first open.
- Confirm Storm Scope can still be entered and exited cleanly.
- Confirm zoom buttons behave like simple zoom controls during normal map use.

## Internal Release Checklist

- App version: `1.1.208`
- Android version code: `10225`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
