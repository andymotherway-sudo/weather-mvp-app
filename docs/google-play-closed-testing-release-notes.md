# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.140**
Android version code: **10157**
Track: **Closed testing / internal testing candidate**
Date: **June 29, 2026**

## Play Console Paste Notes

Maps controls are safer and less sticky: Storm Scope now turns off cleanly, changing map modes clears Storm Scope state correctly, and the zoom buttons now zoom the current map camera only without forcing the map back to the selected city or GPS location.

## Tester Notes

This build is a focused Maps control stability pass.

### What Changed

- Fixed Storm Scope so it can be turned off from both the Radar and Storm Scope views.
- Switching out of Storm Scope now clears the sticky Storm Scope radar state.
- Reworked the map zoom buttons so they call native camera zoom only.
- Zoom buttons no longer use the saved city, selected place, GPS location, or forecast region as the zoom anchor.
- Kept explicit recentering limited to the location button and intentional feature focus actions.

### What To Test

- Open Maps, enable Storm Scope, then turn it off and confirm the map returns to normal Radar mode.
- Switch from Storm Scope to another map mode and confirm Storm Scope does not remain stuck.
- Pan away from the selected city and use zoom in/out; the map should zoom in place and should not snap back to the city.
- Tap the location button and confirm that explicit recenter still works.
- Confirm normal layer controls, radar playback, map panning, and feature taps still behave normally.

### Known Watch Areas

- The location button is still intentionally allowed to recenter the map.
- Feature focus actions, such as route focus and station radar focus, may still intentionally move the camera.
- If Maps snaps back without tapping locate or a feature, include the active mode/layers and whether Storm Scope was active.

## Internal Release Checklist

- App version: `1.1.140`
- Android version code: `10157`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
