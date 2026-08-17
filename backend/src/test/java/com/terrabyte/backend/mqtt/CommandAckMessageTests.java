package com.terrabyte.backend.mqtt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.time.Instant;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.irrigation.CommandAck;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;

/**
 * The {@code up/ack} wire contract, against the application's own ObjectMapper.
 *
 * <p>Uses the real mapper rather than a hand-built one because the snake-case
 * mapping and the ISO-8601 instant handling both come from Spring's
 * configuration; a locally constructed mapper would test a different contract
 * from the one the broker callback uses.
 */
@JsonTest
class CommandAckMessageTests {

    @Autowired private ObjectMapper objectMapper;

    @Test
    void readsTheFrozenCompletedAckFromTheDesignDocument() throws Exception {
        String payload = """
                {
                  "schema_version": 2,
                  "message_type": "command_ack",
                  "command_id": "01J8F3QK2M7X9ZB4CDEFGH",
                  "correlation_id": "3f2b9c0e-7a41-4d88-9c12-5e6f7a8b9c0d",
                  "gateway_id": "orangepi-pro-01",
                  "node_id": "terrabyte-node-01",
                  "pot_id": 42,
                  "phase": "completed",
                  "at": "2026-08-04T10:00:18Z",
                  "reason": "OK",
                  "actual": {
                    "runtime_ms": 17950,
                    "estimated_ml": 118,
                    "stop_cause": "volume_reached"
                  }
                }
                """;

        CommandAckMessage message = objectMapper.readValue(payload, CommandAckMessage.class);

        assertThat(message.schemaVersion()).isEqualTo(2);
        assertThat(message.commandId()).isEqualTo("01J8F3QK2M7X9ZB4CDEFGH");
        assertThat(message.gatewayId()).isEqualTo("orangepi-pro-01");
        assertThat(message.potId()).isEqualTo(42L);
        assertThat(message.phase()).isEqualTo("completed");
        assertThat(message.at()).isEqualTo(Instant.parse("2026-08-04T10:00:18Z"));

        CommandAck domain = message.toDomain();
        assertThat(domain.actualMl()).isEqualTo(118);
        assertThat(domain.actualRuntimeMs()).isEqualTo(17950);
        assertThat(domain.stopCause()).isEqualTo("volume_reached");
    }

    @Test
    void readsARejectionThatCarriesNoExecutionReport() throws Exception {
        String payload = """
                {"schema_version": 2, "message_type": "command_ack",
                 "command_id": "01J8F3", "gateway_id": "orangepi-pro-01",
                 "phase": "rejected", "at": "2026-08-04T10:00:01Z",
                 "reason": "INTERLOCK_COOLDOWN"}
                """;

        CommandAck domain = objectMapper.readValue(payload, CommandAckMessage.class).toDomain();

        assertThat(domain.phase()).isEqualTo("rejected");
        assertThat(domain.reason()).isEqualTo("INTERLOCK_COOLDOWN");
        // A missing `actual` block must not throw; three of the four phases may
        // legitimately omit it.
        assertThat(domain.actualMl()).isNull();
        assertThat(domain.actualRuntimeMs()).isNull();
        assertThat(domain.stopCause()).isNull();
    }

    @Test
    void toleratesFieldsThisBackendHasNeverHeardOf() {
        // The specific regression: a gateway adds one diagnostic field, every
        // completion report becomes unparsable, and each dropped `completed`
        // leaves its command counting against the pot's budget at the granted
        // volume for twenty-four hours.
        String payload = """
                {"schema_version": 2, "command_id": "01J8F3", "phase": "completed",
                 "at": "2026-08-04T10:00:18Z", "firmware_build": "abc123",
                 "actual": {"runtime_ms": 100, "estimated_ml": 5,
                            "stop_cause": "volume_reached", "pump_duty_pct": 80}}
                """;

        assertThatCode(() -> objectMapper.readValue(payload, CommandAckMessage.class))
                .doesNotThrowAnyException();
    }

    @Test
    void doesNotThrowOnAnUnknownPhaseOrAMissingOne() throws Exception {
        // Deserialisation is not where an unexpected value may fail: it runs on a
        // Paho callback thread, where an escaping exception can kill the client's
        // delivery thread. Policy lives in the state machine instead.
        assertThat(objectMapper.readValue(
                        "{\"command_id\":\"01J8F3\",\"phase\":\"teleported\"}",
                        CommandAckMessage.class)
                .phase())
                .isEqualTo("teleported");
        assertThat(objectMapper.readValue("{\"command_id\":\"01J8F3\"}", CommandAckMessage.class)
                        .phase())
                .isNull();
    }
}
