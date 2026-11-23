# OMNIwx iOS Release Plan

Last reviewed: November 22, 2026

## Scope Decision

OMNIwx is a two-store mobile product. Android closed testing remains the active
release lane, but account, entitlement, analytics, and core weather features
must be designed once for both Android and iPhone. An iOS release is not a
post-launch port.

The Expo configuration already declares the iOS bundle ID
`com.omniwx.app`, EAS iOS build profiles, and cross-platform location,
notification, and MapLibre dependencies. No `ios/` native project is committed
yet; the first iOS build will generate and validate that native surface.

## Product Parity

| Capability | iOS launch position | Notes |
| --- | --- | --- |
| Core forecasts, alerts, maps, astronomy, marine, aviation | Required parity | Shared React Native screens and Worker APIs. Validate on a physical iPhone. |
| Account, saved-location sync, Free/Plus entitlement | Required parity | One provider identity and one Worker/D1 entitlement snapshot. |
| Plus subscriptions | Required parity | Same `omniwx_plus` entitlement; App Store products are distinct from Play product IDs. |
| Restore and manage subscription | Required parity | Use the relevant store surface and server-verified state. |
| Map animation and overlays | Required parity | Treat cold open, gestures, memory pressure, and imagery playback as release gates. |
| MP4 map-loop export | Explicit iOS implementation required | Current exporter is Android-native. Do not advertise or gate it as available on iPhone until an iOS implementation passes device tests. |
| Home-screen widgets | Deferred parity decision | Current widgets are Android-native. A WidgetKit scope and support burden must be approved separately. |
| Android Auto | Android-only | Do not imply CarPlay support. CarPlay is a separate, later product decision. |

## Account And Billing Design

Use one account identity across platforms. If Google sign-in is offered as a
primary login on iOS, also offer Sign in with Apple or an equivalent Apple-review
compliant sign-in method. Keep guest weather available without login.

RevenueCat should connect both Google Play and App Store Connect products to the
same `omniwx_plus` entitlement. The app, Worker, and D1 continue to trust only a
verified server-derived entitlement; neither an iOS nor Android client callback
is authorization.

Before account creation is offered on iOS, include an in-app account-deletion
entry point and an external deletion path. This is a launch requirement, not a
later support task.

## Release Gates

1. Enroll the legal owner in the Apple Developer Program and create the App Store
   Connect record for `com.omniwx.app`. Confirm the legal entity, tax, banking,
   and support contacts before paid products are enabled.
2. Generate an EAS development iOS build on a physical iPhone. Record device and
   iOS-version coverage for maps, location denial, notifications, large text,
   safe areas, and video-export availability messaging.
3. Configure development identity credentials for Android and iOS, including the
   Sign in with Apple path if Google sign-in remains available on iPhone. Verify
   every token in the Worker before D1 access.
4. Create matching sandbox subscriptions in App Store Connect and RevenueCat;
   test purchase, restore, cancellation, renewal, expiry, refund, reinstall, and
   account switching through TestFlight/sandbox. Sandbox transactions do not
   charge testers.
5. Complete TestFlight beta acceptance before submitting to App Review. Supply
   review credentials or a complete guest/demo path and disclose weather-data,
   account, privacy, and subscription behavior accurately.

## Non-Negotiable Checks

- Do not use Google Play product IDs on iOS.
- Do not hard-code the displayed subscription price; use store offerings.
- Do not promise Android widgets, Android Auto, or MP4 export to iPhone users
  before iOS device verification.
- Do not publish a paid iOS build until account deletion, restore, and verified
  subscription lifecycle tests are complete.

## Owner Prerequisites

- Apple Developer Program membership and access to App Store Connect.
- A physical iPhone for development-build and TestFlight testing.
- A decision on the account provider, with Sign in with Apple included if Google
  sign-in is used on iOS.
- Approval to create sandbox-only App Store subscriptions and a RevenueCat
  development project. This is not authorization to enable live billing.

## References

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple StoreKit testing and sandbox](https://developer.apple.com/documentation/storekit/testing-at-all-stages-of-development-with-xcode-and-the-sandbox)
- [Expo iOS build setup](https://docs.expo.dev/build/setup/)
