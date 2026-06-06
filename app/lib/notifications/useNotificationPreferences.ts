import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationCategoryId,
  type NotificationPreferences,
  configureNotificationRuntime,
  getNotificationPermissionState,
  loadNotificationPreferences,
  registerNotificationDevice,
  requestNotificationRegistration,
  saveNotificationPreferences,
  scheduleNotificationTest,
} from './preferences';

export function useNotificationPreferences() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await configureNotificationRuntime();
        const [stored, permission] = await Promise.all([
          loadNotificationPreferences(),
          getNotificationPermissionState().catch(() => 'unknown' as const),
        ]);
        if (!mounted) return;
        setPreferences({ ...stored, permission });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: NotificationPreferences) => {
    const saved = await saveNotificationPreferences(next);
    setPreferences(saved);
    registerNotificationDevice(saved).catch(() => {});
    return saved;
  }, []);

  const requestAndEnable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await requestNotificationRegistration();
      return await persist({
        ...preferences,
        enabled: registration.permission === 'granted',
        permission: registration.permission,
        expoPushToken: registration.expoPushToken ?? preferences.expoPushToken,
      });
    } finally {
      setBusy(false);
    }
  }, [persist, preferences]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (enabled) return requestAndEnable();
      return persist({ ...preferences, enabled: false });
    },
    [persist, preferences, requestAndEnable],
  );

  const toggleCategory = useCallback(
    async (id: NotificationCategoryId) => {
      return persist({
        ...preferences,
        categories: {
          ...preferences.categories,
          [id]: !preferences.categories[id],
        },
      });
    },
    [persist, preferences],
  );

  const selectAllCategories = useCallback(
    async (enabled: boolean) => {
      const categories = Object.keys(preferences.categories).reduce(
        (acc, key) => {
          acc[key as NotificationCategoryId] = enabled;
          return acc;
        },
        {} as NotificationPreferences['categories'],
      );
      return persist({ ...preferences, categories });
    },
    [persist, preferences],
  );

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      await scheduleNotificationTest();
    } finally {
      setBusy(false);
    }
  }, []);

  const enabledCount = useMemo(
    () => Object.values(preferences.categories).filter(Boolean).length,
    [preferences.categories],
  );

  return {
    preferences,
    loading,
    busy,
    enabledCount,
    setEnabled,
    requestAndEnable,
    toggleCategory,
    selectAllCategories,
    sendTest,
  };
}
