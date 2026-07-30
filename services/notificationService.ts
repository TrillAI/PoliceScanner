import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CrimeAlert } from '../constants/types';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function sendCrimeAlertNotification(alert: CrimeAlert): Promise<void> {
  const permitted = await requestNotificationPermission();
  if (!permitted) return;

  const severityEmoji = alert.severity === 'HIGH' ? '🚨' : alert.severity === 'MEDIUM' ? '⚠️' : 'ℹ️';

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${severityEmoji} ${alert.severity} ALERT — ${alert.agency}`,
      body: `"${alert.matchedKeyword.toUpperCase()}" detected\n${alert.transcription.slice(0, 100)}`,
      sound: true,
      data: { alertId: alert.id },
    },
    trigger: null,
  });
}

export async function sendSystemNotification(title: string, body: string): Promise<void> {
  const permitted = await requestNotificationPermission();
  if (!permitted) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}
