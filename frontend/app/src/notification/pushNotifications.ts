import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { registerPushToken, unregisterAllPushTokens } from './notificationApi';

const PUSH_TOKEN_KEY = 'terrabyte.androidFcmToken';
const ANDROID_CHANNEL_ID = 'terrabyte-alerts';

export type NotificationSubscription = { remove: () => void };

let registrationSession = 0;
let pendingOperation: Promise<void> = Promise.resolve();
const handledResponses = new Set<string>();

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

function enqueue(operation: () => Promise<void>) {
  const result = pendingOperation.then(operation, operation);
  pendingOperation = result.catch(() => undefined);
  return result;
}

async function saveRegisteredToken(token: string, session: number) {
  if (session !== registrationSession) return;
  const previousToken = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
  await registerPushToken(token, previousToken && previousToken !== token ? previousToken : undefined);
  if (session !== registrationSession) return;
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

async function registerForPushNotifications(session: number) {
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
  await saveRegisteredToken(pushToken.data, session);
}

export function activatePushNotifications() {
  const session = ++registrationSession;
  return enqueue(() => registerForPushNotifications(session));
}

export function deactivatePushNotifications() {
  registrationSession += 1;
  if (Platform.OS !== 'android') return;
  return enqueue(async () => {
    await unregisterAllPushTokens();
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  });
}

export function subscribeToPushTokenChanges(): NotificationSubscription {
  if (Platform.OS !== 'android') return { remove: () => undefined };
  return Notifications.addPushTokenListener((pushToken) => {
    if (pushToken.type !== 'android' || typeof pushToken.data !== 'string') return;
    const session = registrationSession;
    void enqueue(() => saveRegisteredToken(pushToken.data, session)).catch((error) => {
      console.warn('변경된 FCM 토큰을 등록하지 못했습니다.', error);
    });
  });
}

export function subscribeToNotificationResponses(
  listener: (data: Record<string, unknown>) => void,
): NotificationSubscription {
  if (Platform.OS === 'web') return { remove: () => undefined };

  const handle = (response: Notifications.NotificationResponse) => {
    const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (handledResponses.has(responseKey)) return;
    handledResponses.add(responseKey);
    listener(response.notification.request.content.data ?? {});
    Notifications.clearLastNotificationResponse();
  };

  const initialResponse = Notifications.getLastNotificationResponse();
  if (initialResponse) handle(initialResponse);
  return Notifications.addNotificationResponseReceivedListener(handle);
}
