package com.terrabyte.backend.device;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
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
    private static final String DEV_TEST_SERIAL_CODE = "123456";

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
                SET user_id = NULL, space_id = NULL, claimed_at = NULL,
                    status = 'OFFLINE', last_seen_at = NULL
                """);
        jdbcTemplate.update("UPDATE pot SET node_id=NULL,crop_code=NULL,crop_selected_at=NULL,status='OFFLINE',last_seen_at=NULL");
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
    void allowsASecondDeviceForTheSameUser() throws Exception {
        jdbcTemplate.update(
                "INSERT INTO device (serial_code, claim_code, hardware_id) VALUES (?, ?, ?)",
                "111111", "111111", "orangepi-pro-03");
        String token = signupAndGetToken("owner@example.com", "기기소유자");
        register(token, DEMO_SERIAL_CODE);

        mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody("111111")))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/api/devices").header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void allowsMultipleAccountsToRegisterWithTheDevTestCode() throws Exception {
        String firstToken = signupAndGetToken("dev-tester-1@example.com", "테스터1");
        String secondToken = signupAndGetToken("dev-tester-2@example.com", "테스터2");

        String firstResponse = mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(firstToken))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(DEV_TEST_SERIAL_CODE)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("OFFLINE"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        String secondResponse = mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(secondToken))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(DEV_TEST_SERIAL_CODE)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("OFFLINE"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        long firstDeviceId = objectMapper.readTree(firstResponse).get("id").asLong();
        long secondDeviceId = objectMapper.readTree(secondResponse).get("id").asLong();
        assertThat(firstDeviceId).isNotEqualTo(secondDeviceId);

        Integer deviceCountWithDevTestSerialCode = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device WHERE serial_code = ?",
                Integer.class,
                DEV_TEST_SERIAL_CODE);
        assertThat(deviceCountWithDevTestSerialCode).isZero();
    }

    @Test
    // 계정당 1기기 제약이 해제(D6)되어 같은 계정이 개발 테스트 코드를 여러 번 써도 된다.
    // 매번 별개의 기기와 화분이 생겨야 하며, 앞서 만든 기기를 재사용하면 안 된다.
    void createsASeparateDevTestDeviceEachTimeForTheSameUser() throws Exception {
        String token = signupAndGetToken("dev-tester@example.com", "테스터");

        JsonNode first = registerDevTestDevice(token);
        JsonNode second = registerDevTestDevice(token);

        assertThat(second.get("id").asLong()).isNotEqualTo(first.get("id").asLong());
        assertThat(first.get("pots")).hasSize(1);
        assertThat(second.get("pots")).hasSize(1);
    }

    private JsonNode registerDevTestDevice(String token) throws Exception {
        String body = mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(deviceBody(DEV_TEST_SERIAL_CODE)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body);
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
