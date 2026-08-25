package com.terrabyte.backend.notification;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
@ActiveProfiles("test")
class NotificationDeliveryIntegrationTests {

    @Autowired
    private NotificationService notificationService;

    @Autowired
    private NotificationDeliveryWorker deliveryWorker;

    @Autowired
    @Qualifier("postgresJdbcTemplate")
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private PushSender pushSender;

    private long userId;

    @BeforeEach
    void prepareUserAndToken() {
        jdbcTemplate.update("DELETE FROM notification_delivery");
        jdbcTemplate.update("DELETE FROM notification_event");
        jdbcTemplate.update("DELETE FROM notification_condition_state");
        jdbcTemplate.update("DELETE FROM push_registration");
        jdbcTemplate.update("DELETE FROM app_user WHERE email = ?", "delivery-owner@example.com");
        jdbcTemplate.update(
                "INSERT INTO app_user (email, password_hash, nickname) VALUES (?, ?, ?)",
                "delivery-owner@example.com", "unused", "발송테스터");
        userId = jdbcTemplate.queryForObject(
                "SELECT id FROM app_user WHERE email = ?",
                Long.class,
                "delivery-owner@example.com");
        notificationService.register(userId,
                new RegisterPushTokenRequest("delivery-token", PushPlatform.ANDROID));
    }

    @Test
    void persistsBeforeSendingAndDeliversThroughTheWorker() {
        when(pushSender.send(eq("delivery-token"), any(PushMessage.class)))
                .thenReturn(PushSendResult.sent("message-id"));

        notificationService.handleCondition(request(), true, Duration.ofHours(1));

        verify(pushSender, never()).send(eq("delivery-token"), any(PushMessage.class));
        assertThat(deliveryStatus()).isEqualTo("PENDING");
        assertThat(deliveryWorker.drainOnce()).isEqualTo(1);
        assertThat(deliveryStatus()).isEqualTo("SENT");
        verify(pushSender).send(eq("delivery-token"), any(PushMessage.class));
    }

    @Test
    void retriesTransientFailuresWithoutBlockingTheSourceTransaction() {
        when(pushSender.send(eq("delivery-token"), any(PushMessage.class)))
                .thenReturn(PushSendResult.failed("temporary"))
                .thenReturn(PushSendResult.sent("message-id"));
        notificationService.handleCondition(request(), true, Duration.ofHours(1));

        assertThat(deliveryWorker.drainOnce()).isEqualTo(1);
        assertThat(deliveryStatus()).isEqualTo("PENDING");
        assertThat(deliveryAttempts()).isEqualTo(1);

        jdbcTemplate.update(
                "UPDATE notification_delivery SET available_at = ? WHERE status = 'PENDING'",
                Timestamp.from(Instant.EPOCH));
        assertThat(deliveryWorker.drainOnce()).isEqualTo(1);
        assertThat(deliveryStatus()).isEqualTo("SENT");
    }

    @Test
    void concurrentOneTimeEventsCreateOnlyOneNotificationAndDelivery() {
        NotificationRequest once = new NotificationRequest(
                userId,
                NotificationType.IRRIGATION_COMPLETED,
                "관수 완료",
                "관수가 완료되었습니다.",
                null,
                null,
                "same-command",
                "irrigation-completed:same-command",
                Map.of());

        CompletableFuture<?>[] calls = IntStream.range(0, 8)
                .mapToObj(ignored -> CompletableFuture.runAsync(
                        () -> notificationService.handleOnce(once)))
                .toArray(CompletableFuture[]::new);
        CompletableFuture.allOf(calls).join();

        assertThat(count("notification_event")).isEqualTo(1);
        assertThat(count("notification_delivery")).isEqualTo(1);
    }

    private NotificationRequest request() {
        return new NotificationRequest(
                userId,
                NotificationType.SENSOR_ANOMALY,
                "센서 확인 필요",
                "센서가 유효하지 않은 값을 보고했습니다.",
                null,
                null,
                null,
                "sensor-invalid:delivery-test",
                Map.of("sensorKey", "air"));
    }

    private String deliveryStatus() {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM notification_delivery", String.class);
    }

    private int deliveryAttempts() {
        return jdbcTemplate.queryForObject(
                "SELECT attempts FROM notification_delivery", Integer.class);
    }

    private int count(String table) {
        Integer count = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
        return count == null ? 0 : count;
    }
}
