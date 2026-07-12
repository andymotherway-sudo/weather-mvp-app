# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.205**
Android version code: **10222**
Track: **Closed testing / internal testing candidate**
Date: **July 12, 2026**

## Play Console Paste Notes

Fixes a Maps regression where Storm Scope could latch to a radar station and resist turning off. Zoom buttons are restored as camera-only controls: they zoom the current map view without recentering the user, changing radar sites, or forcing Storm Scope state.

## Tester Notes

Please focus testing on Maps:

- Turn Storm Scope on and off repeatedly; it should not stick on.
- Use zoom buttons and pinch gestures; the map should never snap back to the active location.
- Confirm the current smooth RainViewer mosaic behavior remains intact.
- Zoom into station radar and back out; station controls should not appear unless Storm Scope is active.

## Internal Release Checklist

- App version: `1.1.205`
- Android version code: `10222`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
