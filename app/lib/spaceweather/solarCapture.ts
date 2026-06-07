import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import { canExportAnimationVideo, exportAnimationVideo, type AnimationVideoFrame } from '../maps/videoExport';
import { configureNotificationRuntime, loadNotificationPreferences } from '../notifications/preferences';
import type { SpaceWeatherSummary } from './types';
import type { SpaceWeatherEvent } from './useSpaceWeatherEvents';

export const SOLAR_CAPTURE_ENABLED_KEY = 'omniwx:spaceweather:solarCaptureVideos:enabled:v1';
const SOLAR_CAPTURE_LAST_EVENT_KEY = 'omniwx:spaceweather:solarCaptureVideos:lastEvent:v1';

const SOLAR_EVENT_FRAME_URLS = [
  'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIIC.jpg',
  'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_HMIB.jpg',
  'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0171.jpg',
  'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0193.jpg',
  'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_512_0304.jpg',
  'https://soho.nascom.nasa.gov/data/realtime/c2/512/latest.jpg',
];

export type SolarCaptureCandidate = {
  id: string;
  title: string;
  severity: 'notable' | 'major' | 'severe';
  summary: string;
  startedAt?: string;
};

export async function loadSolarCaptureEnabled() {
  return (await AsyncStorage.getItem(SOLAR_CAPTURE_ENABLED_KEY)) === 'true';
}

export async function saveSolarCaptureEnabled(enabled: boolean) {
  await AsyncStorage.setItem(SOLAR_CAPTURE_ENABLED_KEY, enabled ? 'true' : 'false');
}

function flareRank(level?: string) {
  const raw = String(level ?? '').trim().toUpperCase();
  const match = raw.match(/^([ABCXMR])\s*([0-9.]+)/);
  if (!match) return 0;
  const [, klass, valueRaw] = match;
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return 0;
  if (klass === 'X') return 400 + value;
  if (klass === 'M') return 300 + value;
  if (klass === 'C') return 200 + value;
  return 100 + value;
}

function cmeSpeed(level?: string) {
  const match = String(level ?? '').match(/([0-9]{3,5})\s*km\/s/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : null;
}

function gScaleValue(level?: string) {
  const match = String(level ?? '').match(/G([1-5])/i);
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : null;
}

export function identifySolarCaptureCandidate(
  summary: SpaceWeatherSummary | null | undefined,
  events: SpaceWeatherEvent[],
): SolarCaptureCandidate | null {
  const recentCutoff = Date.now() - 36 * 60 * 60_000;
  const recentEvents = events.filter((event) => {
    const t = new Date(event.startTime).getTime();
    return Number.isFinite(t) && t >= recentCutoff;
  });

  const ranked = recentEvents
    .map((event) => {
      if (event.type === 'FLARE') {
        const rank = flareRank(event.level);
        if (rank >= 401) {
          return {
            candidate: {
              id: event.id,
              title: `${event.level ?? 'X-class'} flare recorded`,
              severity: rank >= 405 ? 'severe' : 'major',
              summary: event.summary,
              startedAt: event.startTime,
            } satisfies SolarCaptureCandidate,
            score: rank,
          };
        }
      }
      if (event.type === 'CME') {
        const speed = cmeSpeed(event.level);
        if (speed != null && speed >= 1000) {
          return {
            candidate: {
              id: event.id,
              title: `Fast CME recorded (${speed} km/s)`,
              severity: speed >= 1800 ? 'severe' : 'major',
              summary: event.summary,
              startedAt: event.startTime,
            } satisfies SolarCaptureCandidate,
            score: 300 + speed / 100,
          };
        }
      }
      if (event.type === 'GST') {
        const g = gScaleValue(event.level);
        if (g != null && g >= 2) {
          return {
            candidate: {
              id: event.id,
              title: `${event.level ?? 'Geomagnetic storm'} recorded`,
              severity: g >= 4 ? 'severe' : 'major',
              summary: event.summary,
              startedAt: event.startTime,
            } satisfies SolarCaptureCandidate,
            score: 250 + g,
          };
        }
      }
      if (event.type === 'SEP') {
        return {
          candidate: {
            id: event.id,
            title: 'Particle event recorded',
            severity: 'major',
            summary: event.summary,
            startedAt: event.startTime,
          } satisfies SolarCaptureCandidate,
          score: 260,
        };
      }
      return null;
    })
    .filter(Boolean) as Array<{ candidate: SolarCaptureCandidate; score: number }>;

  const currentG = gScaleValue(summary?.noaaScales?.G?.text) ?? summary?.noaaScales?.G?.scale ?? 0;
  const currentR = summary?.noaaScales?.R?.scale ?? 0;
  const currentS = summary?.noaaScales?.S?.scale ?? 0;
  const currentXrayRank = flareRank(summary?.goesXray?.classLabel);
  const currentCandidates: Array<{ candidate: SolarCaptureCandidate; score: number }> = [];

  if ((summary?.kp ?? 0) >= 6 || currentG >= 2) {
    currentCandidates.push({
      candidate: {
        id: `SWPC:KP:${summary?.updatedAt ?? new Date().toISOString()}`,
        title: `Kp ${summary?.kp?.toFixed(1) ?? 'storm'} geomagnetic event recorded`,
        severity: (summary?.kp ?? 0) >= 8 || currentG >= 4 ? 'severe' : 'major',
        summary: `Current Kp ${summary?.kp?.toFixed(1) ?? '--'} with ${summary?.noaaScales?.G?.text ?? 'elevated geomagnetic conditions'}.`,
        startedAt: summary?.updatedAt,
      },
      score: 240 + (summary?.kp ?? 0),
    });
  }
  if (currentR >= 3 || currentS >= 2 || currentXrayRank >= 401) {
    currentCandidates.push({
      candidate: {
        id: `SWPC:SCALE:${summary?.noaaScalesUpdatedAt ?? summary?.updatedAt ?? new Date().toISOString()}`,
        title: 'Major solar scale event recorded',
        severity: currentR >= 4 || currentS >= 3 || currentXrayRank >= 405 ? 'severe' : 'major',
        summary: `NOAA scales: R${currentR || 0}, S${currentS || 0}, G${currentG || 0}. X-ray ${summary?.goesXray?.classLabel ?? '--'}.`,
        startedAt: summary?.noaaScalesUpdatedAt ?? summary?.updatedAt,
      },
      score: 270 + Math.max(currentR, currentS, currentG, currentXrayRank - 400),
    });
  }

  return [...ranked, ...currentCandidates].sort((a, b) => b.score - a.score)[0]?.candidate ?? null;
}

function captureFrames(candidate: SolarCaptureCandidate): AnimationVideoFrame[] {
  const labels = ['Continuum', 'Magnetogram', 'EUV 171', 'EUV 193', 'EUV 304', 'Coronagraph'];
  return SOLAR_EVENT_FRAME_URLS.map((url, index) => ({
    label: labels[index] ?? `Frame ${index + 1}`,
    urls: [url],
  }));
}

export async function maybeCreateSolarEventCapture(args: {
  summary: SpaceWeatherSummary | null | undefined;
  events: SpaceWeatherEvent[];
}) {
  const enabled = await loadSolarCaptureEnabled();
  if (!enabled || !canExportAnimationVideo()) return null;

  const candidate = identifySolarCaptureCandidate(args.summary, args.events);
  if (!candidate) return null;

  const lastId = await AsyncStorage.getItem(SOLAR_CAPTURE_LAST_EVENT_KEY);
  if (lastId === candidate.id) return null;

  const result = await exportAnimationVideo({
    frames: captureFrames(candidate),
    title: 'OMNIwx Solar Event',
    subtitle: candidate.summary,
    productLabel: candidate.title,
    width: 1080,
    height: 1080,
    fps: 24,
    secondsPerSourceFrame: 0.95,
    transitionSeconds: 0.35,
  });

  await AsyncStorage.setItem(SOLAR_CAPTURE_LAST_EVENT_KEY, candidate.id);
  await notifySolarCaptureSaved(candidate);
  return { candidate, result };
}

async function notifySolarCaptureSaved(candidate: SolarCaptureCandidate) {
  const prefs = await loadNotificationPreferences();
  if (!prefs.enabled || !prefs.categories.solarCaptures) return;

  await configureNotificationRuntime();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Solar event video saved',
      body: candidate.title,
      data: { screen: 'space', source: 'solar-capture', eventId: candidate.id },
      sound: 'default',
    },
    trigger: { seconds: 1, channelId: 'omniwx-alerts' },
  });
}
