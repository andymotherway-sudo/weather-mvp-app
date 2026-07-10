# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.197**
Android version code: **10214**
Track: **Closed testing / internal testing candidate**
Date: **July 10, 2026**

## Play Console Paste Notes

Radar startup refinement. Mosaic radar now starts on the first usable frame, advances with a frame-driven scheduler, skips empty frame slots instead of stalling, and refreshes the rendered raster source as the visible frame changes.

## Tester Notes

Please focus testing on Maps radar playback:

- Open Maps with radar enabled and confirm the mosaic loop starts on its own.
- Press play/pause and confirm playback resumes without needing rewind or fast-forward.
- Watch frame transitions for reduced flashing.
- Confirm Storm Scope still opens and closes normally.

## Internal Release Checklist

- App version: `1.1.197`
- Android version code: `10214`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
