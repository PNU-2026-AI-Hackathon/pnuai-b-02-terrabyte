package com.terrabyte.backend.notification;

import java.util.Map;

public record NotificationRequest(
        long userId,
        NotificationType type,
        String title,
        String body,
        Long deviceId,
        Long potId,
        String externalRef,
        String dedupeKey,
        Map<String, String> data) {

    public NotificationRequest {
        data = data == null ? Map.of() : Map.copyOf(data);
    }
}
