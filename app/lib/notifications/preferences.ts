import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type NotificationCategoryId =
  | 'nwsAlerts'
  | 'newFires'
  | 'kpSpikes'
  | 'aviationCategory'
  | 'skyScore'
  | 'solarCaptures'
  | 'extremes';

export type NotificationPermissionState = 'unknown' | 'granted' | 'denied' | 'undetermined';

export type NotificationPreferences = {
  enabled: boolean;
  categories: Record<NotificationCategoryId, boolean>;
  expoPushToken: string | null;
  permission: NotificationPermissionState;
  updatedAt: string | null;
};

export type NotificationCategory = {
  id: NotificationCategoryId;
  title: string;
  helper: string;
};

export const NOTIFICATION_PREFS_KEY = 'omniwx:notifications:preferences:v1';

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  {
    id: 'nwsAlerts',
    title: 'NWS alerts',
    helper: 'Warnings, watches, advisories, and official alert updates near saved places.',
  },
  {
    id: 'newFires',
    title: 'New fires',
    helper: 'New mapped incidents, nearby perimeters, and meaningful fire-weather changes.',
  },
  {
    id: 'kpSpikes',
    title: 'Kp spikes',
    helper: 'Geomagnetic jumps that can change aurora viewing odds.',
  },
  {
    id: 'aviationCategory',
    title: 'Aviation category',
    helper: 'VFR, MVFR, IFR, and LIFR category changes for saved fields and routes.',
  },
  {
    id: 'skyScore',
    title: 'Sky score',
    helper: 'Meaningful night-sky score and best-window changes for saved locations.',
  },
  {
    id: 'solarCaptures',
    title: 'Solar captures',
    helper: 'Local alert when OMNIwx saves an opt-in solar event capture video.',
  },
  {
    id: 'extremes',
    title: 'Extremes',
    helper: 'Record heat, cold, wind, waves, space weather, and other standout conditions.',
  },
];

const DEFAULT_CATEGORIES = NOTIFICATION_CATEGORIES.reduce(
  (acc, category) => {
    acc[category.id] = true;
    return acc;
  },
  {} as Record<NotificationCategoryId, boolean>,
);

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  categories: DEFAULT_CATEGORIES,
  expoPushToken: null,
  permission: 'unknown',
  updatedAt: null,
};

function normalizePermissionStatus(status: string | null | undefined): NotificationPermissionState {
  if (status === 'granted' || status === 'denied' || status === 'undetermined') return status;
  return 'unknown';
}

function normalizePrefs(raw: any): NotificationPreferences {
  const nextCategories = { ...DEFAULT_CATEGORIES };
  const rawCategories = raw?.categories && typeof raw.categories === 'object' ? raw.categories : {};
  for (const category of NOTIFICATION_CATEGORIES) {
    if (typeof rawCategories[category.id] === 'boolean') {
      nextCategories[category.id] = rawCategories[category.id];
    }
  }

  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : false,
    categories: nextCategories,
    expoPushToken: typeof raw?.expoPushToken === 'string' ? raw.expoPushToken : null,
    permission: normalizePermissionStatus(raw?.permission),
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

export async function loadNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(NOTIFICATION_PREFS_KEY);
    return raw ? normalizePrefs(JSON.parse(raw)) : DEFAULT_NOTIFICATION_PREFERENCES;
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export async function saveNotificationPreferences(
  prefs: NotificationPreferences,
): Promise<NotificationPreferences> {
  const next = { ...prefs, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next));
  return next;
}

export async function configureNotificationRuntime() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('omniwx-alerts', {
      name: 'OMNIwx alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
      sound: 'default',
    });
  }
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  const current = await Notifications.getPermissionsAsync();
  return normalizePermissionStatus(current.status);
}

export async function requestNotificationRegistration(): Promise<{
  permission: NotificationPermissionState;
  expoPushToken: string | null;
}> {
  await configureNotificationRuntime();
  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === 'granted' ? current.status : (await Notifications.requestPermissionsAsync()).status;
  const normalized = normalizePermissionStatus(permission);
  if (normalized !== 'granted') {
    return { permission: normalized, expoPushToken: null };
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined;
  try {
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return { permission: normalized, expoPushToken: token.data };
  } catch {
    return { permission: normalized, expoPushToken: null };
  }
}

export async function scheduleNotificationTest() {
  await configureNotificationRuntime();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'OMNIwx notifications ready',
      body: 'Your selected weather alerts can now use this notification channel.',
      data: { screen: 'settings', source: 'notification-test' },
      sound: 'default',
    },
    trigger: { seconds: 2, channelId: 'omniwx-alerts' },
  });
}

export async function registerNotificationDevice(prefs: NotificationPreferences) {
  const base = (process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');
  if (!base || !prefs.expoPushToken || !prefs.enabled || prefs.permission !== 'granted') return;

  try {
    await fetch(`${base}/api/notifications/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: prefs.expoPushToken,
        categories: prefs.categories,
        platform: Platform.OS,
        app: 'omniwx',
      }),
    });
  } catch {
    // The client stores preferences even if the backend endpoint is not deployed yet.
  }
}
