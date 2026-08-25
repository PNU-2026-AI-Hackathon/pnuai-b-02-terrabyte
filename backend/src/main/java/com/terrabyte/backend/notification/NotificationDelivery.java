package com.terrabyte.backend.notification;

public record NotificationDelivery(
        long id,
        long notificationId,
        long registrationId,
        int attempts) {
}
