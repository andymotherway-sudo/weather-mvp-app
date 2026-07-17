# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.217**
Android version code: **10234**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build targets the strongest remaining map gesture theory directly. During a user pinch, the map wrapper no longer commits live zoom changes into React state on every camera tick. Instead it tracks zoom internally during the gesture and only commits the settled zoom once the interaction finishes, which should stop radar and renderer options from reconfiguring while two fingers are still on the glass.

## Tester Notes

Please focus testing on pure pinch zoom behavior:

- Confirm a two-finger pinch no longer makes the map overreact to each fingertip independently.
- Confirm the map no longer tries to pan or follow individual fingers while also zooming.
- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Confirm radar remains visually stable during an active pinch with no obvious layer snapping.
- Confirm ordinary one-finger panning still feels normal after this change.

## Internal Release Checklist

- App version: `1.1.217`
- Android version code: `10234`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
