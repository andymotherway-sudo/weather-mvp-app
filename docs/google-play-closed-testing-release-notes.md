# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.251**
Android version code: **10268**
Track: **Closed testing / internal testing candidate**
Date: **September 11, 2026**

## Play Console Paste Notes

Improves storm reports and radar reliability checks for internal testers.

## Tester Notes

Please focus testing on Land wxLab and Maps:

- Confirm Local Storm Reports opens readable official report details from the Storm Recap card.
- Confirm summary tiles like Closest, Latest, Max Wind, and Largest Hail open the report browser when reports exist.
- Confirm Maps still shows MRMS broad radar when healthy and falls back cleanly when owned radar is stale or unavailable.
- Confirm Storm Scope `Owned L3` still shows owned NOAA Level III products for Phoenix, Minneapolis, and Duluth pilot sites when fresh.
- Confirm RainViewer and IEM fallback behavior still works where owned radar is unavailable.
- Confirm Land, Hourly, Astro, and Maps still load normally after update/relaunch.

## Internal Release Checklist

- App version: `1.1.251`
- Android version code: `10268`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required unless Worker code changed.
- Android build: `npm run build:android:prod`
