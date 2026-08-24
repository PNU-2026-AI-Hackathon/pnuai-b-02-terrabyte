package com.terrabyte.backend.notification;

import java.time.Instant;
import java.util.Map;

public record NotificationResponse(
        long id,
        NotificationType type,
        String title,
        String body,
        Long deviceId,
        Long potId,
        Map<String, String> data,
        Instant createdAt,
        Instant readAt) {

    public static NotificationResponse from(NotificationEvent event) {
        return new NotificationResponse(
                event.id(), event.type(), event.title(), event.body(),
                event.deviceId(), event.potId(), event.data(),
                event.createdAt(), event.readAt());
    }
}
