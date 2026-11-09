# Google Play Closed Testing Release Notes

Release: **OMNIwx 1.1.269**
Android version code: **10287**
Track: **Closed testing / internal testing candidate**
Date: **November 8, 2026**

## Play Console Paste Notes

Improves Maps GeoColor playback stability. Preloaded true-color frames now mount offscreen, wait for MapLibre to bind and decode, then switch with an instantaneous no-fade handoff. This removes the flash and apparent first-frame reset that could make the satellite loop look choppy.

## Tester Notes

Please focus testing on wxLab, Almanac, and Maps:

- In Land wxLab, verify the denser cells remain readable and tappable with default and increased Android font/display scaling.
- In Almanac, pull down to refresh and verify the updated state changes for forecast, normals, selected-day context, and records.
- In Maps, select GeoColor and zoom around the Southwest. Imagery should be crisp rather than blocky, and the map must not substitute infrared imagery for GeoColor.
- Let GeoColor load for a 2-hour loop, then scrub and play it. Valid frames should switch without flashing, opacity fading, or resetting to the first frame; if an individual official source frame is unavailable, the app should retain valid imagery rather than blanking the map.
- Force-stop and relaunch the app, then open Maps. The initial map should render without requiring a second app restart.
- Test Infrared separately; thermal imagery must remain labeled Infrared.
- Smoke-test Land, Hourly, Space, Almanac, Maps, and Astro after update/relaunch.

## Internal Release Checklist

- App version: `1.1.269`
- Android version code: `10287`
- Intended backend environment: `production`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `npm run build:android:prod`
- Before Play upload, verify the production Worker and renew `NOAA_NCEI_TOKEN` if records are expected to work.

## Release Verification Notes

- Production Worker fixes were deployed on October 17. The default Worker no longer reports a cron schedule, and production was deployed explicitly.
- The production NOAA CDO credential currently returns `400: The token parameter provided is not valid`. The app now explains this state accurately; renew `NOAA_NCEI_TOKEN` in the production Worker before expecting records to load.
- GeoColor frames now come from the private production renderer through Cloudflare Access federation. It fetches the official 5424px GOES GeoColor source, renders regional map tiles with bilinear sampling, and does not substitute infrared or a daily still image.
- This is an app-only playback release; the existing production Worker and private renderer were verified and no new backend deployment was required.
- Rendering capacity is intentionally bounded to two Cloud Run instances with four concurrent requests each. This preserves app responsiveness while preventing unbounded operations growth.
- Radar publisher and watchdog schedules remain disabled or fail closed; this release does not enable radar publishing.
