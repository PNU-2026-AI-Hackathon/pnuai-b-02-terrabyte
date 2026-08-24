package com.terrabyte.backend.notification;

import java.time.Instant;

public record SensorQualityObservedEvent(
        long userId,
        long deviceId,
        long potId,
        String potLabel,
        boolean airSensorValid,
        boolean lightSensorValid,
        Boolean soilSensorValid,
        Instant observedAt) {
}
