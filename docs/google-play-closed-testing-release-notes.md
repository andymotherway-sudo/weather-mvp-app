# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.219**
Android version code: **10236**
Track: **Closed testing / internal testing candidate**
Date: **July 17, 2026**

## Play Console Paste Notes

This build hardens the map wrapper itself against the remaining post-button pinch conflict. Once a real user gesture begins, the renderer now marks that gesture immediately and ignores overlapping non-user camera callbacks until the gesture settles. That should stop any leftover button-zoom camera updates from continuing to rewrite map state underneath a live two-finger pinch.

## Tester Notes

Please focus testing on post-button pinch stability:

- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Confirm the map no longer reacts to each finger as separate pan inputs after a button zoom.
- Confirm a two-finger pinch remains authoritative even if a zoom-button camera update had just finished moments before.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm radar remains visually stable during an active pinch with no obvious snap-back while two fingers are on the screen.
- Confirm no new regressions were introduced in ordinary map taps or button zoom behavior.

## Internal Release Checklist

- App version: `1.1.219`
- Android version code: `10236`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
