# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.224**
Android version code: **10241**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build removes the temporary map diagnostics UI and keeps the zoom-button fix only. The `+` and `-` controls now reset the map the same way the `My Location` action was restoring pinch control, but they stay anchored to the current map center and only apply the requested zoom step.

## Tester Notes

Please focus testing on post-button pinch behavior:

- Confirm the temporary diagnostics controls are no longer visible on the map screen.
- Confirm tapping `+` or `-` still zooms the map smoothly and stays centered on the current view.
- Confirm pinch zoom still feels normal before using the zoom buttons.
- Confirm pinch zoom still feels normal after using the zoom buttons once or multiple times.
- Confirm the map no longer behaves like it is trying to follow both fingers separately after a button zoom.
- Confirm the `My Location` button still works normally and does not introduce any new map reset oddities.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm Storm Scope and radar behavior remain unchanged aside from the zoom-button handoff fix.

## Internal Release Checklist

- App version: `1.1.224`
- Android version code: `10241`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
