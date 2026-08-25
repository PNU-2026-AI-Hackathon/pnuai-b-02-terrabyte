package com.terrabyte.backend.mqtt;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.terrabyte.backend.irrigation.CommandSource;
import com.terrabyte.backend.irrigation.DeviceCommand;
import com.terrabyte.backend.irrigation.IrrigationGrant;

/**
 * The {@code dn/command} payload, frozen at {@code docs/design/edge_ai_hardening.md}.
 *
 * <p>Snake-cased through {@code @JsonNaming} rather than field-by-field, the same
 * way {@code TelemetryEnvelope} does it — the record component names are the
 * contract, character for character.
 *
 * <p>{@code schema_version} 2 is the <em>MQTT</em> contract version. It is a
 * different namespace from the serial link's {@code protocol_version}, which the
 * gateway translates to; the two numbers are unrelated and neither implies the
 * other.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CommandMessage(
        int schemaVersion,
        String messageType,
        String commandId,
        String correlationId,
        String gatewayId,
        String nodeId,
        long potId,
        String actuator,
        String action,
        Params params,
        Instant issuedAt,
        Instant expiresAt,
        String origin,
        String issuedBy,
        Safety safety) {

    public static final int SCHEMA_VERSION = 2;
    public static final String MESSAGE_TYPE = "command";
    public static final String SUFFIX = "command";

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Params(Integer volumeMl, Integer maxRuntimeMs, Boolean on) {
    }

    /**
     * What the safety envelope did to this request, carried so the gateway can
     * say why a dose is the size it is without asking.
     *
     * <p>Advisory in both directions: the gateway must not widen anything on the
     * strength of it, and the firmware interlocks do not consult it at all.
     */
    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Safety(
            Integer requestedMl,
            int grantedMl,
            String clampReason,
            String aiModelVersion) {
    }

    /** Builds the payload for one grant, addressed to one resolved node. */
    public static CommandMessage from(IrrigationGrant grant, String gatewayId, String nodeId) {
        return new CommandMessage(
                SCHEMA_VERSION,
                MESSAGE_TYPE,
                grant.commandId(),
                grant.correlationId(),
                gatewayId,
                nodeId,
                grant.potId(),
                "pump",
                "dose",
                new Params(grant.grantedMl(), grant.maxRuntimeMs(), null),
                grant.issuedAt(),
                grant.expiresAt(),
                grant.origin().name(),
                grant.source().name(),
                new Safety(
                        grant.requestedMl(),
                        grant.grantedMl(),
                        grant.clampReason() == null ? null : grant.clampReason().name(),
                        grant.aiModelVersion()));
    }

    /** Builds a manual light-latch payload, addressed to one resolved node. */
    public static CommandMessage fromLight(
            DeviceCommand command, String gatewayId, String nodeId) {
        boolean on = DeviceCommand.ACTION_ON.equals(command.action());
        return new CommandMessage(
                SCHEMA_VERSION,
                MESSAGE_TYPE,
                command.commandId(),
                command.correlationId(),
                gatewayId,
                nodeId,
                command.potId(),
                DeviceCommand.ACTUATOR_LIGHT,
                on ? DeviceCommand.ACTION_ON : DeviceCommand.ACTION_OFF,
                new Params(null, null, on),
                command.issuedAt(),
                command.expiresAt(),
                command.origin().name(),
                CommandSource.MANUAL.name(),
                null);
    }
}
