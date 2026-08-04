package com.terrabyte.backend.device;

import java.time.Instant;

public record Device(long id, String serialCode, String hardwareId, Long userId, Long spaceId,
        String claimCode, Instant claimedAt, DeviceStatus status, Instant lastSeenAt, Instant createdAt) {
}
