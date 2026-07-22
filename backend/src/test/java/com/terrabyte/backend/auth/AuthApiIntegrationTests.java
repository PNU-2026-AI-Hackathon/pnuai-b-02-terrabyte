package com.terrabyte.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
class AuthApiIntegrationTests {

    private final MockMvc mockMvc;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbcTemplate;
    private final UserAccountRepository userRepository;

    @Autowired
    AuthApiIntegrationTests(
            MockMvc mockMvc,
            ObjectMapper objectMapper,
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate,
            UserAccountRepository userRepository) {
        this.mockMvc = mockMvc;
        this.objectMapper = objectMapper;
        this.jdbcTemplate = jdbcTemplate;
        this.userRepository = userRepository;
    }

    @BeforeEach
    void clearUsers() {
        jdbcTemplate.update("DELETE FROM app_user");
    }

    @Test
    void signsUpAndStoresOnlyThePasswordHash() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(signupBody("User@Example.com", "password1", "테라바이트")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(3600))
                .andExpect(jsonPath("$.user.email").value("user@example.com"))
                .andExpect(jsonPath("$.user.nickname").value("테라바이트"));

        UserAccount saved = userRepository.findByEmail("user@example.com").orElseThrow();
        assertThat(saved.passwordHash()).startsWith("{bcrypt}");
        assertThat(saved.passwordHash()).doesNotContain("password1");
    }

    @Test
    void rejectsDuplicateEmail() throws Exception {
        String request = signupBody("user@example.com", "password1", "첫사용자");
        mockMvc.perform(post("/api/auth/signup").contentType(APPLICATION_JSON).content(request))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/signup").contentType(APPLICATION_JSON).content(request))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
    }

    @Test
    void logsInWithValidCredentialsAndRejectsInvalidPassword() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(signupBody("user@example.com", "password1", "테라바이트")))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(APPLICATION_JSON)
                        .content(loginBody("USER@example.com", "password1")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(APPLICATION_JSON)
                        .content(loginBody("user@example.com", "wrong-password")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    @Test
    void returnsTheCurrentUserForAValidBearerToken() throws Exception {
        String signupResponse = mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(signupBody("user@example.com", "password1", "테라바이트")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        JsonNode responseJson = objectMapper.readTree(signupResponse);
        String token = responseJson.get("accessToken").asText();

        mockMvc.perform(get("/api/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("user@example.com"))
                .andExpect(jsonPath("$.hasDevice").value(false))
                .andExpect(jsonPath("$.hasCrop").value(false))
                .andExpect(jsonPath("$.device").doesNotExist());
    }

    @Test
    void rejectsUnauthenticatedRequestsAndInvalidSignupValues() throws Exception {
        mockMvc.perform(get("/api/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTHENTICATION_REQUIRED"));

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(APPLICATION_JSON)
                        .content(signupBody("not-an-email", "short", "a")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors").isArray());
    }

    private String signupBody(String email, String password, String nickname) throws Exception {
        return objectMapper.writeValueAsString(new SignupRequest(email, password, nickname));
    }

    private String loginBody(String email, String password) throws Exception {
        return objectMapper.writeValueAsString(new LoginRequest(email, password));
    }
}
