import { ResizeMode, Video } from 'expo-av';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { resolveVideoFromWeatherCode } from '../../app/lib/weather/backgroundVideo';

type Props = {
  weatherCode?: number;
  isEvening?: boolean;
};

export default function WeatherVideoBackground({
  weatherCode,
  isEvening = false,
}: Props) {
  const source = useMemo(() => {
    return resolveVideoFromWeatherCode(
      weatherCode,
      isEvening ? 'evening' : 'day'
    );
  }, [weatherCode, isEvening]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Video
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