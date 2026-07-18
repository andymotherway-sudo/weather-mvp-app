# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.221**
Android version code: **10238**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build goes one step deeper on the zoom-button isolation work. In addition to separating button zoom from Storm Scope thresholds and radar-scope mode changes, button-driven camera updates no longer trigger local radar refreshes or radar renderer zoom-dependent reconfiguration. That means `+` and `-` should now act as pure camera zoom controls instead of waking extra radar behavior behind the scenes.

## Tester Notes

Please focus testing on whether the zoom buttons are now truly zoom-only:

- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Confirm tapping `+` or `-` changes only camera zoom and does not wake Storm Scope, radar refresh, or other radar-scope behavior by itself.
- Confirm the map no longer reacts to each finger as separate pan inputs after a button zoom.
- Confirm a two-finger pinch remains authoritative after a button zoom and feels the same as it does before touching the buttons.
- Confirm the radar rendering itself does not subtly change mode, sharpness behavior, or preload behavior just because a zoom button was tapped.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm radar remains visually stable during an active pinch with no obvious snap-back while two fingers are on the screen.
- Confirm no new regressions were introduced in ordinary map taps or button zoom behavior.

## Internal Release Checklist

- App version: `1.1.221`
- Android version code: `10238`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
