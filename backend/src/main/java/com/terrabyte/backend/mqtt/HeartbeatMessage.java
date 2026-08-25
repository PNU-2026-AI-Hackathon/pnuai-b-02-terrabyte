package com.terrabyte.backend.mqtt;

import java.time.Instant;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;

/**
 * The {@code dn/heartbeat} payload: proof that the application, not merely the
 * broker, is alive.
 *
 * <p>The gateway decides whether the cloud is reachable so it can fall back to
 * local irrigation judgement when it is not. Until this existed it made that
 * call from its MQTT connection state, which answers a different question.
 * {@code docs/design/edge_ai_hardening.md} V6/F7 spells out the gap: the broker
 * and the application are separate processes, so an application that has died
 * of an OOM leaves a perfectly healthy connection behind. The gateway keeps
 * publishing telemetry into a topic nobody reads, never switches to autonomous
 * mode, and the plant dries out while every connection indicator is green.
 *
 * <p>Carries no instruction on purpose. Anything actionable would need a TTL, a
 * command id and an acknowledgement, and would then be a command rather than a
 * sign of life.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record HeartbeatMessage(
        int schemaVersion, String messageType, String gatewayId, Instant sentAt) {

    public static final int SCHEMA_VERSION = 2;
    public static final String MESSAGE_TYPE = "heartbeat";
    public static final String SUFFIX = "heartbeat";

    public static HeartbeatMessage now(String gatewayId, Instant sentAt) {
        return new HeartbeatMessage(SCHEMA_VERSION, MESSAGE_TYPE, gatewayId, sentAt);
    }
}
