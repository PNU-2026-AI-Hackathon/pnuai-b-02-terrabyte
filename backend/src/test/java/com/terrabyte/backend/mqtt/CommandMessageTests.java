package com.terrabyte.backend.mqtt;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.terrabyte.backend.irrigation.ClampReason;
import com.terrabyte.backend.irrigation.CommandOrigin;
import com.terrabyte.backend.irrigation.CommandSource;
import com.terrabyte.backend.irrigation.IrrigationGrant;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.json.JsonTest;

/**
 * The {@code dn/command} wire contract, field name by field name.
 *
 * <p>Worth asserting at this level of detail because the gateway parses it with
 * an independent implementation: a component name silently renamed here would
 * compile, publish, and be dropped at the other end.
 */
@JsonTest
class CommandMessageTests {

    @Autowired private ObjectMapper objectMapper;

    private static final IrrigationGrant GRANT = new IrrigationGrant(
            "01J8F3QK2M7X9ZB4CDEFGH",
            42L,
            120,
            18_000,
            Instant.parse("2026-08-04T10:00:00Z"),
            Instant.parse("2026-08-04T10:02:00Z"),
            "3f2b9c0e-7a41-4d88-9c12-5e6f7a8b9c0d",
            CommandSource.RULE_AI,
            CommandOrigin.CLOUD,
            300,
            ClampReason.DAILY_BUDGET,
            "irrigation_rf_v3");

    @Test
    void serialisesEveryFieldOfTheFrozenSchema() throws Exception {
        JsonNode json = objectMapper.valueToTree(
                CommandMessage.from(GRANT, "orangepi-pro-01", "terrabyte-node-01"));

        assertThat(json.get("schema_version").asInt()).isEqualTo(2);
        assertThat(json.get("message_type").asText()).isEqualTo("command");
        assertThat(json.get("command_id").asText()).isEqualTo("01J8F3QK2M7X9ZB4CDEFGH");
        assertThat(json.get("correlation_id").asText())
                .isEqualTo("3f2b9c0e-7a41-4d88-9c12-5e6f7a8b9c0d");
        assertThat(json.get("gateway_id").asText()).isEqualTo("orangepi-pro-01");
        assertThat(json.get("node_id").asText()).isEqualTo("terrabyte-node-01");
        assertThat(json.get("pot_id").asLong()).isEqualTo(42L);
        assertThat(json.get("actuator").asText()).isEqualTo("pump");
        assertThat(json.get("action").asText()).isEqualTo("dose");
        assertThat(json.get("params").get("volume_ml").asInt()).isEqualTo(120);
        assertThat(json.get("params").get("max_runtime_ms").asInt()).isEqualTo(18_000);
        assertThat(json.get("origin").asText()).isEqualTo("CLOUD");
        assertThat(json.get("issued_by").asText()).isEqualTo("RULE_AI");
    }

    @Test
    void writesTimestampsAsIso8601InstantsNotEpochNumbers() throws Exception {
        JsonNode json = objectMapper.valueToTree(
                CommandMessage.from(GRANT, "orangepi-pro-01", "terrabyte-node-01"));

        // The gateway compares expires_at against a timezone-aware wall clock.
        // An epoch number here, or a timestamp without its Z, is the mismatch
        // that makes TTL judgement either never fire or always fire.
        assertThat(json.get("issued_at").asText()).isEqualTo("2026-08-04T10:00:00Z");
        assertThat(json.get("expires_at").asText()).isEqualTo("2026-08-04T10:02:00Z");
    }

    @Test
    void carriesWhatTheEnvelopeDidToTheRequest() throws Exception {
        JsonNode safety = objectMapper
                .valueToTree(CommandMessage.from(GRANT, "orangepi-pro-01", "terrabyte-node-01"))
                .get("safety");

        assertThat(safety.get("requested_ml").asInt()).isEqualTo(300);
        assertThat(safety.get("granted_ml").asInt()).isEqualTo(120);
        assertThat(safety.get("clamp_reason").asText()).isEqualTo("DAILY_BUDGET");
        assertThat(safety.get("ai_model_version").asText()).isEqualTo("irrigation_rf_v3");
    }

    @Test
    void omitsTheAuditFieldsThatHaveNoValueRatherThanInventingThem() throws Exception {
        IrrigationGrant unclamped = new IrrigationGrant(
                "01J8F4", 42L, 40, 5_000,
                Instant.parse("2026-08-04T10:00:00Z"), Instant.parse("2026-08-04T10:02:00Z"),
                "manual-1", CommandSource.MANUAL, CommandOrigin.CLOUD,
                40, null, null);

        JsonNode safety = objectMapper
                .valueToTree(CommandMessage.from(unclamped, "orangepi-pro-01", "node-1"))
                .get("safety");

        assertThat(safety.get("granted_ml").asInt()).isEqualTo(40);
        assertThat(safety.has("clamp_reason")).isFalse();
        assertThat(safety.has("ai_model_version")).isFalse();
    }
}
