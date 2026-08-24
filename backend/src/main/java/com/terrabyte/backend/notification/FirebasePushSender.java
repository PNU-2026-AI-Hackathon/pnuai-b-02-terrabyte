package com.terrabyte.backend.notification;

import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.AndroidNotification;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;

public class FirebasePushSender implements PushSender {

    private static final String CHANNEL_ID = "terrabyte-alerts";

    private final FirebaseMessaging firebaseMessaging;

    public FirebasePushSender(FirebaseMessaging firebaseMessaging) {
        this.firebaseMessaging = firebaseMessaging;
    }

    @Override
    @SuppressWarnings("deprecation")
    public PushSendResult send(String token, PushMessage push) {
        Message message = Message.builder()
                // expo-notifications exposes an Android FCM registration token.
                // Firebase Admin 9.10 deprecates tokens in favour of FIDs, but
                // keeps this path for clients that cannot expose an FID yet.
                .setToken(token)
                .setNotification(Notification.builder()
                        .setTitle(push.title())
                        .setBody(push.body())
                        .build())
                .setAndroidConfig(AndroidConfig.builder()
                        .setPriority(AndroidConfig.Priority.HIGH)
                        .setNotification(AndroidNotification.builder()
                                .setChannelId(CHANNEL_ID)
                                .build())
                        .build())
                .putAllData(push.data())
                .build();
        try {
            return PushSendResult.sent(firebaseMessaging.send(message));
        } catch (FirebaseMessagingException exception) {
            if (exception.getMessagingErrorCode() == MessagingErrorCode.UNREGISTERED) {
                return PushSendResult.invalidToken(exception.getMessage());
            }
            return PushSendResult.failed(exception.getMessage());
        }
    }
}
