import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const REST_ID = 'form-rest-timer';
export async function enableRestNotifications() {
  if (Platform.OS === 'web') return false;
  const permission = await Notifications.requestPermissionsAsync();
  return permission.granted;
}
export async function cancelRestNotification() {
  if (Platform.OS !== 'web') await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => undefined);
}
export async function scheduleRestNotification(endsAt?: number) {
  await cancelRestNotification();
  if (Platform.OS === 'web' || !endsAt || endsAt <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ID,
    content: { title: 'Ready for your next set', body: 'Your rest timer is complete.', sound: 'default' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt) },
  });
}
