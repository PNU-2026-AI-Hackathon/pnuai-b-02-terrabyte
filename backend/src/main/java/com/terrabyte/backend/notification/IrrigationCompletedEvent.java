package com.terrabyte.backend.notification;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Contract for the irrigation execution flow. Publish only after the edge device
 * acknowledges that watering physically completed, never when a command is queued.
 */
public record IrrigationCompletedEvent(
        long userId,
        long deviceId,
        long potId,
        String potLabel,
        String commandId,
        BigDecimal actualMilliliters,
        Instant completedAt) {
}
