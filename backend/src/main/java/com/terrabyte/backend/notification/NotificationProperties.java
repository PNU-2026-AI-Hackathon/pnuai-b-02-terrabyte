package com.terrabyte.backend.notification;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.notification")
public record NotificationProperties(
        Duration sensorReminderInterval,
        Duration offlineReminderInterval,
        Firebase firebase) {

    public record Firebase(boolean enabled, String projectId, String credentialsPath) {
    }
}
