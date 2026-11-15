export type AnalyticsEvent =
  | { name: 'app_first_launch'; properties: { appVersion: string } }
  | { name: 'onboarding_completed'; properties: { path: 'city' | 'gps' } }
  | { name: 'screen_viewed'; properties: { screen: string } }
  | { name: 'feature_used'; properties: { feature: string; tier: 'free' | 'plus' } }
  | { name: 'radar_viewed'; properties: { product: string; source: string; fallback: boolean } }
  | { name: 'astronomy_viewed'; properties: { surface: string } }
  | { name: 'premium_interest'; properties: { feature: string; surface: string } }
  | { name: 'paywall_viewed'; properties: { placement: string } }
  | { name: 'subscription_started'; properties: { productId: string; period: 'monthly' | 'annual' } }
  | { name: 'purchase_completed'; properties: { productId: string; environment: 'sandbox' | 'production' } }
  | { name: 'subscription_status_changed'; properties: { state: string; source: 'verified-server' } }
  | { name: 'provider_fallback'; properties: { feature: string; from: string; to: string; reason: string } }
  | { name: 'user_feedback_opened'; properties: { surface: string } }
  | { name: 'app_error'; properties: { area: string; code: string; recoverable: boolean } };

export type AnalyticsSink = (event: AnalyticsEvent) => void | Promise<void>;

let approvedSink: AnalyticsSink | null = null;

export function configureAnalyticsSink(sink: AnalyticsSink | null) {
  approvedSink = sink;
}

export function trackAnalyticsEvent(event: AnalyticsEvent) {
  // Privacy-safe default: no console logging, persistence, network call, or queue.
  // A future approved provider must explicitly install a sink at app startup.
  if (!approvedSink) return;
  try {
    void approvedSink(event);
  } catch {
    // Analytics must never break a weather workflow.
  }
}
