# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.132**
Android version code: **10149**
Track: **Closed testing / internal testing candidate**
Date: **June 25, 2026**

## Short Play Console Notes

OMNIwx Alpha 1.1.132 rebuilds animated radar and satellite playback around a buffered, persistent-frame engine to reduce flashing, blank transitions, and animation stalls.

## Full Tester Notes

This is still an Alpha build. OMNIwx is becoming a weather workstation: daily weather, hourly timing, climatology, radar, satellite, marine, aviation, solar weather, astronomy context, global extremes, wxLearn, widgets, Android Auto, and native MP4 map exports.

### What changed in this build

- Added a shared disk-backed playback cache for animated radar and satellite imagery.
- Radar, GOES true color, infrared, water vapor, and east/west visible clouds now prepare viewport frames before displaying them.
- Replaced frame-by-frame source teardown with persistent front/back MapLibre image slots.
- Moved crossfade opacity animation out of full Maps-screen React render loops and into MapLibre animated layers.
- Playback now waits for a small lead buffer and holds the current frame when the next frame is not ready.
- Failed source frames are skipped instead of flashing or stalling the entire loop.
- Panning and zooming retain the last complete image while replacement imagery for the settled viewport downloads.
- Radar and satellite have independent buffered channels so layered Storm Scope workflows can animate both.
- Added adaptive frame dimensions for longer loops and a global download-concurrency limit to reduce memory, bandwidth, and device load.
- Unified record-mode map preview with the same buffered compositor used by normal playback.
- High-zoom station radar retains its sharper tiled path while broad/regional radar uses the smoother viewport compositor.
- Removed the Sun & Moon arc from Land Simple so the everyday daily card stays focused on current weather, range, and practical metrics.
- Kept the complete Sun & Moon arc, moon phase, rise/set times, night window, best window, true-dark timing, and day length in Land wxLab.
- Removed the duplicate standalone Sky Score hero from Space.
- Made the 72-hour observing forecast the primary Night Sky hero and moved Astro Map and wxLearn actions into its header.
- Folded Bortle class, aerosols, elevation, best window, darkest window, and source context into the unified observing forecast without dropping content.
- Fixed a Worker solar-event date bug that could assign evening twilight to the previous local day.
- Added app-side normalization for cached/legacy solar-event dates so twilight banners cannot silently label early evening as true dark.
- For Mesa on June 24, the corrected sequence is sunset 7:40 PM, civil dusk 8:09 PM, nautical dusk 8:45 PM, and true dark 9:24 PM.
- Replaced the shrinking Android Auto radar thumbnail with a full `MapTemplate` radar surface.
- Android Auto now registers the native radar renderer while the radar screen is visible and detaches it cleanly when leaving.
- Added a compact radar status/alert pane and refresh action without replacing the primary radar image.
- Connected Space day summaries, Sky Score graph, and hourly observing columns into one shared horizontal forecast track.
- Tapping an astronomy hour now highlights the matching graph point and column and updates a complete selected-hour inspector.
- Preserved all astronomy content, including summary text, clouds, moon state, visibility, wind, temperature, Kp, aurora estimate, daily peaks, true darkness, and moonrise/moonset.
- Removed the far-right AQI axes from daily and hourly wxLab charts.
- Added compact AQI values directly beside each yellow AQI point with automatic above/below placement to reduce collisions with temperature, dew point, and humidity.
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
- AQI uses its own internal plotting scale but is identified by direct point labels rather than a detached screen-edge axis.
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
- **Android Auto radar**: Confirm radar fills the main map area instead of appearing as a small thumbnail. Test loading, refresh, back navigation, and unavailable-radar behavior on real head units where possible.
- **Maps performance**: Try radar, satellite, wind particles, marine zones, aviation hazards, and wildfire layers. Watch for sluggishness, heat, battery drain, or camera snapping.
- **Animation continuity**: Loop broad radar, GeoColor, infrared, water vapor, and visible clouds. Pan and zoom during playback. Report any white/black flash, disappearing frame, misaligned image, stalled loop, or excessive rebuffing.
- **Layered animation**: In Storm Scope, combine radar with infrared or visible-cloud imagery and confirm both remain aligned and transition smoothly.
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

- App version: `1.1.132`
- Android version code: `10149`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Android build: `cd android && .\gradlew.bat bundleRelease --console=plain`
