# OMNIwx Feature Guide

Last updated: June 22, 2026

This guide explains the user-facing screens and major features currently present in OMNIwx. It is written as a product walkthrough rather than a code tutorial. For architecture details, see `docs/how-omniwx-works.md` and `docs/omniwx-training-guide.md`.

## App Shape

OMNIwx is organized around weather lenses:

- Land: everyday current and forecast weather.
- Hourly: short-term forecast detail.
- Almanac: climate normals, records, and date context.
- Maps: radar, satellite, alerts, wildfire, marine, aviation, and astronomy map modes.
- Space: solar weather, aurora, sky score, Earth imagery, and Mars archive context.
- Nautical: marine conditions, tides, buoys, and coastal/offshore forecasts.
- Aviation: airport and route briefings.
- Extremes: ranked marine, land, saved-place, and space extremes.
- Settings: home base, units, appearance, forecast model, notifications, and solar capture preferences.

The visible bottom tabs are Land, Hourly, Almanac, Maps, Space, Nautical, Aviation, and Extremes. The app also has hidden/detail routes for onboarding, settings, buoy details, marine-zone details, standalone map tools, widgets, Android Auto, and animation export.

## Shared App Features

### Location and Favorites

OMNIwx keeps one active place that drives the weather screens. The active place can come from GPS, a searched city, the default city, or a saved favorite.

The Land screen's location picker supports:

- Current location/GPS mode.
- City, state, and country search.
- Saved favorites.
- Favorite weather previews with high/low snippets.
- Star/favorite behavior from the header.

Settings also lets the user return to the default city or GPS mode.

### Simple and wxLab Modes

Several screens use a Simple/wxLab split:

- Simple mode keeps the screen readable and practical.
- wxLab mode exposes richer diagnostics, derived metrics, and explanatory cards.

The setting "Always use WxLab" can make supported screens open in the advanced mode by default.

### wxLearn and Explain Modals

The app includes educational modal surfaces that are now treated as a first-class learning library:

- wxLearn topics are organized into shelves: Start Here, Land Weather, Comfort, Clouds & Precip, Maps & Radar, Marine, Aviation, Space Weather, Astronomy, and Data & Units.
- Learn more topics explain concepts such as dew point, humidity, AQI, pollutant drivers, heat index, wind chill, wind, pressure, alerts, radar products, satellite layers, marine zones, water stations, aviation products, space-weather scales, Kp, solar wind, twilight, Earth terminator imagery, and Sky Score.
- Explain modals summarize how a metric was computed or why a condition matters.
- Search includes topic titles, summaries, units, references, tags, and category context.

These are used across Land, Hourly, Nautical, Aviation, Space, and map details.

### Pull to Refresh

Most data-heavy screens support pull-to-refresh. Depending on the screen, refresh reloads forecast data, records, space-weather feeds, Mars archive data, marine data, buoy data, or current map-support data.

### Horizontal Tab Swipe

The tab layout supports a gated horizontal swipe between the main tabs. Map-heavy screens keep map panning protected by limiting tab swipes to the tab-bar/home-row area.

## Onboarding

### Default City Screen

Route: `app/(onboarding)/default-city.tsx`

The first-run onboarding screen asks the user to choose a default city or use GPS. It supports:

- City search through geocoding.
- Selecting a search result as the default city.
- Using current GPS city after location permission.
- Persisting the default city for startup and Settings.
- Resuming pending GPS setup if the permission flow temporarily leaves the app.

After setup, the app routes into Land.

## Land

Route: `app/(tabs)/index.tsx`

Land is the primary daily weather screen. It combines current conditions, forecast context, alerts, favorites, activity guidance, and deeper wxLab analysis.

Key features:

- OMNIwx header with settings entry, active location, favorite toggle, and Simple/wxLab switch.
- Animated weather background matched to current conditions.
- Current conditions and practical summary text.
- Official alert banner with a detail/explanation modal.
- Daily range card and forecast range visualization.
- Current temperature marker.
- High/low forecast context.
- Metric cards for temperature, feels-like, dew point, humidity, wind, gusts, pressure, visibility, precipitation probability, UV, air quality, cloud cover, and related signals.
- NWS Desk in wxLab with local Area Forecast Discussion and Hazardous Weather Outlook briefing context.
- Storm Recap in wxLab with recent official Local Storm Reports where available.
- 15-day forecast list.
- Sun arc and astronomy timing in Simple mode.
- Sun/moon/sky detail in wxLab mode.
- Activity score cards and explanatory topics.
- Full-screen landscape graph modal for daily/hourly forecast charts.
- Location picker with search, current location, and favorites.

Land is also where saved places begin. Favorites created here appear in the location picker and feed saved-place comparisons in Extremes.

### Land wxLab NWS Desk

The wxLab view includes an NWS Desk card for supported United States locations. It uses the local NWS Weather Forecast Office to pull official text products, then presents:

- Area Forecast Discussion and Hazardous Weather Outlook context.
- Headline, summary, hazards, timing, confidence, source, and update time.
- Collapsed raw AFD/HWO text for users who want the official discussion.
- wxLearn topics explaining AFD, HWO, Weather Story, forecast confidence, and Local Storm Reports.

### Land wxLab Storm Recap

The Storm Recap card scans recent official Local Storm Reports from the local NWS office. It summarizes:

- Report count for the last 24 hours.
- Closest report to the active location.
- Latest report.
- Strongest wind report and largest hail report when present.
- Recent report rows with event type, location, source, and remarks.

Local Storm Reports are reports of what happened, not forecasts or warnings. No recent reports does not mean no weather occurred.

## Hourly

Route: `app/(tabs)/hourly.tsx`

Hourly focuses on short-term weather evolution.

Key features:

- Active place header.
- Simple/wxLab switch.
- Current/near-term hero summary.
- Next 72 hours view.
- Hourly charting and timeline components.
- Temperature, dew point, humidity, clouds, precipitation, wind, gust, and pressure context.
- wxLab-style detailed hourly timeline.
- Learn topics for forecast ingredients.
- Animated weather background.
- Refresh and location fallback states.

Use this screen when the question is "what changes over the next few hours?"

## Almanac

Route: `app/(tabs)/almanac.tsx`

Almanac owns climate and historical context for the active place.

Key features:

- Climate normals for the selected date/location.
- Record highs, lows, and precipitation records.
- Prior-year comparisons.
- Selected-day context.
- Climate arch visualization.
- Download-once behavior for area almanac data.
- Saved/downloaded area recognition so later visits can load from cached Almanac data.
- Forecast and records fallback behavior when climate normals cannot download.
- Pull-to-refresh for forecast and record data.

Almanac is the right home for "is today normal, unusual, record-breaking, or seasonally interesting?"

## Maps

Route: `app/(tabs)/maps.tsx`

Maps is the main map workstation. It supports multiple map modes, layer toggles, animation controls, special inspectors, and export.

### Map Modes

The current map modes are:

- Weather: radar-focused weather map.
- Clouds: GOES visible cloud imagery.
- Wildfire: restrictions, smoke, fire perimeters, hotspots, fire weather, and radar.
- Storm Scope: radar, fronts, lightning, alerts, and storm-focused tools.
- Aviation: aviation hazards and PIREPs.
- Nautical: marine zones and buoys.
- Astronomy: sky/observing-oriented map mode.

### Layer Catalog

Available layer groups include:

- Weather: radar, wind vectors, wind particles, WPC fronts, clouds, GOES true color, infrared, water vapor, global true color, global precipitation, alerts, and lightning.
- Fire & Air: fire restrictions, smoke, fire perimeters, hotspots, and SPC fire-weather outlooks.
- Aviation: turbulence, icing, SIGMETs, CWAs, and PIREPs.
- Marine: marine conditions, coastal/offshore/high-seas zones, buoys, water temperature stations, water-level context, and model-backed area summaries where available.
- Astronomy and Reference groups are reserved for specialized context.

Many layers support opacity control, legend/source info, or timestamp behavior.

### Radar and Satellite Animation

Maps supports:

- RainViewer and IEM radar sources.
- Mosaic radar for broad use.
- Nearest NEXRAD behavior when zoomed in.
- Station radar mode for advanced radar products.
- Storm Scope radar behavior.
- Radar timeline scrubbing.
- Play/pause and frame stepping.
- Animation quality profiles such as Smooth, Cinematic, and Presentation.
- Animated satellite playback where frame sources support it.
- True color, infrared, and related satellite imagery.
- Wind vectors and early Windy-like wind-particle visualization for surface 10 m flow.

### Animation Export

On Android, OMNIwx can export radar/satellite animation loops as MP4 files through the native video export module. Export uses prepared animation frames, preserves the recording region, and saves through Android media APIs.

### Map Interaction

Maps can show:

- Alert detail cards with official alert text.
- Marine feature selections for buoy and zone details.
- Aviation feature inspectors.
- Wildfire incident details.
- Legends and source panels.
- Layer sheet modal with mode shortcuts and per-layer controls.

## Space / Solar Wx

Route: `app/(tabs)/solar.tsx`

The Space tab is labeled "Space" in the tab bar and titled "Solar Wx" inside the screen. It combines live space-weather signals, observing conditions, solar imagery, Earth imagery, and Mars archive data.

Key features:

- NOAA Space Weather Scales for geomagnetic, radio blackout, and solar radiation storm levels.
- Kp and aurora outlook.
- Kp gauge and aurora probability-style context.
- Solar wind at L1: speed, density, temperature, and IMF Bz context.
- Recent solar wind speed history chart.
- GOES X-ray and proton flux context.
- NASA DONKI events for flares, CMEs, geomagnetic storms, and particle events.
- SWPC watches and alerts.
- Solar disk imagery views:
  - Continuum.
  - Magnetogram.
  - EUV 171.
  - EUV 193.
  - EUV 304.
  - Coronagraph.
- Earth View:
  - GOES-East GeoColor terminator view.
  - GOES-West GeoColor terminator view.
  - NASA EPIC/DSCOVR L1 Earth view where available, with terminator imagery preferred for current visual context.
- Sky Score card for observing quality.
- Mars Weather Archive from NASA InSight-era data.
- Learn topics for NOAA scales, Kp, solar wind, solar wind density/speed, IMF Bz, X-ray flux, proton flux, SWPC alerts, DONKI events, CMEs, solar flares, solar imagery, Earth disk/terminator views, Sky Score, and Mars weather.
- Optional solar event capture videos, controlled from Settings.

## Nautical

Route: `app/(tabs)/nautical.tsx`

Nautical is the marine forecast and sea-state screen.

Key features:

- Marine area context.
- Coastal place, station, buoy, and marine-area search.
- Sea State hero with wave height, wind, gusts, water temperature, air temperature, and observed/source timestamps.
- Buoy source selection and live buoy observations.
- Simple and wxLab modes.
- Derived marine indices in wxLab, including steepness, Beaufort context, wave/wind alignment, air-sea stability, gustiness, and hazard summaries.
- Today's tides where supported.
- wxLab tide prediction table with exact heights and times.
- Coastal and offshore forecast text.
- Official forecast zones where available.
- High-seas/METAREA context where official data and curated boundaries are available.
- Water-station context for lakes, rivers, reservoirs, and coastal sensors when recent measurements exist.
- Fallback messaging when marine forecast or tide support is unavailable for an area.

Nautical map behavior is increasingly handled inside the Maps tab's Nautical mode, while this screen remains the focused marine briefing surface.

## Aviation

Route: `app/(tabs)/aviation.tsx`

Aviation provides pilot-oriented briefings. It has two main modes.

### Airport Briefing

Airport Briefing answers "what is this field doing now?"

Key features:

- Airport/station lookup.
- Saved airports.
- Station code and airport label.
- Flight category assessment.
- Plain-English status summary.
- Wind, visibility, ceiling, altimeter, and related station values.
- Decoded METAR.
- TAF summary/timeline.
- Raw aviation products where available.
- Local map context.
- Save behavior for aviation widgets.

### Route Briefing

Route Briefing answers "what could affect this corridor?"

Key features:

- Departure and destination airport inputs.
- Cruise altitude and departure timing.
- Route hazard scan.
- Overall risk summary.
- Corridor advisories from aviation hazard data.
- Worst segment identification.
- Checkpoint/segment-style route cards.
- Turbulence, icing, SIGMET, CWA, PIREP, category, and endpoint-condition concerns.
- Saved routes.
- Route data saved for native route briefing widgets.
- Open map behavior centered on the aviation context.

## Aviation Map

Route: `app/(tabs)/aviation-map.tsx`

This standalone hidden aviation map route provides a focused aviation hazards map.

Key features:

- Aviation hazard polygons.
- Product filters: G-AIRMET, SIGMET, Convective SIGMET, and PIREP.
- Hazard filters: icing, turbulence, low-level wind shear, IFR/mountain obscuration, mountain obscuration, and thunderstorms.
- Altitude filters and flight-level slider.
- Valid-time selection.
- Observation and PIREP toggles.
- Feature picker/inspector.
- Legend and aviation status strip.

The main Maps tab also contains an Aviation mode with similar specialized controls.

Current product priority is stronger North America aviation usefulness first, especially the US, Canada, and Mexico, while keeping the architecture ready for broader global aviation sources.

## Astro / Astronomy Map

Routes: `app/(tabs)/astro-map.tsx`, `app/(tabs)/astronomer.tsx`

Astronomy features focus on observing quality and sky conditions. The Space tab exposes Sky Score and astronomy summaries; the map routes support map-based astronomy workflows.

Expected astronomy features include:

- Sky Score context.
- Aurora context.
- Observing-condition map entry points.
- Bortle/darkness and cloud-related sky quality context where available.
- Astronomy-specific control surfaces separate from aviation controls.

Astronomy and Aviation are intentionally treated as specialized map modes rather than ordinary layer toggles.

## Mariner Map

Route: `app/(tabs)/mariner.tsx`

This hidden route supports marine map workflows. Current product direction places most marine map behavior in the main Maps tab's Nautical mode, where marine zones and buoys can be inspected alongside other weather overlays.

## Extremes

Route: `app/(tabs)/extremes.tsx`

Extremes ranks notable weather and environmental values.

Modes:

- Marine.
- Land.
- Space.

Marine features:

- Highest waves right now.
- Strongest winds right now.
- Highest waves ranked list.
- Strongest winds ranked list.
- Warmest water.
- Coldest water.
- Buoy rows that can open marine map context.

Land features:

- Hot, cold, and wind extremes from available stations/Worker data.
- Hero records where available.
- Saved Places section based on Land favorites.
- Saved place hot/cold/wind comparisons.
- Rows that can open relevant map context.

Space features:

- Mars Weather Archive values for air temperature, pressure, and wind.
- Archived NASA InSight context rather than a live Mars forecast.

## Settings

Route: `app/profile.tsx`

Settings is the preferences hub.

Key features:

- Back/Done navigation.
- Active place summary.
- Default city display.
- Use Default and Use GPS actions.
- Change or set default city.
- Temperature unit: Fahrenheit or Celsius.
- App appearance modes from the app appearance options.
- Base map style: dark or light.
- Always use WxLab toggle.
- Forecast model:
  - Best match.
  - GFS.
  - ECMWF.
  - DWD ICON.
- Notification master toggle.
- Notification category toggles:
  - Official alerts.
  - New fires.
  - Kp spikes.
  - Aviation category.
  - Sky score.
  - Solar captures.
  - Extremes.
- Select all / clear all notification categories.
- Local notification test.
- Solar event capture videos toggle.

Settings stores preferences locally and attempts notification registration when permission and backend configuration are available.

## Buoy Detail

Route: `app/buoy/[buoyId].tsx`

The buoy detail route provides focused buoy observations.

Key features:

- Buoy ID route parameter.
- Buoy name/location and lat/lon display.
- Latest buoy observation details.
- Marine values such as wind, gust, direction, wave, water temperature, air temperature, pressure, and observation time where available.
- Pull-to-refresh.

## Marine Zone Detail

Route: `app/nautical/zone/[zoneId].tsx`

The marine-zone detail route shows official zone context.

Key features:

- Marine zone ID route parameter.
- Official bulletin/forecast text when available.
- Fallback when no official bulletin exists.
- Link into Nautical with the zone context.

## General Modal

Route: `app/modal.tsx`

The app contains a simple modal route used by Expo Router. It can dismiss back to Land.

## MapLibre Test Screen

Route: `app/maplibre-test.tsx`

This is a development/test utility screen for MapLibre and radar behavior.

Key features:

- MapLibre map rendering.
- Radar playback controls.
- Speed presets.
- Zoom controls.
- Basic local radar/map interaction checks.

This is not a normal production tab, but it is useful for development verification.

## Native Android Widgets

Location: `android/app/src/main/java/com/anonymous/weatherapp/widget/`

OMNIwx includes native Android home-screen widgets. These are built with RemoteViews, not React Native screens.

Current widget providers include:

- Current conditions.
- Current + Radar.
- SkyScore.
- Aviation.
- Airport Board.
- Route Briefing.
- Climatology.
- Climate Arch.

Widget behavior:

- Tap widgets to open the matching app route, such as Land, Space, Almanac, or Aviation.
- Use cached/current app data where possible.
- Use native fallback rendering when React Native UI cannot run in widgets.
- Central refresh receiver fans out updates to all widgets.
- Scheduler provides lightweight periodic refresh.
- Missing data states prompt the user to open OMNIwx to refresh.

Widget behavior is still an active closed-test area. Testers should watch for widgets that fail to hydrate after a default/current location is available, stale radar/current data, or widget refresh behavior that affects phone-app responsiveness.

## Android Auto

Location: `android/app/src/main/java/com/anonymous/weatherapp/car/OmniWeatherCarAppService.kt`

OMNIwx includes a native Android Auto surface using AndroidX Car App templates.

Key features:

- Current conditions screen.
- Hourly-style list/screen.
- Daily/five-day forecast screen.
- Alerts screen.
- SkyScore screen.
- Radar Snapshot screen with a custom car map/radar surface.
- Refresh action.
- Car-safe navigation and template-based presentation.

The Android Auto radar view fetches radar tiles and draws a static radar snapshot on a car-safe surface rather than embedding the phone map UI.

Android Auto radar stability is still a priority test area because real head units may behave differently than local builds or emulators.

## Native Animation Video Export

Location: `android/app/src/main/java/com/anonymous/weatherapp/video/`

OMNIwx includes a native Android video export module for weather animation loops.

Key features:

- Receives prepared animation frames from the React Native map system.
- Downloads raster frames.
- Composites frames into bitmaps.
- Encodes MP4/H.264 video.
- Saves exported weather loops through Android media storage.
- Supports radar and satellite-style exports when enough frames are available.

## Notifications

Client-side notification preferences live in Settings.

Supported categories:

- Official alerts.
- New fires.
- Kp spikes.
- Aviation category.
- Sky score.
- Solar captures.
- Extremes.

Current client behavior:

- Requests notification permission.
- Creates the Android notification channel.
- Stores enabled/disabled state and category choices locally.
- Gets an Expo push token when permission is granted.
- Attempts registration with the backend when possible.
- Can schedule a local test notification.

Production event delivery still depends on backend watcher logic for detecting changes and sending push notifications.

## Backend-Supported Features

The Cloudflare Worker in `omniwx-api/` supports many app features by normalizing, proxying, or caching provider data.

Feature areas that use the Worker or Worker-backed helpers include:

- Current weather and forecast aggregation.
- Open-Meteo hourly/daily data.
- Astro location and Sky Score support.
- Almanac climatology and prior-year data.
- Fire context.
- NASA APOD/DONKI and Mars archive routes.
- NCEI data.
- Radar WMS/proxy routes.
- Global/extremes-style data.

The app also calls some public providers directly, including NOAA/NWS, NOAA SWPC, Open-Meteo, NOAA marine/tides, RainViewer, IEM, NASA imagery, ArcGIS services, and map imagery providers.

## Feature Ownership Cheat Sheet

- Everyday weather: Land.
- Short-term timing: Hourly.
- Records and normal climate: Almanac.
- Radar, satellite, alerts, wildfire, marine, aviation, astronomy overlays: Maps.
- Solar storms, aurora, Sky Score, Earth imagery, Mars archive: Space.
- Marine briefing, tides, buoys, and official marine forecasts: Nautical.
- Pilot station and route briefings: Aviation.
- Ranked extremes and saved-place comparisons: Extremes.
- Preferences and notification controls: Settings.
- Glanceable home-screen surfaces: Android widgets.
- Car-safe weather and radar: Android Auto.
- Tester-facing release notes: `docs/google-play-closed-testing-release-notes.md`.
- Saved radar/satellite loops: native video export.
