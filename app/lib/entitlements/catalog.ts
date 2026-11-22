export const OMNIWX_PLUS_ENTITLEMENT = 'omniwx_plus' as const;

export const OMNIWX_FEATURES = {
  CURRENT_CONDITIONS: 'current_conditions',
  HOURLY_FORECAST: 'hourly_forecast',
  DAILY_FORECAST: 'daily_forecast',
  STANDARD_RADAR: 'standard_radar',
  BASIC_ASTRONOMY: 'basic_astronomy',
  ESSENTIAL_MARINE: 'essential_marine',
  OFFICIAL_ALERTS: 'official_alerts',
  BASIC_SAVED_LOCATIONS: 'basic_saved_locations',
  ADVANCED_STORM_SCOPE: 'advanced_storm_scope',
  ADVANCED_RADAR_PRODUCTS: 'advanced_radar_products',
  DETAILED_ASTRONOMY: 'detailed_astronomy',
  SKY_SCORE_MAPS: 'sky_score_maps',
  ADVANCED_MARINE: 'advanced_marine',
  EXTENDED_CLIMATOLOGY: 'extended_climatology',
  ENHANCED_SAVED_LOCATIONS: 'enhanced_saved_locations',
  ADVANCED_PERSONALIZATION: 'advanced_personalization',
  VIDEO_EXPORT: 'video_export',
  EXTREMES: 'extremes',
} as const;

export type OmniwxFeature = (typeof OMNIWX_FEATURES)[keyof typeof OMNIWX_FEATURES];
export type OmniwxTier = 'free' | 'plus';

export type EntitlementSnapshot = {
  tier: OmniwxTier;
  activeEntitlements: readonly string[];
  source: 'guest' | 'verified-server';
  checkedAt: string | null;
  expiresAt: string | null;
};

const FREE_FEATURES = new Set<OmniwxFeature>([
  OMNIWX_FEATURES.CURRENT_CONDITIONS,
  OMNIWX_FEATURES.HOURLY_FORECAST,
  OMNIWX_FEATURES.DAILY_FORECAST,
  OMNIWX_FEATURES.STANDARD_RADAR,
  OMNIWX_FEATURES.BASIC_ASTRONOMY,
  OMNIWX_FEATURES.ESSENTIAL_MARINE,
  OMNIWX_FEATURES.OFFICIAL_ALERTS,
  OMNIWX_FEATURES.BASIC_SAVED_LOCATIONS,
]);

export const GUEST_ENTITLEMENTS: EntitlementSnapshot = Object.freeze({
  tier: 'free',
  activeEntitlements: Object.freeze([]),
  source: 'guest',
  checkedAt: null,
  expiresAt: null,
});

export function hasPlusEntitlement(snapshot: EntitlementSnapshot) {
  return snapshot.source === 'verified-server'
    && snapshot.activeEntitlements.includes(OMNIWX_PLUS_ENTITLEMENT);
}

export function canUseFeature(snapshot: EntitlementSnapshot, feature: OmniwxFeature) {
  return FREE_FEATURES.has(feature) || hasPlusEntitlement(snapshot);
}

export function savedLocationLimit(snapshot: EntitlementSnapshot) {
  return hasPlusEntitlement(snapshot) ? 25 : 3;
}
