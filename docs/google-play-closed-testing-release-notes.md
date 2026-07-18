# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.226**
Android version code: **10243**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build delivers Phase 1 of the Storm Scope redesign. Storm Scope now uses a compact HUD, persistent product strip, tactical quick controls, compact legend, nearby radar selection, and a bottom-sheet console instead of the old bulky panel. The radar product strip was also tightened so button labels map more clearly to the actual products, unavailable products explain themselves, and active product switches visibly show loading progress while the previous radar stays on screen.

## Tester Notes

Please focus testing on Storm Scope product behavior and the new compact radar workspace:

- Confirm Storm Scope opens as a compact HUD instead of the old large product/settings panel.
- Confirm the minimized HUD, persistent product strip, quick controls, compact legend, and bottom-sheet console all remain responsive and do not take control of the map camera.
- Confirm `REFL`, `VEL`, `LVEL`, `SRV`, and `ET` map to the correct product labels and switch reliably while local radar is available.
- Confirm switching products shows visible loading feedback and keeps the previous radar image visible until the requested product is ready.
- Confirm unavailable products such as `CC`, `ZDR`, and `VIL` remain visible but clearly explain why they cannot be used.
- Confirm zoomed-out Storm Scope behaves as mosaic overview and tells the user to zoom closer for local radar products.
- Confirm nearby radar markers and radar selection from the console work without unexpectedly recentering the map.
- Confirm the tighter playback dock still scrubs, plays, pauses, and shows `LIVE` / `HISTORY` state correctly.
- Confirm pinch zoom, pan, zoom buttons, and playback still behave normally before and after interacting with Storm Scope controls.

## Internal Release Checklist

- App version: `1.1.226`
- Android version code: `10243`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
