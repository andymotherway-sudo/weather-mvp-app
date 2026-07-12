# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.204**
Android version code: **10221**
Track: **Closed testing / internal testing candidate**
Date: **July 11, 2026**

## Play Console Paste Notes

Improves the Maps overlay selector with visual layer thumbnails so testers can understand radar, satellite, marine, wildfire, fronts, alerts, water, and wind layers before enabling them. Keeps recent Maps work intact: radar and satellite overlays can remain active together, wildfire perimeters are clearer, and incident clutter is reduced.

## Tester Notes

Please focus testing on Maps:

- Open the Layers sheet and verify recognizable thumbnail previews appear for known layers.
- Enable radar plus infrared/true color/cloud layers and confirm overlays can remain active together.
- Recheck Storm Scope open/close behavior and product selection.
- Check wildfire mode near active fires for cleaner incident labels and more perimeter outlines.
- Spot-check marine, water station, wind particle, alert, and fronts thumbnails for clear meaning.

## Internal Release Checklist

- App version: `1.1.204`
- Android version code: `10221`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
