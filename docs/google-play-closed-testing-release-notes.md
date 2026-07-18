# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.220**
Android version code: **10237**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build isolates zoom-button camera changes from radar-scope behavior. The map can still visually zoom from the `+` and `-` controls, but Storm Scope thresholds, provider switching, station rings, and related radar behavior now update only from real user map gestures instead of button-driven camera callbacks. The renderer also reports whether a region change came from a user interaction so the parent can keep those two paths separate.

## Tester Notes

Please focus testing on dumb zoom-button behavior and post-button pinch stability:

- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Confirm tapping `+` or `-` changes only camera zoom and does not wake Storm Scope or other radar-scope behavior by itself.
- Confirm the map no longer reacts to each finger as separate pan inputs after a button zoom.
- Confirm a two-finger pinch remains authoritative after a button zoom and feels the same as it does before touching the buttons.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm radar remains visually stable during an active pinch with no obvious snap-back while two fingers are on the screen.
- Confirm no new regressions were introduced in ordinary map taps or button zoom behavior.

## Internal Release Checklist

- App version: `1.1.220`
- Android version code: `10237`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
