package com.terrabyte.backend.device;

import java.time.Instant;

public record Device(
        long id,
        String serialCode,
        String hardwareId,
        Long userId,
        String cropCode,
        Instant cropSelectedAt,
        DeviceStatus status,
        Instant lastSeenAt,
        Instant createdAt) {
}
