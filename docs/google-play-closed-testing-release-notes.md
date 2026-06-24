# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.129**
Android version code: **10146**
Track: **Closed testing / internal testing candidate**
Date: **June 24, 2026**

## Short Play Console Notes

OMNIwx Alpha 1.1.129 makes location changes consistent across every tab, combines the Space observing forecast into one synchronized 72-hour timeline, improves Windy-style flow animation, and expands Maps recording to capture animated wind and layered weather products. This build uses a fresh Android version code for Play/device update recognition.

## Full Tester Notes

This is still an Alpha build. OMNIwx is becoming a weather workstation: daily weather, hourly timing, climatology, radar, satellite, marine, aviation, solar weather, astronomy context, global extremes, wxLearn, widgets, Android Auto, and native MP4 map exports.

### What changed in this build

- Unified active-location behavior across Land, Hourly, Almanac, Maps, Space, Nautical, Aviation, Extremes, and supporting data hooks.
- Location-sensitive requests now clear old-place content and ignore late responses from the previous city.
- Added one synchronized 72-hour astronomy forecast to Space, combining the Sky Score graph and hourly observing cards in a shared horizontal timeline.
- Added daily astronomy summaries with peak observing time, clouds, moon illumination, true-dark duration, wind, moonrise/moonset, Kp forecast, and estimated aurora-viewing context.
- Added SWPC Kp forecast samples to the existing Space Weather summary contract and direct fallback.
- Improved animated 10 m wind flow with curved midpoint advection, better particle reseeding, tapered fading trails, and bright moving heads.
- Increased wind animation smoothness while keeping the effect in the lightweight Skia overlay.
- Expanded native MP4 recording so enabled animated radar/satellite underlays and wind particles can be preserved together.
- Added wind-only MP4 recording for the animated 10 m flow layer.
- Matched exported wind styling to the live map with graded trails and moving particle heads.
- Added **NWS Desk** to Land wxLab using official NOAA/NWS AFD and HWO text products.
- Added a cached worker endpoint for local NWS desk briefings, including WFO, update time, headline, summary, hazards, timing, confidence, and raw AFD/HWO text.
- Cleaned up NWS Desk summaries so repeated AFD/HWO sentences are deduped and leading bulletin dash/bullet noise is removed.
- Reworked the NWS Desk timing area so timing has a full-width block instead of being clipped inside a cramped half-width tile.
- Added **Storm Recap** to Land wxLab using official NOAA/NWS Local Storm Reports for the active forecast office.
- Storm Recap summarizes recent report count, closest report, latest report, strongest wind report, and largest hail report when available.
- Added **Severe Setup** to Land wxLab using official SPC Day 1 categorical, tornado, hail, and wind outlook layers.
- Severe Setup identifies the primary outlook hazard and adds active severe-thunderstorm or tornado watch context where available.
- Added NWS alert lifecycle context so recent alerts can be identified as issued, updated, extended, upgraded, replaced, or cancelled.
- Added **Forecast vs Reality** context using the current NWS forecast period and a fresh nearby official station observation.
- Forecast verification shows station name, distance, observation age, and model/NWS differences without treating one station as the selected location.
- Added a detailed wxLearn topic explaining SPC outlook categories, hazard probabilities, watches, warnings, and limitations.
- Improved GOES true-color and infrared animation staging with warm, previous, and current frames to reduce blank flashes between frames.
- Slowed satellite frame cadence slightly and lengthened eased crossfades for a smoother, less choppy loop.
- Improved animated 10 m wind particles with a persistent runtime, adaptive particle density, and longer speed-sensitive trails.
- Moved AQI chart labels to a quieter right-side scale in daily/hourly wxLab charts so the AQI axis no longer crowds the time labels and selected-hour cursor.
- Reordered the Space tab to lead with **Night Sky Context**, followed by Solar Wx, Earth View, and Mars Weather Archive.
- Renamed the Space header from Solar Wx to **Space Wx** to better reflect the broader screen.
- Added wxLearn topics for Area Forecast Discussion, Hazardous Weather Outlook, Weather Story, Forecast Confidence, and Local Storm Reports.
- Fixed a Maps camera behavior where the map could re-center on the active app location after the user tried to pan elsewhere.
- Maps now only changes camera for explicit actions such as one-time route focus, the locate button, manual radar station selection, or cluster zoom.
- Added an app-to-widget weather cache handoff so opening OMNIwx can refresh native widget weather data even if Android background widget DNS/network fetches fail.
- Widgets now have a better fallback path for current temperature, daily high/low, wind, dew point, humidity, cloud cover, weather code, and radar-card weather context.
- Storm Scope is now visible in the map mode selector instead of being hidden behind nerdy mode.
- Storm Scope now defaults to a stronger operational bundle: radar, alert polygons, recent lightning activity metadata, WPC fronts, and animated 10 m wind particles.
- Lightning wording was adjusted to describe recent lightning activity rather than exact strike-by-strike safety guidance.
- Added Privacy Policy and Support links in Settings.
- Drafted a replacement privacy policy in `docs/privacy-policy.md` for publishing on omni-wx.com.
- Removed unused sensitive Android permissions from the manifest.

### Recent Alpha improvements included in this test line

- wxLearn is organized into a categorized learning library.
- Space Wx now leads with night-sky context and still includes Kp, NOAA G/R/S scales, aurora, L1 solar wind, solar activity, Earth terminator imagery, and SWPC/DONKI context.
- Marine maps include official-zone/high-seas work, buoy/water-station layers, and subtler zone styling.
- Radar and satellite animation/export behavior has been improved.
- Daily/hourly charts have more breathing room and less crowded AQI axis handling.
- Sun/moon arcs and moon timing presentation have been improved.
- Android widgets are being hardened for lower power use and more reliable loading.

### Known areas that need tester attention

- **Widgets**: After installing this build, open OMNIwx once on the Land screen for your desired location, then refresh the widget. Report whether weather values fill in and whether they stay current.
- **NWS Desk / Severe Setup / Storm Recap**: In Land wxLab, verify the cards load for US locations, show reasonable source/update text, and fail quietly when no SPC risk or recent reports exist.
- **Forecast verification**: Compare several locations. Confirm the nearest-station name, distance, age, and differences look plausible and stale observations are not presented as current evidence.
- **Maps camera**: Pan away from the selected city, switch layers, open/close panels, and leave/return to Maps. The map should not snap back unless you tap locate or intentionally select a focused map target.
- **Storm Scope**: Test the Weather and Storm Scope map modes. Storm Scope should feel operational without breaking normal Weather, Nautical, Aviation, Astronomy, or Wildfire modes.
- **Lightning**: This build contains safer layer metadata and mode wiring. Do not treat lightning as exact ground-strike safety guidance.
- **Android Auto radar**: Radar should fail gracefully instead of crashing or staying stuck. Test on real head units where possible.
- **Maps performance**: Try radar, satellite, wind particles, marine zones, aviation hazards, and wildfire layers. Watch for sluggishness, heat, battery drain, or camera snapping.
- **Privacy/support links**: Confirm Settings opens the published Privacy Policy and support contact paths.

### What to report

- Device model and Android version.
- Whether the app was installed from Internal testing or Closed testing.
- The app version shown by Google Play.
- Screen/tab where the issue happened.
- Steps to reproduce.
- Screenshot or screen recording.
- Whether deleting widgets, disabling a map layer, changing location, or opening OMNIwx once affects the issue.

## Internal Release Checklist

- App version: `1.1.129`
- Android version code: `10146`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
