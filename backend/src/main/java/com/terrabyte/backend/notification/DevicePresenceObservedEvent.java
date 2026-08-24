package com.terrabyte.backend.notification;

import java.time.Instant;

public record DevicePresenceObservedEvent(
        long userId,
        long deviceId,
        String serialCode,
        boolean online,
        Instant lastSeenAt) {
}
