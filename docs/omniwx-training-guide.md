# OMNIwx Training Guide

**A beginner-friendly guide to how your app is structured, how the code works together, and how to explain it.**

Audience: this is written for someone who can write a basic Python `hello world`, understands simple variables/functions, and has some basic SQL experience. You do not need to already know React Native, Expo, TypeScript, or mobile app architecture.

Last updated: May 9, 2026

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
- Local high-zoom image mode.
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

### Tile Mode vs Local Image Mode

At broader zoom levels, radar is usually rendered as map tiles.

At high zoom levels, the app can switch to a generated local image/WMS-style overlay. That can improve detail and reduce tile churn.

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

The app has a separate nautical map because marine data and buoy interactions are different from the general radar map.

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

