// app/lib/weather/backgroundVideo.ts

export type WxVideoKey =
  | 'clear'
  | 'partly'
  | 'overcast'
  | 'rain'
  | 'storm'
  | 'snow';

export const VIDEO_MAP: Record<WxVideoKey, any> = {
  clear: require('../../../assets/weather/clear.mp4'),
  partly: require('../../../assets/weather/partly-cloudy.mp4'),
  overcast: require('../../../assets/weather/overcast.mp4'),
  rain: require('../../../assets/weather/rain.mp4'),
  storm: require('../../../assets/weather/storm.mp4'),
  snow: require('../../../assets/weather/snow.mp4'),
};

// Map Open-Meteo weather codes → your video keys
export function resolveVideoFromWeatherCode(code?: number): WxVideoKey {
  if (code == null) return 'clear';

  // Thunderstorm
  if ([95, 96, 99].includes(code)) return 'storm';

  // Snow
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';

  // Rain
  if (
    [51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)
  )
    return 'rain';

  // Overcast
  if (code === 3) return 'overcast';

  // Partly cloudy
  if (code === 1 || code === 2) return 'partly';

  // Clear
  if (code === 0) return 'clear';

  return 'clear';
}