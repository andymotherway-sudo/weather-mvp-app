import type { LearnTopic } from './topics';

export const OMNIWX_TUTORIAL_VERSION = 'feature-guide-2026-06';

const tutorialSections = [
  {
    title: 'Land',
    body:
      'Start with the daily answer: current conditions, high and low, actual versus feels-like temperature, alerts, sunrise and sunset, and practical weather signals.',
    bullets: ['Use Simple for the clean forecast.', 'Use wxLab for forecaster-style diagnostics.', 'Tap metrics for wxLearn explanations.'],
  },
  {
    title: 'Hourly',
    body:
      'Use Hourly when timing matters. The next-72-hour charts show temperature, dew point, humidity, precipitation, wind, gusts, clouds, pressure, and AQI trends.',
    bullets: ['Scrub the graph for timing.', 'Use wxLab rows when labels feel crowded.', 'AQI is labeled at its points instead of sharing the temperature scale.'],
  },
  {
    title: 'Maps',
    body:
      'Maps is the operations surface for radar, satellite, Storm Scope, alerts, fronts, marine zones, aviation hazards, wildfire context, wind flow, and MP4 exports.',
    bullets: [
      'Use Layers to choose the mission.',
      'Storm Scope bundles active storm context.',
      'Legends change by product, so HeatRisk, NHC tropics, and radar are explained separately.',
    ],
  },
  {
    title: 'Space',
    body:
      'Space starts with night-sky observing conditions, then moves into solar weather, Earth imagery, SWPC alerts, DONKI events, and Mars archive context.',
    bullets: ['Sky Score is for observing quality.', 'Kp and NOAA G/R/S scales describe space-weather activity.', 'Solar wind at L1 explains what is arriving upstream of Earth.'],
  },
  {
    title: 'Nautical',
    body:
      'Nautical combines marine forecast context, waves, wind, gusts, tides, buoy observations, water-station readings, sea temperature, and official marine zones.',
    bullets: ['Use it for near-coast and Great Lakes context.', 'Official zones and model-backed values are labeled differently.', 'Buoy freshness matters.'],
  },
  {
    title: 'Aviation',
    body:
      'Aviation focuses on airport and route weather: METAR, TAF, flight category, route briefing, winds, visibility, ceilings, turbulence, icing, PIREPs, SIGMETs, and map handoff.',
    bullets: ['Pick an airport for decoded conditions.', 'Use route briefing for corridor risk.', 'Aviation weather is expanding across North America and the Caribbean.'],
  },
  {
    title: 'Extremes',
    body:
      'Extremes is the weather scoreboard: hottest, coldest, windiest, marine extremes, space-weather signals, water temperatures, and saved-location comparisons.',
    bullets: ['Global lists are curated and fun, not a peer-reviewed climate archive.', 'Saved places make it personal.', 'Source and freshness still matter.'],
  },
] satisfies NonNullable<LearnTopic['sections']>;

export const OMNIWX_TUTORIAL_TOPIC: LearnTopic = {
  id: 'omniwx-tutorial',
  title: 'OMNIwx Feature Tutorial',
  category: 'start',
  tags: ['tutorial', 'feature guide', 'start here', 'onboarding'],
  summary:
    'A quick clickable walkthrough of the major OMNIwx surfaces. Update this topic when a new feature guide changes the app tour.',
  references: [
    { label: 'Update point', value: 'app/lib/learn/tutorial.ts' },
    { label: 'Guide version', value: OMNIWX_TUTORIAL_VERSION },
  ],
  bullets: [
    'Use this first if you are new to OMNIwx.',
    'Each section maps to one of the main app tabs or workflows.',
    'The full feature guide can be updated separately, then this topic can be refreshed from the same outline.',
  ],
  sections: tutorialSections,
  callout:
    'This topic is intentionally maintained outside the modal component so future feature-guide updates can refresh the tutorial without changing wxLearn UI code.',
};
