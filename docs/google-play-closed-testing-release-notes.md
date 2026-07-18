# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.222**
Android version code: **10239**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build targets the remaining “force centering” feel after pinch zoom. Radar fetch anchoring now prefers the user’s actual live map region instead of snapping back to the selected radar-site center during Storm Scope behavior. Combined with the earlier zoom-button isolation work, that should stop the map from feeling like it recenters itself after a pinch settles.

## Tester Notes

Please focus testing on post-pinch recenter behavior:

- Confirm pinch zoom still works cleanly after using the `+` or `-` buttons first.
- Confirm the map no longer feels like it force-centers or snaps back toward the radar site after a pinch zoom settles.
- Confirm a two-finger pinch remains anchored to the user’s chosen view instead of drifting back toward a selected radar-site center.
- Confirm tapping `+` or `-` still changes only camera zoom and does not wake Storm Scope, radar refresh, or other radar-scope behavior by itself.
- Confirm ordinary one-finger panning still feels normal before and after button zooms.
- Confirm radar remains visually stable during an active pinch with no obvious snap-back while two fingers are on the screen.
- Confirm no new regressions were introduced in ordinary map taps or button zoom behavior.

## Internal Release Checklist

- App version: `1.1.222`
- Android version code: `10239`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
