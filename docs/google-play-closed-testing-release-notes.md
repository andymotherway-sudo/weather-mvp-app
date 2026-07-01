# Google Play Closed Testing Release Notes

Release: **OMNIwx Alpha 1.1.153**
Android version code: **10170**
Track: **Closed testing / internal testing candidate**
Date: **July 1, 2026**

## Play Console Paste Notes

This build keeps the restored RainViewer national radar mosaic and adds careful map controls around it. Zoom buttons now only zoom the map camera in or out; they do not recenter, force Storm Scope, select a radar site, or change radar products. The map recorder is now an old-school red record dot placed beside play, rewind, and fast-forward in the radar/satellite timeline controls.

The prior RainViewer worker fix remains in place: the worker supports both exact RainViewer frame paths and older timestamp-only app requests, and this app build continues to send explicit frame paths for the broad mosaic.

## Tester Notes

Please focus testing on Maps radar behavior. The important expectation is that broad zoom shows the RainViewer national mosaic, close zoom shows the nearest local NEXRAD/radar rings when appropriate, Storm Scope remains a radar-workstation toggle, the new zoom buttons only zoom, and the map never forces the camera back to the saved/current location.

### What Changed

- Restored RainViewer national radar as the broad-zoom animated mosaic.
- Fixed the Cloudflare Worker RainViewer tile proxy for RainViewer's current frame-path tile URLs.
- Added app-side RainViewer frame-path forwarding so future builds request exact mosaic frames.
- Added worker backward compatibility for older timestamp-only RainViewer tile requests.
- Added map zoom-in and zoom-out buttons that only change camera zoom.
- Moved map recording into the playback controls as a red record-dot button.
- Removed the separate text-based `Record` pill above the radar/satellite timeline.
- Restored automatic close-zoom handoff to nearest local NEXRAD with radar rings.
- Restored Storm Scope as the local NEXRAD workstation: base reflectivity, velocity, storm total precip, echo tops, and hail tracks.
- Removed the accidental `National Radar` entry from the station product selector.
- Fixed sticky Storm Scope state by restoring the pre-zoom radar toggle behavior.
- Removed the separate Storm Scope view-switch path that was disrupting mosaic/local radar handoff.
- Restored the pre-zoom automatic NEXRAD handoff threshold.
- Restored the national mosaic zoom cap so broad radar does not disappear during handoff.
- Restored RainViewer mosaic visibility while overzooming between broad mosaic and local NEXRAD modes.

### What To Test

- Open Land and Hourly and confirm forecast cards still load normally.
- Open Almanac and confirm record building/cached records still progress normally.
- Open Maps at national scale and confirm the RainViewer national radar mosaic appears and animates.
- Zoom toward a local area and confirm nearest NEXRAD detail/products are available without camera snap-back.
- Zoom back out and confirm the broad RainViewer national radar mosaic returns.
- Use the `+` and `-` buttons and confirm they only zoom the current map view without recentering or changing radar mode.
- Toggle Storm Scope on and confirm local NEXRAD, radar rings, and the product selector appear immediately.
- Toggle Storm Scope off and confirm the broad national mosaic returns without recentering to the saved/current location.
- In Storm Scope, choose base reflectivity, velocity, storm total precip, echo tops, and hail tracks and confirm single-site products appear when available.
- Confirm the map never displays a large "Zoom Level Not Supported" radar tile.
- Open Nautical and confirm sea state, tides, wxLab rows, and official forecast unsupported states still render cleanly.
- Open Space and confirm SWPC/DONKI fallback content still loads when available.
- Try Android Auto radar and confirm failures show friendly UI instead of crashing.

### Known Watch Areas

- Radar providers can still return stale or missing frames; those states should be visible without trapping playback.
- Storm Scope is intentionally a local NEXRAD workstation toggle now, not a separate forced camera view.
- Android Auto still reports upstream AndroidX Car App deprecation warnings during native compile; this build does not change that API surface.

## Internal Release Checklist

- App version: `1.1.153`
- Android version code: `10170`
- AAB path: `android/app/build/outputs/bundle/release/app-release.aab`
- TypeScript check: `npx tsc --noEmit`
- Kotlin check: `cd android && .\gradlew.bat :app:compileReleaseKotlin --console=plain`
- Android build: `cd android && .\gradlew.bat :app:bundleRelease --console=plain`
