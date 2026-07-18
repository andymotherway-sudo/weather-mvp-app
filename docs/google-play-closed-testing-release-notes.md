# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.228**
Android version code: **10245**
Track: **Closed testing / internal testing candidate**
Date: **July 18, 2026**

## Play Console Paste Notes

Storm Scope now collapses cleanly, the radar timeline has a `2h / 3h / 5h` range selector again, tropical development areas are tappable with details, and Active Tropical Cyclones is now a standard layer so cones and trackers are easier to find.

## Tester Notes

Please focus testing on the updated map HUD and tropical layers:

- Confirm Storm Scope minimize collapses the full stack, not just the title card.
- Confirm the radar playback dock shows `2h`, `3h`, and `5h` again and changes radar history length.
- Confirm the Storm Scope legend stays compact unless expanded.
- Confirm tropical development areas can be tapped for 2-day and 7-day details.
- Confirm Active Tropical Cyclones is easy to find and shows cones, tracks, and wind fields when active storms exist.

## Internal Release Checklist

- App version: `1.1.228`
- Android version code: `10245`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
