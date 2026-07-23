package com.terrabyte.backend.device;

import java.math.BigDecimal;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class DeviceApiIntegrationTests {

    private static final String DEMO_SERIAL_CODE = "483920";

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    DeviceApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @BeforeEach
    void resetData() {
        jdbcTemplate.update("DELETE FROM device WHERE serial_code <> ?", DEMO_SERIAL_CODE);
        jdbcTemplate.update(
                """
                UPDATE device
                SET user_id = NULL, crop_code = NULL, crop_selected_at = NULL,
                    status = 'OFFLINE', last_seen_at = NULL
                """);
        jdbcTemplate.update("DELETE FROM app_user");
    }

    @Test
    void registersAProvisionedDeviceAndReflectsItInMe() throws Exception {
        String token = signupAndGetToken("owner@example.com", "기기소유자");

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(DEMO_SERIAL_CODE)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.serialCode").value(DEMO_SERIAL_CODE))
                .andExpect(jsonPath("$.status").value("OFFLINE"))
                .andExpect(jsonPath("$.lastSeenAt").doesNotExist())
                .andExpect(jsonPath("$.space.name").value("부산 도심 옥상 A"))
                .andExpect(jsonPath("$.space.spaceType").value("건물 옥상"))
                .andExpect(jsonPath("$.space.areaSquareMeters").value(42));

        mockMvc.perform(get("/api/me").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasDevice").value(true))
                .andExpect(jsonPath("$.hasCrop").value(false))
                .andExpect(jsonPath("$.device.serialCode").value(DEMO_SERIAL_CODE))
                .andExpect(jsonPath("$.device.space.name").value("부산 도심 옥상 A"));
    }

    @Test
    void rejectsUnknownAndMalformedSerialCodes() throws Exception {
        String token = signupAndGetToken("owner@example.com", "기기소유자");

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody("999999")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("DEVICE_NOT_FOUND"));

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody("12A")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    void rejectsADeviceThatBelongsToAnotherUser() throws Exception {
        String ownerToken = signupAndGetToken("owner@example.com", "첫소유자");
        register(ownerToken, DEMO_SERIAL_CODE);
        String otherToken = signupAndGetToken("other@example.com", "다른사용자");

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(otherToken))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(DEMO_SERIAL_CODE)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEVICE_ALREADY_REGISTERED"));
    }

    @Test
    void rejectsASecondDeviceForTheSameUser() throws Exception {
        jdbcTemplate.update("INSERT INTO device (serial_code) VALUES (?)", "111111");
        String token = signupAndGetToken("owner@example.com", "기기소유자");
        register(token, DEMO_SERIAL_CODE);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody("111111")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_ALREADY_HAS_DEVICE"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/devices")
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(DEMO_SERIAL_CODE)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));
    }

    @Test
    void validatesCultivationSpaceValues() throws Exception {
        String token = signupAndGetToken("owner@example.com", "기기소유자");
        RegisterDeviceRequest invalidRequest = new RegisterDeviceRequest(
                DEMO_SERIAL_CODE,
                " ",
                "건물 옥상",
                BigDecimal.ZERO);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidRequest)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    private String signupAndGetToken(String email, String nickname) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", nickname))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return json.get("accessToken").asText();
    }

    private void register(String token, String serialCode) throws Exception {
        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(serialCode)))
                .andExpect(status().isCreated());
    }

    private String deviceBody(String serialCode) throws Exception {
        return objectMapper.writeValueAsString(new RegisterDeviceRequest(
                serialCode,
                "부산 도심 옥상 A",
                "건물 옥상",
                new BigDecimal("42")));
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }
}
