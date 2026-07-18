# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.223**
Android version code: **10240**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build adds an on-screen map diagnostics recorder so we can capture exactly what changes between a normal pinch, a zoom-button tap, and the next pinch attempt. It is intended to expose whether MapLibre gesture state, settled region callbacks, or another camera signal changes only after the zoom buttons are used.

## Tester Notes

Please focus testing on the pinch-versus-zoom-button handoff:

- Tap the new `REC` chip on the map, reproduce the issue, tap `Copy`, and paste the diagnostics log back into the bug thread.
- Confirm pinch zoom still feels normal before any zoom-button tap.
- Confirm tapping `+` or `-` still changes only camera zoom and does not wake Storm Scope, radar refresh, or other radar-scope behavior by itself.
- Confirm whether the first pinch after a zoom-button tap still feels like the map is reacting to each finger separately instead of treating the motion as a single pinch gesture.
- Confirm whether any force-centering, snap-back, or drift appears after the zoom-button tap.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm no new regressions were introduced in ordinary map taps or button zoom behavior.

## Internal Release Checklist

- App version: `1.1.223`
- Android version code: `10240`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
