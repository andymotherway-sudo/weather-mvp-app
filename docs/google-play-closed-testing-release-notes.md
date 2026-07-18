# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.225**
Android version code: **10242**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build redesigns the map layer selector to reduce scrolling, replaces the large mode cards with a compact Standard/Aviation/Astronomy segmented control, groups overlays into collapsible sections with active-layer counts, and adds a new Active Layers area so opacity and source controls stay close at hand. It also improves atmospheric playback by giving radar and satellite a shared timeline when both are active, adds adjustable loop speed controls, and extends radar frame coverage for the current loop.

## Tester Notes

Please focus testing on the layer-selector hierarchy and atmospheric playback polish:

- Confirm the layer sheet header, Done button, and Standard/Aviation/Astronomy selector stay visible while the list scrolls.
- Confirm Standard mode now groups overlays into Alerts & Forecast Hazards, Radar & Satellite, Fire & Air, and Marine.
- Confirm categories with active overlays auto-expand and show the correct active count in the header.
- Confirm the Active Layers section appears only when overlays are enabled and exposes opacity plus legend/source actions without needing to hunt through the full list.
- Confirm toggles still apply live with no extra Apply step and that existing thumbnails and dark glass styling still feel intact.
- Confirm Astronomy still routes correctly from the segmented control and Aviation still switches the sheet into flight-focused overlays.
- Confirm radar and satellite can play together on one shared timeline when both are active.
- Confirm the playback-speed control changes loop speed cleanly for radar, satellite, and combined atmospheric playback.
- Confirm the expanded radar loop still loads and scrubs smoothly without disturbing existing radar behavior.

## Internal Release Checklist

- App version: `1.1.225`
- Android version code: `10242`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
