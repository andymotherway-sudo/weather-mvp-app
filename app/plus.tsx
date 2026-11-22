import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEntitlements } from './context/EntitlementContext';
import { trackAnalyticsEvent } from './lib/analytics/events';
import { useSettings } from './context/SettingsContext';
import { appChrome } from './lib/theme/appAppearance';

const EARLY_ACCESS_URL =
  'mailto:admin@omni-wx.com?subject=OMNIwx%20Plus%20early%20access&body=I%20am%20interested%20in%20OMNIwx%20Plus.%0A%0AWhich%20features%20matter%20most%20to%20you%3F%0A';

const INCLUDED_FEATURES = [
  'High-resolution map-animation recording and MP4 export',
  'Advanced Storm Scope and validated radar products',
  'Detailed astronomy forecasts and sky-score maps',
  'Advanced marine analysis and planning tools',
  'Up to 25 synced saved locations and enhanced personalization',
] as const;

export default function PlusScreen() {
  const insets = useSafeAreaInsets();
  const { appColorMode } = useSettings();
  const chrome = useMemo(() => appChrome(appColorMode), [appColorMode]);
  const { isPlus } = useEntitlements();

  useEffect(() => {
    trackAnalyticsEvent({ name: 'paywall_viewed', properties: { placement: 'membership' } });
  }, []);

  const showInterest = () => {
    trackAnalyticsEvent({ name: 'premium_interest', properties: { feature: 'omniwx_plus', surface: 'membership' } });
    Linking.openURL(EARLY_ACCESS_URL).catch(() => undefined);
  };

  return (
    <View style={[styles.root, { backgroundColor: chrome.background }]}>
      <View style={[styles.glowTop, { backgroundColor: chrome.blobA }]} />
      <View style={[styles.glowBottom, { backgroundColor: chrome.blobB }]} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top + 16, 28), paddingBottom: insets.bottom + 30 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <View style={styles.eyebrow}><Text style={styles.eyebrowText}>OMNIwx PLUS</Text></View>
        <Text style={styles.title}>More depth when the weather matters.</Text>
        <Text style={styles.subtitle}>
          Keep everyday weather free. Plus is being prepared for power users who need richer weather intelligence, smoother map tools, and exportable loops.
        </Text>

        <View style={[styles.planCard, { backgroundColor: chrome.card, borderColor: chrome.borderStrong }]}>
          <View style={styles.planHeader}>
            <View>
              <Text style={styles.planTitle}>{isPlus ? 'Your OMNIwx Plus plan' : 'OMNIwx Plus'}</Text>
              <Text style={styles.planDetail}>One entitlement, monthly or annual</Text>
            </View>
            <View style={styles.plusBadge}><Text style={styles.plusBadgeText}>PLUS</Text></View>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.price}>$5.99</Text><Text style={styles.priceTerm}> / month</Text>
          </View>
          <Text style={styles.annual}>or $49.99 / year</Text>
          <Text style={styles.disclosure}>Prices are proposed. Store-localized pricing, renewal terms, and checkout will appear only after Google Play Billing is configured.</Text>
        </View>

        <View style={[styles.featureCard, { backgroundColor: chrome.card, borderColor: chrome.border }]}>
          <Text style={styles.sectionTitle}>Planned Plus benefits</Text>
          <Text style={styles.sectionIntro}>Each feature must clear data-rights, reliability, and cost review before it is turned on.</Text>
          {INCLUDED_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.check}><Text style={styles.checkText}>+</Text></View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.freeCard, { borderColor: chrome.border }]}>
          <Text style={styles.freeTitle}>Always available without an account</Text>
          <Text style={styles.freeText}>Current conditions, hourly and daily forecasts, standard radar, official alerts, basic astronomy, and essential marine weather.</Text>
        </View>

        {isPlus ? (
          <View style={styles.currentPlan}><Text style={styles.currentPlanText}>Your verified Plus status will appear here once account services are enabled.</Text></View>
        ) : (
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={showInterest}>
            <Text style={styles.primaryButtonText}>Request Plus early access</Text>
          </Pressable>
        )}
        <Text style={styles.availability}>Accounts, purchases, and charges are not enabled in this build. Requesting early access opens a message to OMNIwx; it does not create an account or start a subscription.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#020617' },
  glowTop: { position: 'absolute', top: -130, right: -110, width: 380, height: 380, borderRadius: 380, opacity: 0.85 },
  glowBottom: { position: 'absolute', bottom: -170, left: -160, width: 420, height: 420, borderRadius: 420, opacity: 0.65 },
  content: { paddingHorizontal: 18 },
  back: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  backText: { color: 'white', fontSize: 12, fontWeight: '900' },
  eyebrow: { alignSelf: 'flex-start', marginTop: 24, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(14,165,233,0.18)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.36)' },
  eyebrowText: { color: '#BAE6FD', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { marginTop: 14, color: 'white', fontSize: 32, lineHeight: 37, fontWeight: '900', maxWidth: 520 },
  subtitle: { marginTop: 10, color: 'rgba(255,255,255,0.70)', fontSize: 15, lineHeight: 22, fontWeight: '600', maxWidth: 580 },
  planCard: { marginTop: 20, padding: 17, borderRadius: 20, borderWidth: 1 },
  planHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  planTitle: { color: 'white', fontSize: 19, fontWeight: '900' },
  planDetail: { marginTop: 4, color: 'rgba(255,255,255,0.62)', fontSize: 12, fontWeight: '700' },
  plusBadge: { minWidth: 57, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, alignItems: 'center', backgroundColor: 'rgba(14,165,233,0.24)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.45)' },
  plusBadgeText: { color: '#E0F2FE', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 22 },
  price: { color: 'white', fontSize: 38, fontWeight: '900' },
  priceTerm: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '800' },
  annual: { marginTop: 2, color: '#7DD3FC', fontSize: 14, fontWeight: '900' },
  disclosure: { marginTop: 14, color: 'rgba(255,255,255,0.56)', fontSize: 11, lineHeight: 16, fontWeight: '600' },
  featureCard: { marginTop: 14, padding: 17, borderRadius: 20, borderWidth: 1 },
  sectionTitle: { color: 'white', fontSize: 17, fontWeight: '900' },
  sectionIntro: { marginTop: 5, color: 'rgba(255,255,255,0.62)', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 15 },
  check: { marginTop: 1, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,165,233,0.24)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.40)' },
  checkText: { color: '#E0F2FE', fontSize: 15, fontWeight: '900', lineHeight: 18 },
  featureText: { flex: 1, color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  freeCard: { marginTop: 14, padding: 15, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1 },
  freeTitle: { color: 'white', fontSize: 14, fontWeight: '900' },
  freeText: { marginTop: 5, color: 'rgba(255,255,255,0.64)', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  primaryButton: { marginTop: 18, minHeight: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0284C7', borderWidth: 1, borderColor: 'rgba(186,230,253,0.62)' },
  primaryButtonText: { color: 'white', fontSize: 15, fontWeight: '900' },
  currentPlan: { marginTop: 18, padding: 14, borderRadius: 14, backgroundColor: 'rgba(14,165,233,0.14)', borderWidth: 1, borderColor: 'rgba(125,211,252,0.34)' },
  currentPlanText: { color: '#E0F2FE', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  availability: { marginTop: 12, color: 'rgba(255,255,255,0.52)', fontSize: 11, lineHeight: 16, textAlign: 'center', fontWeight: '600' },
});
