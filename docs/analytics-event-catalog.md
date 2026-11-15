# OMNIwx Analytics Event Catalog

Last reviewed: November 14, 2026

The code boundary is `app/lib/analytics/events.ts`. It is currently a typed no-op:
no SDK, network request, device identifier, queue or console log exists. Provider
selection, consent/disclosure and retention approval are required before installing
a sink. Analytics must never block weather use.

## Privacy Rules

- Never send latitude/longitude, searched place, saved-location names, email,
  tokens, purchase receipts, raw provider payloads or free-text feedback.
- Use coarse feature/source identifiers and app version. Do not fingerprint devices.
- Separate operational telemetry from marketing analytics. Minimize retention and
  access; document processor/subprocessors and deletion behavior.
- Revenue/renewal/cancellation comes from verified billing lifecycle data, not an
  app-side claim. Avoid sending duplicate purchase value from the client.
- Support a user-facing analytics control if the selected legal basis requires it.

## Events

| Event | When | Allowed properties | Success question |
| --- | --- | --- | --- |
| `app_first_launch` | First completed app boot | `appVersion` | Install volume |
| `onboarding_completed` | User finishes setup | `path: city|gps` | Activation |
| `screen_viewed` | Stable screen view, debounced | `screen` enum | Navigation/use |
| `feature_used` | Deliberate feature action | `feature`, `tier` | Core value |
| `radar_viewed` | Radar product becomes visible | product/source enums, `fallback` | Radar engagement/reliability |
| `astronomy_viewed` | Astronomy surface visible | `surface` enum | Astronomy engagement |
| `premium_interest` | User asks about a provisional Plus feature | feature/surface enums | Catalog demand |
| `paywall_viewed` | Approved paywall displayed | placement enum | Funnel entry |
| `subscription_started` | Store checkout initiated | product ID, monthly/annual | Intent only |
| `purchase_completed` | Verified lifecycle projection | product ID, sandbox/production | Conversion |
| `subscription_status_changed` | Verified server transition | state enum, verified source | Renewal/churn |
| `provider_fallback` | Visible fallback selected | feature, from/to, reason enums | Data reliability |
| `user_feedback_opened` | Feedback composer opened | surface enum | Feedback availability |
| `app_error` | Actionable handled failure | area/code enums, recoverable | Quality |

## Derived Metrics

- Activation: onboarding completion / first launches.
- Retention: privacy-reviewed cohort return at day 1, 7 and 30.
- Maps success: radar views without fallback/error and time-to-first-visible frame.
- Premium interest: unique interested users / active users, by capability.
- Conversion: verified paid starts / eligible paywall viewers.
- Renewal and cancellation: server lifecycle cohorts, not client events.
- Reliability: provider fallback and recoverable error rate per feature/version.

Instrument in small reviewed slices. Every new event needs an owner, enum schema,
purpose, retention decision and deletion/opt-out behavior before release.
