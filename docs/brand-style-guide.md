# OMNIwx Brand And Theme Guide

Last updated: September 8, 2026

This guide is the source of truth for keeping OMNIwx visually consistent as Land, Hourly, Almanac, Maps, Space, Nautical, Aviation, Extremes, widgets, and future paid surfaces evolve.

## Brand Direction

OMNIwx should feel like a polished weather instrument, not a generic weather app. The core visual language is dark atmospheric glass, practical forecast hierarchy, data-rich cards, and bright weather-native accents.

The app should feel:

- **Operational**: clear enough for pilots, storm watchers, boaters, and weather nerds.
- **Beautiful**: atmospheric backgrounds, glass cards, gradients, and cinematic motion.
- **Trustworthy**: NOAA/NWS-style seriousness without becoming sterile.
- **Glanceable first**: big state, then supporting detail, then expert context.
- **Consistent across modes**: each tab can have its own accent, but cards, spacing, chips, typography, and bottom navigation should come from the same system.

## Current Catalogue

Shared pieces that already exist:

- `styles/theme.ts`: base dark navy palette, spacing, radius, and minimal shadow token.
- `app/lib/theme/appAppearance.ts`: user-selectable chrome modes for classic, grayscale, and high contrast.
- `app/lib/theme/useAppChrome.ts`: hook that exposes the active chrome mode.
- `styles/typography.ts`: reusable text roles plus a WxLab/system-style variant.
- `components/common/Glass.tsx`: shared translucent card primitive.
- `components/layout/Card.tsx`: reusable layout card tied to theme spacing/radius.
- `app/lib/brand/assets.ts`: shared transparent OMNIwx logo asset and tab-logo sizing.
- `components/backgrounds/AnimatedPageBackground.tsx` and weather backgrounds: atmospheric visual foundation.

Current consistency issues:

- Many screens still define colors, spacing, radii, shadows, and typography directly inside local `StyleSheet.create` blocks.
- There are many hard-coded `rgba(...)` glass values instead of named opacity tokens.
- Tab-specific pages sometimes solve the same UI pattern differently: chips, metric tiles, section headers, learn buttons, legends, modals, and status pills.
- The Space tab, Maps/Storm Scope, and Land cards are visually related, but their density and control hierarchy are not yet governed by shared component rules.
- Accessibility modes exist, but new UI work can bypass them if it uses raw colors instead of `useAppChrome` and shared semantic tokens.

## Core Tokens

Use semantic tokens instead of one-off colors wherever possible.

Primary chrome:

- `background`: app-level dark field.
- `card`: standard glass panel.
- `cardStrong`: elevated or high-emphasis glass panel.
- `border`: default glass border.
- `borderStrong`: selected/focused border.
- `pill`: inactive chip/control background.
- `pillActive`: active chip/control background.
- `primary`: app action/accent blue.
- `tabBar`: bottom navigation surface.
- `tabActiveBg`: selected tab background.

Data accents:

- Radar reflectivity, warnings, fire, aviation category, marine, sky score, and solar weather colors are data colors. They should remain meaningful and should not be recolored only to match branding.
- Use brand blue/cyan for controls and selection, not for every metric.
- Use amber/red only for freshness, warning, stale, severe, or degraded states.
- Use green for good/healthy/clear scores when the underlying metric is positive.

## Typography

The current app leans on heavy weights and high contrast. Keep that identity, but standardize roles:

- Screen title: 24-30, heavy, short.
- Section title: 18-22, heavy.
- Card title: 16-20, heavy.
- Body: 13-15, medium/semibold where readability needs it.
- Label/eyebrow: 10-12, uppercase, letter-spaced.
- Metric number: tabular, heavy, sized to importance.
- Timestamp/freshness: small, secondary unless stale.

Use `styles/typography.ts` for common roles. Use the WxLab variant for instrument-style dense screens.

## Layout Rules

- Normal card radius: 18-24.
- Major hero radius: 28-34.
- Chip radius: pill.
- Standard screen horizontal padding: 16-20.
- Standard card padding: 14-18.
- Dense control row gap: 8-10.
- Section gap: 16-24.
- Keep the bottom tab readable and stable across all feature pages.

Do not let controls cover the primary content more than necessary. Maps and Space should feel like instrumentation over the world/sky, not dashboards that happen to have a background.

## Shared Component Targets

Create or formalize these components before large visual rewrites:

- `OmniScreen`: safe-area screen shell with background, padding, and refresh behavior.
- `OmniHero`: top card/header pattern with logo, title, subtitle, and primary action.
- `OmniChip`: selected, unselected, disabled, segmented, and toggle variants.
- Planned next: card, metric, and section-header primitives should be added only when a screen adopts them.
- `OmniBottomSheet`: collapsed, half, expanded states for Maps/Storm Scope and dense tools.
- `OmniLegend`: compact and expanded legends for radar/fire/sky score/data layers.

## Space Mockup Read

The mockup is directionally aligned with OMNIwx. It keeps the dark glass brand, adds stronger hourly selection, and makes Sky Score feel like a real product instead of one more metric.

Adopt:

- Compact Space header with logo/title/location and one clear Learn action.
- Segmented navigation: `Now`, `Hourly`, `Daily`, `Solar Activity`.
- Hourly Sky Score strip with selectable cards and tiny condition bars.
- Selected-hour detail card with large Sky Score and short plain-English interpretation.
- Breakdown grid for clouds, transparency, darkness, moon, seeing, and aurora.
- Additional conditions as compact metric tiles.

Adjust before implementation:

- Use OMNIwx `Glass`/chrome tokens instead of introducing a new black/neon style.
- Keep the current tab bar and logo proportions consistent with the rest of the app.
- Avoid making every tile equally loud; only the selected Sky Score and degraded factors should pop.
- Keep the page less dense on smaller Android devices by collapsing secondary panels.
- Use the same chip/control treatment as Maps and Land once `OmniChip` exists.

## Implementation Path

1. Freeze the brand guide as the design contract. Initial guide added September 8, 2026.
2. Add semantic theme tokens for score colors, freshness states, glass opacity, control states, and feature accents. Initial tokens added September 8, 2026.
3. Expand shared UI primitives as screens adopt them. `OmniChip` is the first adopted primitive; avoid adding unused shared components ahead of actual UI work.
4. Convert one screen section at a time, starting with low-risk duplicated patterns.
5. Use Space as the first polished redesign target after radar stabilizes.
6. Follow with Storm Scope controls, then Land/Hourly card consistency.
7. Add lightweight screenshot QA notes for release builds so visual regressions are caught before Google Play.

## Rules For Future Changes

- New screens should not introduce raw brand colors unless they are data-specific.
- New cards should use shared glass/card primitives.
- New chips should use the shared chip component.
- wxLearn buttons should have one consistent shape, size, and label treatment.
- Empty, stale, loading, and error states should look consistent across tabs.
- Brand polish should never hide operational status. Freshness, source, and fallback state must remain visible where trust matters.
