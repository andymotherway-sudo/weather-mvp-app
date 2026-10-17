# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.263**
Android version code: **10280**
Track: **Closed testing / internal testing candidate**
Date: **October 17, 2026**

## Play Console Paste Notes

Makes wxLab substantially more information-dense, removes the Land-page Forecast Nuance card, fixes Almanac pull-to-refresh, and makes GeoColor honest: it now shows only a verified live animated loop, never a still image or infrared substitute.

## Tester Notes

Please focus testing on wxLab, Almanac, and Maps:

- In Land wxLab, verify the denser cells remain readable and tappable with default and increased Android font/display scaling.
- In Almanac, pull down to refresh and verify the updated state changes for forecast, normals, selected-day context, and records.
- In Maps, select GeoColor. It must animate only when NOAA NESDIS provides multiple fresh GeoColor frames; otherwise it must show an unavailable state rather than infrared or a daily still image.
- Test Infrared separately; thermal imagery must remain labeled Infrared.
- Smoke-test Land, Hourly, Space, Almanac, Maps, and Astro after update/relaunch.

## Internal Release Checklist

- App version: `1.1.263`
- Android version code: `10280`
- Intended backend environment: `production`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `npm run build:android:prod`
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN` if records are expected to work.

## Release Verification Notes

- Production Worker fixes were deployed on October 17. The default Worker no longer reports a cron schedule, and production was deployed explicitly.
- The production NOAA CDO credential currently returns `400: The token parameter provided is not valid`. The app now explains this state accurately; renew `NOAA_NCEI_TOKEN` in the production Worker before expecting records to load.
- NOAA NESDIS `MERGEDGC_Last_24hr` is currently stale and does not provide usable live GeoColor frames. The app intentionally does not substitute imagery while that upstream archive is stale.
- Radar publisher and watchdog schedules remain disabled or fail closed; this release does not enable radar publishing.
