package com.terrabyte.backend.irrigation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.measurement.MeasurementStore;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

/** The ownership, addressability and lifecycle boundaries of the manual light API. */
@SpringBootTest
@ActiveProfiles("test")
class LightApiIntegrationTests {

    private static final long POT_ID = 1L;
    private static final long OWNER_ID = 9101L;
    private static final long STRANGER_ID = 9102L;

    @Autowired private WebApplicationContext context;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private DeviceCommandRepository commandRepository;

    @MockitoBean private MeasurementStore measurementStore;
    @MockitoBean private CommandDispatcher dispatcher;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .apply(springSecurity())
                .build();

        jdbcTemplate.update(
                "INSERT INTO app_user (id, email, password_hash, nickname, created_at)"
                        + " VALUES (?, ?, 'x', 'owner', CURRENT_TIMESTAMP)"
                        + " ON CONFLICT DO NOTHING",
                OWNER_ID, "owner-" + OWNER_ID + "@terrabyte.test");
        jdbcTemplate.update(
                "INSERT INTO app_user (id, email, password_hash, nickname, created_at)"
                        + " VALUES (?, ?, 'x', 'stranger', CURRENT_TIMESTAMP)"
                        + " ON CONFLICT DO NOTHING",
                STRANGER_ID, "stranger-" + STRANGER_ID + "@terrabyte.test");
        jdbcTemplate.update(
                "UPDATE device SET user_id = ?, hardware_id = 'orangepi-pro-01' "
                        + "WHERE id = (SELECT device_id FROM pot WHERE id = ?)",
                OWNER_ID, POT_ID);
        jdbcTemplate.update("UPDATE pot SET node_id = 'terrabyte-node-01' WHERE id = ?", POT_ID);
        jdbcTemplate.update("DELETE FROM device_command");

        reset(dispatcher);
        when(dispatcher.dispatchLight(any(), any())).thenReturn(true);
    }

    @Test
    void lightOnIssuesANonDosingCommand() throws Exception {
        MvcResult result = switchLight(OWNER_ID, true);

        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        LightOutcome outcome = objectMapper.readValue(
                result.getResponse().getContentAsString(), LightOutcome.class);
        assertThat(outcome.issued()).isTrue();
        assertThat(outcome.on()).isTrue();
        assertThat(outcome.dispatched()).isTrue();

        DeviceCommand command = commandRepository.findById(outcome.commandId()).orElseThrow();
        assertThat(command.actuator()).isEqualTo(DeviceCommand.ACTUATOR_LIGHT);
        assertThat(command.action()).isEqualTo(DeviceCommand.ACTION_ON);
        assertThat(command.grantedMl()).isNull();
        assertThat(command.maxRuntimeMs()).isZero();
    }

    @Test
    void aPotWithNoAddressableNodeIsRefusedWithoutDispatching() throws Exception {
        jdbcTemplate.update("UPDATE pot SET node_id = NULL WHERE id = ?", POT_ID);

        MvcResult result = switchLight(OWNER_ID, true);

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        LightOutcome outcome = objectMapper.readValue(
                result.getResponse().getContentAsString(), LightOutcome.class);
        assertThat(outcome.issued()).isFalse();
        assertThat(outcome.denyReason()).isEqualTo(LightDenyReason.NO_ADDRESSABLE_NODE);
        assertThat(commandCount()).isZero();
        verify(dispatcher, never()).dispatchLight(any(), any());
    }

    @Test
    void aSecondLightSwitchIsRefusedWhileTheFirstAwaitsItsAck() throws Exception {
        assertThat(switchLight(OWNER_ID, true).getResponse().getStatus()).isEqualTo(201);

        MvcResult second = switchLight(OWNER_ID, false);

        assertThat(second.getResponse().getStatus()).isEqualTo(409);
        LightOutcome outcome = objectMapper.readValue(
                second.getResponse().getContentAsString(), LightOutcome.class);
        assertThat(outcome.denyReason()).isEqualTo(LightDenyReason.IN_FLIGHT);
        assertThat(outcome.nextAvailableAt()).isNotNull();
        assertThat(commandCount()).isEqualTo(1);
    }

    @Test
    void aStrangerGetsNotFoundAndNoCommandIsIssued() throws Exception {
        MvcResult result = switchLight(STRANGER_ID, true);

        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(result.getResponse().getContentAsString()).contains("POT_NOT_FOUND");
        assertThat(commandCount()).isZero();
        verify(dispatcher, never()).dispatchLight(any(), any());
    }

    private MvcResult switchLight(long userId, boolean on) throws Exception {
        String body = objectMapper.writeValueAsString(new LightController.LightRequest(on));
        return mockMvc.perform(post("/api/pots/{potId}/light", POT_ID)
                        .with(jwt().jwt(builder -> builder.subject(String.valueOf(userId))))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
    }

    private int commandCount() {
        return jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device_command WHERE pot_id = ?", Integer.class, POT_ID);
    }
}
