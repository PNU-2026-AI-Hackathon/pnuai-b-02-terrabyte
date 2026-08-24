package com.terrabyte.backend.notification;

import java.time.Instant;
import java.util.Map;

public record NotificationEvent(
        long id,
        long userId,
        NotificationType type,
        String title,
        String body,
        Long deviceId,
        Long potId,
        String externalRef,
        String dedupeKey,
        Map<String, String> data,
        Instant createdAt,
        Instant readAt) {
}
