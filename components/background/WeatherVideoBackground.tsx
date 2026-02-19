import { ResizeMode, Video } from 'expo-av';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { VIDEO_MAP, resolveVideoFromWeatherCode } from '../../app/lib/weather/backgroundVideo';

type Props = {
  weatherCode?: number;
};

export default function WeatherVideoBackground({ weatherCode }: Props) {
  const source = useMemo(() => {
    const key = resolveVideoFromWeatherCode(weatherCode);
    return VIDEO_MAP[key];
  }, [weatherCode]);

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