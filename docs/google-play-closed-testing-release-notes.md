# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.139**
Android version code: **10156**
Track: **Closed testing / internal testing candidate**
Date: **June 29, 2026**

## Play Console Paste Notes

Maps animation controls are cleaner: recording now lives beside play, rewind, and fast-forward as a red record-dot button. Wind-flow particles are denser, so animated 10 m winds look more continuous and less scattered. Timeline control symbols were simplified for more reliable Android rendering.

## Tester Notes

This build is a focused Maps usability pass.

### What Changed

- Moved map animation recording into the playback control row next to play, rewind, and fast-forward.
- Replaced the worded **Record** pill with a compact red record-dot button.
- Increased animated 10 m wind-particle density and the particle cap so wind streaks sit closer together.
- Replaced fragile timeline playback glyphs with stable text controls to avoid symbol rendering problems on Android.
- Kept the existing MP4 export pipeline and output location unchanged.

### What To Test

- Open Maps with radar enabled and confirm the red record-dot button appears in the same row as playback controls.
- Tap the red record-dot button and confirm MP4 export still saves to `Movies/OMNIwx`.
- Enable 10 m wind particles and confirm the streaks appear closer together without making Maps sluggish.
- Test play, pause, rewind, fast-forward, and scrub controls on radar and satellite loops.
- Confirm normal layer controls, map panning, locate, and zoom buttons still behave normally.

### Known Watch Areas

- Wind particles should feel denser, but not so dense that lower-end devices stutter.
- MP4 export can still take time for high-resolution radar/satellite loops.
- If a map loop flashes, stalls, or exports missing frames, include the active layers and whether wind particles were enabled.

## Internal Release Checklist

- App version: `1.1.139`
- Android version code: `10156`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
