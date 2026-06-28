import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const STORAGE_PREFIX = 'omniwx:tutorial:v1:';

type TutorialStep = {
  title: string;
  body: string;
  image?: ImageSourcePropType;
};

type TutorialDefinition = {
  eyebrow: string;
  accent: string;
  steps: TutorialStep[];
};

const GUIDE_IMAGES = {
  land: require('../../assets/tutorial/guide-page-03.jpg'),
  hourly: require('../../assets/tutorial/guide-page-04.jpg'),
  almanac: require('../../assets/tutorial/guide-page-07.jpg'),
  maps: require('../../assets/tutorial/guide-page-08.jpg'),
  space: require('../../assets/tutorial/guide-page-05.jpg'),
  nautical: require('../../assets/tutorial/guide-page-11.jpg'),
  aviation: require('../../assets/tutorial/guide-page-12.jpg'),
  extremes: require('../../assets/tutorial/guide-page-13.jpg'),
  wxlab: require('../../assets/tutorial/guide-page-06.jpg'),
} as const;

const TUTORIALS: Record<string, TutorialDefinition> = {
  index: {
    eyebrow: 'Land Tutorial',
    accent: '#78b7ff',
    steps: [
      {
        title: 'Daily weather cockpit',
        body: 'Start here for the plain-language daily answer: current conditions, high and low, actual vs feels, sun and moon timing, alerts, and practical weather signals.',
        image: GUIDE_IMAGES.land,
      },
      {
        title: 'Simple first, wxLab when curious',
        body: 'Simple keeps the forecast readable. wxLab adds dew band, gust factor, pressure behavior, radiation regime, fog risk, and deeper diagnostic cards.',
        image: GUIDE_IMAGES.wxlab,
      },
      {
        title: 'Tap metrics to learn',
        body: 'Many cards open wxLearn topics, so terms like dew point, heat index, wind chill, pressure, AQI, and alerts become explainable inside the app.',
      },
    ],
  },
  hourly: {
    eyebrow: 'Hourly Tutorial',
    accent: '#7bd7ff',
    steps: [
      {
        title: 'Watch the next 72 hours',
        body: 'Hourly is for timing changes: temperature, dew point, wind, gusts, precipitation, clouds, pressure, AQI, and short-term trend notes.',
        image: GUIDE_IMAGES.hourly,
      },
      {
        title: 'Use charts for timing',
        body: 'The detailed view turns those signals into trend lines and compact rows so you can see when the weather actually changes.',
        image: GUIDE_IMAGES.wxlab,
      },
    ],
  },
  almanac: {
    eyebrow: 'Almanac Tutorial',
    accent: '#9cd67a',
    steps: [
      {
        title: 'Climate memory for today',
        body: 'Almanac answers whether today is normal, seasonal, unusual, or record-adjacent using normals, records, prior-year traces, and selected-day context.',
        image: GUIDE_IMAGES.almanac,
      },
      {
        title: 'Records can take a minute',
        body: 'First loads may build station records in the background. Once cached, the screen can return to the same area much faster.',
      },
    ],
  },
  maps: {
    eyebrow: 'Maps Tutorial',
    accent: '#4fd7cf',
    steps: [
      {
        title: 'Weather workstation',
        body: 'Maps brings radar, satellite, alerts, fronts, fire, marine, aviation, astronomy, and export controls into one map surface.',
        image: GUIDE_IMAGES.maps,
      },
      {
        title: 'Layers change the mission',
        body: 'Use the Layers button to switch between radar, clouds, storm scope, nautical, aviation, fire, and sky context without leaving the map.',
      },
      {
        title: 'Animation controls live here',
        body: 'Radar and supported satellite layers can play, pause, scrub, step through frames, and record MP4 loops when frames are available.',
      },
    ],
  },
  solar: {
    eyebrow: 'Space Tutorial',
    accent: '#bca0ff',
    steps: [
      {
        title: 'Solar Wx command center',
        body: 'Space summarizes Kp, aurora, NOAA G/R/S scales, solar wind at L1, SWPC alerts, solar imagery, Earth imagery, Sky Score, and Mars context.',
        image: GUIDE_IMAGES.space,
      },
      {
        title: 'Look for the why',
        body: 'Kp and aurora answer whether anything is happening. Solar wind, Bz, solar disk imagery, and event cards help explain why.',
      },
    ],
  },
  nautical: {
    eyebrow: 'Nautical Tutorial',
    accent: '#54d9ff',
    steps: [
      {
        title: 'Marine briefing without sprawl',
        body: 'Nautical combines sea state, wind, gusts, tides, buoy observations, sea-surface temperature, Beaufort context, and marine forecast text.',
        image: GUIDE_IMAGES.nautical,
      },
      {
        title: 'Nearest coast follows your place',
        body: 'When your active OMNIwx place changes, Nautical can anchor itself to the nearest coastal area and matching marine station.',
      },
    ],
  },
  aviation: {
    eyebrow: 'Aviation Tutorial',
    accent: '#ffd36b',
    steps: [
      {
        title: 'Airport and route briefing',
        body: 'Aviation decodes METAR, TAF, flight category, airport favorites, route corridors, altitude filters, and aviation hazard products.',
        image: GUIDE_IMAGES.aviation,
      },
      {
        title: 'Jump to map context',
        body: 'Saved airports and routes can connect to aviation maps for SIGMETs, turbulence, icing, PIREPs, IFR, mountain obscuration, and thunderstorms.',
      },
    ],
  },
  extremes: {
    eyebrow: 'Extremes Tutorial',
    accent: '#ff8c75',
    steps: [
      {
        title: 'Weather scoreboard',
        body: 'Extremes ranks standout signals: hottest, coldest, windiest, biggest seas, strongest marine winds, water temperatures, space weather, and saved places.',
        image: GUIDE_IMAGES.extremes,
      },
      {
        title: 'Fun, curated, and current',
        body: 'Global rankings are meant to be useful and interesting, not academic perfection. Saved places let you compare the locations you care about.',
      },
    ],
  },
};

function tabKeyFromPath(pathname: string) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return 'index';
  return clean.split('/').filter(Boolean)[0] ?? 'index';
}

export function TabTutorial({
  pathname,
  bottomOffset,
}: {
  pathname: string;
  bottomOffset: number;
}) {
  const tabKey = tabKeyFromPath(pathname);
  const tutorial = TUTORIALS[tabKey];
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}${tabKey}`, [tabKey]);

  useEffect(() => {
    let mounted = true;
    setStepIndex(0);

    if (!tutorial) {
      setVisible(false);
      return () => {
        mounted = false;
      };
    }

    AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (mounted) setVisible(value !== 'done');
      })
      .catch(() => {
        if (mounted) setVisible(true);
      });

    return () => {
      mounted = false;
    };
  }, [storageKey, tutorial]);

  if (!tutorial || !visible) return null;

  const step = tutorial.steps[Math.min(stepIndex, tutorial.steps.length - 1)];
  const isLast = stepIndex >= tutorial.steps.length - 1;

  const finish = () => {
    setVisible(false);
    AsyncStorage.setItem(storageKey, 'done').catch(() => {});
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: bottomOffset }]}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View>
            <Text style={[styles.eyebrow, { color: tutorial.accent }]}>{tutorial.eyebrow}</Text>
            <Text style={styles.progress}>
              {stepIndex + 1} of {tutorial.steps.length}
            </Text>
          </View>

          <Pressable style={styles.skipButton} onPress={finish}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        {step.image ? (
          <Image source={step.image} style={styles.image} resizeMode="contain" />
        ) : null}

        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {tutorial.steps.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === stepIndex && { backgroundColor: tutorial.accent, width: 18 },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            {stepIndex > 0 ? (
              <Pressable style={styles.secondaryButton} onPress={() => setStepIndex((v) => Math.max(0, v - 1))}>
                <Text style={styles.secondaryText}>Back</Text>
              </Pressable>
            ) : null}

            <Pressable
              style={[styles.primaryButton, { backgroundColor: tutorial.accent }]}
              onPress={() => {
                if (isLast) finish();
                else setStepIndex((v) => Math.min(tutorial.steps.length - 1, v + 1));
              }}
            >
              <Text style={styles.primaryText}>{isLast ? 'Done' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: 100,
  },
  card: {
    width: '100%',
    maxWidth: 620,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(180,210,255,0.22)',
    backgroundColor: 'rgba(4,10,28,0.94)',
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  progress: {
    marginTop: 3,
    color: 'rgba(255,255,255,0.48)',
    fontSize: 11,
    fontWeight: '800',
  },
  skipButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipText: {
    color: 'rgba(255,255,255,0.72)',
    fontWeight: '900',
    fontSize: 12,
  },
  image: {
    marginTop: 12,
    width: '100%',
    height: 210,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.28)',
    opacity: 1,
  },
  title: {
    marginTop: 12,
    color: 'white',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  body: {
    marginTop: 7,
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  footer: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  secondaryText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '900',
  },
  primaryButton: {
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  primaryText: {
    color: '#06111f',
    fontSize: 12,
    fontWeight: '900',
  },
});
