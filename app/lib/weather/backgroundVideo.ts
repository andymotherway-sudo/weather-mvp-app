// app/lib/weather/backgroundVideo.ts

export type WxVideoKey =
  | 'clear'
  | 'partly'
  | 'overcast'
  | 'rain'
  | 'storm'
  | 'snow';

export type VideoTheme = 'day' | 'evening';

type VideoMap = Record<WxVideoKey, any>;

const DAY_VIDEO_MAP: VideoMap = {
  clear: require('../../../assets/weather/clear.mp4'),
  partly: require('../../../assets/weather/partly-cloudy.mp4'),
  overcast: require('../../../assets/weather/overcast.mp4'),
  rain: require('../../../assets/weather/rain.mp4'),
  storm: require('../../../assets/weather/storm.mp4'),
  snow: require('../../../assets/weather/snow.mp4'),
};

const EVENING_VIDEO_MAP: Partial<VideoMap> = {
  clear: require('../../../assets/weather/clear-evening.mp4'),
  partly: require('../../../assets/weather/partly-cloudy-evening.mp4'),

  // Add these as you make them:
  // overcast: require('../../../assets/weather/overcast-evening.mp4'),
  // rain: require('../../../assets/weather/rain-evening.mp4'),
  // storm: require('../../../assets/weather/storm-evening.mp4'),
  // snow: require('../../../assets/weather/snow-evening.mp4'),
};

// Map Open-Meteo weather codes → your video keys
export function resolveVideoKeyFromWeatherCode(code?: number): WxVideoKey {
  if (code == null) return 'clear';

  if ([95, 96, 99].includes(code)) return 'storm';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';

  if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) {
    return 'rain';
  }

  if (code === 3) return 'overcast';
  if (code === 1 || code === 2) return 'partly';
  if (code === 0) return 'clear';

  return 'clear';
}

export function resolveVideoFromWeatherCode(
  code?: number,
  theme: VideoTheme = 'day'
): any {
  const key = resolveVideoKeyFromWeatherCode(code);

  if (theme === 'evening') {
    return EVENING_VIDEO_MAP[key] ?? DAY_VIDEO_MAP[key];
  }

  return DAY_VIDEO_MAP[key];
}