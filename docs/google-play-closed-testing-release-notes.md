# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.253**
Android version code: **10270**
Track: **Closed testing / internal testing candidate**
Date: **September 12, 2026**

## Play Console Paste Notes

Improves Space sky/cloud detail and storm report readability.

## Tester Notes

Please focus testing on Land, Space, and Maps:

- Confirm Local Storm Reports opens readable official report details from the Storm Recap card.
- Confirm summary tiles like Closest, Latest, Max Wind, and Largest Hail open the report browser when reports exist.
- Confirm Space shows Sky Score plus low, mid, and high cloud layers in the overview and selected-hour details.
- Confirm Space tab solar/earth selectors and wxLearn actions still work.
- Confirm Maps still shows MRMS broad radar when healthy and falls back cleanly when owned radar is stale or unavailable.
- Confirm Storm Scope `Owned L3` still shows owned NOAA Level III products for Phoenix, Minneapolis, and Duluth pilot sites when fresh.
- Confirm RainViewer and IEM fallback behavior still works where owned radar is unavailable.
- Confirm Land, Hourly, Astro, and Maps still load normally after update/relaunch.

## Internal Release Checklist

- App version: `1.1.253`
- Android version code: `10270`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required unless Worker code changed.
- Android build: `npm run build:android:prod`
