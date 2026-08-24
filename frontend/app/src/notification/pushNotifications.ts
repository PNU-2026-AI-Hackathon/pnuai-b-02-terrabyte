import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { registerPushToken, unregisterPushToken } from './notificationApi';

const PUSH_TOKEN_KEY = 'terrabyte.androidFcmToken';
const ANDROID_CHANNEL_ID = 'terrabyte-alerts';

export type NotificationSubscription = { remove: () => void };

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function saveRegisteredToken(token: string) {
  await registerPushToken(token);
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

export async function registerForPushNotifications() {
  // The backend sends directly through FCM. Expo returns an APNs token on iOS,
  // so iOS is intentionally deferred until an APNs sender is implemented.
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'TerraByte 알림',
    importance: Notifications.AndroidImportance.MAX,
    lightColor: '#1F6646',
    vibrationPattern: [0, 250, 250, 250],
  });

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return;

  const pushToken = await Notifications.getDevicePushTokenAsync();
  if (pushToken.type !== 'android' || typeof pushToken.data !== 'string') return;
  await saveRegisteredToken(pushToken.data);
}

export async function unregisterFromPushNotifications() {
  if (Platform.OS !== 'android') return;
  const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  if (!token) return;
  await unregisterPushToken(token);
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}

export function subscribeToPushTokenChanges(): NotificationSubscription {
  if (Platform.OS !== 'android') return { remove: () => undefined };
  return Notifications.addPushTokenListener((pushToken) => {
    if (pushToken.type !== 'android' || typeof pushToken.data !== 'string') return;
    void saveRegisteredToken(pushToken.data).catch((error) => {
      console.warn('변경된 FCM 토큰을 등록하지 못했습니다.', error);
    });
  });
}

export function subscribeToNotificationResponses(
  listener: (data: Record<string, unknown>) => void,
): NotificationSubscription {
  if (Platform.OS === 'web') return { remove: () => undefined };
  return Notifications.addNotificationResponseReceivedListener((response) => {
    listener(response.notification.request.content.data ?? {});
  });
}
