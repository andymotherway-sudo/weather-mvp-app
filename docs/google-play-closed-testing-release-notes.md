# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.263**
Android version code: **10280**
Track: **Closed testing / internal testing candidate**
Date: **October 18, 2026**

## Play Console Paste Notes

Makes wxLab substantially more information-dense, removes the Land-page Forecast Nuance card, fixes Almanac pull-to-refresh, and restores verified live animated GeoColor through the private production renderer. GeoColor stays visible while the local animation cache is preparing, avoiding a blank map between valid frame load and native map paint.

## Tester Notes

Please focus testing on wxLab, Almanac, and Maps:

- In Land wxLab, verify the denser cells remain readable and tappable with default and increased Android font/display scaling.
- In Almanac, pull down to refresh and verify the updated state changes for forecast, normals, selected-day context, and records.
- In Maps, select GeoColor. It must show verified live GeoColor frames and animate when multiple fresh frames are available. While the local animation cache initializes, the visible live raster must remain on screen rather than going blank.
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
- GeoColor frames now come from the private production renderer through Cloudflare Access federation. The app does not substitute infrared or a daily still image if that verified live source is unavailable.
- Radar publisher and watchdog schedules remain disabled or fail closed; this release does not enable radar publishing.
