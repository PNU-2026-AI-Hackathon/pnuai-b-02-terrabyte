package com.terrabyte.backend.device;

import java.time.Instant;

public record Device(
        long id,
        String serialCode,
        Long userId,
        DeviceStatus status,
        Instant lastSeenAt,
        Instant createdAt) {
}
