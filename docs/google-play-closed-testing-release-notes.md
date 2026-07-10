# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.196**
Android version code: **10213**
Track: **Closed testing / internal testing candidate**
Date: **July 10, 2026**

## Play Console Paste Notes

Radar startup refinement. Mosaic radar now starts on the first usable frame, skips empty frame slots instead of stalling, and refreshes the rendered raster source as the visible frame changes. This should make the standard radar loop appear and autoplay more reliably when opening Maps.

## Tester Notes

Please focus testing on Maps radar playback:

- Open Maps with radar enabled and confirm the mosaic loop starts on its own.
- Press play/pause and confirm playback resumes without needing rewind or fast-forward.
- Watch frame transitions for reduced flashing.
- Confirm Storm Scope still opens and closes normally.

## Internal Release Checklist

- App version: `1.1.196`
- Android version code: `10213`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
