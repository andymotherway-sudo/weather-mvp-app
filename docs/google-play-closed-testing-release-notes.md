# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.195**
Android version code: **10212**
Track: **Closed testing / internal testing candidate**
Date: **July 10, 2026**

## Play Console Paste Notes

Radar playback refinement. Mosaic radar now avoids getting stuck behind its next-frame preload state, and frame blending has been tuned to reduce the bright flash between radar frames. This should make the standard radar loop start and continue more reliably without needing a manual rewind or fast-forward nudge.

## Tester Notes

Please focus testing on Maps radar playback:

- Open Maps with radar enabled and confirm the mosaic loop starts on its own.
- Press play/pause and confirm playback resumes without needing rewind or fast-forward.
- Watch frame transitions for reduced flashing.
- Confirm Storm Scope still opens and closes normally.

## Internal Release Checklist

- App version: `1.1.195`
- Android version code: `10212`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
