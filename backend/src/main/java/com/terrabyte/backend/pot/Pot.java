package com.terrabyte.backend.pot;

import java.time.Instant;

import com.terrabyte.backend.device.DeviceStatus;

public record Pot(
        long id,
        long deviceId,
        String nodeId,
        String label,
        String cropCode,
        Instant cropSelectedAt,
        DeviceStatus status,
        Instant lastSeenAt,
        Instant createdAt) {
}
