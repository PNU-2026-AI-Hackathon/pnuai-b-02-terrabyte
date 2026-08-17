package com.terrabyte.backend.mqtt;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.terrabyte.backend.irrigation.CommandAck;

/**
 * The {@code up/ack} payload. All four phases share one schema.
 *
 * <p>{@code ignoreUnknown} is load-bearing rather than lax. This record is the
 * backend's copy of a contract three components implement, and the failure it
 * prevents is specific: a gateway that starts sending one new diagnostic field
 * must not cause every completion report to be dropped as unparsable, because a
 * dropped {@code completed} leaves the command counting against the budget at
 * its granted volume for the next twenty-four hours.
 *
 * <p>Every field is boxed and {@code phase} is a plain string. Deserialisation
 * must not be where an unexpected value fails — it fails inside a Paho callback,
 * where the distinction between "drop this message" and "redeliver it" has
 * already been decided by {@link MqttUplinkRouter}. Validation happens after
 * parsing, in the state machine.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonIgnoreProperties(ignoreUnknown = true)
public record CommandAckMessage(
        Integer schemaVersion,
        String messageType,
        String commandId,
        String correlationId,
        String gatewayId,
        String nodeId,
        Long potId,
        String phase,
        Instant at,
        String reason,
        Actual actual) {

    public static final String SUFFIX = "ack";

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Actual(Integer runtimeMs, Integer estimatedMl, String stopCause) {
    }

    /** Copies into the transport-independent shape the state machine consumes. */
    public CommandAck toDomain() {
        return new CommandAck(
                commandId,
                phase,
                at,
                reason,
                potId,
                actual == null ? null : actual.estimatedMl(),
                actual == null ? null : actual.runtimeMs(),
                actual == null ? null : actual.stopCause());
    }
}
