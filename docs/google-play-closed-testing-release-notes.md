# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.203**
Android version code: **10220**
Track: **Closed testing / internal testing candidate**
Date: **July 11, 2026**

## Play Console Paste Notes

Improves Maps compositing and wildfire clarity. Radar, infrared, true color, water vapor, cloud, and precipitation overlays can now stay active together and animate from the shared map timeline instead of disabling each other. Wildfire mode now prefers current official perimeter geometry where available, filters agency-code clutter, and keeps incident dots focused on meaningful active fires.

## Tester Notes

Please focus testing on Maps:

- Open radar before touching controls. It should autoplay and show mosaic data.
- If mosaic is blank or starts only after FF/Rewind, tap `Diag` before pressing anything else.
- If frames flash, jump, or show the wrong timestamp, tap `Diag` immediately after the bad transition.
- In copied diagnostics, check `activeFrameMatchesDominantTemplate` and `sourceKeyUsesActiveFrame`.
- Recheck Storm Scope open/close behavior and product selection.
- Enable radar plus infrared/true color/cloud layers and confirm the overlays can remain active together.
- Check wildfire mode near active fires for cleaner incident labels and more perimeter outlines.

## Internal Release Checklist

- App version: `1.1.203`
- Android version code: `10220`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
