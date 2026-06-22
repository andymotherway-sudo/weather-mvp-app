# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.122**  
Android version code: **10139**  
Track: **Closed testing**  
Date: **June 22, 2026**

## Short Play Console Notes

OMNIwx Alpha 1.1.122 turns wxLearn into a categorized learning library and refreshes app docs for closed testing. Please test wxLearn search/categories, Land/Hourly/Maps/Space/Nautical/Aviation/Extremes navigation, map performance with radar/satellite/marine/wind layers, widgets after setting a default/current location, Android Auto radar fallback behavior, and Play update recognition.

## Full Tester Notes

This is still an Alpha build. OMNIwx is now much broader than a simple weather app: it includes daily weather, short-term forecasts, climate context, radar and satellite maps, marine data, aviation weather, solar weather, astronomy context, global extremes, widgets, Android Auto, and native MP4 map exports.

### What changed in this build

- wxLearn is now organized like a real library instead of one flat list.
- Learn topics are grouped by Start Here, Land Weather, Comfort, Clouds & Precip, Maps & Radar, Marine, Aviation, Space Weather, Astronomy, and Data & Units.
- Added deeper wxLearn material for:
  - AQI and pollutant drivers.
  - Watches, warnings, advisories, and statements.
  - Thunderstorm risk.
  - Snow level and freezing level.
  - Satellite layers.
  - Radar mosaic versus station radar.
  - Map layer performance.
  - Official marine zones and high seas forecasts.
  - Water stations.
  - Aviation units and SIGMET/AIRMET products.
  - Solar wind density/speed, Earth terminator imagery, CMEs, solar flares, and global source coverage.
- Search now considers topic category context and tags, so users can find material by source area or concept.
- Repo documentation was refreshed for the current Alpha product shape and release workflow.

### Recent Alpha improvements included in this test line

- Improved Solar Wx / Space Weather screen hierarchy.
- Better Earth terminator imagery context.
- More explanatory space-weather topics for SWPC alerts, L1 solar wind, X-ray flux, proton flux, and DONKI-style events.
- More global marine work, including official-zone/high-seas direction and clearer map behavior.
- More subtle marine polygon styling while keeping zone outlines visible.
- Improved radar/satellite animation and export behavior.
- Added wind vectors and early wind-particle map work.
- Improved daily/hourly chart spacing and AQI treatment.
- Improved sun/moon arc behavior and moon timing presentation.
- Reduced widget impact on app responsiveness, with widget loading still an active test area.

### Known areas that need tester attention

- **Widgets**: Some widget types may still show "Open OMNIwx to refresh" until the app has a usable default location/current location cache. Please test adding widgets after opening the app and setting a default place.
- **Android Auto radar**: Radar should fail gracefully instead of crashing or staying stuck. Please test in the vehicle if possible, because head-unit behavior can differ from emulator behavior.
- **Maps performance**: Try maps with radar, satellite, wind, marine, aviation, and wildfire layers. Watch for sluggish scrolling, camera snapping, choppy animation, or heavy battery/heat behavior.
- **Marine zones**: Official polygons should be useful but not visually overwhelming. Please test coastal/offshore areas near the US, Canada, Mexico, Europe, and Australia where data is available.
- **Global coverage**: Some global features are model-backed or source-dependent. Coverage may be stronger in the US than elsewhere. The app should label or handle gaps without pretending all regions are equal.
- **wxLearn links**: Pressable educational links should open a relevant topic. Please report tiles that open the wrong topic, no topic, or a topic that feels too thin.

### What to report

The most useful feedback includes:

- Device model and Android version.
- Whether the app was installed from Internal testing or Closed testing.
- The app version shown by Google Play.
- Screen/tab where the issue happened.
- Steps to reproduce.
- Screenshot or screen recording.
- Whether deleting widgets, disabling a map layer, or changing location affects the issue.

## Internal Release Checklist

- App version: `1.1.122`
- Android version code: `10139`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
