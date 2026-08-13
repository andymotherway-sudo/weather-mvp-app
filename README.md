# OMNIwx

OMNIwx is an Android-first weather workstation that brings daily forecasts, radar and satellite maps, marine weather, aviation weather, space weather, climatology, and educational wxLearn topics into one app.

Current release line: **OMNIwx 1.1.242**
Current Android version code: **10259**

## Product Shape

OMNIwx is organized around weather lenses:

- **Land**: current conditions, alerts, daily range, a compact Simple-mode sunrise/sunset/daylight strip, activity context, and wxLab diagnostics including complete Sun/Moon astronomy, NWS Desk, Severe Setup, forecast verification, and Storm Recap.
- **Hourly**: next-72-hour timing, forecast charts, hourly details, and wxLab timeline analysis.
- **Almanac**: normals, records, prior-year context, climate arch, and selected-day climate signals.
- **Maps**: native timestamped live radar animation with warm next-frame preloading, buffered satellite animation, storm scope, copyable radar diagnostics, NWS HeatRisk, tropical cyclone cones and tracks, wildfire, marine, aviation, astronomy, alerts, wind, and export workflows.
- **Space**: night-sky context first, then Solar Wx with Kp, NOAA G/R/S scales, aurora context, solar wind at L1, solar imagery, Earth terminator imagery, SWPC alerts, DONKI events, and Mars archive context.
- **Nautical**: sea state, buoys, tides, official coastal/offshore/high-seas forecast context, marine wxLab metrics, and water-station context.
- **Aviation**: METAR/TAF airport briefings, route briefings, aviation hazard context, and map handoff.
- **Extremes**: ranked land, marine, saved-place, and space extremes.
- **wxLearn**: categorized educational topics for weather, marine, aviation, radar, space weather, astronomy, data sources, and units.

OMNIwx also includes native Android companion surfaces:

- Home-screen widgets.
- Android Auto weather and radar surfaces.
- Native MP4 export for radar, satellite, layered weather, and animated wind-flow loops.

## Tech Stack

- React Native and Expo Router.
- TypeScript.
- MapLibre for map rendering.
- Skia/SVG for charts and map effects.
- Cloudflare Worker backend in `omniwx-api/`, including cached NWS Desk, SPC severe-setup aggregation, alert lifecycle context, forecast verification, and Local Storm Report normalization.
- Native Android code for widgets, Android Auto, and MP4 export.

## Key Directories

- `app/`: Expo Router screens, contexts, and app-level feature logic.
- `components/`: reusable UI components, charting, maps, widgets-facing helpers, and screen sections.
- `app/lib/`: API clients, hooks, map state, weather transforms, learning topics, and feature utilities.
- `android/`: native Android app, widgets, Android Auto, video export, Gradle config, and release build output.
- `omniwx-api/`: Cloudflare Worker used for aggregation, caching, and provider normalization.
- `docs/`: product guides, architecture notes, training docs, and release notes.

## Development

Install dependencies:

```powershell
npm install
```

Run TypeScript verification:

```powershell
npx tsc --noEmit
```

Build the Android release AAB:

```powershell
npm run build:android:prod
```

The release bundle is written to:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

For the full tester-safe backend + app sequence, use:

- [docs/full-release-path.md](C:/Users/andym_au640pp/weather-app/docs/full-release-path.md)

## Release Versioning

Google Play uniqueness is controlled by Android `versionCode`. Keep these files aligned before building:

- `app.json`: `expo.version`, `ios.buildNumber`, `android.versionCode`, and `extra.buildLabel`.
- `android/app/build.gradle`: `versionCode` and `versionName`.
- `package.json` and `package-lock.json`: repo metadata version.

## Documentation

- `docs/omniwx-feature-guide.md`: user-facing feature guide.
- `docs/how-omniwx-works.md`: plain-English architecture guide.
- `docs/omniwx-training-guide.md`: private builder/training guide.
- `docs/google-play-closed-testing-release-notes.md`: tester-facing release notes for Play Console.
- `docs/full-release-path.md`: the required dev-to-production release sequence for internal testing.
- `docs/production-readiness-plan.md`: security, paid-customer, radar, Storm Scope, and operations roadmap.
- `docs/documentation-guidelines.md`: what docs belong in git versus ignored private notes.
- `docs/privacy-policy.md`: publishable replacement privacy policy for omni-wx.com.

## Status

OMNIwx is moving from internal alpha toward beta testing. The current priority is making the app stable, global, beautiful, and honest about source coverage while keeping map-heavy features smooth on real phones.

## Author

Andrew Motherway

## License

(c) OMNIwx. All rights reserved.
