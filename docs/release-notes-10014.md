# OMNIwx Alpha 1.1.7 / 10014 Release Notes

Baseline reviewed: `C:\Users\andym_au640pp\Downloads\10010.apk`

Upload artifact built: `C:\Users\andym_au640pp\weather-app\android\app\build\outputs\bundle\release\app-release.aab`

## Google Play "What's New"

Improved radar and map playback with smoother frame fades, restored radar loading, and a standard map return option. Refined aviation product controls and map layout. Fixed map freeze after selecting land extremes. Improved daily/hourly chart table sync, row label alignment, and glass styling. Added clearer AQI, dew band, and moon phase details.

## Full Notes

This release focuses on map reliability, radar usability, and wxLab chart polish.

- Improved radar playback by preloading the next real radar frame before fading, reducing hard jumps between time blocks.
- Preserved two radar render slots during playback/crossfade so local zooms can fade between frames instead of snapping.
- Restored RainViewer radar loading through the current public weather maps endpoint.
- Improved radar tile behavior for storm inspection, including higher-quality resampling and more stable frame templates.
- Fixed the map freeze/stickiness after selecting a land extreme and jumping to the map.
- Added a Standard Map selector so users can return from aviation/nautical/astronomy map modes.
- Moved the aviation products drawer lower on the map and made it collapsible.
- Improved aviation product chip layout so product, hazard, and valid-time controls are easier to scan.
- Refined daily and hourly chart scrolling so chart and table values stay locked together.
- Fixed daily chart row label alignment and softened label rail styling to match the chart glass.
- Reduced row label visual weight and matched label colors more closely to the chart surface.
- Improved wind direction text sizing to avoid wraps on values like SSW.
- Added AQI number display alongside the air quality category.
- Updated dew band display to show the comfort word under the tile title and removed the duplicated dew point value.
- Removed the wxLearn button above the hourly chart.
- Reworked the Sun & Moon panel with a more realistic moon phase graphic and percent-full label.
- Removed/corrected empty "Updated --" display when no valid update time is available.
- Matched alert banner styling to the app's glass surfaces.
- Made glass surfaces slightly more transparent for a lighter, more cohesive look.

## Build Verification

- `npx tsc --noEmit` passed.
- `android/gradlew.bat bundleRelease` completed successfully.

