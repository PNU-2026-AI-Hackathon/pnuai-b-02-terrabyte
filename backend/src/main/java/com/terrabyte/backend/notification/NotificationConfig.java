package com.terrabyte.backend.notification;

import java.io.FileInputStream;
import java.io.IOException;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(NotificationProperties.class)
@EnableScheduling
public class NotificationConfig {

    @Bean(destroyMethod = "delete")
    @ConditionalOnProperty(
            prefix = "app.notification.firebase",
            name = "enabled",
            havingValue = "true")
    public FirebaseApp firebaseApp(NotificationProperties properties) throws IOException {
        NotificationProperties.Firebase firebase = properties.firebase();
        GoogleCredentials credentials;
        if (firebase.credentialsPath() == null || firebase.credentialsPath().isBlank()) {
            credentials = GoogleCredentials.getApplicationDefault();
        } else {
            try (FileInputStream input = new FileInputStream(firebase.credentialsPath())) {
                credentials = GoogleCredentials.fromStream(input);
            }
        }

        FirebaseOptions.Builder options = FirebaseOptions.builder().setCredentials(credentials);
        if (firebase.projectId() != null && !firebase.projectId().isBlank()) {
            options.setProjectId(firebase.projectId());
        }
        return FirebaseApp.initializeApp(options.build(), "terrabyte-push");
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "app.notification.firebase",
            name = "enabled",
            havingValue = "true")
    public FirebaseMessaging firebaseMessaging(FirebaseApp firebaseApp) {
        return FirebaseMessaging.getInstance(firebaseApp);
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "app.notification.firebase",
            name = "enabled",
            havingValue = "true")
    public PushSender firebasePushSender(FirebaseMessaging firebaseMessaging) {
        return new FirebasePushSender(firebaseMessaging);
    }

    @Bean
    @ConditionalOnProperty(
            prefix = "app.notification.firebase",
            name = "enabled",
            havingValue = "false",
            matchIfMissing = true)
    public PushSender noOpPushSender() {
        return (token, message) -> PushSendResult.skipped("firebase_disabled");
    }
}
