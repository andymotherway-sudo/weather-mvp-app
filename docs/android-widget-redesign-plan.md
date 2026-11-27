# OMNIwx Premium Android Widget Redesign

## Current Inventory

| Widget | Current data | Status | First redesign scope |
| --- | --- | --- | --- |
| Current conditions | Active place, Open-Meteo forecast cache, native weather icon | Implemented | Responsive 2x2 and 4x1 presentation |
| Current plus radar | Current conditions and cached native RainViewer composite | Implemented | Responsive radar dashboard, freshness and manual refresh |
| Sky Score | Cached OMNIwx Sky Score, cloud layers, Bortle context | Implemented with weather-derived fallback | Responsive observing summary; retain fallback disclosure |
| Aviation | Aviation briefing | Implemented | Compact supplemental briefing only |
| Airport Board | METAR and TAF-derived summary | Implemented | Responsive compact, balanced, and detailed aviation board; future ICAO configuration and runway-relative wind |
| Route Briefing | Route-aware aviation summary | Implemented | Responsive compact, balanced, and detailed route awareness; remain supplemental only |
| Climatology | Climate normals and records cache | Implemented | Responsive record-context summary; future Plus presentation review |
| Climate Arch | Climate-record visualization | Implemented | Responsive detailed annual visualization; future Plus presentation review |
| Marine | No native provider or verified widget feed | Missing | Requires normalized marine and tide/buoy data contract |
| Space weather | Worker-cached NOAA SWPC Kp, solar wind, Bz, and X-ray summary | Implemented | Responsive visual refinement and physical-device validation |
| Extremes | No native provider | Missing | Requires a licensed, normalized extremes feed |
| Satellite | No native provider | Missing | Requires a small cached raster contract and coverage configuration |

## Architecture Decision

The existing implementation uses `AppWidgetProvider`, XML `RemoteViews`, cached bitmaps, and a serialized native worker. This remains the correct implementation path for the current application. Jetpack Glance would require a migration without solving the important constraints: launcher-owned sizing, limited background execution, and bitmap rendering for radar or charts.

The refresh worker runs at a thirty-minute Android-scheduled cadence and is deliberately serialized to protect battery use and upstream APIs. Widgets can render cached content between refreshes. They must label stale or failed data clearly and must never synthesize observations.

RemoteViews limitations that affect the design:

- Launchers own final dimensions; grid labels such as 2x2 and 4x4 are targets, not pixel contracts.
- Views support text, basic visibility, pending intents, and bitmaps. They do not run Compose or React Native.
- Rich maps, sparklines, tide curves, and compass plots require pre-rendered cached bitmaps.
- Per-widget setup needs a native configuration activity and persisted app-widget-id settings; none exists yet, so current widgets retain the active place or existing aviation selection.

## Shared Design System

- Near-black and deep-navy gradient panels with restrained cyan borders.
- Large primary values, tabular/compact supporting numbers, and explicit timestamps.
- Size classes use Android `AppWidgetOptions`: compact, standard, and expanded.
- Compact widgets hide supporting rows rather than shrink text until it is illegible.
- Theme, opacity, units, visible metrics, and per-widget location are planned as versioned per-widget preferences. They will be introduced with a configuration activity so existing widgets keep their defaults.

## Delivery Sequence

1. Completed: shared size classes and the visual migration for the current widget suite. Every existing widget now uses the OMNIwx branded header, deep-navy panel system, and progressive disclosure at compact, balanced, and detailed launcher sizes. Current Conditions adds a cached six-point, near-term temperature trend at standard and expanded sizes, with wind, humidity, and dew point at expanded size. This extends its existing forecast request rather than adding a second polling path.
2. Completed: Airport Board, Route Briefing, Climatology, and Climate Arch now respond to launcher resize events. Compact presentations retain the station, route, or place decision metric while balanced and detailed presentations reveal the supporting panels and chart data.
3. Next: native configuration activity and persistent settings for location, airport, theme, units, radar coverage, and visible metrics.
4. Then: add METAR age, TAF-validity, and optional crosswind only when runway metadata is defensible.
5. Add Marine only after wave, tide, buoy, and warning normalization is verified. Satellite and Extremes remain blocked on small cached-data contracts and licensing/cost review.

## Validation Matrix

- Pixel Launcher and Samsung One UI: 2x2, 4x1, 4x2, and 4x4 targets.
- Small-screen, large-font, offline, stale-cache, reboot, upgrade, and multiple-widget cases.
- Confirm deep links and manual refresh behavior per provider.
- Measure serialized widget refresh requests and bitmap memory before enabling additional imagery widgets.
- Capture real emulator or device screenshots for every supported size before release; no mock screenshots substitute for launcher validation.
