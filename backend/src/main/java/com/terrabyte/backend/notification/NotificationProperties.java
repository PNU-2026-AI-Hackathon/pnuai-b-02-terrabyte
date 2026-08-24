package com.terrabyte.backend.notification;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.notification")
public record NotificationProperties(
        Duration sensorReminderInterval,
        Duration offlineReminderInterval,
        Firebase firebase,
        Delivery delivery) {

    public record Firebase(boolean enabled, String projectId, String credentialsPath) {
    }

    public record Delivery(
            long pollDelayMs,
            int batchSize,
            int maxAttempts,
            Duration retryInterval,
            Duration claimTimeout) {
    }
}
