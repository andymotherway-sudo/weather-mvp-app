import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';

import { AstroHeroCard } from '../../components/astro/AstroHeroCard';
import { AstroHourlyStrip } from '../../components/astro/AstroHourlyStrip';
import { MoonDarknessCard } from '../../components/astro/MoonDarknessCard';
import { OpenAstroMapCard } from '../../components/astro/OpenAstroMapCard';
import { SkyScoreChart } from '../../components/astro/SkyScoreChart';
import { LearnMoreModal } from '../../components/common/LearnMoreModal';
import {
  NerdyExplainModal,
  type ExplainPayload,
} from '../../components/common/NerdyExplainModal';

import { usePlace } from '../context/PlaceContext';
import { typography } from '../../styles/typography';
import { useLocationAstroForecast } from '../lib/astro/locationAstro';
import { writeSkyScoreWidgetCache } from '../lib/astro/skyScoreCache';
import { OMNI_MARK_WORD } from '../lib/brand/assets';
import {
  fetchLatestTerminatorEarthDisk,
  type EarthDiskImage,
  type EarthDiskView,
} from '../lib/spaceweather/earthDisk';
import { useMarsInsightWeather, useSpaceWeatherSummary } from '../lib/spaceweather/hooks';
import { maybeCreateSolarEventCapture } from '../lib/spaceweather/solarCapture';
import { useSpaceWeatherEvents } from '../lib/spaceweather/useSpaceWeatherEvents';
import { useAppChrome } from '../lib/theme/useAppChrome';

const EARTH_DISK_REFRESH_MS = 60 * 60 * 1000;

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
  if (kp < 3) return 0;
  if (kp < 4) return 15;
  if (kp < 5) return 30;
  if (kp < 6) return 55;
  if (kp < 7) return 75;
  if (kp < 8) return 90;
  return 98;
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}


function extractIsoWallClockParts(value: unknown) {
  if (typeof value !== 'string') return null;

  const s = value.trim();
  if (!s) return null;

  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (!m) return null;

  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function wallClockToSortableMs(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
}

function getNowSortableMs(timeZone?: string) {
  if (timeZone) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const parts = fmt.formatToParts(new Date());
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');

    return wallClockToSortableMs({
      year: pick('year'),
      month: pick('month'),
      day: pick('day'),
      hour: pick('hour'),
      minute: pick('minute'),
    });
  }

  const now = new Date();
  return wallClockToSortableMs({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
  });
}

function getNoaaScaleLevel(raw: any): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;

  if (
    raw &&
    typeof raw === 'object' &&
    typeof raw.scale === 'number' &&
    Number.isFinite(raw.scale)
  ) {
    return raw.scale;
  }

  return null;
}

function solarWindBand(speed: number) {
  if (!Number.isFinite(speed)) return { label: 'Unknown', index: 0 };
  if (speed < 350) return { label: 'Slow', index: 0 };
  if (speed < 500) return { label: 'Typical', index: 1 };
  if (speed < 700) return { label: 'Fast', index: 2 };
  return { label: 'Very fast', index: 3 };
}

function fmtMarsTemp(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value)}°C`;
}

function fmtMarsPressure(value: number | null | undefined) {
  if (value == null) return '—';
  return `${Math.round(value)} Pa`;
}

function fmtMarsWind(value: number | null | undefined) {
  if (value == null) return '—';
  return `${value.toFixed(1)} m/s`;
}

function LearnRow({
  label = 'wxLearn',
  onPress,
}: {
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.learnBtn} hitSlop={10}>
      <Text style={styles.learnBtnText}>{label}</Text>
    </Pressable>
  );
}

type SolarViewOption = {
  id: string;
  label: string;
  source: string;
  description: string;
  imageUrl: string;
  topicId: string;
};

const SOLAR_VIEWS: SolarViewOption[] = [
  {
    id: 'continuum',
    label: 'Continuum',
    source: 'SDO HMI',
    description: 'Visible-light solar disk showing sunspots and broad surface structure.',
    imageUrl: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',
    topicId: 'solar-view-continuum',
  },
  {
    id: 'magnetogram',
    label: 'Magnetogram',
    source: 'SDO HMI',
    description: 'Magnetic field map highlighting active regions and polarity boundaries.',
    imageUrl: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIB.jpg',
    topicId: 'solar-view-magnetogram',
  },
  {
    id: 'euv171',
    label: 'EUV 171',
    source: 'SDO AIA',
    description: 'Cooler coronal loops and magnetic arcades in the upper atmosphere.',
    imageUrl: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg',
    topicId: 'solar-view-euv171',
  },
  {
    id: 'euv193',
    label: 'EUV 193',
    source: 'SDO AIA',
    description: 'Coronal holes and hotter active corona, useful for solar wind source regions.',
    imageUrl: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
    topicId: 'solar-view-euv193',
  },
  {
    id: 'euv304',
    label: 'EUV 304',
    source: 'SDO AIA',
    description: 'Chromosphere and prominences around the limb of the Sun.',
    imageUrl: 'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg',
    topicId: 'solar-view-euv304',
  },
  {
    id: 'lasco',
    label: 'Coronagraph',
    source: 'SOHO LASCO C2',
    description: 'Outer corona view used to spot CMEs moving away from the Sun.',
    imageUrl: 'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg',
    topicId: 'solar-view-coronagraph',
  },
];

export default function SolarScreen() {
  const insets = useSafeAreaInsets();
  const { chrome } = useAppChrome();
  const isFocused = useIsFocused();
  const { active } = usePlace();

  const { data, loading, error, refreshing, refresh } = useSpaceWeatherSummary(isFocused);
  const {
    data: mars,
    loading: marsLoading,
    error: marsError,
    refreshing: marsRefreshing,
    refresh: refreshMars,
  } = useMarsInsightWeather(isFocused);
  const { events, loading: eventsLoading, error: eventsError } = useSpaceWeatherEvents(7, isFocused);

  const {
    data: astro,
    loading: astroLoading,
    refreshing: astroRefreshing,
    error: astroError,
    refresh: refreshAstro,
  } = useLocationAstroForecast({
    lat: active?.lat,
    lon: active?.lon,
    placeName: active?.name,
    enabled: isFocused && !!active,
  });

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainPayload, setExplainPayload] = useState<ExplainPayload | null>(null);
  const [learnOpen, setLearnOpen] = useState(false);
  const [learnTopicId, setLearnTopicId] = useState<string | undefined>(undefined);
  const [solarViewId, setSolarViewId] = useState<string>(SOLAR_VIEWS[0].id);
  const [solarImageState, setSolarImageState] = useState<Record<string, 'idle' | 'loading' | 'loaded' | 'error'>>(
    {}
  );
  const [earthDiskView, setEarthDiskView] = useState<EarthDiskView>('goes-east');
  const [earthDisk, setEarthDisk] = useState<EarthDiskImage | null>(null);
  const [earthDiskLoading, setEarthDiskLoading] = useState(true);
  const [earthDiskError, setEarthDiskError] = useState<string | null>(null);
  const [earthDiskImageState, setEarthDiskImageState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [openDetailSections, setOpenDetailSections] = useState<Record<string, boolean>>({});
  const [showAllSwpcAlerts, setShowAllSwpcAlerts] = useState(false);
  const earthDiskRefreshInFlightRef = useRef(false);
  const solarCaptureRunKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFocused) return;
    if (!astro) return;
    writeSkyScoreWidgetCache(astro).catch(() => {});
  }, [astro, isFocused]);

  const solarCaptureEventSignature = useMemo(
    () => events.map((event) => event.id).join('|'),
    [events]
  );

  useEffect(() => {
    if (!isFocused) return;
    if (!data || eventsLoading) return;
    const key = `${data.updatedAt ?? 'space'}|${data.noaaScalesUpdatedAt ?? 'scale'}|${solarCaptureEventSignature}`;
    if (solarCaptureRunKeyRef.current === key) return;
    solarCaptureRunKeyRef.current = key;
    maybeCreateSolarEventCapture({ summary: data, events }).catch(() => {});
  }, [data, events, eventsLoading, solarCaptureEventSignature, isFocused]);

  const openExplain = (p: ExplainPayload) => {
    setExplainPayload(p);
    setExplainOpen(true);
  };

  const openLearnTopic = useCallback((topicId?: string) => {
    setLearnTopicId(topicId ?? undefined);
    setLearnOpen(true);
  }, []);

  const refreshEarthDisk = useCallback(async () => {
    if (earthDiskRefreshInFlightRef.current) return;
    earthDiskRefreshInFlightRef.current = true;
    setEarthDiskLoading(true);
    setEarthDiskError(null);
    setEarthDiskImageState('loading');
    try {
      const next = await fetchLatestTerminatorEarthDisk(earthDiskView === 'goes-west' ? 'west' : 'east');
      setEarthDisk(next);
    } catch (err: any) {
      setEarthDiskError(err?.message ? String(err.message) : 'Earth disk unavailable right now.');
    } finally {
      earthDiskRefreshInFlightRef.current = false;
      setEarthDiskLoading(false);
    }
  }, [earthDiskView]);

  const onRefreshAll = async () => {
    try {
      await Promise.allSettled([
        Promise.resolve(refresh()),
        Promise.resolve(refreshAstro()),
        Promise.resolve(refreshMars()),
        Promise.resolve(refreshEarthDisk()),
      ]);
    } catch {
      // no-op
    }
  };

  useEffect(() => {
    if (!isFocused) return;
    refreshEarthDisk();
  }, [refreshEarthDisk, isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    const timer = setInterval(() => {
      refreshEarthDisk();
    }, EARTH_DISK_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refreshEarthDisk, isFocused]);

  const isRefreshing = refreshing || astroRefreshing || marsRefreshing || earthDiskLoading;
  const chartHours = useMemo(() => {
    const hours = astro?.hours ?? [];
    if (!hours.length) return hours;

    const nowSortable = getNowSortableMs(astro?.timezone);
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < hours.length; i++) {
      const parts = extractIsoWallClockParts(hours[i]?.time);
      if (!parts) continue;

      const hourSortable = wallClockToSortableMs(parts);
      const distance = Math.abs(hourSortable - nowSortable);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    return hours.slice(bestIndex, bestIndex + 72);
  }, [astro]);

  const renderKpGauge = (kp: number) => {
    const segments = Array.from({ length: 9 }, (_, i) => i + 1);

    return (
      <View style={styles.kpGaugeContainer}>
        <View style={styles.kpGaugeRow}>
          {segments.map((value) => {
            const activeSeg = kp >= value - 0.5;
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
                    backgroundColor: activeSeg ? color : '#111827',
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
    const band = solarWindBand(speed);
    const bands = ['Slow', 'Typical', 'Fast', 'Very fast'];

    return (
      <View style={styles.speedMeterContainer}>
        <View style={styles.speedMeterHeader}>
          <Text style={styles.speedMeterValue}>{Math.round(speed)} km/s</Text>
          <View style={styles.speedMeterBadge}>
            <Text style={styles.speedMeterBadgeText}>{band.label}</Text>
          </View>
        </View>

        <View style={styles.speedMeterRow}>
          {bands.map((label, idx) => {
            const activeSeg = idx <= band.index;
            return (
              <View
                key={label}
                style={[
                  styles.speedMeterSeg,
                  activeSeg && styles.speedMeterSegActive,
                ]}
              />
            );
          })}
        </View>

        <View style={styles.speedMeterLabels}>
          <Text style={styles.smallText}>Slow</Text>
          <Text style={styles.smallText}>Typical</Text>
          <Text style={styles.smallText}>Fast</Text>
          <Text style={styles.smallText}>Very fast</Text>
        </View>

        <Text style={styles.smallText}>
          Solar wind is the stream of charged particles from the Sun. Around
          350–500 km/s is typical; above 500 km/s is increasingly fast.
        </Text>
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
          <View
            style={[styles.auroraFill, { flex: pct, backgroundColor: color }]}
          />
          <View style={{ flex: 1 - pct }} />
        </View>
        <Text style={styles.smallText}>
          Simple aurora likelihood estimate: {chance.toFixed(0)}%
        </Text>
      </View>
    );
  };

  function renderable(v: any): string {
    if (v == null) return '—';
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
    ) {
      return String(v);
    }

    if (typeof v === 'object') {
      if (typeof (v as any).message === 'string' && (v as any).message) {
        return (v as any).message;
      }

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

  const renderWindHistory = (embedded = false) => {
    if (!data?.windHistory?.length) return null;

    const history = data.windHistory;
    const speeds = history.map((s) => s.speed).filter((v) => Number.isFinite(v));
    const minSpeed = Math.min(...speeds);
    const maxSpeed = Math.max(...speeds);
    const latestSpeed = speeds[speeds.length - 1];
    const startSpeed = speeds[0];
    const speedDelta = latestSpeed - startSpeed;
    const sampleCount = history.length;
    const approxMinutes = Math.max(5, (sampleCount - 1) * 5);
    const yMin = Math.max(250, Math.floor((minSpeed - 20) / 25) * 25);
    const yMax = Math.max(yMin + 75, Math.ceil((maxSpeed + 20) / 25) * 25);
    const slowMax = 400;
    const typicalMax = 550;
    const chartW = 320;
    const chartH = 120;
    const padL = 38;
    const padR = 14;
    const padT = 12;
    const padB = 24;
    const innerW = chartW - padL - padR;
    const innerH = chartH - padT - padB;
    const speedRange = Math.max(1, yMax - yMin);
    const yFor = (speed: number) => padT + (1 - (speed - yMin) / speedRange) * innerH;
    const xFor = (index: number) =>
      padL + (history.length <= 1 ? 0 : (index / (history.length - 1)) * innerW);
    const gridTicks = [yMax, Math.round((yMax + yMin) / 2), yMin];
    const speedPath = history
      .map((sample, idx) => `${idx === 0 ? 'M' : 'L'} ${xFor(idx).toFixed(1)} ${yFor(sample.speed).toFixed(1)}`)
      .join(' ');
    const latestPoint = { x: xFor(history.length - 1), y: yFor(latestSpeed) };
    const trendLabel =
      Math.abs(speedDelta) < 10 ? 'Steady' : speedDelta > 0 ? 'Rising' : 'Falling';
    const bz = data.imf?.bzGsmNt;
    const bzLabel =
      typeof bz === 'number' && Number.isFinite(bz)
        ? bz < -2
          ? `Bz south ${bz.toFixed(1)} nT`
          : `Bz north ${bz.toFixed(1)} nT`
        : 'Bz unavailable';

    return (
      <View style={embedded ? styles.embeddedPanel : themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Solar Wind Speed – last few hours</Text>
          <LearnRow
            onPress={() =>
              openExplain({
                title: 'Solar wind speed history',
                summary:
                  'This mini chart shows recent upstream solar wind speed changes.',
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

        <View style={styles.historyChartFrame}>
          <Svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
            {gridTicks.map((tick) => {
              const y = yFor(tick);
              return (
                <React.Fragment key={tick}>
                  <Line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                  <SvgText x={padL - 8} y={y + 4} fontSize="10" fontWeight="700" fill="rgba(255,255,255,0.48)" textAnchor="end">
                    {Math.round(tick)}
                  </SvgText>
                </React.Fragment>
              );
            })}
            <Line x1={latestPoint.x} y1={padT} x2={latestPoint.x} y2={chartH - padB} stroke="rgba(125,211,252,0.18)" strokeWidth={1} />
            <Path d={speedPath} stroke="#7dd3fc" strokeWidth={3} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            <Circle cx={latestPoint.x} cy={latestPoint.y} r={4.5} fill="#e0f2fe" />
            <SvgText x={padL} y={chartH - 6} fontSize="10" fontWeight="700" fill="rgba(255,255,255,0.46)" textAnchor="start">
              Earlier
            </SvgText>
            <SvgText x={chartW - padR} y={chartH - 6} fontSize="10" fontWeight="700" fill="rgba(255,255,255,0.46)" textAnchor="end">
              Now
            </SvgText>
          </Svg>
        </View>

        <View style={styles.historySummaryRow}>
          <View style={styles.historyMetricPill}>
            <Text style={styles.historyMetricLabel}>Now</Text>
            <Text style={styles.historyMetricValue}>{Math.round(latestSpeed)} km/s</Text>
          </View>
          <View style={styles.historyMetricPill}>
            <Text style={styles.historyMetricLabel}>Trend</Text>
            <Text style={styles.historyMetricValue}>
              {trendLabel} {speedDelta >= 0 ? '+' : ''}
              {Math.round(speedDelta)}
            </Text>
          </View>
          <View style={styles.historyMetricPill}>
            <Text style={styles.historyMetricLabel}>Range</Text>
            <Text style={styles.historyMetricValue}>
              {Math.round(minSpeed)}–{Math.round(maxSpeed)}
            </Text>
          </View>
        </View>
        <Text style={styles.smallText}>
          Approx. {approxMinutes} min trace. {bzLabel}. Speed is most useful when paired with IMF direction, not by itself.
        </Text>

        <View style={styles.historyLabels}>
          <Text style={styles.smallText}>Earlier</Text>
          <Text style={styles.smallText}>
            Bands: ≤{Math.round(slowMax)} (slow) • ≤{Math.round(typicalMax)}{' '}
            (typical) • &gt;{Math.round(typicalMax)} (fast)
          </Text>
          <Text style={styles.smallText}>Now</Text>
        </View>
      </View>
    );
  };

  const renderRecentEvents = () => {
  return (
    <View style={themedCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.cardTitle}>Recent Space Events</Text>
        <LearnRow
          onPress={() =>
            openExplain({
              title: 'NASA DONKI events',
              summary:
                'A curated feed of notable events: flares, CMEs, particle events, and storm reports.',
              whyItMatters:
                'Helps you understand why conditions might change over the next 1–3 days.',
              howComputed: 'NASA DONKI API queried over the last 7 days.',
              confidence: 'high',
              learnTopicId: 'donki-events',
            })
          }
        />
      </View>

      {eventsLoading ? (
        <Text style={styles.smallText}>Loading events…</Text>
      ) : eventsError ? (
        <>
          <Text style={styles.smallText}>{eventsError}</Text>
          <Text style={styles.smallText}>
            This usually means the NASA DONKI feed or proxy timed out, rate-limited, or returned an upstream error.
          </Text>
          <Text style={styles.smallText}>Source: NASA DONKI</Text>
        </>
      ) : events?.length ? (
        <>
          {events.slice(0, 4).map((e) => (
            <View key={e.id} style={{ marginBottom: 10 }}>
              <Text style={{ color: '#E5E7EB', fontWeight: '700' }}>
                {e.type}
                {e.level ? ` • ${e.level}` : ''}
              </Text>
              <Text style={styles.smallText}>{fmtEventTime(e.startTime)}</Text>
              <Text style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 18 }}>
                {e.summary}
              </Text>
            </View>
          ))}
          <Text style={styles.smallText}>Source: NASA DONKI</Text>
        </>
      ) : (
        <>
          <Text style={styles.smallText}>
            No recent events returned for the last 7 days.
          </Text>
          <Text style={styles.smallText}>Source: NASA DONKI</Text>
        </>
      )}
    </View>
  );
};

  const renderStormSignal = () => {
    if (!data?.incomingStorm) return null;
    const signal = data.incomingStorm;
    const tone =
      signal.level === 'storm-underway'
        ? styles.stormSevere
        : signal.level === 'storm-likely'
          ? styles.stormElevated
          : signal.level === 'watch'
            ? styles.stormWatch
            : styles.stormQuiet;
    return (
      <View style={[themedCard, tone]}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Incoming Storm Signal</Text>
          <Text style={styles.stormScore}>{signal.score}</Text>
        </View>
        <Text style={styles.stormLabel}>{signal.label}</Text>
        <Text style={styles.cardBody}>{signal.summary}</Text>
      </View>
    );
  };

  const renderSwpcAlerts = () => {
    const alerts = data?.swpcAlerts ?? [];
    if (!alerts.length) return null;
    const visibleAlerts = showAllSwpcAlerts ? alerts : alerts.slice(0, 3);
    return (
      <View style={themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>SWPC Watches & Alerts</Text>
          <View style={styles.cardHeaderActions}>
            <LearnRow onPress={() => openLearnTopic('swpc-alerts')} />
            <Text style={styles.alertCount}>{alerts.length}</Text>
          </View>
        </View>
        {visibleAlerts.map((alert) => (
          <View key={alert.id} style={styles.swpcAlertItem}>
            <View style={styles.swpcAlertHeader}>
              <Text style={styles.swpcAlertSeverity}>{alert.severity.toUpperCase()}</Text>
              <Text style={styles.smallText}>{alert.issuedAt ? fmtUpdated(alert.issuedAt) : 'Issued time unavailable'}</Text>
            </View>
            <Text style={styles.swpcAlertTitle}>{alert.title}</Text>
            <Text style={styles.smallText} numberOfLines={4}>{alert.message}</Text>
          </View>
        ))}
        {alerts.length > 3 ? (
          <Pressable style={styles.showAllAlertsButton} onPress={() => setShowAllSwpcAlerts((v) => !v)}>
            <Text style={styles.showAllAlertsText}>
              {showAllSwpcAlerts ? 'Show fewer alerts' : `Show all ${alerts.length} alerts`}
            </Text>
          </Pressable>
        ) : null}
        <Text style={styles.smallText}>Source: NOAA SWPC alerts</Text>
      </View>
    );
  };

  const freshnessToneStyle = (freshness: string) => {
    if (freshness === 'fresh') return styles.freshnessFresh;
    if (freshness === 'lagging') return styles.freshnessLagging;
    if (freshness === 'stale') return styles.freshnessStale;
    return styles.freshnessUnknown;
  };

  const renderSourceFreshness = () => {
    const sources = data?.sources ?? [];
    if (!sources.length) return null;
    return (
      <View style={themedCard}>
        <Text style={styles.cardTitle}>Source Freshness</Text>
        {sources.map((source) => (
          <View key={source.id} style={styles.sourceRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sourceLabel}>{source.label}</Text>
              <Text style={styles.smallText}>{source.provider}</Text>
            </View>
            <View style={[styles.freshnessPill, freshnessToneStyle(source.freshness)]}>
              <Text style={styles.freshnessPillText}>
                {source.freshness}
                {typeof source.ageMinutes === 'number' ? ` · ${source.ageMinutes}m` : ''}
              </Text>
            </View>
          </View>
        ))}
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
  const themedCard = useMemo(
    () => [styles.card, { backgroundColor: chrome.cardStrong, borderColor: chrome.border }],
    [chrome.border, chrome.cardStrong]
  );
  const themedErrorCard = useMemo(
    () => [styles.cardError, { borderColor: chrome.borderStrong }],
    [chrome.borderStrong]
  );

  const astroReady = !!astro;
  const showAstroLoading = astroLoading && !astro;
  const showSpaceWeatherLoading = loading && !data;
  const activeSolarView = useMemo(
    () => SOLAR_VIEWS.find((view) => view.id === solarViewId) ?? SOLAR_VIEWS[0],
    [solarViewId]
  );
  const activeSolarImageState = solarImageState[activeSolarView.id] ?? 'idle';

  const toggleDetailSection = useCallback((key: string) => {
    setOpenDetailSections((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const renderNoaaScaleTile = (k: 'G' | 'R' | 'S') => {
    const raw = (data as any)?.noaaScales?.[k];
    const scale = getNoaaScaleLevel(raw);
    const text =
      raw &&
      typeof raw === 'object' &&
      typeof raw.text === 'string'
        ? raw.text
        : undefined;
    const title =
      k === 'G'
        ? 'Geomagnetic Storms'
        : k === 'R'
          ? 'Radio Blackouts'
          : 'Solar Radiation Storms';

    return (
      <Pressable
        key={k}
        onPress={() =>
          openExplain({
            title: `NOAA ${k}-scale`,
            summary:
              scale == null
                ? `Current ${k}-scale status is unavailable.`
                : `Current ${k}-scale status is ${k}${scale}.`,
            whyItMatters: 'These are impact-focused summary scales.',
            howComputed: 'From NOAA SWPC scales feed.',
            confidence: 'high',
            learnTopicId: 'noaa-scales',
          })
        }
        style={styles.noaaStatusTile}
      >
        <Text style={styles.statusTileTitle}>{title}</Text>
        <Text style={styles.statusTileLabel}>{k} Scale</Text>
        <Text style={styles.noaaStatusValue}>{scale == null ? `${k}—` : `${k}${scale}`}</Text>
        {text ? <Text style={styles.statusTileBody} numberOfLines={2}>{text}</Text> : null}
      </Pressable>
    );
  };

  const renderSpaceWeatherNowCard = () => {
    if (!data) return null;
    const chance = auroraChancePct(data.kp);
    const gScale = getNoaaScaleLevel((data as any).noaaScales?.G);
    const rScale = getNoaaScaleLevel((data as any).noaaScales?.R);
    const sScale = getNoaaScaleLevel((data as any).noaaScales?.S);
    const status = data.incomingStorm?.label ?? kpNarrative(data.kp);

    return (
      <View style={[themedCard, styles.nowHeroCard]}>
        <View style={styles.nowHeroHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>SPACE WEATHER NOW</Text>
            <Text style={styles.nowStatus} numberOfLines={2}>{status}</Text>
          </View>
          <Text style={styles.nowUpdated}>
            Last updated: {fmtUpdated(data.updatedAt)}
          </Text>
        </View>

        <View style={styles.nowHeroGrid}>
          <Pressable style={styles.kpHeroBlock} onPress={() => openLearnTopic('kp')}>
            <Text style={styles.statusTileLabel}>Kp</Text>
            <Text style={styles.kpHeroValue}>{data.kp.toFixed(1)}</Text>
            <Text style={styles.statusTileBody}>{kpNarrative(data.kp)}</Text>
          </Pressable>
          <Pressable style={styles.auroraHeroBlock} onPress={() => openLearnTopic('kp')}>
            <Text style={styles.statusTileLabel}>Aurora</Text>
            <Text style={styles.auroraHeroValue}>{chance.toFixed(0)}%</Text>
            <Text style={styles.statusTileBody}>Simple aurora likelihood estimate</Text>
          </Pressable>
        </View>

        <View style={styles.scaleMiniRow}>
          <Pressable style={styles.scaleMiniTile} onPress={() => openLearnTopic('noaa-scales')}>
            <Text style={styles.statusTileLabel}>G</Text>
            <Text style={styles.scaleMiniValue}>{gScale == null ? 'G—' : `G${gScale}`}</Text>
          </Pressable>
          <Pressable style={styles.scaleMiniTile} onPress={() => openLearnTopic('noaa-scales')}>
            <Text style={styles.statusTileLabel}>R</Text>
            <Text style={styles.scaleMiniValue}>{rScale == null ? 'R—' : `R${rScale}`}</Text>
          </Pressable>
          <Pressable style={styles.scaleMiniTile} onPress={() => openLearnTopic('noaa-scales')}>
            <Text style={styles.statusTileLabel}>S</Text>
            <Text style={styles.scaleMiniValue}>{sScale == null ? 'S—' : `S${sScale}`}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderNoaaScaleGrid = () => {
    if (!data || !('noaaScales' in data) || !(data as any).noaaScales) return null;
    return (
      <View style={themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>NOAA Space Weather Scales</Text>
          <LearnRow
            onPress={() =>
              openExplain({
                title: 'NOAA Scales (G / R / S)',
                summary:
                  'NOAA impact scales for geomagnetic, radio, and radiation storms.',
                whyItMatters: 'Quick readout of operational impacts.',
                howComputed: 'From NOAA SWPC “noaa_scales” feed.',
                confidence: 'high',
                learnTopicId: 'noaa-scales',
              })
            }
          />
        </View>
        <View style={styles.noaaScaleGrid}>
          {(['G', 'R', 'S'] as const).map(renderNoaaScaleTile)}
        </View>
        <Text style={styles.smallText}>
          Updated:{' '}
          {(data as any).noaaScalesUpdatedAt
            ? fmtUpdated((data as any).noaaScalesUpdatedAt)
            : 'Unavailable'}
        </Text>
      </View>
    );
  };

  const renderKpAuroraOutlook = () => {
    if (!data) return null;
    return (
      <View style={themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Kp & Aurora Outlook</Text>
          <LearnRow
            onPress={() =>
              openExplain({
                title: 'Kp index',
                summary:
                  'Kp is a 0â€“9 global score for geomagnetic disturbance.',
                whyItMatters:
                  'Higher Kp often means better aurora odds (latitude + sky conditions still matter).',
                howComputed:
                  'From NOAA SWPC Kp feeds (observed with forecast fallback).',
                confidence: 'high',
                learnTopicId: 'kp',
              })
            }
          />
        </View>

        <View style={styles.kpOutlookHeader}>
          <View>
            <Text style={styles.label}>Kp Index</Text>
            <Text style={styles.kpValue}>{data.kp.toFixed(1)}</Text>
          </View>
          <View style={styles.auroraBadge}>
            <Text style={styles.statusTileLabel}>Aurora</Text>
            <Text style={styles.auroraBadgeValue}>{auroraChancePct(data.kp).toFixed(0)}%</Text>
          </View>
        </View>
        {renderKpGauge(data.kp)}
        <Text style={styles.kpDescription}>{kpNarrative(data.kp)}</Text>
        {renderAuroraBar(data.kp)}
      </View>
    );
  };

  const renderSolarWindPanel = () => {
    if (!data) return null;
    const bz = data.imf?.bzGsmNt;
    const bt = data.imf?.btNt;
    return (
      <View style={themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Solar Wind at L1</Text>
          <LearnRow
            onPress={() =>
              openExplain({
                title: 'Solar wind (L1)',
                summary:
                  'Upstream plasma readings: speed, density, temperature.',
                whyItMatters:
                  'Speed/density help estimate energy input, but Bz often controls coupling.',
                howComputed:
                  'NOAA SWPC plasma feed with fallbacks + a small recent history.',
                confidence: 'high',
                learnTopicId: 'solar-wind',
              })
            }
          />
        </View>

        <View style={styles.windTopGrid}>
          <Pressable style={styles.instrumentTile} onPress={() => openLearnTopic('solar-wind')}>
            <Text style={styles.label}>Speed</Text>
            <Text style={styles.cardValue}>{data.solarWindSpeed.toFixed(1)} km/s</Text>
          </Pressable>
          <Pressable style={styles.instrumentTile} onPress={() => openLearnTopic('solar-wind')}>
            <Text style={styles.label}>Density</Text>
            <Text style={styles.cardValue}>{data.solarWindDensity.toFixed(2)} p/cm3</Text>
          </Pressable>
          <Pressable style={styles.instrumentTile} onPress={() => openLearnTopic('imf-bz')}>
            <Text style={styles.label}>Bz</Text>
            <Text style={styles.cardValue}>{typeof bz === 'number' ? `${bz.toFixed(1)} nT` : 'â€”'}</Text>
          </Pressable>
        </View>

        <View style={styles.secondaryMetricGrid}>
          <Pressable style={styles.secondaryMetricTile} onPress={() => openLearnTopic('solar-wind')}>
            <Text style={styles.label}>Temperature</Text>
            <Text style={styles.secondaryMetricValue}>
              {Math.round(data.solarWindTemp).toLocaleString()} K
            </Text>
          </Pressable>
          <Pressable style={styles.secondaryMetricTile} onPress={() => openLearnTopic('imf-bz')}>
            <Text style={styles.label}>Bt</Text>
            <Text style={styles.secondaryMetricValue}>{typeof bt === 'number' ? `${bt.toFixed(1)} nT` : 'â€”'}</Text>
          </Pressable>
          {data.protons ? (
            <Pressable style={styles.secondaryMetricTile} onPress={() => openLearnTopic('proton-flux')}>
              <Text style={styles.label}>Protons</Text>
              <Text style={styles.secondaryMetricValue}>
                {data.protons.pfu10MeV != null ? data.protons.pfu10MeV.toFixed(2) : 'â€”'}
              </Text>
            </Pressable>
          ) : null}
          {data.protons?.sScale ? (
            <Pressable style={styles.secondaryMetricTile} onPress={() => openLearnTopic('proton-flux')}>
              <Text style={styles.label}>S scale</Text>
              <Text style={styles.secondaryMetricValue}>{data.protons.sScale}</Text>
            </Pressable>
          ) : null}
        </View>

        {renderSpeedDial(data.solarWindSpeed)}
        {renderWindHistory(true)}
      </View>
    );
  };

  const renderSolarActivityPanel = () => {
    return (
      <View style={themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Solar Disk</Text>
          <LearnRow
            onPress={() => {
              setLearnTopicId(activeSolarView.topicId);
              setLearnOpen(true);
            }}
          />
        </View>

        <View style={styles.solarChipRow}>
          {SOLAR_VIEWS.map((view) => (
            <Pressable
              key={view.id}
              onPress={() => setSolarViewId(view.id)}
              style={[
                styles.solarChip,
                view.id === activeSolarView.id ? styles.solarChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.solarChipText,
                  view.id === activeSolarView.id ? styles.solarChipTextActive : null,
                ]}
              >
                {view.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.solarImageFrame}>
          <Image
            source={{ uri: activeSolarView.imageUrl }}
            style={styles.solarImage}
            resizeMode="cover"
            onLoadStart={() =>
              setSolarImageState((current) => ({ ...current, [activeSolarView.id]: 'loading' }))
            }
            onLoad={() =>
              setSolarImageState((current) => ({ ...current, [activeSolarView.id]: 'loaded' }))
            }
            onError={() =>
              setSolarImageState((current) => ({ ...current, [activeSolarView.id]: 'error' }))
            }
          />

          {activeSolarImageState !== 'loaded' ? (
            <View style={styles.solarImageOverlay}>
              <ActivityIndicator color="#E0F2FE" />
              <Text style={styles.solarImageOverlayText}>
                {activeSolarImageState === 'error'
                  ? 'Solar image unavailable right now'
                  : 'Loading live solar image...'}
              </Text>
              <Text style={styles.solarImageOverlaySubtext}>
                Using a smaller mobile-friendly image and warming the rest in the background
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.solarMetaRow}>
          <View style={styles.solarSourcePill}>
            <Text style={styles.solarSourcePillText}>{activeSolarView.source}</Text>
          </View>
          <Text style={styles.smallText}>Live image feed</Text>
        </View>

        <Text style={styles.cardBody}>{activeSolarView.description}</Text>

        {data?.goesXray ? (
          <Pressable style={styles.xrayInlinePanel} onPress={() => openLearnTopic('xray-flux')}>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Current Flux</Text>
                <Text style={styles.cardValue}>
                  {data.goesXray.fluxWm2 != null ? data.goesXray.fluxWm2.toExponential(2) : 'â€”'}
                </Text>
                <Text style={styles.smallText}>
                  Time: {data.goesXray.timeTag ? fmtUpdated(data.goesXray.timeTag) : 'Unavailable'}
                </Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Flare Class</Text>
                <Text style={styles.flareClassText}>{data.goesXray.classLabel}</Text>
              </View>
            </View>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderEarthDiskPanel = () => {
    const earthViewOptions: Array<{ id: EarthDiskView; label: string }> = [
      { id: 'goes-east', label: 'Terminator E' },
      { id: 'goes-west', label: 'Terminator W' },
    ];

    return (
      <View style={themedCard}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardTitle}>Earth View</Text>
          <View style={styles.cardHeaderActions}>
            <LearnRow onPress={() => openLearnTopic('earth-disk')} />
            <Pressable
              style={styles.solarSourcePill}
              onPress={refreshEarthDisk}
              accessibilityRole="button"
              accessibilityLabel="Refresh Earth view"
            >
              <Text style={styles.solarSourcePillText}>Refresh</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.solarChipRow}>
          {earthViewOptions.map((view) => (
            <Pressable
              key={view.id}
              onPress={() => setEarthDiskView(view.id)}
              style={[
                styles.solarChip,
                earthDiskView === view.id ? styles.solarChipActive : null,
              ]}
            >
              <Text
                style={[
                  styles.solarChipText,
                  earthDiskView === view.id ? styles.solarChipTextActive : null,
                ]}
              >
                {view.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.earthDiskFrame}>
          {earthDisk?.imageUrl ? (
            <Image
              source={{ uri: earthDisk.imageUrl }}
              style={styles.earthDiskImage}
              resizeMode="contain"
              onLoadStart={() => setEarthDiskImageState('loading')}
              onLoad={() => setEarthDiskImageState('loaded')}
              onError={() => setEarthDiskImageState('error')}
            />
          ) : null}

          {earthDiskLoading || earthDiskError || earthDiskImageState === 'error' || earthDiskImageState !== 'loaded' ? (
            <View style={styles.solarImageOverlay}>
              {earthDiskLoading ? <ActivityIndicator color="#E0F2FE" /> : null}
              <Text style={styles.solarImageOverlayText}>
                {earthDiskError || earthDiskImageState === 'error'
                  ? 'Earth disk unavailable right now'
                  : 'Loading latest Earth disk...'}
              </Text>
              <Text style={styles.solarImageOverlaySubtext}>
                GOES GeoColor provides the frequently updated terminator views
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.solarMetaRow}>
          <View style={styles.solarSourcePill}>
            <Text style={styles.solarSourcePillText}>{earthDisk?.source ?? 'NOAA GOES GeoColor'}</Text>
          </View>
          <Text style={styles.smallText}>
            {earthDisk?.date ? fmtUpdated(earthDisk.date) : 'Latest available'}
          </Text>
        </View>
        <Text style={styles.cardBody}>
          {earthDisk?.caption ??
            'GOES GeoColor full-disk view shows the day-night terminator from NOAA geostationary weather satellites.'}
        </Text>
        {earthDisk?.centroid ? (
          <Text style={styles.smallText}>
            Disk center near {earthDisk.centroid.lat.toFixed(1)} deg, {earthDisk.centroid.lon.toFixed(1)} deg
          </Text>
        ) : null}
      </View>
    );
  };

  const renderDetailAccordion = (key: string, title: string, children: React.ReactNode) => {
    const open = !!openDetailSections[key];
    return (
      <View style={styles.accordionItem}>
        <Pressable style={styles.accordionHeader} onPress={() => toggleDetailSection(key)}>
          <Text style={styles.accordionTitle}>{title}</Text>
          <Text style={styles.accordionChevron}>{open ? '−' : '+'}</Text>
        </Pressable>
        {open ? <View style={styles.accordionBody}>{children}</View> : null}
      </View>
    );
  };

  useEffect(() => {
    setSolarImageState((current) =>
      current[activeSolarView.id] ? current : { ...current, [activeSolarView.id]: 'loading' }
    );
  }, [activeSolarView.id]);

  useEffect(() => {
    if (!isFocused) return;
    let cancelled = false;

    const warm = async () => {
      const remaining = SOLAR_VIEWS.filter((view) => view.id !== activeSolarView.id);
      for (const view of remaining) {
        try {
          await Image.prefetch(view.imageUrl);
          if (cancelled) return;
          setSolarImageState((current) =>
            current[view.id] === 'loaded' ? current : { ...current, [view.id]: 'loaded' }
          );
        } catch {
          if (cancelled) return;
        }
      }
    };

    warm();
    return () => {
      cancelled = true;
    };
  }, [activeSolarView.id, isFocused]);

  const renderNightSkySection = () => (
    <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Night Sky Context</Text>
        <Text style={styles.sectionSubtitle}>
          Location-based observing conditions and astronomy context
        </Text>
      </View>

      {showAstroLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.smallText}>Loading astro forecast...</Text>
        </View>
      ) : astroError && !astro ? (
        <View style={themedErrorCard}>
          <Text style={styles.cardTitle}>Astro Forecast Error</Text>
          <Text style={styles.cardValue}>{renderable(astroError)}</Text>
        </View>
      ) : astroReady ? (
        <>
          <AstroHeroCard
            forecast={astro}
            onLearnSkyScore={() =>
              openExplain({
                title: 'Sky Score',
                summary:
                  'Sky Score is OMNIwx observing-quality score that blends Bortle darkness, cloud layers, transparency, moonlight, and stability into one number.',
                whyItMatters:
                  'It gives a fast read on whether the sky is truly worth your time, not just whether the Sun is down.',
                howComputed:
                  'The current model weights Bortle and cloud-driven transparency most heavily, then factors in darkness state, moonlight, wind stability, humidity, visibility, and aerosols.',
                confidence: 'medium',
                learnTopicId: 'astro-sky-score',
              })
            }
          />
          <OpenAstroMapCard
            lat={astro.lat}
            lon={astro.lon}
            placeName={astro.placeName}
            compact
          />
          <SkyScoreChart hours={chartHours} />
          <AstroHourlyStrip hours={astro.tonightHours} />
          <MoonDarknessCard
            forecast={astro}
            onLearnTopic={(topicId) => {
              setLearnTopicId(topicId ?? undefined);
              setLearnOpen(true);
            }}
          />
        </>
      ) : null}
    </>
  );

  return (
    <>
      <SafeAreaView style={[styles.safe, { backgroundColor: chrome.background }]} edges={['top', 'left', 'right']}>
        <ScrollView
          style={[styles.container, { backgroundColor: chrome.background }]}
          contentContainerStyle={[styles.content, contentPad]}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefreshAll} />
          }
        >
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <Image source={OMNI_MARK_WORD} style={styles.brandWordmark} resizeMode="contain" />
              <View style={{ flex: 1 }}>
                <View style={styles.domainPill}>
                  <Text style={styles.domainPillText}>Space</Text>
                </View>
                <Text style={styles.headerTitle}>Space Wx</Text>
                <Text style={styles.headerSubline} numberOfLines={2}>
                  {active?.name ? `${active.name} · night sky forecast and solar activity` : 'Night sky forecast, moonlight, observing conditions, aurora context, and space weather'}
                </Text>
              </View>
            </View>
          </View>

          {!active ? (
            <View style={themedCard}>
              <Text style={styles.cardTitle}>No selected location</Text>
              <Text style={styles.cardBody}>
                Choose a location in OMNIwx to load an astro forecast for that
                place.
              </Text>
            </View>
          ) : null}

          {renderNightSkySection()}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Solar Wx</Text>
            <Text style={styles.sectionSubtitle}>
              Current space weather, aurora context, upstream solar wind, and solar activity
            </Text>
          </View>

          {showSpaceWeatherLoading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" />
              <Text style={styles.smallText}>Loading space weatherâ€¦</Text>
            </View>
          ) : error ? (
            <View style={themedErrorCard}>
              <Text style={styles.cardTitle}>Error</Text>
              <Text style={styles.cardValue}>{renderable(error)}</Text>
            </View>
          ) : data ? (
            <>
              {renderSpaceWeatherNowCard()}
              {renderStormSignal()}
              {renderSwpcAlerts()}

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>NOAA SPACE WEATHER SCALES</Text>
                {renderNoaaScaleGrid()}
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>KP & AURORA OUTLOOK</Text>
                {renderKpAuroraOutlook()}
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>SOLAR WIND AT L1</Text>
                {renderSolarWindPanel()}
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>SOLAR ACTIVITY</Text>
                {renderSolarActivityPanel()}
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>EARTH VIEW</Text>
                {renderEarthDiskPanel()}
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>SOLAR EVENTS</Text>
                {renderRecentEvents()}
              </View>

              <View style={styles.dashboardSection}>
                <Text style={styles.dashboardSectionTitle}>DETAILS & LEARN</Text>
                <View style={themedCard}>
                  {renderDetailAccordion('source-freshness', 'Data Sources', renderSourceFreshness())}
                  {renderDetailAccordion(
                    'wxlearn',
                    'WxLearn',
                    <Text style={styles.cardBody}>
                      Use the wxLearn buttons on each panel for NOAA scales, Kp, solar wind, solar imagery, and DONKI event context.
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.footer}>
                <Text style={styles.smallText}>
                  Last updated: {fmtUpdated(data.updatedAt)}
                </Text>
                <Text style={styles.smallText}>
                  Data sources: {data.source ?? 'NOAA SWPC'} â€¢ NASA DONKI (events)
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.center}>
              <Text style={{ color: '#E5E7EB' }}>
                No space weather data available.
              </Text>
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Mars Weather Archive</Text>
            <Text style={styles.sectionSubtitle}>
              Retired InSight observations preserved as a historical Mars weather reference
            </Text>
          </View>

          <View style={themedCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Mars Weather Archive</Text>
              <LearnRow
                onPress={() =>
                  openExplain({
                    title: 'InSight Mars weather',
                    summary:
                      'NASA InSight measured surface temperature, pressure, and wind at Elysium Planitia on Mars.',
                    whyItMatters:
                      'The mission is retired, so this is archived context rather than a live Mars forecast.',
                    howComputed:
                      'OMNIwx requests the NASA InSight Weather API through the worker and falls back to an archived final-mission sample when the stale feed is unavailable.',
                    confidence: 'medium',
                    learnTopicId: 'mars-insight-weather',
                  })
                }
              />
            </View>

            {marsLoading && !mars ? (
              <Text style={styles.smallText}>Loading archived Mars weather...</Text>
            ) : marsError && !mars ? (
              <Text style={styles.smallText}>{marsError}</Text>
            ) : mars ? (
              <>
                <View style={styles.marsMetricRow}>
                  <View style={styles.marsMetricTile}>
                    <Text style={styles.label}>Air temp avg</Text>
                    <Text style={styles.cardValue}>{fmtMarsTemp(mars.tempC.avg)}</Text>
                    <Text style={styles.smallText}>
                      {fmtMarsTemp(mars.tempC.min)} to {fmtMarsTemp(mars.tempC.max)}
                    </Text>
                  </View>
                  <View style={styles.marsMetricTile}>
                    <Text style={styles.label}>Pressure</Text>
                    <Text style={styles.cardValue}>{fmtMarsPressure(mars.pressurePa.avg)}</Text>
                    <Text style={styles.smallText}>Sol {mars.sol}</Text>
                  </View>
                </View>
                <View style={styles.marsMetricRow}>
                  <View style={styles.marsMetricTile}>
                    <Text style={styles.label}>Wind avg</Text>
                    <Text style={styles.cardValue}>{fmtMarsWind(mars.windMps.avg)}</Text>
                    <Text style={styles.smallText}>Max {fmtMarsWind(mars.windMps.max)}</Text>
                  </View>
                  <View style={styles.marsMetricTile}>
                    <Text style={styles.label}>Date</Text>
                    <Text style={styles.cardValue}>{mars.terrestrialDate ?? 'Archived'}</Text>
                    <Text style={styles.smallText}>{mars.season ?? mars.source}</Text>
                  </View>
                </View>
                <Text style={styles.smallText}>{mars.note}</Text>
              </>
            ) : null}
          </View>
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

      <LearnMoreModal
        visible={learnOpen}
        onClose={() => setLearnOpen(false)}
        initialTopicId={learnTopicId}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#020817' },
  container: { flex: 1, backgroundColor: '#020817' },
  content: { paddingHorizontal: 16 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 12,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
    flex: 1,
  },

  brandWordmark: {
    width: 92,
    height: 92,
    backgroundColor: 'transparent',
  },

  domainPill: {
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  domainPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: 'white',
  },

  headerTitle: {
    ...typography.title,
  },

  headerSubline: {
    ...typography.subtitle,
  },

  sectionHeader: {
    marginTop: 4,
    marginBottom: 14,
  },

  sectionTitle: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 4,
  },

  sectionSubtitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 16,
  },

  dashboardSection: {
    marginTop: 2,
  },

  dashboardSectionTitle: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  eyebrow: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 6,
  },

  nowHeroCard: {
    borderColor: 'rgba(125,211,252,0.28)',
    backgroundColor: 'rgba(8,18,40,0.86)',
  },

  nowHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },

  nowStatus: {
    color: '#F9FAFB',
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
  },

  nowUpdated: {
    color: 'rgba(255,255,255,0.56)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    textAlign: 'right',
    maxWidth: 118,
  },

  nowHeroGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },

  kpHeroBlock: {
    flex: 1.1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(251,191,36,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.22)',
  },

  auroraHeroBlock: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.22)',
  },

  kpHeroValue: {
    color: '#FBBF24',
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '900',
  },

  auroraHeroValue: {
    color: '#67E8F9',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
  },

  scaleMiniRow: {
    flexDirection: 'row',
    gap: 8,
  },

  scaleMiniTile: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  scaleMiniValue: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '900',
  },

  noaaScaleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },

  noaaStatusTile: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.16)',
  },

  statusTileTitle: {
    color: '#E5E7EB',
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },

  statusTileLabel: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '900',
    marginTop: 3,
    textTransform: 'uppercase',
  },

  statusTileBody: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 4,
  },

  noaaStatusValue: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    marginTop: 4,
  },

  kpOutlookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },

  auroraBadge: {
    minWidth: 98,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(34,211,238,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.20)',
  },

  auroraBadgeValue: {
    color: '#67E8F9',
    fontSize: 26,
    fontWeight: '900',
  },

  windTopGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },

  instrumentTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.14)',
  },

  secondaryMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },

  secondaryMetricTile: {
    flexGrow: 1,
    flexBasis: '47%',
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  secondaryMetricValue: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '900',
  },

  xrayInlinePanel: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  accordionItem: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  accordionHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  accordionTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '900',
  },

  accordionChevron: {
    color: '#BAE6FD',
    fontSize: 22,
    fontWeight: '900',
  },

  accordionBody: {
    paddingBottom: 12,
  },

  eventItem: {
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },

  eventHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },

  eventType: {
    color: '#E5E7EB',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    flex: 1,
  },

  eventSummary: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
  },

  center: {
    marginTop: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
  },

  embeddedPanel: {
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    backgroundColor: 'rgba(2,6,23,0.34)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
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

  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F9FAFB',
  },

  cardBody: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },

  solarChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    marginBottom: 12,
  },

  solarChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  solarChipActive: {
    borderColor: 'rgba(125,211,252,0.30)',
    backgroundColor: 'rgba(56,189,248,0.12)',
  },

  solarChipText: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 12,
    fontWeight: '800',
  },

  solarChipTextActive: {
    color: '#E0F2FE',
  },

  solarImageFrame: {
    width: '100%',
    aspectRatio: 1.08,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  solarImage: {
    width: '100%',
    height: '100%',
  },

  earthDiskFrame: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.12)',
  },

  earthDiskImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#020617',
  },

  solarImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(2,6,23,0.78)',
    gap: 8,
  },

  solarImageOverlayText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },

  solarImageOverlaySubtext: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },

  solarMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  solarSourcePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },

  solarSourcePillText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '800',
  },

  label: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },

  cardValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#E5E7EB',
  },

  learnBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },

  learnBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '900',
    fontSize: 12,
  },

  row: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 16,
  },

  col: {
    flex: 1,
  },

  noaaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },

  noaaTile: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  noaaVal: {
    color: 'white',
    fontWeight: '900',
    fontSize: 18,
  },

  noaaLbl: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '800',
    fontSize: 12,
  },

  stormQuiet: {
    borderColor: 'rgba(34,197,94,0.24)',
  },
  stormWatch: {
    borderColor: 'rgba(250,204,21,0.34)',
    backgroundColor: 'rgba(113,63,18,0.22)',
  },
  stormElevated: {
    borderColor: 'rgba(249,115,22,0.38)',
    backgroundColor: 'rgba(124,45,18,0.26)',
  },
  stormSevere: {
    borderColor: 'rgba(239,68,68,0.42)',
    backgroundColor: 'rgba(127,29,29,0.28)',
  },
  stormScore: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 12,
    fontWeight: '900',
  },
  stormLabel: {
    color: 'white',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  alertCount: {
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    textAlign: 'center',
    color: '#E0F2FE',
    backgroundColor: 'rgba(14,165,233,0.18)',
    fontSize: 12,
    fontWeight: '900',
  },
  swpcAlertItem: {
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    gap: 4,
  },
  swpcAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  swpcAlertSeverity: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  swpcAlertTitle: {
    color: '#F9FAFB',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
  },
  showAllAlertsButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.22)',
    backgroundColor: 'rgba(14,165,233,0.10)',
  },
  showAllAlertsText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '900',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  sourceLabel: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '900',
  },
  freshnessPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  freshnessPillText: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  freshnessFresh: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.34)',
  },
  freshnessLagging: {
    backgroundColor: 'rgba(250,204,21,0.14)',
    borderColor: 'rgba(250,204,21,0.34)',
  },
  freshnessStale: {
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderColor: 'rgba(239,68,68,0.34)',
  },
  freshnessUnknown: {
    backgroundColor: 'rgba(148,163,184,0.14)',
    borderColor: 'rgba(148,163,184,0.28)',
  },

  marsMetricRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },

  marsMetricTile: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.20)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  flareClassText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#FBBF24',
    marginTop: 6,
  },

  kpValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FBBF24',
    marginTop: 4,
  },

  kpDescription: {
    marginTop: 8,
    fontSize: 13,
    color: '#D1D5DB',
  },

  kpGaugeContainer: {
    marginTop: 8,
  },

  kpGaugeRow: {
    flexDirection: 'row',
    gap: 4,
  },

  kpSegment: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
  },

  kpGaugeLabels: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  speedDialContainer: {
    marginTop: 12,
  },

  speedDialTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },

  speedDialFill: {
    backgroundColor: '#38bdf8',
  },

  speedDialLabels: {
    marginTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  speedMeterContainer: {
    marginTop: 12,
  },

  speedMeterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },

  speedMeterValue: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '800',
  },

  speedMeterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
  },

  speedMeterBadgeText: {
    color: '#BAE6FD',
    fontSize: 12,
    fontWeight: '800',
  },

  speedMeterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
  },

  speedMeterSeg: {
    flex: 1,
    height: 12,
    borderRadius: 999,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  speedMeterSegActive: {
    backgroundColor: '#38bdf8',
    borderColor: '#38bdf8',
  },

  speedMeterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },

  auroraContainer: {
    marginTop: 12,
  },

  auroraTrack: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#020617',
    marginBottom: 4,
  },

  auroraFill: {
    borderRadius: 999,
  },

  historyGraph: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 8,
    height: 60,
    paddingVertical: 3,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  historyChartFrame: {
    marginTop: 10,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  historySummaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 10,
  },
  historyMetricPill: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  historyMetricLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
  },
  historyMetricValue: {
    marginTop: 4,
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '900',
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

  historyBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  historyBar: {
    width: 6,
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },

  historyLabels: {
    display: 'none',
  },

  footer: {
    marginTop: 4,
    marginBottom: 6,
  },

  smallText: {
    fontSize: 11,
    color: '#6B7280',
  },
});

