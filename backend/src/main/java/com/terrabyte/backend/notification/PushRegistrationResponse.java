package com.terrabyte.backend.notification;

import java.time.Instant;

public record PushRegistrationResponse(
        long id,
        PushPlatform platform,
        boolean active,
        Instant createdAt,
        Instant updatedAt) {

    public static PushRegistrationResponse from(PushRegistration registration) {
        return new PushRegistrationResponse(
                registration.id(),
                registration.platform(),
                registration.active(),
                registration.createdAt(),
                registration.updatedAt());
    }
}
