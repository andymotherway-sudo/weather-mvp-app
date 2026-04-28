# How OMNIwx Works

This document explains the app in plain English from the code that is in this repository right now.

It is written for someone who is not deeply familiar with coding, React, or mobile app structure.

## 1. What This App Is

OMNIwx is a React Native mobile app built with Expo and Expo Router.

At a high level, the app does four jobs:

1. It decides which screen to show.
2. It remembers user state such as location, favorites, and display mode.
3. It fetches weather and environmental data from APIs.
4. It turns that data into screens like Land, Maps, Nautical, Almanac, Solar, and Aviation.

You can think of it as:

- UI layer: what the user sees and taps
- state layer: what the app remembers
- data layer: how the app loads weather data
- backend layer: the Cloudflare Worker in `omniwx-api/`

## 2. The Main Tech Stack

From `package.json`, the important pieces are:

- `react` and `react-native`: the core UI system
- `expo`: the app runtime and native tooling
- `expo-router`: file-based routing for screens
- `@react-native-async-storage/async-storage`: local storage on the device
- `expo-location`: GPS and permission handling
- `@maplibre/maplibre-react-native`: map rendering
- `react-native-svg` and `@shopify/react-native-skia`: drawing charts and visual effects

That means this is not a traditional website. It is a mobile app codebase, but the structure still feels similar to a web React app.

## 3. The Highest-Level Structure

The repo is organized like this:

- `app/`: screens, routes, app-level contexts, and feature libraries
- `components/`: reusable UI pieces
- `app/lib/`: most data hooks, API functions, and feature logic
- `app/context/`: shared app-wide state
- `omniwx-api/`: backend worker used as your API layer
- `assets/`: images and weather videos
- `docs/`: project notes and requirements

The key idea is:

- `app/(tabs)/*.tsx` = user-facing screens
- `app/lib/**` = logic and data loading behind those screens
- `components/**` = reusable visual building blocks
- `omniwx-api/src/index.ts` = server-side API endpoints

## 4. How the App Starts

The app entry point is [`app/_layout.tsx`](../app/_layout.tsx).

That file sets up the global wrapper around the whole app:

- `SettingsProvider`
- `LocationsProvider`
- `PlaceProvider`
- `WxLabProvider`
- `AppBoot`
- `Stack`

In plain English:

1. The app boots.
2. Shared state providers are created.
3. boot logic decides whether onboarding is required.
4. Expo Router renders the current screen.

### What `AppBoot` does

`components/boot/AppBoot.tsx` is the startup gatekeeper.

Its job is to:

- keep the splash screen visible while important startup work happens
- check whether a default city exists in storage
- redirect the user into onboarding if the app has not been configured yet
- show the OMNIwx brand overlay briefly

This is a very common pattern in apps: do minimal startup work, decide whether the user can continue, then show the main UI.

## 5. How Navigation Works

This app uses Expo Router, which means the folder names inside `app/` define routes.

Important route groups:

- `app/(onboarding)/...`: onboarding screens
- `app/(tabs)/...`: the main tab bar experience
- `app/modal.tsx`: modal screen
- `app/buoy/[buoyId].tsx`: parameterized route for a buoy detail page
- `app/nautical/zone/[zoneId].tsx`: parameterized route for marine zones

The tab layout is defined in [`app/(tabs)/_layout.tsx`](../app/(tabs)/_layout.tsx).

That file creates the bottom tab bar and wires visible screens like:

- `index` -> Land
- `hourly` -> Hourly
- `almanac` -> Almanac
- `maps` -> Maps
- `solar` -> Space
- `nautical` -> Nautical
- `aviation` -> Aviation
- `extremes` -> Extremes

Some routes exist but are hidden from the tab bar using `href: null`, such as:

- `mariner`
- `astronomer`
- `nautical-map`
- `astro-map`

## 6. What a Context Is in This App

A context is shared state that many screens can use without passing it manually through every component.

You can think of context as a global app memory bucket.

This app has several important contexts.

### `SettingsContext`

File: [`app/context/SettingsContext.tsx`](../app/context/SettingsContext.tsx)

Right now this is simple. It stores:

- `tempUnit`
- `setTempUnit`

So if one screen changes Fahrenheit to Celsius, any screen using that context can react to it.

### `LocationsProvider`

File: [`app/lib/locations/useLocations.tsx`](../app/lib/locations/useLocations.tsx)

This is one of the core state systems in the app.

It manages:

- favorites
- which location is active
- current GPS coordinates
- last known current-location label
- hydration from device storage

Important details:

- it uses `AsyncStorage` to persist data locally
- it requests foreground location permission
- it warms up current location on startup
- it exposes helper functions like `refreshCurrentLocation`, `setActiveCurrent`, and `addOrActivateFavorite`

### `PlaceContext`

File: [`app/context/PlaceContext.tsx`](../app/context/PlaceContext.tsx)

This sits on top of the lower-level location system and adds app-specific place behavior.

It handles:

- the current active place the app should use
- saved favorites
- switching to GPS
- default city behavior
- migration logic for an older default-place setup

This is important because the app concept of "place" is more opinionated than raw device coordinates.

### `WxLabContext`

File: [`app/context/WxLabContext.tsx`](../app/context/WxLabContext.tsx)

This stores a simple boolean:

- `wxLab`

That toggle changes whether the user is in a more advanced weather-analysis mode.

A good mental model:

- simple mode = easier user-facing presentation
- WxLab mode = more "nerdy" or advanced interpretation

## 7. What a Hook Is

A hook is a React function that lets components use state, effects, memoization, or reusable behavior.

Hooks almost always start with `use`.

Examples:

- `useState`
- `useEffect`
- `useMemo`
- `useContext`
- custom hooks like `useCurrentWeather`

### Simple definition

A hook is a reusable chunk of component logic.

Instead of copying the same fetch/state/error/loading code into many screens, the app puts that logic in a hook and reuses it.

### Hooks you use from React

#### `useState`

Stores changing values inside a component.

Example meaning:

- "is the modal open?"
- "what is the selected map layer?"
- "what is the loaded forecast data?"

#### `useEffect`

Runs side effects when something happens.

Examples:

- fetch data when a screen loads
- save state when something changes
- start boot logic on startup

#### `useMemo`

Caches a computed value so React does not recalculate it every render unless its inputs changed.

More on this in the memo section below.

#### `useCallback`

Caches a function reference.

This matters when child components depend on function identity or when an effect depends on a function.

#### `useContext`

Reads values from a context provider such as location, settings, or WxLab mode.

### Custom hooks in this app

This project has many custom hooks. These are some of the most important:

- `useLocations`
- `usePlace`
- `useCurrentWeather`
- `useOpenMeteoForecast`
- `useFireContext`
- `useNwsAlerts`
- `useNauticalSummary`
- `useMarineForecast`
- `useRadarController`
- `useAviationMapData`
- `useWildfireMapData`
- `useClimatology`
- `useDailyRecordsHook`

These custom hooks are where most of the real application behavior lives.

## 8. What "Memos" Means Here

When people say "memos" in React, they usually mean one of two things:

1. `useMemo(...)`
2. `React.memo(...)`

They are related, but not the same.

### `useMemo`

`useMemo` stores the result of a calculation.

Example from [`app/(tabs)/_layout.tsx`](../app/(tabs)/_layout.tsx):

- the tab bar style is built with `useMemo`
- it only recalculates when `insets.bottom` changes

Why that matters:

- tab bar styles do not need to be rebuilt on every render
- only changes in screen safe-area padding should force a new style object

Example from [`app/lib/openmeteo/hooks.ts`](../app/lib/openmeteo/hooks.ts):

- latitude and longitude are rounded into `latKey` and `lonKey` with `useMemo`

Why:

- tiny floating-point GPS noise should not trigger unnecessary reloads
- it stabilizes the fetch inputs

Example from [`app/lib/locations/useLocations.tsx`](../app/lib/locations/useLocations.tsx):

- `activeFavorite`, `activeCoords`, and `activeLabel` are memoized

Why:

- those are derived values from the main location state
- React can reuse them until their inputs actually change

### `React.memo`

`React.memo(Component)` wraps a component so React can skip re-rendering it if its props are unchanged.

This appears in map-related components like:

- `components/maps/TimelineScrubber.tsx`
- `components/maps/overlays/OverlayEngine.tsx`

Why it matters there:

- map UIs are expensive
- radar animation and overlays can update often
- skipping unnecessary re-renders helps performance

### Plain-English meaning of memoization

Memoization means:

"If I already solved this with the same inputs, reuse the old answer."

This app uses memoization heavily in:

- charts
- maps
- derived location state
- tab styling
- radar frame management
- expensive data transforms

## 9. What an API Is in This App

An API is just a way one piece of software asks another piece of software for data.

In this app, there are three main API patterns:

1. the mobile app calls your own backend Worker
2. the mobile app calls third-party services directly
3. the Worker itself calls third-party services on behalf of the app

That distinction matters.

## 10. Your Main Backend API

Your `.env` file contains:

`EXPO_PUBLIC_API_BASE=https://omniwx-api.omniwx.workers.dev`

That means the app's own backend base URL is your Cloudflare Worker:

- `https://omniwx-api.omniwx.workers.dev`

The helper for this is in [`app/lib/net/apiBase.ts`](../app/lib/net/apiBase.ts).

Many client hooks build URLs with:

- `apiUrl('/api/...')`

So in practice, many app requests become:

- `https://omniwx-api.omniwx.workers.dev/api/...`

## 11. Worker Routes That Exist in This Repo

The Worker code is in [`omniwx-api/src/index.ts`](../omniwx-api/src/index.ts).

From the route checks in that file, these server endpoints exist:

- `/api/current`
- `/api/openmeteo/hourly`
- `/api/astro/location`
- `/api/astro/inspect`
- `/api/astro/skyscore-grid`
- `/api/almanac/climo`
- `/api/almanac/prior-year`
- `/api/fire/context`
- `/api/nasa/apod`
- `/api/nasa/donki/<TYPE>`
- `/api/ncei/*`
- `/v2/radar/wms`

### What these routes appear to do

- `/api/current`: current weather data, normalized for the client
- `/api/openmeteo/hourly`: forecast data pulled from Open-Meteo and reshaped
- `/api/astro/location`: astronomy summary for a location
- `/api/astro/inspect`: detailed astro inspection data
- `/api/astro/skyscore-grid`: astro map/scoring grid
- `/api/almanac/climo`: climatology data
- `/api/almanac/prior-year`: prior-year climate/observation data
- `/api/fire/context`: fire danger, restrictions, and fire-weather context
- `/api/nasa/apod`: Astronomy Picture of the Day
- `/api/nasa/donki/*`: space weather event proxy
- `/api/ncei/*`: NOAA NCEI proxy
- `/v2/radar/wms`: radar imagery for the map system

### Why the Worker exists

The Worker is useful because it can:

- hide private API tokens
- normalize ugly third-party responses into cleaner app-friendly JSON
- cache expensive requests
- combine data from multiple sources
- enforce timeouts and retries

In other words, the Worker is your backend API layer.

## 12. Third-Party APIs the App Calls Directly

Not everything goes through your Worker.

The client code also calls outside providers directly in several places.

### Weather and forecast sources

- Open-Meteo geocoding:
  - used by [`app/lib/locations/geocode.ts`](../app/lib/locations/geocode.ts)
- Open-Meteo marine API:
  - used by [`app/lib/nautical/api.ts`](../app/lib/nautical/api.ts)
- Open-Meteo forecast:
  - direct use appears in some older/specialized helpers too

### Alerts

- NOAA / NWS alerts:
  - `https://api.weather.gov`
  - used by [`app/lib/alerts/nws.ts`](../app/lib/alerts/nws.ts)

### Tides and marine

- NOAA Tides and Currents:
  - used by [`app/lib/nautical/api.ts`](../app/lib/nautical/api.ts)

### Space weather

- NOAA SWPC:
  - used by [`app/lib/spaceweather/api.ts`](../app/lib/spaceweather/api.ts)

### Maps and overlays

The maps system uses many direct remote sources, such as:

- ArcGIS services
- NOAA map services
- IEM radar services
- RainViewer
- GOES/NESDIS imagery

These are heavily managed from:

- [`app/(tabs)/maps.tsx`](../app/(tabs)/maps.tsx)
- [`app/lib/maps/useRadarController.ts`](../app/lib/maps/useRadarController.ts)

## 13. A Good Rule for Understanding "Whose API Is This?"

When reading this code, ask:

### If the URL starts with `apiUrl(...)`

That means the app is calling your backend Worker.

### If the URL is a full external domain

That means the app is calling a third-party service directly.

That one distinction explains a lot of the architecture.

## 14. How Data Flows Through the Land Screen

The Land screen is [`app/(tabs)/index.tsx`](../app/(tabs)/index.tsx).

This is one of the biggest screens in the app, but the data flow is understandable if you break it down.

### Step 1: choose a location

The screen uses:

- `usePlace()`
- `useLocations()`

That gives it the current place and location controls.

### Step 2: fetch weather-related data

The screen uses hooks such as:

- `useCurrentWeather`
- `useOpenMeteoForecast`
- `useLocationAstroForecast`
- `useFireContext`
- `useNwsAlerts`

Each hook owns one domain of data.

### Step 3: derive user-facing information

The screen computes things like:

- pressure trend
- daily labels
- weather summaries
- activity scores
- nerdy insights

This is where a lot of `useMemo` appears.

### Step 4: render visual sections

It passes processed data into UI components such as:

- `AlertBanner`
- `DailyRangeChart`
- `HourlyCharts72h`
- modal components
- background video components

So the Land screen is doing orchestration:

- get location
- load multiple datasets
- derive insights
- render cards and charts

## 15. How Data Flows Through the Maps Screen

The Maps screen is [`app/(tabs)/maps.tsx`](../app/(tabs)/maps.tsx).

This screen is closer to a mini application inside the application.

### State model

It uses a reducer:

- `mapReducer`
- `createInitialMapState`

Reducers are useful when state is complex and many actions can change it.

For maps, that makes sense because the screen has:

- active view
- enabled layers
- opacity settings
- radar playback state
- selected product
- panel visibility

### Radar controller

The heavy radar logic lives in [`app/lib/maps/useRadarController.ts`](../app/lib/maps/useRadarController.ts).

That hook manages:

- provider choice (`iem` vs `rainviewer`)
- frame selection
- playback timing
- safe playlist updates
- worker WMS URLs
- smoothing and opacity rules

This is a good example of why custom hooks are powerful: the screen stays large, but the radar-specific machinery is pulled into a reusable unit.

### Overlay system

Map overlays are assembled as config objects and rendered by map components like:

- `MapRenderer`
- `OverlayEngine`
- `RadarOverlay`
- `WmsImageOverlay`

This is a layered architecture:

1. screen decides what should be visible
2. hook prepares data and URLs
3. renderer paints the map

## 16. How Data Flows Through the Nautical Screen

The Nautical screen is [`app/(tabs)/nautical.tsx`](../app/(tabs)/nautical.tsx).

It mixes several marine sources:

- `useNauticalSummary`
- `useAllBuoyDetails`
- `useBuoyDetail`
- `useMarineForecast`

Its behavior is:

1. identify the marine area or zone
2. choose a station or buoy
3. fetch tides
4. fetch marine conditions
5. fetch coastal/offshore forecast
6. optionally build a more advanced "nerdy" interpretation

This screen is especially good for learning one pattern in the codebase:

- raw data comes in from APIs
- hook normalizes the data
- screen computes user-friendly summaries
- UI switches between simple mode and nerdy mode

## 17. Error, Loading, and Refresh Pattern

Many hooks in this project use the same shape:

- `data`
- `loading`
- `error`
- `refreshing`
- `refresh()`

Examples:

- `useCurrentWeather`
- `useOpenMeteoForecast`
- `useFireContext`
- `useNauticalSummary`

This is a very good pattern because screens can treat different data sources in a consistent way.

In plain English:

- `loading`: initial fetch is happening
- `refreshing`: user requested a refresh or the hook is reloading
- `error`: request failed
- `data`: latest successful payload
- `refresh`: function to try again

## 18. How Local Storage Is Used

This app stores some user state on the device using `AsyncStorage`.

Examples include:

- favorites
- last known coordinates
- active place
- default city

Why local storage matters:

- the app can reopen without forgetting everything
- onboarding choices persist
- last location is available before fresh GPS arrives

Without that, the app would feel much more fragile and slower.

## 19. What "Hydration" Means Here

You will see the word `hydrated` in the location system.

Hydration means:

"We loaded previously saved local state into memory."

That is important because the app must not overwrite saved values too early.

Example:

- if the app has not finished reading favorites from storage yet
- and code immediately writes an empty list
- the saved list could be lost

So `hydrated` is a safety marker saying:

"The initial local-state load finished."

## 20. Why There Are So Many Utility Functions

Many files contain helpers like:

- `safeNum`
- `safeIso`
- `formatTime`
- `degToCompass`
- `cleanText`
- `nearestIndexForTime`

These are not random clutter.

They exist because weather APIs are messy:

- missing fields
- strings instead of numbers
- inconsistent timestamps
- inconsistent units
- partial data

A weather app lives or dies on defensive parsing.

This codebase does a lot of normalization before rendering UI, which is a good sign.

## 21. How to Read This Codebase Without Getting Lost

If you are learning the app, use this order:

1. `app/_layout.tsx`
2. `components/boot/AppBoot.tsx`
3. `app/(tabs)/_layout.tsx`
4. one screen at a time, starting with `app/(tabs)/index.tsx`
5. for each screen, open the hooks it imports from `app/lib/**`
6. if a hook calls `apiUrl(...)`, look for the matching route in `omniwx-api/src/index.ts`

That gives you a top-down path:

- app shell
- routing
- screen
- hook
- API

## 22. Files That Matter Most for Understanding the App

If you only study a handful of files, I would prioritize these:

- [`app/_layout.tsx`](../app/_layout.tsx)
- [`components/boot/AppBoot.tsx`](../components/boot/AppBoot.tsx)
- [`app/(tabs)/_layout.tsx`](../app/(tabs)/_layout.tsx)
- [`app/context/PlaceContext.tsx`](../app/context/PlaceContext.tsx)
- [`app/lib/locations/useLocations.tsx`](../app/lib/locations/useLocations.tsx)
- [`app/(tabs)/index.tsx`](../app/(tabs)/index.tsx)
- [`app/lib/weather/hooks.ts`](../app/lib/weather/hooks.ts)
- [`app/lib/openmeteo/hooks.ts`](../app/lib/openmeteo/hooks.ts)
- [`app/(tabs)/maps.tsx`](../app/(tabs)/maps.tsx)
- [`app/lib/maps/useRadarController.ts`](../app/lib/maps/useRadarController.ts)
- [`app/(tabs)/nautical.tsx`](../app/(tabs)/nautical.tsx)
- [`omniwx-api/src/index.ts`](../omniwx-api/src/index.ts)

## 23. Short Answers to Your Specific Questions

### "What are my APIs?"

Your main app backend API is the Cloudflare Worker at:

- `https://omniwx-api.omniwx.workers.dev`

The app also talks directly to several third-party APIs, especially:

- Open-Meteo
- NOAA / NWS
- NOAA SWPC
- NOAA Tides and Currents
- ArcGIS and map imagery services
- RainViewer
- IEM radar services

### "What's a hook?"

A hook is a reusable function for React component behavior.

In this app, hooks usually do one of these:

- load data
- manage state
- derive computed values
- connect a screen to shared context

### "What are the memos?"

Usually:

- `useMemo`: cache a computed value
- `React.memo`: skip re-rendering a component when props did not change

In this app, memos are used mostly for performance and stability.

### "How is it structured?"

Very roughly:

- routes/screens in `app/`
- shared UI in `components/`
- feature logic and data access in `app/lib/`
- global shared state in `app/context/`
- backend API in `omniwx-api/`

## 24. My Read of the Architecture

This app is not a tiny toy app anymore. It is moving toward a layered product architecture.

The strongest structural patterns in the current code are:

- file-based routing with Expo Router
- context-based shared app state
- feature-specific custom hooks
- a mixed API strategy: Worker proxy plus direct provider calls
- heavy memoization for maps, charts, and derived weather data

The largest complexity centers are:

- the Land screen
- the Maps screen
- the astro and almanac data pipelines
- the Worker backend

That is normal for a weather product, because weather apps are data-aggregation apps with lots of normalization.

## 25. If You Want to Keep Learning

The best next steps are:

1. Read the app shell files first.
2. Follow one feature end to end, such as Land or Maps.
3. Practice identifying:
   - screen
   - hook
   - API call
   - renderer/component
4. Treat `useMemo` as "cache this computation until inputs change."
5. Treat contexts as "global shared state."

If useful, a good follow-up document would be:

- "Land screen walkthrough"
- "Maps and radar walkthrough"
- "Backend Worker walkthrough"
- "Glossary of React terms used in this app"

