package com.terrabyte.backend.space;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.auth.SignupRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class CultivationSpaceApiIntegrationTests {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;

    private String token;

    @Autowired
    CultivationSpaceApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
    }

    @BeforeEach
    void setUp() throws Exception {
        jdbcTemplate.update("DELETE FROM app_user");
        token = signupAndGetToken();
    }

    @Test
    void 공간_생성시_광원을_저장한다() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"옥상","spaceType":"건물 옥상",
                                 "areaSquareMeters":10.0,"lightSource":"NATURAL_LIGHT"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lightSource").value("NATURAL_LIGHT"));
    }

    @Test
    void 광원을_생략하면_null_로_저장된다() throws Exception {
        mockMvc.perform(post("/api/spaces")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"지하","spaceType":"지하 공간",
                                 "areaSquareMeters":10.0}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lightSource").doesNotExist());
    }

    @Test
    void 광원만_수정할_수_있다() throws Exception {
        long spaceId = createSpace(token, "옥상");

        mockMvc.perform(patch("/api/spaces/{id}", spaceId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lightSource\":\"WHITE_GROW_LED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lightSource").value("WHITE_GROW_LED"));
    }

    @Test
    void 남의_공간은_수정할_수_없다() throws Exception {
        String otherToken = signupAndGetToken("other-owner@example.com", "다른소유자");
        long otherUsersSpaceId = createSpace(otherToken, "온실");

        mockMvc.perform(patch("/api/spaces/{id}", otherUsersSpaceId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lightSource\":\"NATURAL_LIGHT\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void 광원을_null_로_되돌릴_수_있다() throws Exception {
        long spaceId = createSpace(token, "옥상");
        mockMvc.perform(patch("/api/spaces/{id}", spaceId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lightSource\":\"WHITE_GROW_LED\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/spaces/{id}", spaceId)
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"lightSource\":null}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lightSource").doesNotExist());
    }

    private long createSpace(String authToken, String name) throws Exception {
        String response = mockMvc.perform(post("/api/spaces")
                        .header("Authorization", "Bearer " + authToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","spaceType":"건물 옥상","areaSquareMeters":10.0}
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("id").asLong();
    }

    private String signupAndGetToken() throws Exception {
        return signupAndGetToken("space-owner@example.com", "공간소유자");
    }

    private String signupAndGetToken(String email, String name) throws Exception {
        String response = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                new SignupRequest(email, "password1", name))))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(response).get("accessToken").asText();
    }
}
