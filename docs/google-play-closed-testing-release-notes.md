# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.254**
Android version code: **10271**
Track: **Closed testing / internal testing candidate**
Date: **September 13, 2026**

## Play Console Paste Notes

Fixes Space navigation so Now, Hourly, Solar Activity, and Mars open focused views instead of one long stacked page.

## Tester Notes

Please focus testing on Space, then smoke-test Land and Maps:

- Confirm Space mode buttons switch cleanly between Now, Hourly, Solar Activity, and Mars.
- Confirm the page scrolls to the top of the selected Space focus and no longer overlaps or lands between sections.
- Confirm low, mid, and high cloud layers still appear in Space overview and selected-hour details.
- Confirm Solar Activity still shows current space weather, alerts, solar wind, imagery, and wxLearn actions.
- Confirm Mars still opens the InSight archive card only when the Mars mode is selected.
- Confirm Maps still shows MRMS broad radar when healthy and falls back cleanly when owned radar is stale or unavailable.
- Confirm Storm Scope `Owned L3` still shows owned NOAA Level III products for Phoenix, Minneapolis, and Duluth pilot sites when fresh.
- Confirm RainViewer and IEM fallback behavior still works where owned radar is unavailable.
- Confirm Land, Hourly, Astro, and Maps still load normally after update/relaunch.

## Internal Release Checklist

- App version: `1.1.254`
- Android version code: `10271`
- Intended backend environment: `production`
- Confirm `npx expo config --json` resolves `extra.apiEnvironment=production`, the production API URL, and `extra.mrmsRadarPreviewEnabled=1` before building.
- Run GitHub Actions -> `Radar health report` against production before upload when available.
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Production worker deploy: not required unless Worker code changed.
- Android build: `npm run build:android:prod`
