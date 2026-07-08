# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.189**
Android version code: **10206**
Track: **Closed testing / internal testing candidate**
Date: **July 8, 2026**

## Play Console Paste Notes

Radar playback polish. Radar now auto-starts when a valid mosaic playlist is ready, keeps a warm next-frame tile mounted during close-zoom playback, and uses a softer crossfade so animated radar should no longer require a frame-step tap before it starts.

## Tester Notes

Please focus testing on normal radar mosaic playback, Storm Scope playback, and frame-to-frame flashing.

### What Changed

- Auto-start radar playback when the playlist becomes usable.
- Keep the next radar frame pre-mounted so close-zoom playback can crossfade instead of blanking.
- Hold more of the prior frame during crossfade to reduce visible flashing.

### What To Test

- Open Maps and confirm radar begins animating without pressing fast-forward.
- Let the radar run for several loops and confirm it advances frames without pulsing or blanking.
- Enter and leave Storm Scope and confirm standard radar still plays afterward.

### Known Watch Areas

- Radar providers can still return stale or missing frames; playback should remain armed until valid frames arrive.
- Echo tops and less common station products depend on upstream support and may be hidden or unavailable.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.189`
- Android version code: `10206`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
