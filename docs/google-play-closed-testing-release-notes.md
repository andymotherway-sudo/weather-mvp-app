# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.227**
Android version code: **10244**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

This build sharpens exported MP4 place labels, restores the `2h / 3h / 5h` loop selector when animated satellite layers are active, and keeps radar and satellite products synchronized in mixed loops and video exports. Combined map videos now preserve the active satellite stack instead of dropping to a single product, so combinations like radar plus clouds, true color, or infrared stay aligned.

## Tester Notes

Please focus testing on map animation/export behavior and exported video quality:

- Confirm exported MP4 place labels look sharper and less oversized than the previous build.
- Confirm the `2h`, `3h`, and `5h` loop buttons appear whenever animated satellite layers are active, including when radar is also on.
- Confirm radar plus clouds, radar plus true color, and radar plus infrared scrub and play in tandem from the shared timeline.
- Confirm true color and infrared combinations stay synchronized during live playback and in recorded MP4 exports.
- Confirm mixed satellite exports preserve the visible active layer stack instead of dropping to a single satellite product.
- Confirm timeline playback rate, scrubbing, and recording still work normally after changing the satellite loop length.

## Internal Release Checklist

- App version: `1.1.227`
- Android version code: `10244`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
