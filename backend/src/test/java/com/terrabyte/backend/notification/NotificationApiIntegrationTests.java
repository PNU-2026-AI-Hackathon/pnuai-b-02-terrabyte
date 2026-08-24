package com.terrabyte.backend.notification;

import java.time.Duration;
import java.util.Map;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class NotificationApiIntegrationTests {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final NotificationService notificationService;
    private final NotificationDeliveryWorker deliveryWorker;

    @MockitoBean
    private PushSender pushSender;

    @Autowired
    NotificationApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate,
            NotificationService notificationService,
            NotificationDeliveryWorker deliveryWorker) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.notificationService = notificationService;
        this.deliveryWorker = deliveryWorker;
    }

    @BeforeEach
    void resetNotificationData() {
        jdbcTemplate.update("DELETE FROM notification_delivery");
        jdbcTemplate.update("DELETE FROM notification_event");
        jdbcTemplate.update("DELETE FROM notification_condition_state");
        jdbcTemplate.update("DELETE FROM push_registration");
        when(pushSender.send(anyString(), any(PushMessage.class)))
                .thenReturn(PushSendResult.sent("test"));
    }

    @Test
    void registersAndUnregistersTheAuthenticatedUsersTokenWithoutReturningIt() throws Exception {
        String token = signupAndGetToken("push-owner@example.com");

        mockMvc.perform(post("/api/push-tokens")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"token":"native-fcm-token","platform":"ANDROID"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.platform").value("ANDROID"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.token").doesNotExist());

        mockMvc.perform(delete("/api/push-tokens")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("{\"token\":\"native-fcm-token\"}"))
                .andExpect(status().isNoContent());

        Integer active = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM push_registration WHERE active = TRUE",
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(active).isZero();
    }

    @Test
    void replacesThePreviousTokenAndCanRevokeAllTokens() throws Exception {
        String token = signupAndGetToken("push-replace@example.com");

        mockMvc.perform(post("/api/push-tokens")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("{\"token\":\"old-token\",\"platform\":\"ANDROID\"}"))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/push-tokens")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("""
                                {"token":"new-token","platform":"ANDROID",\
                                 "previousToken":"old-token"}
                                """))
                .andExpect(status().isCreated());

        Integer oldActive = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM push_registration WHERE token = 'old-token' AND active = TRUE",
                Integer.class);
        Integer newActive = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM push_registration WHERE token = 'new-token' AND active = TRUE",
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(oldActive).isZero();
        org.assertj.core.api.Assertions.assertThat(newActive).isEqualTo(1);

        mockMvc.perform(delete("/api/push-tokens/all")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isNoContent());
        Integer active = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM push_registration WHERE active = TRUE",
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(active).isZero();
    }

    @Test
    void rejectsUnsupportedIosRegistrations() throws Exception {
        String token = signupAndGetToken("push-ios@example.com");

        mockMvc.perform(post("/api/push-tokens")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("{\"token\":\"apns-token\",\"platform\":\"IOS\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void exposesPersistedNotificationsAndReadState() throws Exception {
        String token = signupAndGetToken("alert-owner@example.com");
        long userId = userId("alert-owner@example.com");
        notificationService.handleCondition(
                request(userId), true, Duration.ofHours(1));

        String response = mockMvc.perform(get("/api/notifications")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].type").value("SENSOR_ANOMALY"))
                .andExpect(jsonPath("$[0].title").value("센서 확인 필요"))
                .andExpect(jsonPath("$[0].data.sensorKey").value("air"))
                .andExpect(jsonPath("$[0].readAt").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        long notificationId = objectMapper.readTree(response).get(0).get("id").asLong();
        mockMvc.perform(patch("/api/notifications/{id}/read", notificationId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/notifications")
                        .header("Authorization", bearer(token)))
                .andExpect(jsonPath("$[0].readAt").isNotEmpty());

        mockMvc.perform(get("/api/notifications/unread-count")
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
    }

    @Test
    void suppressesAContinuousConditionAndNotifiesAgainAfterRecovery() throws Exception {
        signupAndGetToken("dedupe-owner@example.com");
        long userId = userId("dedupe-owner@example.com");
        notificationService.register(userId,
                new RegisterPushTokenRequest("dedupe-token", PushPlatform.ANDROID));
        NotificationRequest request = request(userId);

        notificationService.handleCondition(request, true, Duration.ofHours(1));
        notificationService.handleCondition(request, true, Duration.ofHours(1));
        notificationService.handleCondition(request, false, Duration.ofHours(1));
        notificationService.handleCondition(request, true, Duration.ofHours(1));

        Integer events = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification_event WHERE user_id = ?",
                Integer.class,
                userId);
        org.assertj.core.api.Assertions.assertThat(events).isEqualTo(2);
        org.assertj.core.api.Assertions.assertThat(deliveryWorker.drainOnce()).isEqualTo(2);
        verify(pushSender, times(2)).send(eq("dedupe-token"), any(PushMessage.class));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/push-tokens")
                        .contentType(APPLICATION_JSON)
                        .content("{\"token\":\"x\",\"platform\":\"ANDROID\"}"))
                .andExpect(status().isUnauthorized());
    }

    private NotificationRequest request(long userId) {
        return new NotificationRequest(
                userId,
                NotificationType.SENSOR_ANOMALY,
                "센서 확인 필요",
                "온·습도 센서가 유효하지 않습니다.",
                null,
                null,
                null,
                "sensor-invalid:test:air",
                Map.of("sensorKey", "air"));
    }

    private String signupAndGetToken(String email) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", "알림테스터"))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return json.get("accessToken").asText();
    }

    private long userId(String email) {
        return jdbcTemplate.queryForObject(
                "SELECT id FROM app_user WHERE email = ?", Long.class, email);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
