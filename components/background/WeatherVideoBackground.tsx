import { ResizeMode, Video } from 'expo-av';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { resolveVideoFromWeatherCode } from '../../app/lib/weather/backgroundVideo';

type Props = {
  weatherCode?: number;
  conditionText?: string | null;
  isEvening?: boolean;
};

export default function WeatherVideoBackground({
  weatherCode,
  conditionText,
  isEvening = false,
}: Props) {
  const theme = isEvening ? 'evening' : 'day';
  const source = useMemo(() => {
    return resolveVideoFromWeatherCode(
      weatherCode,
      theme,
      conditionText
    );
  }, [weatherCode, theme, conditionText]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Video
        key={`${theme}-${weatherCode ?? 'none'}-${conditionText ?? ''}`}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        shouldPlay
        isLooping
        isMuted
      />
    </View>
  );
}
