// app/(tabs)/index.tsx
// Land Wx – Simple (NOAA/Open-Meteo style current) + Nerdy mode

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useOpenMeteoForecast } from '../lib/openmeteo/hooks';
import { useCurrentWeather } from '../lib/weather/hooks';
import { DEFAULT_LOCATION } from '../lib/weather/locations';

import { Mode, ModeToggle } from '../../components/common/ModeToggle';
import { Card } from '../../components/layout/Card';
import { theme } from '../../styles/theme';
import { typography } from '../../styles/typography';

export default function LandWeatherScreen() {
  const [mode, setMode] = useState<Mode>('simple');
  const router = useRouter();

  // NOAA/Open-Meteo current conditions (your existing hook)
  const {
    data: currentData,
    loading: currentLoading,
    error: currentError,
    refreshing: currentRefreshing,
    refresh: currentRefresh,
  } = useCurrentWeather({
    lat: DEFAULT_LOCATION.lat,
    lon: DEFAULT_LOCATION.lon,
    units: 'imperial',
  } as any);

  // Open-Meteo 3-day forecast (free multi-model blend)
  const {
    data: forecastData,
    loading: forecastLoading,
    error: forecastError,
    refreshing: forecastRefreshing,
    refresh: forecastRefresh,
  } = useOpenMeteoForecast(3);

  const loading = currentLoading || (mode === 'nerdy' && forecastLoading);
  const refreshing = currentRefreshing || forecastRefreshing;

  const onRefresh = () => {
    currentRefresh && currentRefresh();
    forecastRefresh && forecastRefresh();
  };

  // Normalize current weather fields but stay defensive
  const wx: any = currentData ?? {};
  const temp = wx.temperatureF ?? wx.temp_f ?? wx.temperature ?? wx.temp ?? null;
  const feelsLike = wx.apparentTemperatureF ?? wx.feels_like_f ?? wx.feels_like;
  const dewpoint = wx.dewpointF ?? wx.dewpoint_f ?? wx.dew_point ?? null;
  const humidity = wx.relativeHumidity ?? wx.humidity ?? null;
  const windSpeed = wx.windSpeedMph ?? wx.wind_speed_mph ?? wx.windSpeed ?? null;
  const windDir = wx.windDirection ?? wx.wind_dir ?? wx.wind_direction;
  const condition =
    wx.shortForecast ?? wx.condition ?? wx.textDescription ?? wx.weather ?? '—';
  const observationTime = wx.observedAt ?? wx.timestamp ?? wx.datetime ?? null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.appTitle}>Land Wx</Text>
          <Text style={styles.appSubtitle}>
            {DEFAULT_LOCATION.name}
            {DEFAULT_LOCATION.region ? `, ${DEFAULT_LOCATION.region}` : ''}
          </Text>

          {/* Temporary: MapLibre smoke test link (only show in Nerdy to keep Simple clean) */}
          {mode === 'nerdy' ? (
            <Pressable
              onPress={() => router.push('/maplibre-test')}
              style={styles.debugButton}
            >
              <Text style={styles.debugButtonText}>Open MapLibre Test</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Simple / Nerdy toggle */}
        <ModeToggle mode={mode} onChange={setMode} />
      </View>

      {loading && !currentData && (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <Text style={styles.smallText}>Loading weather…</Text>
        </View>
      )}

      {/* Error card – show whichever provider complained first */}
      {(currentError || forecastError) && (
        <Card style={styles.errorCard}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{currentError || forecastError}</Text>
        </Card>
      )}

      {/* SIMPLE MODE */}
      {mode === 'simple' && (
        <>
          {/* Big main card */}
          <Card style={styles.simpleCard}>
            <Text style={styles.simpleTemp}>
              {temp != null ? `${Math.round(temp)}°` : '—'}
            </Text>
            <Text style={styles.simpleCondition}>{condition}</Text>

            <Text style={styles.simpleMeta}>
              Feels like {feelsLike != null ? `${Math.round(feelsLike)}°` : '—'}
            </Text>
            <Text style={styles.simpleMeta}>
              Dew point {dewpoint != null ? `${Math.round(dewpoint)}°` : '—'} ·
              Humidity {humidity != null ? `${Math.round(humidity)}%` : '—'}
            </Text>
            <Text style={styles.simpleMeta}>
              Wind{' '}
              {windSpeed != null ? `${Math.round(windSpeed)} mph` : '—'}{' '}
              {windDir != null ? `@ ${windDir}°` : ''}
            </Text>

            <Text style={styles.updatedText}>
              Observed{' '}
              {observationTime
                ? new Date(observationTime).toLocaleTimeString()
                : '—'}
            </Text>
          </Card>

          {/* 3-day forecast strip (Open-Meteo) */}
          {forecastData && forecastData.daily.length > 0 && (
            <Card style={styles.forecastCard}>
              <Text style={styles.cardTitle}>3-Day Outlook</Text>
              {forecastData.daily.map((d: any) => {
                const date = new Date(d.date);
                return (
                  <View style={styles.forecastRow} key={d.date}>
                    <Text style={styles.forecastDay}>
                      {date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </Text>
                    <Text style={styles.forecastTemps}>
                      {d.tempMax != null ? Math.round(d.tempMax) : '—'}° /{' '}
                      {d.tempMin != null ? Math.round(d.tempMin) : '—'}°
                    </Text>
                    <Text style={styles.forecastMeta}>
                      {d.precipProb != null ? `${d.precipProb}% rain` : '—'}
                    </Text>
                  </View>
                );
              })}
              <Text style={styles.updatedText}>
                Source: Open-Meteo (multi-model blend)
              </Text>
            </Card>
          )}
        </>
      )}

      {/* NERDY MODE */}
      {mode === 'nerdy' && (
        <>
          {/* Current obs panel – more metrics, more texty */}
          <Card style={styles.nerdyCard}>
            <Text style={styles.cardTitle}>Current Observations</Text>
            <Text style={styles.nerdyLine}>
              Temperature:{' '}
              <Text style={styles.nerdyValue}>
                {temp != null ? `${temp.toFixed(1)} °F` : '—'}
              </Text>
            </Text>
            <Text style={styles.nerdyLine}>
              Feels like:{' '}
              <Text style={styles.nerdyValue}>
                {feelsLike != null ? `${feelsLike.toFixed(1)} °F` : '—'}
              </Text>
            </Text>
            <Text style={styles.nerdyLine}>
              Dew point / RH:{' '}
              <Text style={styles.nerdyValue}>
                {dewpoint != null ? `${dewpoint.toFixed(1)} °F` : '—'} ·{' '}
                {humidity != null ? `${Math.round(humidity)} %` : '—'}
              </Text>
            </Text>
            <Text style={styles.nerdyLine}>
              Wind:{' '}
              <Text style={styles.nerdyValue}>
                {windSpeed != null ? `${windSpeed.toFixed(1)} mph` : '—'}{' '}
                {windDir != null ? `@ ${windDir}°` : ''}
              </Text>
            </Text>
            <Text style={styles.nerdyLine}>
              Condition: <Text style={styles.nerdyValue}>{condition}</Text>
            </Text>
            <Text style={styles.updatedText}>
              Source: NOAA / Open-Meteo current observation
            </Text>
          </Card>

          {/* Forecast – same data, but styled more “data table” */}
          {forecastData && forecastData.daily.length > 0 && (
            <Card style={styles.nerdyCard}>
              <Text style={styles.cardTitle}>3-Day Model Blend (Open-Meteo)</Text>
              {forecastData.daily.map((d: any) => {
                const date = new Date(d.date);
                return (
                  <View style={styles.forecastRow} key={d.date}>
                    <Text style={styles.forecastDay}>
                      {date.toLocaleDateString(undefined, { weekday: 'short' })}
                    </Text>
                    <Text style={styles.forecastTemps}>
                      Max {d.tempMax != null ? `${d.tempMax.toFixed(1)}°` : '—'} ·
                      Min {d.tempMin != null ? `${d.tempMin.toFixed(1)}°` : '—'}
                    </Text>
                    <Text style={styles.forecastMeta}>
                      POP {d.precipProb != null ? `${d.precipProb.toFixed(0)} %` : '—'}
                    </Text>
                  </View>
                );
              })}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    gap: 12,
  },
  appTitle: {
    ...typography.title,
  },
  appSubtitle: {
    ...typography.subtitle,
  },

  debugButton: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  debugButtonText: {
    color: 'white',
    fontWeight: '800',
    fontSize: 12,
  },

  center: {
    marginTop: theme.spacing['2xl'],
    alignItems: 'center',
  },
  smallText: {
    ...typography.small,
    marginTop: theme.spacing.sm,
  },
  errorCard: {
    backgroundColor: theme.colors.errorBg,
    borderColor: theme.colors.errorBg,
    marginBottom: theme.spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.errorText,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    color: theme.colors.errorText,
  },
  simpleCard: {
    marginBottom: theme.spacing.lg,
  },
  simpleTemp: {
    fontSize: 64,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  simpleCondition: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: 4,
  },
  simpleMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  updatedText: {
    ...typography.small,
    marginTop: theme.spacing.md,
  },
  forecastCard: {
    marginBottom: theme.spacing.lg,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  forecastRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  forecastDay: {
    fontSize: 12,
    color: '#CBD5F5',
    width: 60,
  },
  forecastTemps: {
    fontSize: 12,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  forecastMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'right',
    width: 70,
  },
  nerdyCard: {
    marginBottom: theme.spacing.md,
  },
  nerdyLine: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 2,
  },
  nerdyValue: {
    color: theme.colors.textPrimary,
    fontWeight: '500',
  },
});
