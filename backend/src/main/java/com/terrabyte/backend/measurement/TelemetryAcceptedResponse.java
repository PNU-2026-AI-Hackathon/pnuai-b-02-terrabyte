package com.terrabyte.backend.measurement;

import java.time.Instant;

public record TelemetryAcceptedResponse(
        boolean accepted,
        long deviceId,
        String hardwareDeviceId,
        Instant observedAt,
        long sequence) {
}
