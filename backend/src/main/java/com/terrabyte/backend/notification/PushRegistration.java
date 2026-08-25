package com.terrabyte.backend.notification;

import java.time.Instant;

public record PushRegistration(
        long id,
        long userId,
        String token,
        PushPlatform platform,
        boolean active,
        Instant createdAt,
        Instant updatedAt) {
}
