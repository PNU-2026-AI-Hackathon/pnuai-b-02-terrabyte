package com.terrabyte.backend.soil;

import java.math.BigDecimal;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import com.terrabyte.backend.device.RegisterDeviceRequest;
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
class SoilRecommendationApiIntegrationTests {

    private static final String SERIAL_CODE = "483920";

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    @Autowired
    SoilRecommendationApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @BeforeEach
    void resetData() {
        jdbcTemplate.update("""
                UPDATE device
                SET user_id = NULL, crop_code = NULL, crop_selected_at = NULL,
                    status = 'OFFLINE', last_seen_at = NULL
                """);
        jdbcTemplate.update("DELETE FROM app_user");
    }

    @Test
    void returnsNormalSoilProfileForSelectedCrop() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        selectCrop(token, deviceId, "lettuce");

        mockMvc.perform(get("/api/devices/{deviceId}/soil-recommendation", deviceId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.deviceId").value(deviceId))
                .andExpect(jsonPath("$.cropCode").value("lettuce"))
                .andExpect(jsonPath("$.cropName").value("상추"))
                .andExpect(jsonPath("$.targetCondition").value("NORMAL"))
                .andExpect(jsonPath("$.mixRatioText").value("원예용 배양토 4 : 펄라이트 1"))
                .andExpect(jsonPath("$.materials[0].name").value("원예용 배양토"))
                .andExpect(jsonPath("$.assumptionNotice[0]").value("작물의 일반 생육 특성과 현재 환경정보에 기반한 가정값입니다."));
    }

    @Test
    void reportsTheAppOwnedCropCodeNotTheDatasetInternalKeyForWelshOnion() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);
        selectCrop(token, deviceId, "welsh_onion");

        mockMvc.perform(get("/api/devices/{deviceId}/soil-recommendation", deviceId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cropCode").value("welsh_onion"))
                .andExpect(jsonPath("$.cropName").value("대파"));
    }

    @Test
    void rejectsRequestWhenCropNotSelectedYet() throws Exception {
        String token = signupAndGetToken();
        long deviceId = registerAndGetDeviceId(token);

        mockMvc.perform(get("/api/devices/{deviceId}/soil-recommendation", deviceId)
                        .header("Authorization", bearer(token)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("CROP_NOT_SELECTED"));
    }

    private String signupAndGetToken() throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest("soil-owner@example.com", "password1", "배지소유자"))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asText();
    }

    private long registerAndGetDeviceId(String token) throws Exception {
        RegisterDeviceRequest request = new RegisterDeviceRequest(
                SERIAL_CODE,
                "부산 도심 옥상 A",
                "건물 옥상",
                new BigDecimal("42"));
        String response = mockMvc.perform(post("/api/devices")
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode json = objectMapper.readTree(response);
        return json.get("id").asLong();
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private void selectCrop(String token, long deviceId, String cropCode) throws Exception {
        mockMvc.perform(patch("/api/devices/{deviceId}/crop", deviceId)
                        .header("Authorization", bearer(token))
                        .contentType(APPLICATION_JSON)
                        .content("{\"cropCode\":\"" + cropCode + "\"}"))
                .andExpect(status().isOk());
    }
}
