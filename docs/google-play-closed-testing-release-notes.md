# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.163**
Android version code: **10180**
Track: **Closed testing / internal testing candidate**
Date: **July 1, 2026**

## Play Console Paste Notes

This build focuses on RainViewer national mosaic playback stability. The mosaic now keeps the last good RainViewer frame list if a timeline refresh fails, so transient provider/network errors should no longer make the radar layer flash away.

RainViewer timeline refreshes also preserve the nearest currently displayed timestamp instead of resetting playback to the first frame. Crossfade slots are no longer reset during normal RainViewer timeline refreshes, which should reduce blinking and make the mosaic animation advance more naturally.

Storm Scope behavior is unchanged in this build: local radar products should still block the national mosaic underneath them, while normal broad radar views use the RainViewer mosaic.

## Tester Notes

Please focus testing on broad RainViewer mosaic animation. The important expectation is that the national mosaic keeps animating forward, does not jump back to the first frame during timeline refresh, and does not flash away when RainViewer has a short fetch hiccup.

### What Changed

- Preserve the last good RainViewer frame list when a refresh fails.
- Preserve the nearest displayed RainViewer timestamp when the timeline updates.
- Avoid resetting RainViewer crossfade slots during normal timeline refresh.
- Keep Storm Scope/local radar behavior unchanged.

### What To Test

- Open Maps at national scale and confirm the RainViewer national radar mosaic appears.
- Let the mosaic play through multiple frames and confirm it advances instead of repeatedly jumping to frame one.
- Watch for several minutes and confirm the mosaic does not flash away during provider refresh.
- Toggle Storm Scope on and confirm the broad mosaic is still not visible underneath local radar.
- Toggle Storm Scope off and confirm the broad RainViewer mosaic returns.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope remains a local NEXRAD workstation toggle, not a forced camera view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.163`
- Android version code: `10180`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
