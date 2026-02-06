// app/(tabs)/solar.tsx

import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import { NerdyExplainModal, type ExplainPayload } from '../../components/common/NerdyExplainModal';

import { useSpaceWeatherSummary } from '../lib/spaceweather/hooks';
import { useSpaceWeatherEvents } from '../lib/spaceweather/useSpaceWeatherEvents';

function fmtUpdated(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function fmtEventTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function kpNarrative(kp?: number) {
  if (kp == null || Number.isNaN(kp)) return '—';
  if (kp < 3) return 'Quiet geomagnetic conditions';
  if (kp < 5) return 'Active – possible minor aurora at high latitudes';
  if (kp < 7) return 'Storm – good aurora chances at mid/high latitudes';
  return 'Strong storm – intense geomagnetic activity';
}

function auroraChancePct(kp?: number) {
  if (kp == null || Number.isNaN(kp)) return 0;
  if (kp < 3) return 5;
  if (kp < 4) return 15;
  if (kp < 5) return 30;
  if (kp < 6) return 55;
  if (kp < 7) return 75;
  if (kp < 8) return 90;
  return 98;
}

// ─────────────────────────────────────────────────────────────
// Soft reference band calibration + NOAA-sync (G/R/S tint strength)
// ─────────────────────────────────────────────────────────────

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function percentile(sortedAsc: number[], p: number) {
  if (!sortedAsc.length) return NaN;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

function smooth(prev: number | null | undefined, next: number, a = 0.2) {
  if (prev == null || !Number.isFinite(prev)) return next;
  return prev * (1 - a) + next * a;
}

type SpeedBands = { slowMax: number; typicalMax: number; max: number };

function computeSolarWindSpeedBands(speeds: number[]): SpeedBands {
  const clean = speeds.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length < 12) return { slowMax: 400, typicalMax: 550, max: 900 };

  const p33 = percentile(clean, 0.33);
  const p66 = percentile(clean, 0.66);

  const slowMax = clamp(p33, 320, 430);
  const typicalMax = clamp(p66, 480, 650);

  return { slowMax, typicalMax, max: 900 };
}

function getNoaaScaleLevel(raw: any): number {
  // supports number OR { scale: number; text?: string }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw === 'object' && typeof raw.scale === 'number' && Number.isFinite(raw.scale)) return raw.scale;
  return 0;
}

function bandOpacitiesForLevel(level?: number) {
  // subtle ramp (still OMNI), increases with severity
  const lv = level == null ? 0 : clamp(level, 0, 5);
  const t = lv / 5; // 0..1
  const base = 0.05 + t * 0.06; // 0.05..0.11
  return {
    slow: base,
    typical: base + 0.02,
    fast: base + 0.04,
  };
}

function LearnRow({ label = 'Learn', onPress }: { label?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.learnBtn} hitSlop={10}>
      <Text style={styles.learnBtnText}>{label}</Text>
    </Pressable>
  );
}

export default function SolarScreen() {
  const insets = useSafeAreaInsets();

  const { data, loading, error, refreshing, refresh } = useSpaceWeatherSummary();
  const { events, loading: eventsLoading } = useSpaceWeatherEvents(7);

  // Reuse your Learn system
  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);

  // Smooth band thresholds across refreshes so they don’t “wiggle”
  const bandsRef = useRef<{ slowMax: number; typicalMax: number } | null>(null);

  const openExplain = (p: ExplainPayload) => {
    setExplainPayload(p);
    setExplainOpen(true);
  };

  const renderKpGauge = (kp: number) => {
    const segments = Array.from({ length: 9 }, (_, i) => i + 1);
    return (
      <View style={styles.kpGaugeContainer}>
        <View style={styles.kpGaugeRow}>
          {segments.map((value) => {
            const active = kp >= value - 0.5;
            let color = '#16a34a';
            if (value >= 4 && value < 6) color = '#facc15';
            if (value >= 6 && value < 7) color = '#f97316';
            if (value >= 7) color = '#ef4444';

            return (
              <View
                key={value}
                style={[
                  styles.kpSegment,
                  {
                    backgroundColor: active ? color : '#111827',
                    borderColor: color,
                  },
                ]}
              />
            );
          })}
        </View>
        <View style={styles.kpGaugeLabels}>
          <Text style={styles.smallText}>0</Text>
          <Text style={styles.smallText}>3</Text>
          <Text style={styles.smallText}>5</Text>
          <Text style={styles.smallText}>7</Text>
          <Text style={styles.smallText}>9</Text>
        </View>
      </View>
    );
  };

  const renderSpeedDial = (speed: number) => {
    // keep simple here (the “frame of reference” is now the history bands)
    const min = 250;
    const max = 800;
    const clamped = Math.min(Math.max(speed, min), max);
    const pct = (clamped - min) / (max - min);

    return (
      <View style={styles.speedDialContainer}>
        <View style={styles.speedDialTrack}>
          <View style={[styles.speedDialFill, { flex: pct || 0.05 }]} />
          <View style={{ flex: 1 - pct }} />
        </View>
        <View style={styles.speedDialLabels}>
          <Text style={styles.smallText}>Slow</Text>
          <Text style={styles.smallText}>Fast</Text>
        </View>
      </View>
    );
  };

  const renderAuroraBar = (kp: number) => {
    const chance = auroraChancePct(kp);
    const pct = Math.max(0.05, Math.min(chance / 100, 1));
    let color = '#16a34a';
    if (kp >= 4 && kp < 6) color = '#facc15';
    if (kp >= 6 && kp < 7) color = '#f97316';
    if (kp >= 7) color = '#ef4444';

    return (
      <View style={styles.auroraContainer}>
        <View style={styles.auroraTrack}>
          <View style={[styles.auroraFill, { flex: pct, backgroundColor: color }]} />
          <View style={{ flex: 1 - pct }} />
        </View>
        <Text style={styles.smallText}>Simple aurora likelihood estimate: {chance.toFixed(0)}%</Text>
      </View>
    );
  };

  function renderable(v: any): string {
    if (v == null) return '—';
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);

    if (typeof v === 'object') {
      const scale = (v as any).scale;
      const text = (v as any).text;
      if (typeof scale === 'number') {
        return `${scale}${typeof text === 'string' && text ? ` • ${text}` : ''}`;
      }
      try {
        return JSON.stringify(v);
      } catch {
        return '[object]';
      }
    }

    return String(v);
  }

  // ✅ UPDATED: Wind history now has calibrated soft reference bands + NOAA(G) synced tint
  const renderWindHistory = () => {
    if (!data?.windHistory?.length) return null;

    const history = data.windHistory;

    const speeds = history.map((s) => s.speed).filter((v) => Number.isFinite(v));
    const rawBands = computeSolarWindSpeedBands(speeds);

    // smooth thresholds across refresh
    const prev = bandsRef.current;
    const slowMax = smooth(prev?.slowMax, rawBands.slowMax, 0.2);
    const typicalMax = smooth(prev?.typicalMax, rawBands.typicalMax, 0.2);
    bandsRef.current = { slowMax, typicalMax };

    // severity-driven tint (Solar wind card uses G-scale)
    const gLevel =
      data && (data as any).noaaScales
        ? getNoaaScaleLevel((data as any).noaaScales?.G)
        : 0;

    const op = bandOpacitiesForLevel(gLevel);

    // stable chart max so bars don't "breathe" too much
    const maxDisplay = rawBands.max; // 900
    const hMax = 54;

    // band heights (top-down): slow, typical, fast
    const ySlow = (1 - slowMax / maxDisplay) * hMax;
    const yTypical = (1 - typicalMax / maxDisplay) * hMax;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Solar Wind Speed – last few hours</Text>
          <LearnRow
            onPress={() =>
              openExplain({
                title: 'Solar wind speed history',
                summary: 'This mini chart shows recent upstream solar wind speed changes.',
                whyItMatters:
                  'Speed alone doesn’t guarantee geomagnetic activity, but rising speed can amplify impacts when Bz turns south.',
                howComputed:
                  'Bars are recent NOAA SWPC plasma samples. The background bands are calibrated from recent samples (percentile-based) and smoothed.',
                confidence: 'medium',
                learnTopicId: 'solar-wind',
              })
            }
          />
        </View>

        {/* soft reference bands + bars */}
        <View style={styles.historyGraph}>
          {/* Bands (absolute behind bars) */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {/* FAST band (top) */}
            <View
              style={[
                styles.band,
                {
                  top: 0,
                  height: Math.max(0, yTypical),
                  backgroundColor: `rgba(56,189,248,${op.fast})`,
                  borderColor: `rgba(56,189,248,${op.fast + 0.08})`,
                },
              ]}
            />
            {/* TYPICAL band (middle) */}
            <View
              style={[
                styles.band,
                {
                  top: yTypical,
                  height: Math.max(0, ySlow - yTypical),
                  backgroundColor: `rgba(56,189,248,${op.typical})`,
                  borderColor: `rgba(56,189,248,${op.typical + 0.08})`,
                },
              ]}
            />
            {/* SLOW band (bottom) */}
            <View
              style={[
                styles.band,
                {
                  top: ySlow,
                  height: Math.max(0, hMax - ySlow),
                  backgroundColor: `rgba(56,189,248,${op.slow})`,
                  borderColor: `rgba(56,189,248,${op.slow + 0.08})`,
                },
              ]}
            />

            {/* Threshold lines */}
            <View style={[styles.bandLine, { top: yTypical }]} />
            <View style={[styles.bandLine, { top: ySlow }]} />
          </View>

          {history.map((sample, idx) => {
            const h = Math.max(8, (sample.speed / maxDisplay) * hMax);
            const isLast = idx === history.length - 1;

            // optional: classify bar for tiny “meaning” cue (still subtle)
            const alpha = isLast ? 1 : 0.65;

            return (
              <View key={sample.time} style={styles.historyBarWrapper}>
                <View style={[styles.historyBar, { height: h, opacity: alpha }]} />
              </View>
            );
          })}
        </View>

        <View style={styles.historyLabels}>
          <Text style={styles.smallText}>Earlier</Text>
          <Text style={styles.smallText}>
            Bands: ≤{Math.round(slowMax)} (slow) • ≤{Math.round(typicalMax)} (typical) • &gt;{Math.round(typicalMax)} (fast)
          </Text>
          <Text style={styles.smallText}>Now</Text>
        </View>
      </View>
    );
  };

  const renderRecentEvents = () => {
    if (eventsLoading) {
      return (
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Recent Space Events</Text>
            <LearnRow
              onPress={() =>
                openExplain({
                  title: 'What are “events” here?',
                  summary: 'These are notable space weather events reported by NASA DONKI.',
                  whyItMatters: 'They add context beyond raw sensor data (flares, CMEs, storms, particle events).',
                  howComputed: 'Pulled from NASA DONKI endpoints and normalized into a single feed.',
                  confidence: 'high',
                  learnTopicId: 'donki-events',
                })
              }
            />
          </View>
          <Text style={styles.smallText}>Loading events…</Text>
        </View>
      );
    }

    if (!events?.length) return null;

    const recent = events.slice(0, 4);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Recent Space Events</Text>
          <LearnRow
            onPress={() =>
              openExplain({
                title: 'NASA DONKI events',
                summary: 'A curated feed of notable events: flares, CMEs, particle events, and storm reports.',
                whyItMatters: 'Helps you understand “why” conditions might change over the next 1–3 days.',
                howComputed: 'NASA DONKI API queried over the last 7 days.',
                confidence: 'high',
                learnTopicId: 'donki-events',
              })
            }
          />
        </View>

        {recent.map((e) => (
          <View key={e.id} style={{ marginBottom: 10 }}>
            <Text style={{ color: '#E5E7EB', fontWeight: '700' }}>
              {e.type}
              {e.level ? ` • ${e.level}` : ''}
            </Text>
            <Text style={styles.smallText}>{fmtEventTime(e.startTime)}</Text>
            <Text style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 18 }}>{e.summary}</Text>
          </View>
        ))}

        <Text style={styles.smallText}>Source: NASA DONKI</Text>
      </View>
    );
  };

  const contentPad = useMemo(
    () => ({
      paddingTop: Math.max(12, insets.top * 0.25),
      paddingBottom: Math.max(18, insets.bottom + 18),
    }),
    [insets.top, insets.bottom]
  );

  return (
    <>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, contentPad]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {/* Brand header (OMNIwx style) */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.brandRow}>
                <View style={styles.brandLeft}>
                  <View style={styles.brandMarkWrap}>
                    <Image source={require('../../assets/brand/omniwx-mark.png')} style={styles.brandMark} />
                  </View>

                  <View style={{ flexShrink: 1 }}>
                    <View style={styles.wordmarkRow}>
                      <Text style={styles.wordmarkOmni}>OMNI</Text>
                      <Text style={styles.wordmarkWxSup}>wx</Text>
                    </View>

                    <View style={styles.domainPill}>
                      <Text style={styles.domainPillText}>Space Wx</Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
          <Text style={styles.subtitle}>Solar wind, geomagnetic activity, NOAA scale status, X-ray flux, and events</Text>

          {loading && !data ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={styles.smallText}>Loading space weather…</Text>
            </View>
          ) : error ? (
            <View style={styles.cardError}>
              <Text style={styles.cardTitle}>Error</Text>
              <Text style={styles.cardValue}>{renderable(error)}</Text>
            </View>
          ) : data ? (
            <>
              {/* NOAA Scale Status */}
              {'noaaScales' in data && (data as any).noaaScales ? (
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>NOAA Scale Status</Text>
                    <LearnRow
                      onPress={() =>
                        openExplain({
                          title: 'NOAA Scales (G / R / S)',
                          summary: 'NOAA impact scales for geomagnetic, radio, and radiation storms.',
                          whyItMatters: 'Quick readout of operational impacts.',
                          howComputed: 'From NOAA SWPC “noaa_scales” feed.',
                          confidence: 'high',
                          learnTopicId: 'noaa-scales',
                        })
                      }
                    />
                  </View>

                  <View style={styles.noaaRow}>
                    {(['G', 'R', 'S'] as const).map((k) => {
                      const raw = (data as any).noaaScales?.[k];
                      const scale = getNoaaScaleLevel(raw);
                      const text = raw && typeof raw === 'object' && typeof raw.text === 'string' ? raw.text : undefined;

                      return (
                        <Pressable
                          key={k}
                          onPress={() =>
                            openExplain({
                              title: `NOAA ${k}-scale`,
                              summary: `Current ${k}-scale status is ${k}${scale}.`,
                              whyItMatters: 'These are impact-focused summary scales.',
                              howComputed: 'From NOAA SWPC scales feed.',
                              confidence: 'high',
                              learnTopicId: 'noaa-scales',
                            })
                          }
                          style={styles.noaaTile}
                        >
                          <Text style={styles.noaaVal}>
                            {k}
                            {scale}
                          </Text>

                          <Text style={styles.noaaLbl}>
                            {k === 'G' ? 'Geomagnetic' : k === 'R' ? 'Radio' : 'Radiation'}
                            {text ? ` • ${text}` : ''}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.smallText}>Updated: {renderable((data as any).noaaScalesUpdatedAt)}</Text>
                </View>
              ) : null}

              {/* GOES X-ray Flux */}
              {'xrayFlux' in data && (data as any).xrayFlux ? (
                <View style={styles.card}>
                  <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>GOES X-ray Flux</Text>
                    <LearnRow
                      onPress={() =>
                        openExplain({
                          title: 'X-ray flux & flare class',
                          summary: 'GOES satellites measure solar X-ray brightness; spikes indicate flares.',
                          whyItMatters: 'Flares can cause radio blackouts and may precede eruptions.',
                          howComputed: 'From NOAA SWPC GOES X-ray flux feed.',
                          confidence: 'high',
                          learnTopicId: 'xray-flux',
                        })
                      }
                    />
                  </View>

                  <View style={styles.row}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Current Flux</Text>
                      <Text style={styles.cardValue}>{renderable((data as any).xrayFlux.value)}</Text>
                      <Text style={styles.smallText}>Time: {renderable((data as any).xrayFlux.time)}</Text>
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Flare Class</Text>
                      <Text style={styles.flareClassText}>{(data as any).xrayFlux.classLabel}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Solar Wind Card */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Solar Wind (L1)</Text>
                  <LearnRow
                    onPress={() =>
                      openExplain({
                        title: 'Solar wind (L1)',
                        summary: 'Upstream plasma readings: speed, density, temperature.',
                        whyItMatters: 'Speed/density help estimate energy input, but Bz often controls coupling.',
                        howComputed: 'NOAA SWPC plasma feed with fallbacks + a small recent history.',
                        confidence: 'high',
                        learnTopicId: 'solar-wind',
                      })
                    }
                  />
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Speed</Text>
                    <Text style={styles.cardValue}>{data.solarWindSpeed.toFixed(1)} km/s</Text>
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Density</Text>
                    <Text style={styles.cardValue}>{data.solarWindDensity.toFixed(2)} /cm³</Text>
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={styles.col}>
                    <Text style={styles.label}>Temperature</Text>
                    <Text style={styles.cardValue}>{Math.round(data.solarWindTemp).toLocaleString()} K</Text>
                  </View>
                </View>

                {renderSpeedDial(data.solarWindSpeed)}
              </View>

              {/* Geomagnetic / Aurora Card */}
              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Geomagnetic Activity</Text>
                  <LearnRow
                    onPress={() =>
                      openExplain({
                        title: 'Kp index',
                        summary: 'Kp is a 0–9 global score for geomagnetic disturbance.',
                        whyItMatters: 'Higher Kp often means better aurora odds (latitude + sky conditions still matter).',
                        howComputed: 'From NOAA SWPC Kp feeds (observed with forecast fallback).',
                        confidence: 'high',
                        learnTopicId: 'kp',
                      })
                    }
                  />
                </View>

                <Text style={styles.label}>Planetary Kp Index</Text>
                <Text style={styles.kpValue}>{data.kp.toFixed(1)}</Text>

                {renderKpGauge(data.kp)}

                <Text style={styles.kpDescription}>{kpNarrative(data.kp)}</Text>
                {renderAuroraBar(data.kp)}
              </View>

              {renderRecentEvents()}
              {renderWindHistory()}

              <View style={styles.footer}>
                <Text style={styles.smallText}>Last updated: {fmtUpdated(data.updatedAt)}</Text>
                <Text style={styles.smallText}>Data sources: NOAA SWPC (measurements) • NASA DONKI (events)</Text>
              </View>
            </>
          ) : (
            <View style={styles.center}>
              <Text style={{ color: '#E5E7EB' }}>No space weather data available.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <NerdyExplainModal
        visible={explainOpen}
        onClose={() => setExplainOpen(false)}
        payload={explainPayload}
        onLearnMore={(topicId) => {
          setExplainOpen(false);
          setLearnTopicId(topicId ?? undefined);
          setLearnOpen(true);
        }}
      />

      <LearnMoreModal visible={learnOpen} onClose={() => setLearnOpen(false)} initialTopicId={learnTopicId} />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020817' },
  container: { flex: 1, backgroundColor: '#020817' },
  content: { paddingHorizontal: 16 },

  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },

  brandRow: { marginBottom: 6 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  brandMarkWrap: { width: 42, height: 42, backgroundColor: 'transparent' },
  brandMark: {
    width: '100%',
    height: '100%',
    resizeMode: 'contain',
    backgroundColor: 'transparent',
    borderRadius: 21,
  },

  wordmarkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  wordmarkOmni: { color: 'white', fontSize: 18, fontWeight: '900', letterSpacing: 0.4 },
  wordmarkWxSup: {
    marginLeft: 2,
    marginTop: 2,
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
  },
  wordmarkWx: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '800', marginBottom: 2 },

  domainPill: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  domainPillText: { fontSize: 11, fontWeight: '800', color: 'white' },

  subtitle: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 14, lineHeight: 16 },

  // Generic layout
  center: { marginTop: 28, alignItems: 'center', justifyContent: 'center' },

  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  cardError: {
    backgroundColor: '#7F1D1D',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },

  cardTitle: { fontSize: 16, fontWeight: '700', color: '#F9FAFB' },
  label: { fontSize: 12, color: '#9CA3AF', marginBottom: 4 },
  cardValue: { fontSize: 18, fontWeight: '700', color: '#E5E7EB' },

  learnBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  learnBtnText: { color: 'rgba(255,255,255,0.85)', fontWeight: '900', fontSize: 12 },

  row: { flexDirection: 'row', marginTop: 8, gap: 16 },
  col: { flex: 1 },

  // NOAA tiles
  noaaRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  noaaTile: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  noaaVal: { color: 'white', fontWeight: '900', fontSize: 18 },
  noaaLbl: { marginTop: 4, color: 'rgba(255,255,255,0.65)', fontWeight: '800', fontSize: 12 },

  // Flare class
  flareClassText: { fontSize: 36, fontWeight: '900', color: '#FBBF24', marginTop: 6 },

  // Kp
  kpValue: { fontSize: 32, fontWeight: '900', color: '#FBBF24', marginTop: 4 },
  kpDescription: { marginTop: 8, fontSize: 13, color: '#D1D5DB' },

  kpGaugeContainer: { marginTop: 8 },
  kpGaugeRow: { flexDirection: 'row', gap: 4 },
  kpSegment: { flex: 1, height: 12, borderRadius: 999, borderWidth: 1 },
  kpGaugeLabels: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },

  // Speed dial
  speedDialContainer: { marginTop: 12 },
  speedDialTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  speedDialFill: { backgroundColor: '#38bdf8' },
  speedDialLabels: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' },

  // Aurora bar
  auroraContainer: { marginTop: 12 },
  auroraTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
    marginBottom: 4,
  },
  auroraFill: { borderRadius: 999 },

  // History bars (+ bands)
  historyGraph: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 8,
    height: 60,
    paddingVertical: 3, // gives the bands a little breathing room
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  bandLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  historyBarWrapper: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  historyBar: { width: 6, borderRadius: 999, backgroundColor: '#38bdf8' },

  historyLabels: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },

  footer: { marginTop: 4, marginBottom: 6 },
  smallText: { fontSize: 11, color: '#6B7280' },
});
