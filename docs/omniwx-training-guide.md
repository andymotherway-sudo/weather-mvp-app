# OMNIwx Training Guide

**A beginner-friendly guide to how your app is structured, how the code works together, and how to explain it.**

Audience: this is written for someone who can write a basic Python `hello world`, understands simple variables/functions, and has some basic SQL experience. You do not need to already know React Native, Expo, TypeScript, or mobile app architecture.

Last updated: June 30, 2026

Personal note: this file is meant to be Andy's private working guide. It explains the product and codebase in more detail than a public README should, including intent, mental models, and implementation notes that are useful while building OMNIwx.

---

## 1. The Big Picture

OMNIwx is a mobile weather app built with **React Native** and **Expo**. React Native lets you write mobile screens using JavaScript/TypeScript instead of Java/Kotlin for Android and Swift for iOS. Expo adds tooling around React Native: routing, building, native modules, dev tools, and Android packaging.

The app is organized around weather “lenses”:

- **Land**: current weather, daily forecast, detailed daily charts, favorites, and advanced WxLab-style panels.
- **Hourly**: hour-by-hour forecast and charts.
- **Almanac**: longer-term climate/astronomy-style reference views.
- **Maps**: radar, satellite, fire, aviation, storm, and other map overlays.
- **Space**: solar, aurora, and space-weather conditions.
- **Nautical**: marine forecasts, buoys, sea state, and marine map tools.
- **Aviation**: aviation weather hazards and aviation-focused views.
- **Extremes**: land/marine/space extremes that can link into maps.

Current product direction as of June 2026:

- **Land** is the primary daily weather surface. It has a compact header, alert card, Simple/WxLab toggle, and daily range card. Sun/Moon arcs and detailed astronomy timing live in wxLab with the richer diagnostic cards. The old climatology context card was removed because Almanac owns that job now.
- **Hourly** remains its own forecast tab, but horizontal navigation can also move between tabs using an edge/home-row swipe pattern.
- **Almanac** owns records, normals, prior-year comparisons, and the climate arch. Pull-to-refresh should refresh forecast and record data without changing the meaning of the page.
- **Maps** is now the main home for map modes. Weather, Storm Scope, Wildfire, Nautical, Aviation, and Astronomy are treated as map modes/presets instead of unrelated one-off map experiences.
- **Storm Scope** is the premium radar-workbench direction: radar, fronts, lightning, alerts, range markers, product selectors, and animation controls live here.
- **Tropics / NHC work** belongs in Maps as official tropical products rather than decorative storm markers. Active storms should render as ordered overlays: cone context, wind radii, arrival timing, track, and watches/warnings, with legends that clearly differ from radar intensity legends.
- **Wind particles** are the preferred Windy-like visualization. Keep the live effect in the lightweight Skia overlay, use surface 10 m wind, and avoid pushing hundreds of animated particles through MapLibre sources.
- **Nautical** map functionality is being migrated into the main Maps tab. Marine zones and buoys should be clickable on the main map, with the same official NOAA/marine forecast behavior users expect from the Nautical screen.
- **Astronomy** and **Aviation** are map modes with their own control surfaces. They should not be active at the same time because their drawers, inspectors, and workflows are complex.
- **Android widgets** are native Android home-screen widgets, not React Native screens. They use AppWidgetProvider and RemoteViews.
- **Android Auto** is a native car-app surface, not a mirrored phone screen. It uses AndroidX Car App templates and a custom radar surface renderer.
- **Notifications** are preference-driven. The app currently stores local preferences and push token state for categories such as NWS alerts, new fires, Kp spikes, aviation category changes, sky score changes, and extremes.
- **Radar/satellite animation** is an important differentiator. The app now has an in-app compositor for smoother playback and a native Android MP4 exporter for recording loops.
- **Branding** should use the shared OMNIwx transparent logo asset and shared tab-logo style instead of one-off tab dimensions. This keeps the logo consistent across Land, Hourly, Almanac, Space, Nautical, Aviation, and Extremes.
- **wxLearn / tutorial content** should be treated as a real app surface. Reusable tutorial content belongs in `app/lib/learn/tutorial.ts` and should be registered with the rest of the wxLearn topics so it can be updated without rewriting individual screens.

There are two major pieces in the repository:

1. **The mobile app**: everything under `app/`, `components/`, `styles/`, `constants/`, `hooks/`, and `android/`.
2. **The helper backend**: `omniwx-api/`, a Cloudflare Worker that aggregates, normalizes, and proxies weather data.

At a very high level:

```text
User opens app
  -> Expo Router loads app/_layout.tsx
  -> Global providers load settings, location, active place, WxLab mode
  -> Tab layout loads screens such as Land, Hourly, Maps, Extremes
  -> Screens call hooks to fetch weather data
  -> Hooks call OMNIwx API / Open-Meteo / NOAA / map services
  -> Components render cards, charts, maps, and controls
  -> User interactions update state and trigger re-rendering
```

If you know SQL, think of the app as having a few “tables” of state:

- Current settings: temperature unit, map style, radar provider, forecast model.
- Current place: active location plus favorites.
- Forecast data: hourly rows and daily rows.
- Map state: selected map view, enabled layers, opacity, radar timeline frame.

React components read those state “tables” and render the UI.

---


### Code hygiene and developer comments

Comments should explain durable intent: why a fallback exists, why a provider is optional, why a cache key is versioned, or why map/radar state is constrained. Avoid commit-history comments such as "new", "drop-in", "MVP", or notes to self. Debug logging should not ship in React Native app, Worker, or Android Auto paths unless it is intentionally guarded and documented. CLI scripts may still print progress because those messages are the script UI.

## 2. Vocabulary You Need Before Reading the Code

### TypeScript

The app uses **TypeScript**, which is JavaScript with types. A type tells the editor and compiler what shape a value should have.

Example:

```ts
type ForecastHour = {
  time: string;
  tempF: number | null;
  windMph: number | null;
};
```

This means a forecast hour is an object with `time`, `tempF`, and `windMph`. `number | null` means the value can be a number or missing.

TypeScript helps catch mistakes like trying to use `windMph.toFixed()` when `windMph` might be `null`.

### React Components

A **component** is a function that returns UI.

```tsx
function TemperatureCard({ tempF }: { tempF: number | null }) {
  return <Text>{tempF == null ? '—' : `${Math.round(tempF)}°`}</Text>;
}
```

This is similar to a Python function, but instead of returning a number or string, it returns a description of what should appear on screen.

### Props

**Props** are inputs passed into a component. If SQL rows are data, props are like selecting a few columns and giving them to one display function.

```tsx
<TemperatureCard tempF={65} />
```

The component receives `tempF` as a prop.

### State

**State** is data that can change while the app is running.

```ts
const [selectedIndex, setSelectedIndex] = useState(0);
```

This means:

- `selectedIndex` is the current value.
- `setSelectedIndex(...)` changes it.
- When it changes, React re-renders the component.

### Hooks

A **hook** is a function that lets a component use React features like state, effects, context, or data fetching. Hooks usually start with `use`.

Examples in this app:

- `useSettings()`
- `usePlace()`
- `useOpenMeteoForecast()`
- `useRadarController()`
- `useLocations()`

### Effects

`useEffect` runs code after rendering, usually for side effects:

- Fetch data.
- Load from storage.
- Save settings.
- Start/stop timers.
- React to route parameters.

Example:

```ts
useEffect(() => {
  AsyncStorage.setItem(KEY, value).catch(() => {});
}, [value]);
```

This says: whenever `value` changes, save it.

### Context

**Context** is app-wide state. Instead of passing settings through every component manually, the app wraps screens in providers.

Examples:

- `SettingsProvider`
- `LocationsProvider`
- `PlaceProvider`
- `WxLabProvider`

The screen can then call `useSettings()` or `usePlace()` from anywhere below those providers.

### Async/Await

Weather data comes from the network, so code waits for responses using `async` and `await`.

```ts
const res = await fetch(url);
const json = await res.json();
```

This is like saying: “pause this function until the network returns data.”

---

## 3. Repository Map

Here is the important folder structure:

```text
weather-app/
  app/
    _layout.tsx
    (tabs)/
      _layout.tsx
      index.tsx
      hourly.tsx
      maps.tsx
      extremes.tsx
      nautical.tsx
      aviation.tsx
      solar.tsx
      almanac.tsx
      astro-map.tsx
      nautical-map.tsx
      aviation-map.tsx
    context/
      PlaceContext.tsx
      SettingsContext.tsx
      WxLabContext.tsx
    lib/
      openmeteo/
      maps/
      locations/
      alerts/
      aviation/
      nautical/
      spaceweather/
      weather/
  components/
    common/
    land/
    maps/
    alerts/
    weather/
    layout/
  styles/
  constants/
  android/
  omniwx-api/
    src/index.ts
```

### `app/`

This folder is the routing layer. Expo Router uses the files in `app/` to decide which screens exist.

Important files:

- `app/_layout.tsx`: root app shell. Wraps the whole app in providers.
- `app/(tabs)/_layout.tsx`: bottom tab bar setup.
- `app/(tabs)/index.tsx`: Land tab.
- `app/(tabs)/hourly.tsx`: Hourly tab.
- `app/(tabs)/maps.tsx`: main map/radar tab.
- `app/(tabs)/extremes.tsx`: weather extremes tab.

### `components/`

This folder contains reusable UI pieces.

Examples:

- `components/common/Glass.tsx`: shared glass panel styling.
- `components/layout/Card.tsx`: card container.
- `components/land/DailyRangeChart.tsx`: daily chart/table component.
- `components/land/HourlyRangeChart.tsx`: hourly chart/table component.
- `components/maps/MapRenderer.tsx`: MapLibre map wrapper.
- `components/maps/LayerSheetModal.tsx`: layer controls.
- `components/weather/PremiumWeatherIcon.tsx`: weather icons.

### `app/lib/`

This is where much of the logic lives.

Examples:

- `app/lib/openmeteo/hooks.ts`: fetches and normalizes forecast data.
- `app/lib/maps/useRadarController.ts`: radar timeline and raster/image overlay logic.
- `app/lib/maps/state.ts`: map reducer and map runtime state.
- `app/lib/maps/layerCatalog.ts`: available map layers.
- `app/lib/locations/useLocations.ts`: GPS/current-location state.
- `app/lib/net/`: network helpers.

### `omniwx-api/`

This is a Cloudflare Worker backend. It is not the phone app itself. It helps the app by:

- Proxying external weather/map services.
- Normalizing API responses.
- Caching or simplifying data.
- Serving endpoints like land extremes, radar WMS, Bortle lookups, and other weather utilities.

The main file is:

```text
omniwx-api/src/index.ts
```

---

## 4. How the App Starts

The app starts at:

```text
app/_layout.tsx
```

This file sets up the global shell:

```tsx
<SettingsProvider>
  <LocationsProvider>
    <PlaceProvider>
      <WxLabProvider>
        <AppBoot>
          <Stack>
            ...
          </Stack>
        </AppBoot>
      </WxLabProvider>
    </PlaceProvider>
  </LocationsProvider>
</SettingsProvider>
```

The order matters.

### SettingsProvider

Loads saved user settings from `AsyncStorage`:

- Temperature unit: `F` or `C`
- Base map style: `dark` or `light`
- Radar provider: `iem` or `rainviewer`
- Forecast model: `best_match`, `gfs`, `ecmwf`, `dwd_icon`

File:

```text
app/context/SettingsContext.tsx
```

### LocationsProvider

Manages current GPS or last-known coordinates.

File:

```text
app/lib/locations/useLocations.ts
```

### PlaceProvider

Manages the active place and favorites:

- Current location
- Searched location
- Favorite location
- Default city

File:

```text
app/context/PlaceContext.tsx
```

### WxLabProvider

Controls whether advanced WxLab-style views are enabled.

File:

```text
app/context/WxLabContext.tsx
```

### AppBoot

Handles app startup behavior such as splash/loading/onboarding flow.

File:

```text
components/boot/AppBoot.tsx
```

---

## 5. Navigation and Tabs

The tab bar is defined in:

```text
app/(tabs)/_layout.tsx
```

Each `<Tabs.Screen>` maps to a file in `app/(tabs)/`.

Examples:

```tsx
<Tabs.Screen name="index" options={{ title: 'Land' }} />
<Tabs.Screen name="hourly" options={{ title: 'Hourly' }} />
<Tabs.Screen name="maps" options={{ title: 'Maps' }} />
<Tabs.Screen name="extremes" options={{ title: 'Extremes' }} />
```

Because Expo Router is file-based:

```text
app/(tabs)/index.tsx  -> Land tab
app/(tabs)/hourly.tsx -> Hourly tab
app/(tabs)/maps.tsx   -> Maps tab
```

Some screens exist but are hidden from the tab bar:

```tsx
<Tabs.Screen name="nautical-map" options={{ href: null }} />
<Tabs.Screen name="aviation-map" options={{ href: null }} />
<Tabs.Screen name="astro-map" options={{ href: null }} />
```

These are still navigable in code, but they do not appear as bottom-tab buttons.

---

## 6. The Main Data Flow

The most important data flow is:

```text
Active place
  -> latitude/longitude
  -> forecast hook
  -> daily/hourly forecast arrays
  -> screen derives summary values
  -> UI components render cards/charts
```

In SQL terms:

```sql
SELECT *
FROM forecast
WHERE lat = active_place.lat
  AND lon = active_place.lon;
```

Except in the app, the “query” is an API call instead of SQL.

### Active Place

`PlaceContext` provides the active location.

The active place has this shape:

```ts
type Place = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  source: 'gps' | 'favorite' | 'search';
};
```

Screens read it with:

```ts
const { active } = usePlace();
```

### Forecast Fetching

Forecast data comes from:

```text
app/lib/openmeteo/hooks.ts
```

The main hook is:

```ts
useOpenMeteoForecast(...)
```

It returns:

```ts
{
  data,
  loading,
  error,
  refreshing,
  refresh
}
```

Inside `data`:

```ts
type ForecastData = {
  daily: ForecastDay[];
  hourly: ForecastHour[];
  timezone?: string | null;
};
```

This is the cleaned-up forecast data used by Land, Hourly, charts, astronomy calculations, and other views.

---

## 7. Forecast Hook Explained

File:

```text
app/lib/openmeteo/hooks.ts
```

This hook does several jobs:

1. Accepts latitude, longitude, forecast days, past days, and model.
2. Builds a URL for the backend API.
3. Fetches JSON data.
4. Converts raw API arrays into friendly JavaScript objects.
5. Stores loading/error/refreshing state.

### Why Raw Weather APIs Are Annoying

Weather APIs often return data in parallel arrays:

```json
{
  "hourly": {
    "time": ["2026-05-09T07:00", "2026-05-09T08:00"],
    "temperature_2m": [65, 67],
    "wind_speed_10m": [8, 10]
  }
}
```

That is efficient for APIs, but not convenient for UI. So the hook converts it into rows:

```ts
[
  { time: '2026-05-09T07:00', tempF: 65, windMph: 8 },
  { time: '2026-05-09T08:00', tempF: 67, windMph: 10 }
]
```

That is much easier for charts and cards to consume.

### Daily Data

Daily data is normalized into:

```ts
type ForecastDay = {
  date: string;
  tempMaxF: number | null;
  tempMinF: number | null;
  dewPointMaxF: number | null;
  humidityMaxPct: number | null;
  precipProbMaxPct: number | null;
  windMaxMph: number | null;
  windGustMaxMph: number | null;
  windDirDominantDeg: number | null;
  cloudCoverAvgPct: number | null;
};
```

### Hourly Data

Hourly data is normalized into:

```ts
type ForecastHour = {
  time: string;
  tempF: number | null;
  apparentTempF?: number | null;
  dewPointF: number | null;
  humidityPct: number | null;
  cloudCoverPct: number | null;
  precipProbPct: number | null;
  windMph: number | null;
  windGustMph: number | null;
  windDirDeg?: number | null;
};
```

This shape is used by the hourly screen and hourly charts.

---

## 8. Land Tab

File:

```text
app/(tabs)/index.tsx
```

This is the largest screen in the app. It handles:

- Current conditions.
- Favorite locations.
- Current place display.
- Forecast summary.
- Daily range chart.
- Advanced/WxLab cards.
- Learn-more modals.
- Many derived weather labels.

Because it is large, the easiest way to understand it is by thinking in layers.

### Layer 1: Inputs

The Land tab reads global state:

- Active place from `usePlace()`
- Settings from `useSettings()`
- WxLab mode from `useWxLab()`

Then it fetches weather:

- Current/forecast data from Open-Meteo hooks.
- Air quality data from related API helpers.
- Astronomy/sun/moon data from app libraries.

### Layer 2: Derived Values

Raw weather values are transformed into friendlier values:

- `tempF`
- `feelsLikeF`
- `dewpointF`
- `humidityPct`
- `windMph`
- `gustMph`
- `cloudCoverPct`
- `pressureHpa`
- `visibilityMi`
- `airQualityLabel`
- `airQualityIndex`

The screen also derives text like:

- “Dry”
- “Comfortable”
- “Humid”
- “Rising”
- “Calm”
- “Breezy”

This derived text is what makes the app feel human rather than just showing raw numbers.

### Layer 3: UI Components

The Land tab passes data down into components:

- Daily chart/table: `components/land/DailyRangeChart.tsx`
- Weather icons: `components/weather/PremiumWeatherIcon.tsx`
- Glass/card wrappers: `components/common/Glass.tsx`, `components/layout/Card.tsx`
- Learn modal: `components/common/LearnMoreModal.tsx`

### Why the Land Tab Is Big

The Land tab is doing several jobs in one file:

- Data assembly.
- Weather interpretation.
- UI layout.
- Advanced view rendering.
- Favorite-location handling.

That is common in fast-moving app development, but it means you should read it section by section rather than top to bottom.

---

## 9. Daily and Hourly Charts

Files:

```text
components/land/DailyRangeChart.tsx
components/land/HourlyRangeChart.tsx
```

These components are responsible for the chart plus table values.

### What They Receive

`DailyRangeChart` receives daily forecast rows:

```ts
daily: DailyDatum[]
```

`HourlyRangeChart` receives hourly forecast rows:

```ts
hours: ForecastHour[]
```

### What They Draw

They use:

- `ScrollView` for horizontal scrolling.
- `react-native-svg` for chart lines, dots, bars, labels, and bands.
- React Native `View` and `Text` for table rows and value cells.

### Important Concept: One Data Row, Multiple Visual Marks

One forecast day might appear as:

- A red high-temperature point.
- A blue low-temperature point.
- A green dew-point dot.
- A purple humidity dot.
- A wind/gust mini bar.
- A cloud band fill.
- A table column.

All of those are based on the same row of data.

### Coordinate Mapping

Charts convert data values into screen positions.

Example:

```ts
const xForIdx = (i: number) => padL + i * (TILE_W + GAP) + TILE_W / 2;
```

This says: “for data item number `i`, place it at this horizontal x-coordinate.”

Temperature values are converted into y-coordinates:

```ts
const yForTemp = (t: number) => {
  const span = Math.max(1, tempStats.yMax - tempStats.yMin);
  const p = (t - tempStats.yMin) / span;
  return padT + (1 - p) * plotH;
};
```

That is just math:

- Low values go lower on the chart.
- High values go higher on the chart.
- The chart scales based on the data range.

### Table and Chart Alignment

The important rule is:

```text
Same data index -> same x-position -> same visual column
```

If day index `2` is at x-position `300` in the chart, the table value for day index `2` needs to sit at that same horizontal position.

That is why these components use constants like:

```ts
const TILE_W = 132;
const GAP = 10;
```

or hourly:

```ts
const TILE_W = 92;
const GAP = 10;
```

The chart and table cells must share the same width and gap logic.

---

## 10. Hourly Tab

File:

```text
app/(tabs)/hourly.tsx
```

The Hourly tab focuses on forecast hours rather than forecast days.

It uses the forecast data from Open-Meteo and displays:

- Hour-by-hour temperature.
- Dew point.
- Relative humidity.
- Wind/gusts.
- Clouds.
- Precipitation probability.
- Hourly chart strips and detailed timeline components.

The hourly screen is especially sensitive to time zones. Weather APIs often return local wall-clock times, UTC times, or times with offsets. The app has helper functions to avoid accidentally interpreting a forecast hour in the device’s wrong timezone.

Example helper concept:

```text
Forecast says: 2026-05-09T14:00
The app treats that as local forecast-location time,
not necessarily the phone's current timezone.
```

This matters when the user is looking at weather for a place far away from their current location.

---

## 11. Maps Tab

File:

```text
app/(tabs)/maps.tsx
```

This is the central map/radar screen. It uses:

- MapLibre for map rendering.
- A reducer for map state.
- A layer catalog for available overlays.
- A radar controller for radar frames and animation.
- Overlay components for WMS/image/raster layers.

### Map State

Map state is managed by:

```text
app/lib/maps/state.ts
```

The map reducer understands actions like:

```ts
{ type: 'SET_VIEW', viewId: 'radar' }
{ type: 'SET_LAYER_ENABLED', layerId, enabled: true }
{ type: 'SET_LAYER_OPACITY', layerId, opacity: 0.5 }
{ type: 'SET_RADAR_FRAME', frameIndex: 3 }
{ type: 'SET_RADAR_PLAYING', playing: true }
```

If you know SQL, a reducer is like a controlled update function:

```sql
UPDATE map_state
SET current_view = 'radar'
WHERE app_session = current_session;
```

Except in React it returns a new JavaScript object instead of changing a database row.

### Map Views

Map views are defined in:

```text
app/lib/maps/views.ts
```

A view is a preset, like:

- Radar
- Clouds
- Wildfire
- Aviation
- Storm

Each view can enable default layers.

### Layer Catalog

Available map layers live in:

```text
app/lib/maps/layerCatalog.ts
```

The catalog is the source of truth for layer metadata:

- ID
- Title
- Subtitle
- Default opacity
- Group/category

### MapRenderer

File:

```text
components/maps/MapRenderer.tsx
```

This wraps MapLibre so the rest of the app does not talk directly to raw MapLibre everywhere.

It handles:

- Base map style.
- Camera defaults.
- Region tracking.
- Map press events.
- Radar raster overlays.
- WMS overlay rendering.
- Boundary relief layers.

This is similar to writing a small adapter around a database client. Instead of every screen knowing MapLibre details, `MapRenderer` hides many of them.

---

## 12. Radar System

Radar logic is mostly in:

```text
app/lib/maps/useRadarController.ts
```

This is one of the more complex systems in the app.

It handles:

- Radar provider selection.
- RainViewer frames.
- IEM/NEXRAD frames.
- Radar animation timing.
- Crossfading between frames.
- Mode-specific tile handoff between broad mosaic and local NEXRAD.
- Frame labels and timeline state.
- Tile URL generation.

### Why Radar Is Hard

Radar animation is not just “show an image.”

The app needs to:

1. Find available radar timestamps.
2. Sort frames chronologically.
3. Decide which frame is active.
4. Preload or hold tiles.
5. Blend/crossfade.
6. Avoid expensive requests when zoomed in.
7. Keep the map responsive.

### Mosaic, NEXRAD, and Storm Scope

At broader zoom levels, normal radar should use the RainViewer mosaic. This is the national/broad-view product.

At close zoom levels, normal radar can automatically latch into the nearest NEXRAD site. The handoff should use hysteresis so a tiny zoom jitter does not rapidly switch providers.

Storm Scope is the explicit chaser/workstation tool. It should turn on local NEXRAD/product controls while it is active, then fully return to normal radar behavior when it is turned off.

### Radar Mode Invariants

Radar should preserve three user-facing behaviors:

- Broad map views show the national radar mosaic.
- Local zoom and station contexts can use the nearest NEXRAD site and expose station products.
- Storm Scope is an in-place radar mode, not a separate map view that forces the camera.
- Storm Scope controls must stay available at broad zoom; they should not be gated behind local NEXRAD zoom.
- Normal radar defaults to the broad RainViewer mosaic and automatically hands off to nearest NEXRAD at close zoom. Storm Scope is an explicit tool for local NEXRAD, product selection, and chaser-style inspection.
- Zooming back out from local radar should return to the broad national mosaic.

Zoom controls should only change camera zoom. They should not recenter the map, lock the user to a radar site, or keep snapping back to the active location.

### Timeline

The timeline state is stored in the map reducer:

```ts
radarTime: {
  frameIndex: number;
  playing: boolean;
  stormMode: boolean;
}
```

The UI can set `frameIndex` when the user scrubs the timeline.

---

## 13. Overlay System

Overlay rendering lives in:

```text
components/maps/overlays/OverlayEngine.tsx
```

The map screen builds a list of overlay configs, then `OverlayEngine` renders them.

An overlay config can describe things like:

- WMS URL
- Opacity
- z-index
- Time parameter
- Layer name

This makes overlays data-driven. Instead of hardcoding every map layer directly into JSX, the screen can build an array like:

```ts
const overlays = [
  { id: 'fronts-day-1', url: ..., opacity: 0.7 },
  { id: 'clouds', url: ..., opacity: 0.5 }
];
```

Then the overlay engine turns those into map layers.

---

## 14. Extremes Tab

File:

```text
app/(tabs)/extremes.tsx
```

The Extremes tab displays unusual or notable conditions, such as:

- Hottest/coldest land locations.
- Strong winds.
- Heavy rain.
- Marine extremes.
- Space-weather extremes.

Land extremes are fetched from the backend worker endpoint:

```text
/land-extremes
```

When the user taps a land extreme, the app navigates to the map screen with route parameters:

```ts
router.push({
  pathname: '/maps',
  params: {
    view: 'radar',
    focus: 'once',
    lat: String(x.lat),
    lon: String(x.lon),
    label: x.name,
    source: 'extremes',
    targetType: 'land-extreme',
  },
});
```

The map screen reads those parameters, focuses the map once, then clears/consumes them so the user is not permanently locked to that location.

This is a good example of cross-screen communication:

```text
Extremes screen
  -> passes lat/lon as route params
  -> Maps screen reads params
  -> Maps screen updates map region
  -> Maps screen clears params
```

---

## 15. Nautical Section

Main files:

```text
app/(tabs)/nautical.tsx
app/(tabs)/nautical-map.tsx
app/lib/nautical/
app/lib/buoys/
components/nautical-related pieces
```

The Nautical section focuses on:

- Marine conditions.
- Buoys.
- Sea state.
- Marine forecast zones.
- Nautical map views.

Historically, the app had a separate nautical map because marine data and buoy interactions were different from the general radar map. The current direction is to move those marine map interactions into the main Maps tab so users do not have to understand two separate map products.

The Nautical tab is still evolving, but structurally it follows the same pattern:

```text
Screen
  -> hooks/libs fetch data
  -> normalize data
  -> render cards/map/list
  -> user taps item
  -> maybe navigate to detail/map
```

---

## 16. Aviation Section

Main files:

```text
app/(tabs)/aviation.tsx
app/(tabs)/aviation-map.tsx
app/lib/aviation/
app/lib/maps/useAviationMapData.ts
components/maps/aviation/
```

The Aviation section handles:

- Turbulence.
- Icing.
- SIGMET/G-AIRMET-style products.
- PIREPs.
- Altitude filtering.
- Aviation hazard maps.

The aviation map data is normalized before display. This matters because aviation products can come from different feeds and have different shapes.

The map components then render polygons, fills, lines, and inspectors.

---

## 17. Space / Solar Section

Main file:

```text
app/(tabs)/solar.tsx
```

Related libraries:

```text
app/lib/spaceweather/
app/lib/aurora/
app/lib/astro/
```

This section focuses on:

- Solar activity.
- Aurora conditions.
- Space weather.
- Sky observing context.

This is similar to Land in structure:

```text
Fetch data
  -> derive readable labels/scores
  -> render cards and charts
```

The difference is that the raw data source is not regular surface weather.

---

## 18. Almanac and Astronomy

Main files:

```text
app/(tabs)/almanac.tsx
app/(tabs)/astro-map.tsx
components/astro/
app/lib/astro/
```

These pieces work with:

- Sun times.
- Moon times.
- Twilight.
- Darkness windows.
- Sky observing conditions.

The app uses helper functions to format times and compute windows. Like hourly forecasts, astronomy logic is sensitive to dates and time zones.

---

## 19. Styling System

There is no single giant design-system package, but the app uses repeated styling patterns:

- Glass panels.
- Cards.
- Dark translucent backgrounds.
- White text with opacity.
- Weather-themed accent colors.
- Shared typography helpers.

Important files:

```text
components/common/Glass.tsx
components/layout/Card.tsx
styles/typography.ts
constants/theme.ts
```

### Glass

`Glass.tsx` provides the translucent panel style used throughout the app.

When you changed glass transparency, this was one of the key files.

### Card

`Card.tsx` is another reusable container. It gives sections a consistent background, border, and spacing.

### Typography

`styles/typography.ts` helps the app switch text density/style based on WxLab mode.

---

## 20. The Backend Worker

Folder:

```text
omniwx-api/
```

This is a Cloudflare Worker. It is a lightweight backend that runs at the edge.

Main file:

```text
omniwx-api/src/index.ts
```

### Why Have a Backend?

The mobile app could call many services directly, but a backend helps because:

- Some APIs have awkward formats.
- Some APIs need proxying.
- Some responses should be cached.
- Some data needs combining.
- Mobile apps should avoid complicated service-specific logic when possible.

### What the Worker Does

The worker appears to support endpoints for things like:

- Open-Meteo proxying.
- Radar WMS/image requests.
- Land extremes.
- Bortle/light-pollution lookup.
- Weather/space/marine helper endpoints.

Think of it as a weather data translator:

```text
External weather service
  -> Cloudflare Worker
  -> simplified OMNIwx response
  -> mobile app
```

---

## 21. Network Helpers

The app uses helper utilities for network calls.

Important files:

```text
app/lib/net/apiBase.ts
app/lib/net/fetchWithTimeout.ts
```

### API Base

`apiBase.ts` decides the base URL for OMNIwx API calls.

This lets the app use environment variables such as:

```text
EXPO_PUBLIC_API_BASE
EXPO_PUBLIC_OMNIWX_API_BASE
```

### Fetch With Timeout

`fetchWithTimeout.ts` prevents network calls from hanging forever.

Conceptually:

```text
Start fetch
Start timer
If fetch wins -> return response
If timer wins -> cancel/fail
```

This is important for mobile apps because a bad network connection should not freeze the UI indefinitely.

---

## 22. Storage

The app uses `AsyncStorage` to remember user choices.

Examples:

- Settings.
- Active place.
- Favorites.
- Default city.

Files using storage include:

```text
app/context/SettingsContext.tsx
app/context/PlaceContext.tsx
```

`AsyncStorage` is like a tiny key/value database on the device.

Example:

```ts
AsyncStorage.setItem('omniwx:settings:tempUnit', 'F');
```

This is similar to:

```sql
INSERT INTO settings (key, value)
VALUES ('tempUnit', 'F');
```

Except it is local device storage, not a relational database.

---

## 23. How UI Updates Work

React Native follows this loop:

```text
State changes
  -> component re-renders
  -> React compares old UI and new UI
  -> native screen updates
```

Example:

```ts
const [selIdx, setSelIdx] = useState(0);
```

When a chart scrolls:

```ts
setSelIdx(idx);
```

Then React redraws:

- Active cursor line.
- Highlighted label.
- Selected card/tile.
- Any readouts depending on `selIdx`.

This is different from old-school UI programming where you might manually find a label and set its text.

---

## 24. How a User Action Travels Through the App

Example: tapping a land extreme.

```text
User taps extreme card
  -> onPress fires in app/(tabs)/extremes.tsx
  -> pushLandExtremeToMap(router, item)
  -> router.push('/maps', params)
  -> maps.tsx reads lat/lon/focus params
  -> map region is set to that location
  -> params are consumed/cleared
  -> user can pan normally
```

Example: changing forecast model.

```text
User picks model
  -> SettingsContext updates forecastModel
  -> AsyncStorage saves it
  -> Land/Hourly screen sees new setting
  -> useOpenMeteoForecast refetches with model param
  -> charts/cards re-render with new forecast data
```

Example: scrubbing radar timeline.

```text
User moves timeline
  -> dispatch SET_RADAR_FRAME
  -> map state updates frameIndex
  -> useRadarController chooses active frame/template
  -> MapRenderer receives new radar overlay props
  -> map layer changes
```

---

## 25. Build Process

The Android project is in:

```text
android/
```

The release APK command is:

```powershell
cd C:\Users\andym_au640pp\weather-app\android
.\gradlew.bat assembleRelease
```

The APK output is:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Before building, it is useful to run:

```powershell
npx tsc --noEmit
```

That checks TypeScript without generating files.

### What Happens During APK Build

Gradle:

1. Runs Android build tasks.
2. Bundles the JavaScript app.
3. Copies assets.
4. Compiles native Android pieces.
5. Packages everything into an APK.

When you see:

```text
BUILD SUCCESSFUL
```

the APK was produced.

---

## 26. How to Read the Code Without Getting Lost

The app is large, so do not start by reading every line.

Use this process:

### Step 1: Find the screen

If you care about the Land tab:

```text
app/(tabs)/index.tsx
```

If you care about the Maps tab:

```text
app/(tabs)/maps.tsx
```

If you care about Extremes:

```text
app/(tabs)/extremes.tsx
```

### Step 2: Find the data hook

Look for lines starting with `use...`.

Examples:

```ts
usePlace()
useSettings()
useOpenMeteoForecast()
useRadarController()
```

Those tell you where the screen gets its data.

### Step 3: Find derived variables

Search for variables like:

```ts
const tempF = ...
const windMph = ...
const pressureTrend = ...
const dpBand = ...
```

These are the bridge between raw data and UI.

### Step 4: Find JSX

JSX is the markup-looking part:

```tsx
<Text style={styles.title}>Land</Text>
<DailyRangeChart daily={daily} />
```

This tells you what appears on screen.

### Step 5: Find styles

Most files end with:

```ts
const styles = StyleSheet.create({
  ...
});
```

or:

```ts
const s = StyleSheet.create({
  ...
});
```

That is where colors, spacing, text sizes, borders, and layout rules live.

---

## 27. Common File Patterns

### Screen File Pattern

A screen usually looks like this:

```tsx
export default function SomeScreen() {
  const settings = useSettings();
  const place = usePlace();
  const forecast = useOpenMeteoForecast(...);

  const derivedValue = ...;

  return (
    <View>
      ...
    </View>
  );
}
```

### Component File Pattern

A reusable component usually looks like this:

```tsx
type Props = {
  title: string;
  value: string;
};

export function MetricCard({ title, value }: Props) {
  return (
    <View>
      <Text>{title}</Text>
      <Text>{value}</Text>
    </View>
  );
}
```

### Hook File Pattern

A hook usually looks like this:

```ts
export function useSomething(input) {
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      const result = await fetch(...);
      setData(result);
    }
    load();
  }, [input]);

  return { data };
}
```

---

## 28. Debugging Guide

### TypeScript Check

Run:

```powershell
npx tsc --noEmit
```

This catches syntax/type errors.

### Search for Code

Use `rg` if available:

```powershell
rg "Air Quality"
rg "pushLandExtremeToMap"
rg "DailyRangeChart"
```

If `rg` is unavailable or blocked, use PowerShell:

```powershell
Get-ChildItem -Recurse -Include *.tsx,*.ts | Select-String -Pattern "Air Quality"
```

### Build APK

Run:

```powershell
cd android
.\gradlew.bat assembleRelease
```

### Reading Errors

If TypeScript says:

```text
Cannot find name 'airQualityIndex'
```

It usually means a variable was used in JSX but not passed into the component or destructured from props.

If JSX says:

```text
JSX element 'View' has no corresponding closing tag
```

It means a `<View>` was opened but not closed with `</View>`.

---

## 29. How to Make Safe Changes

### For UI text changes

Search for the visible text.

Example:

```powershell
Select-String -Path 'app\(tabs)\index.tsx' -Pattern 'Air Quality'
```

Then update the nearby JSX.

### For colors/transparency

Search for `rgba`.

Common files:

```text
components/common/Glass.tsx
components/layout/Card.tsx
components/alerts/AlertBanner.tsx
```

### For chart layout

Daily:

```text
components/land/DailyRangeChart.tsx
```

Hourly:

```text
components/land/HourlyRangeChart.tsx
```

Look for:

```ts
TILE_W
GAP
padL
padR
xForIdx
```

These control alignment.

### For maps

Main map screen:

```text
app/(tabs)/maps.tsx
```

Map renderer:

```text
components/maps/MapRenderer.tsx
```

Radar controller:

```text
app/lib/maps/useRadarController.ts
```

Layer list:

```text
app/lib/maps/layerCatalog.ts
```

---

## 30. How to Explain OMNIwx to Someone Else

Here is a simple explanation:

> OMNIwx is a React Native weather app built with Expo. It has multiple weather modes such as Land, Hourly, Maps, Space, Nautical, Aviation, and Extremes. The app stores user settings and active location locally, fetches weather data through hooks and a Cloudflare Worker backend, normalizes the data into daily and hourly forecast objects, and renders that data through reusable cards, charts, and MapLibre map layers.

A more technical explanation:

> The app uses Expo Router for file-based navigation. `app/_layout.tsx` sets up global providers for settings, locations, active place, and WxLab mode. Each tab screen reads those providers, calls data hooks, derives display values, and passes data into reusable components. The map system uses a reducer-driven runtime state, a layer catalog, a radar controller, and a MapLibre wrapper. The backend worker in `omniwx-api` aggregates and normalizes external weather services for the mobile app.

---

## 31. Mental Model Cheat Sheet

```text
app/_layout.tsx
  = app shell and global providers

app/(tabs)/_layout.tsx
  = bottom tab bar

app/(tabs)/index.tsx
  = Land screen

app/(tabs)/hourly.tsx
  = Hourly screen

app/(tabs)/maps.tsx
  = Main map/radar screen

app/context/*
  = app-wide saved state

app/lib/*
  = data fetching, parsing, domain logic

components/*
  = reusable UI pieces

omniwx-api/*
  = Cloudflare Worker backend

android/*
  = native Android project and APK build output
```

---

## 32. Suggested Learning Path

If you want to understand the app deeply, study it in this order:

1. `app/_layout.tsx`
2. `app/(tabs)/_layout.tsx`
3. `app/context/SettingsContext.tsx`
4. `app/context/PlaceContext.tsx`
5. `app/lib/openmeteo/hooks.ts`
6. `app/(tabs)/index.tsx`
7. `components/land/DailyRangeChart.tsx`
8. `app/(tabs)/hourly.tsx`
9. `components/land/HourlyRangeChart.tsx`
10. `app/(tabs)/maps.tsx`
11. `app/lib/maps/state.ts`
12. `app/lib/maps/layerCatalog.ts`
13. `app/lib/maps/useRadarController.ts`
14. `components/maps/MapRenderer.tsx`
15. `app/(tabs)/extremes.tsx`
16. `omniwx-api/src/index.ts`

Do not start with `omniwx-api/src/index.ts` or `app/(tabs)/index.tsx` if you are tired. They are large files. Start with contexts and hooks first.

---

## 33. Practical Exercises

### Exercise 1: Trace the Temperature

Goal: explain how the current temperature appears on the Land tab.

Trace:

```text
active place
  -> useOpenMeteoForecast
  -> hourly/daily data
  -> tempF variable
  -> Text component in Land tab
```

### Exercise 2: Trace a Favorite Location

Goal: explain how a saved favorite works.

Trace:

```text
User taps save
  -> PlaceContext addFavorite
  -> favorites state changes
  -> AsyncStorage saves favorites
  -> UI re-renders favorite list
```

### Exercise 3: Trace a Radar Frame

Goal: explain how radar animation changes.

Trace:

```text
Map screen
  -> useRadarController
  -> frame list
  -> current frame index
  -> MapRenderer radar prop
  -> RasterSource/RasterLayer
```

### Exercise 4: Trace an Extreme Tap

Goal: explain how tapping an extreme moves to the map.

Trace:

```text
extremes.tsx
  -> pushLandExtremeToMap
  -> router params
  -> maps.tsx routeFocusTarget
  -> map region/camera seed
```

---

## 34. Final Summary

OMNIwx is best understood as a set of screens powered by shared state and data hooks.

The most important ideas are:

- **Providers** hold app-wide state.
- **Hooks** fetch and normalize data.
- **Screens** assemble data and decide what to show.
- **Components** render reusable pieces of UI.
- **Reducers** manage more complex state like maps.
- **The backend worker** simplifies external weather services.
- **The Android folder** packages everything into an APK.

Once you understand those pieces, the app stops being one giant wall of code and becomes a set of connected systems.

The fastest way to get comfortable is to trace one feature at a time:

```text
Where does the data come from?
Where is it transformed?
Where is it rendered?
What state changes when the user interacts?
```

That question pattern will work for almost every part of OMNIwx.

---

## 35. Current Architecture Snapshot - June 2026

This section is the practical "what we have now" layer. Treat it as the current owner manual for the app.

### App Version and Build Identity

The current Android/Expo app identity is split across several files:

- `package.json`: npm package version.
- `app.json`: Expo version, Android package, Android version code, app scheme, plugins, and EAS project id.
- `android/app/build.gradle`: native Android `versionCode` and `versionName`.
- `android/app/src/main/AndroidManifest.xml`: native permissions, Android Auto service, widget receivers, and deep link intent filters.

Current closed-test build identity:

- Current release example: app version `1.1.173`, Android version code `10190`.
- Play release note file: `docs/google-play-closed-testing-release-notes.md`.

Radar release note: broad/national radar should prefer the RainViewer mosaic. RainViewer frames now require their generated `/v2/radar/<frame-id>` path, so the app forwards that path to the Worker and the Worker still supports older timestamp-only requests by looking up the matching RainViewer frame path.

Radar playback note: provider swaps, product swaps, zoom handoffs, and Storm Scope toggles must preserve playback by nearest timestamp. Do not dispatch `SET_RADAR_FRAME` with `frameIndex: 0` from UI controls unless the user explicitly scrubbed to the first frame.

Storm Scope state note: Storm Scope should be driven by `radarTime.stormMode`, not by multiple overlapping flags. Any legacy `storm` route/view should normalize back through the standard radar view with Storm Scope enabled so the visible chip remains the single on/off control. Normal radar owns the automatic RainViewer-to-NEXRAD zoom handoff; Storm Scope is an explicit chaser/workstation tool layered on top of that workflow.

Radar playlist note: when provider frames refresh, map the new playlist to the displayed timestamp, but do not snap to frame `0` just because the old timestamp falls before the new frame list. Preserve the user's current loop position unless the user actually scrubbed to the first frame.

Radar handoff note: broad zoom should use the RainViewer mosaic, close zoom should latch into nearest local NEXRAD with hysteresis, and MapLibre radar source IDs should include the active radar mode so stale provider tiles cannot remain behind after a provider switch.

Map-control release note: zoom buttons are intentionally camera-only controls. They should never recenter the map, switch Storm Scope, select a radar station, alter layers, or change radar products. Recording animated map loops belongs in the timeline control cluster as a red record-dot button beside playback controls, not as a separate text pill.

When Google Play says a version code has already been used, the number that matters most is Android `versionCode`. The public-looking version string is `versionName`, but Play Console uniqueness is driven by `versionCode`.

Practical release rule:

1. Bump `expo.version` in `app.json`.
2. Bump `android.versionCode` in `app.json`.
3. Bump `versionCode` and `versionName` in `android/app/build.gradle`.
4. Bump `package.json` and `package-lock.json` if you want repo metadata aligned.
5. Build the release AAB from `android/` with `./gradlew.bat :app:bundleRelease`.
6. Verify the packaged manifest if Play Console is acting strange.

### Native Android Is Now Part of the App

This project is no longer a pure managed Expo app. It has real native Android code under `android/`.

That matters because:

- Android Auto requires native AndroidX Car App code.
- Home-screen widgets require native AppWidgetProvider and RemoteViews.
- MP4 export uses a native Android module for MediaCodec and MediaMuxer.
- Manifest changes are real app behavior changes.

Current native areas:

- `android/app/src/main/java/com/anonymous/weatherapp/car/OmniWeatherCarAppService.kt`
- `android/app/src/main/java/com/anonymous/weatherapp/widget/*`
- `android/app/src/main/java/com/anonymous/weatherapp/video/OmniwxVideoExportModule.kt`
- `android/app/src/main/res/layout/omniwx_widget_*.xml`
- `android/app/src/main/res/xml/omniwx_widget_*_info.xml`
- `android/app/src/main/AndroidManifest.xml`

You can still use Expo Router and React Native for the phone app, but anything under `android/app/src/main/java/com/anonymous/weatherapp/` must compile through Gradle.

### Deep Links

The app scheme is `weatherapp`.

Android deep links are accepted by `MainActivity` through the `weatherapp` and `exp+weather-app` schemes. Widgets and native surfaces should use actual Expo Router paths that exist, not invented paths.

Safe mental mapping:

- Land tab: root tab/index behavior.
- Hourly tab: `/(tabs)/hourly`.
- Almanac tab: `/(tabs)/almanac`.
- Maps tab: `/(tabs)/maps`.
- Space tab: `/(tabs)/solar`.
- Nautical tab: `/(tabs)/nautical`.
- Aviation tab: `/(tabs)/aviation`.
- Extremes tab: `/(tabs)/extremes`.

If a widget opens an "Unmatched Route" screen, the native PendingIntent probably used a path that Expo Router does not recognize.

### Settings and Preferences

User preferences are mostly stored in AsyncStorage.

Important settings live in `app/context/SettingsContext.tsx`:

- Temperature unit: `F` or `C`.
- Base map style: `dark` or `light`.
- Radar provider: `iem` or `rainviewer`.
- Forecast model: `best_match`, `gfs`, `ecmwf`, or `dwd_icon`.
- App color mode: classic, grayscale, or high contrast.
- Always use WxLab: if true, Land and Hourly should start in detailed mode.

The Settings screen is `app/profile.tsx`. It is not just a profile screen anymore; it is the app preferences hub.

When adding a setting, remember the full chain:

1. Add the type to `SettingsContext`.
2. Add an AsyncStorage key.
3. Load and validate the stored value.
4. Persist changes in a `useEffect`.
5. Expose the setter in the context value.
6. Add UI in `app/profile.tsx`.
7. Make the relevant screen read the setting.

### WxLab

WxLab is a shared mode, not a separate route.

The current context is `app/context/WxLabContext.tsx`. It stores:

- `wxLab`
- `setWxLab`
- `toggleWxLab`

`SettingsContext` owns `alwaysUseWxLab`. `WxLabProvider` watches that setting and turns WxLab on when the preference is enabled.

Practical meaning:

- Simple mode should be clean, compact, and broadly readable.
- WxLab mode should be more analytical and detailed.
- The toggle can move in the UI, but the source of truth should remain the shared context.

## 36. Current Screen Guide

### Land

Primary file:

- `app/(tabs)/index.tsx`

Land is the first screen most users experience. It currently combines:

- active place header with logo/location/settings behavior
- alert card
- Simple/WxLab mode toggle
- animated weather background
- daily range card
- low-to-high temperature range bar
- current temperature marker
- records for the date/location
- metric grid
- 15-day forecast list
- no astronomy arc in Simple; keep the everyday surface compact
- sun and moon arcs, timing, phase, and darkness context in wxLab

Recent product intent:

- The logo acts as the settings entry point.
- The top header should stay compact so alerts and daily range move upward.
- Hourly and Almanac buttons were removed from the top tile to reduce vertical waste.
- Low and high tiles should match the slider direction: low on the left, high on the right.
- Climatology context was removed from Land because Almanac owns climate context.

Things to be careful about:

- Large cards can easily push the 15-day forecast below the fold.
- Long location names need room.
- Phone status bars and bottom tabs consume real space.
- The animated background should not make text unreadable.
- The Simple and WxLab versions should feel related, not like two unrelated screens.

### Hourly

Primary file:

- `app/(tabs)/hourly.tsx`

Hourly is the short-term forecast surface. It shares active place, forecast model, units, and WxLab mode.

When changing Hourly, check:

- Does it still respect Fahrenheit/Celsius?
- Does it still use the same active place as Land?
- Does it stay usable when WxLab is forced on from Settings?
- Does horizontal tab swipe interfere with chart scrolling?

### Almanac

Primary file:

- `app/(tabs)/almanac.tsx`

Important libraries:

- `app/lib/almanac/records.ts`
- `app/lib/almanac/recordsCache.ts`
- `app/lib/almanac/recordsStation.ts`
- `app/lib/almanac/resolveRecordStation.ts`
- `app/lib/almanac/useDailyRecordsHook.ts`
- `app/lib/almanac/dayContextHook.ts`
- `app/lib/almanac/observationsHook.ts`

Almanac owns:

- normal high and low
- prior-year high and low
- prior-year precip
- record high and date/year
- record low and date/year
- record precip and date/year
- climate arch visualization
- selected day context

Important product rule:

Pull-to-refresh on Almanac should refresh current forecast and record data. It should not make the page feel like it is re-downloading the entire identity of the location unless that is truly necessary.

### Maps

Primary file:

- `app/(tabs)/maps.tsx`

Core map files:

- `app/lib/maps/views.ts`
- `app/lib/maps/state.ts`
- `app/lib/maps/layerCatalog.ts`
- `components/maps/MapRenderer.tsx`
- `components/maps/LayerSheet.tsx`
- `components/maps/LayerSheetModal.tsx`
- `components/maps/LayerDrawer.tsx`
- `components/maps/LegendOverlay.tsx`
- `components/maps/AnimationCompositor.tsx`

The map system has three ideas:

- A **view** is a preset or mode, such as Weather, Storm Scope, Wildfire, Nautical, Aviation, or Astronomy.
- A **layer** is a specific overlay, such as radar, alerts, marine conditions, fronts, or satellite imagery.
- A **control surface** is the drawer/legend/selector UI shown for a mode.

Current map views from `app/lib/maps/views.ts`:

- `radar`: Weather
- `clouds`: Clouds
- `wildfire`: Wildfire
- `storm`: Storm Scope
- `aviation`: Aviation
- `mariner`: Nautical
- `astronomer`: Astronomy

Important rule:

Astronomy and Aviation should not be active at the same time. Their control surfaces are complex and should remain mutually exclusive.

### Storm Scope

Storm Scope is the advanced radar mode. It should feel like a premium radar competitor.

Expected ingredients:

- radar reflectivity
- nearest NEXRAD behavior when zoomed in
- radar products
- range markers
- fronts
- lightning
- alert polygons
- timeline controls
- animation loop duration controls
- smooth/cinematic/presentation playback settings
- record/export option

Product distinction:

- Basic Weather mode should be broadly usable and not require people to know radar station details.
- Storm Scope is where power-user radar controls belong.
- Storm Scope should toggle on top of the normal radar map workflow. It should not force the user into a separate map view or prevent panning away from the active location.

### Nautical

The Nautical tab still exists, but the direction is to move nautical map functionality into Maps.

Current desired behavior:

- Main Maps tab keeps a Nautical mode.
- Nautical overlays should include one practical marine layer that shows marine zones and buoys.
- Clicking a buoy should open buoy observations/details similar to the Nautical screen.
- Clicking a marine polygon should show official NOAA marine forecast text when available.
- Extremes sea routes should open the main weather map, not an old standalone nautical map.

Be careful:

- Alert polygons and marine polygons can overlap.
- If the user clicks a warning over a marine zone, the app should still show the official message or relevant forecast panel rather than making the user fight the z-order.
- Marine users need official language preserved. Summaries are helpful, but the official NOAA product matters.

### Aviation

Primary file:

- `app/(tabs)/aviation.tsx`

Map mode:

- `app/(tabs)/aviation-map.tsx`
- `components/maps/aviation/*`
- `app/lib/maps/useAviationMapData.ts`
- `app/lib/aviation/*`

Aviation has two user-facing briefing modes:

- Airport Briefing
- Route Briefing

Airport Briefing should show:

- station code
- airport name
- overall flight category
- plain-English status
- wind
- visibility
- ceiling
- altimeter
- decoded METAR
- TAF timeline
- decoded TAF
- raw products

Route Briefing should show:

- route
- cruise altitude
- departure time
- overall risk
- plain-English route concern
- turbulence/icing/category/SIGMET/CWA/PIREP badges
- visual route map
- route strip checkpoints
- worst segment
- checkpoint cards with expandable pilot details

Current widget direction:

- There should be separate aviation widgets for home airport and saved route because those answer different pilot questions.
- Airport widget: "What is my field doing now?"
- Route widget: "What could bite me along this corridor?"

Important UI pitfall:

The VFR/IFR badge must stay inside the screen/card bounds on narrow phones. If it hangs off the right edge, the layout is too absolute or too wide for the available viewport.

### Space and Astronomy

Primary tab:

- `app/(tabs)/solar.tsx`

Astronomy map:

- `app/(tabs)/astro-map.tsx`
- `app/lib/astro/skyScore.ts`
- `app/lib/astro/skyScoreCache.ts`
- `app/lib/astro/skyGrid.ts`

Space owns the Sky Score card, aurora/space weather context, and the entry into the astronomy map.

Current Sky Score expectations:

- App Sky Score and widget Sky Score should match. If they do not, the widget is probably using a fallback or stale/native calculation instead of the same cached app data.
- Widget should deep link to the Space tab.
- Bortle should display when available.
- Low/mid/high clouds should be shown when available.
- Best viewing window and dark window matter.
- Aerosols and local sky brightness matter for deep-sky viewing.

Astronomy map direction:

- Astronomy mode should feel like the original full astronomy map, not a reduced "astro map lite."
- The drawer should include the richer astronomy details that existed before.
- Sky Score and Aurora should not appear as ordinary layer toggles in the main overlay selector for now.

### Extremes

Primary file:

- `app/(tabs)/extremes.tsx`

Current product direction:

- Do not separate U.S. extremes as their own special section.
- Show a unified list of extremes regardless of where they are in the world.
- Let people add places to Extremes, likely from saved locations.
- Extremes can become a notification category.

Extremes should link into the correct surface:

- land/radar/weather extremes should go to Maps or Land depending on context
- marine/sea route extremes should go to the main Maps tab with Nautical mode/layers, not old standalone maps
- space extremes should connect to Space

## 37. Native Android Widgets

Widgets are not React Native UI. They are Android RemoteViews.

Widget provider classes live in:

- `android/app/src/main/java/com/anonymous/weatherapp/widget/`

Widget XML layouts live in:

- `android/app/src/main/res/layout/`

Widget provider metadata lives in:

- `android/app/src/main/res/xml/`

Registered widgets in the manifest include:

- Current
- Current + Radar
- SkyScore
- Aviation
- Airport Board
- Route Briefing
- Climatology
- Climate Arch

Shared native data helper:

- `OmniwxWidgetData.kt`

Refresh/scheduling:

- `OmniwxWidgetScheduler.kt`
- `OmniwxWidgetRefreshReceiver.kt`

Important widget principles:

- Widgets should be glanceable.
- Widgets should match OMNIwx dark glass style.
- Widgets should not require live React Native components.
- Widgets should use cached/shared data when possible.
- Widgets should gracefully show "Open OMNIwx to refresh" when data is missing.
- Refresh buttons should update widget content without causing excessive API calls.
- 15-minute refresh is aggressive for Android widgets; make sure scheduling respects Android limits and does not drain battery.

Common widget bug:

If the widget says it cannot be added, check XML dimensions, class registration, manifest receiver names, and layout resource validity.

Common widget data bug:

If the widget displays different values from the app, the native code is probably using a different endpoint, fallback calculation, or stale cache than the React Native screen.

## 38. Android Auto

Android Auto is implemented in:

- `android/app/src/main/java/com/anonymous/weatherapp/car/OmniWeatherCarAppService.kt`

Manifest permissions/metadata:

- `androidx.car.app.ACCESS_SURFACE`
- `androidx.car.app.MAP_TEMPLATES`
- `com.google.android.gms.car.application`
- `androidx.car.app.minCarApiLevel`

OMNIwx uses AndroidX Car App templates. The car app is not just the phone UI squeezed into a dashboard.

Current Android Auto features include:

- current conditions
- alerts
- hourly list/screen
- five-day/daily forecast screen
- nearby radar entry
- Sky Score entry
- refresh action
- radar map surface renderer

Radar in Android Auto:

- Uses a custom surface renderer, not a normal React Native MapLibre view.
- Fetches RainViewer timeline.
- Draws tiles around the current location.
- Registers the renderer through `AppManager` while the radar screen is visible.
- Uses a `MapTemplate` so radar fills the map canvas instead of appearing as a row thumbnail.
- Keeps only compact status, alert, and refresh controls in the overlay pane.
- Detaches the callback and recycles tile bitmaps when the radar screen stops.

Important Android Auto constraints:

- Many arbitrary layouts are not allowed.
- Interaction is intentionally limited for driving safety.
- Visual richness has to be achieved through templates, panes, rows, icons, map surfaces, and carefully chosen text.
- If a screen traps the user, make sure the template has a back action or the screen manager stack can pop.

Testing reality:

The user's Toyota 2023 4Runner matters. Android Auto behavior can vary by head unit, screen size, Car API level, and phone/vehicle software. A fix that works in emulator may still need testing in the vehicle.

## 39. Radar, Satellite, Animation, and Export

Radar and satellite animation are now one of OMNIwx's standout areas.

Key files:

- `app/lib/maps/useRadarController.ts`
- `app/lib/maps/radar/useAnimatedRadar.ts`
- `app/lib/maps/radar/RadarOverlay.tsx`
- `app/lib/maps/animationFrameCache.ts`
- `components/maps/BufferedAtmosphericLayer.tsx`
- `components/maps/AnimationCompositor.tsx`
- `app/lib/maps/videoExport.ts`
- `android/app/src/main/java/com/anonymous/weatherapp/video/OmniwxVideoExportModule.kt`

Current animation concepts:

- Radar, infrared, true color, water vapor, and paired east/west visible clouds can be animated through one buffered engine.
- The app supports longer loops, up to around 5 hours depending on source availability.
- Viewport images are downloaded into a bounded local cache with global concurrency limits.
- Playback waits for a small lead buffer and skips failed source frames.
- Persistent front/back MapLibre image slots keep the last complete frame visible until the next local frame is ready.
- Native layer opacity animation blends from the current frame to the next without driving full-screen React renders.
- Radar and satellite use independent buffered channels so both can animate in layered map workflows.
- Panning or zooming retains the previous complete viewport while replacement imagery is prepared.
- Record-mode preview uses the same buffered compositor as normal playback.
- It loops from the final frame back to the first instead of ping-ponging.
- Native export can create MP4 files on Android.

Smooth/Cinematic/Presentation mental model:

- **Smooth**: faster, lightweight playback for normal use.
- **Cinematic**: more emphasis on blended transitions and visual polish.
- **Presentation**: slower, clearer playback for showing or recording what is happening.

True color reality:

- True color/GeoColor imagery may not be available at the same cadence everywhere or every time.
- Some services update every 10 to 15 minutes; some products appear hourly or have delayed imagery.
- If true color seems sparse, inspect the actual returned time-enabled frames before assuming the app is broken.

Infrared reality:

- Infrared should preserve the map aspect and the recording aspect.
- Stretching usually means the export/composition code is drawing source imagery into a destination rectangle without preserving the viewport ratio.
- Portrait recordings should produce portrait videos when the user is in portrait mode.

MP4 export pitfalls:

- Need at least two prepared frames.
- All frame URLs need to download successfully.
- Android codec support varies by device.
- Width and height should be even numbers.
- Bitrate too low causes muddy output; bitrate too high can fail on older devices.
- The MediaStore save step is separate from the temporary file encode step.

## 40. Notifications

Notification preferences live in:

- `app/lib/notifications/preferences.ts`
- `app/lib/notifications/useNotificationPreferences.ts`

Settings UI lives in:

- `app/profile.tsx`

Current categories:

- NWS alerts
- New fires
- Kp spikes
- Aviation category
- Sky score
- Extremes

Current client behavior:

- Requests notification permission.
- Creates Android notification channel `omniwx-alerts`.
- Stores enabled/disabled state and category selection in AsyncStorage.
- Stores Expo push token when permission is granted.
- Attempts to register with `/api/notifications/register` if an API base and token exist.
- Can schedule a local test notification.

Important limitation:

Client preferences are not the same thing as a full production push pipeline. To actually send push notifications for weather events, the backend needs scheduled/event-driven logic that compares latest data with previous known state and sends pushes only when thresholds are met.

What the backend eventually needs:

- device registration endpoint
- token/category storage
- saved place storage or user/location association
- periodic checks for NWS alerts, fires, Kp, aviation categories, sky score, and extremes
- deduplication so users do not get spammed
- quiet hours or severity filtering
- token cleanup for invalid push tokens

## 41. wxLearn as a Real Surface

wxLearn is no longer just a "learn more" popup. It is the education layer for OMNIwx.

Primary files:

- `app/lib/learn/topics.ts`
- `components/common/LearnMoreModal.tsx`
- `components/common/NerdyExplainModal.tsx`

The library is organized by shelves:

- Start Here
- Land Weather
- Comfort
- Clouds & Precip
- Maps & Radar
- Marine
- Aviation
- Space Weather
- Astronomy
- Data & Units

When adding or editing a metric, ask:

- Does this value have units that need explanation?
- Is it official, observed, model-backed, derived, curated, or source-dependent?
- Is there a formula?
- Are there thresholds?
- Does the topic explain why the user should care?
- Does the pressable tile open the most relevant topic?

For technical features, wxLearn should explain both the concept and the limitation. Examples:

- AQI should explain pollutants, not just the index number.
- Solar wind density should use a real unit such as `particles/cm^3`.
- Marine zones should explain official forecast boundaries versus actual ocean conditions.
- Aviation products should explain altitude, valid time, units, and operational meaning.
- Radar products should explain what the product can and cannot show.
- Global products should explain coverage honestly.

Maintenance rule:

If a screen introduces a new pressable data tile, chart series, unit, model field, or official product type, update `app/lib/learn/topics.ts` in the same change.

## 42. How to Make Changes Without Breaking the App

When working on OMNIwx, think in layers.

### If You Change UI

Check:

- small Android phone width
- large Android phone width
- long location name
- bottom tab overlap
- status bar overlap
- Simple and WxLab mode
- dark/light base map if relevant
- app color mode if relevant

Run:

```bash
npx tsc --noEmit
npm run lint -- --quiet
```

### If You Change Maps

Check:

- `app/lib/maps/types.ts`
- `app/lib/maps/views.ts`
- `app/lib/maps/layerCatalog.ts`
- `app/lib/maps/state.ts`
- `components/maps/MapRenderer.tsx`
- legend and drawer behavior
- click handling/z-order
- animation readiness
- source attribution

For map clicks, ask:

- Is the user clicking a point, polygon, raster, or map background?
- Which layer should win if features overlap?
- Should an alert open official NWS text?
- Should a marine polygon open the NOAA marine forecast?
- Should the inspector show raw details or hide them behind an expandable section?

### If You Change Widgets

Run a full Android build. TypeScript is not enough.

Check:

- layout XML compiles
- provider XML is valid
- provider class name matches manifest
- tap PendingIntent opens a real route
- refresh receiver works
- stale data fallback looks acceptable
- widget can be added on a real launcher

### If You Change Android Auto

Run a full Android build and test on real Android Auto when possible.

Check:

- no screen traps
- back action works
- refresh action works
- car app starts without requiring unsafe phone interaction
- radar surface does not crash
- unavailable data produces a clear fallback

### If You Change Native Video Export

Run:

```bash
cd android
./gradlew.bat :app:bundleRelease
```

Then test on a real device:

- radar export
- infrared export
- true color export
- portrait orientation
- landscape orientation
- saved MP4 playback in gallery/files

## 43. Current Mental Model Cheat Sheet

Use this when you are trying to orient quickly:

- **Expo Router** decides which phone screen appears.
- **Context providers** remember settings, place, locations, and WxLab mode.
- **Hooks** fetch or derive data.
- **Components** render cards, charts, maps, and controls.
- **Map views** are presets.
- **Map layers** are overlays.
- **Layer catalog** is the menu/source of truth for layer metadata.
- **MapRenderer** is where layers become MapLibre sources/layers.
- **wxLearn** is the shared education layer for units, formulas, source context, and limitations.
- **Nautical map behavior** is moving into Maps.
- **Astronomy and Aviation** are special map modes, not ordinary simple overlays.
- **Widgets** are native Android RemoteViews.
- **Android Auto** is native AndroidX Car App.
- **Video export** is native Android MediaCodec/MediaMuxer.
- **Notifications** currently have client preferences; full alerting needs backend event logic.

## 44. Personal Maintenance Notes

These docs are intentionally more detailed and more opinionated than public documentation.

Keep them useful by updating them whenever you make a meaningful product-direction change, especially when:

- a standalone screen becomes a map mode
- a widget is added
- Android Auto behavior changes
- notification categories change
- wxLearn shelves/topics or pressable education links change
- a user-facing mental model changes
- a build/version issue happens
- a major bug reveals an architectural trap

If these docs are kept out of commits, they can stay honest and specific without worrying about whether every sentence belongs in public project documentation.
