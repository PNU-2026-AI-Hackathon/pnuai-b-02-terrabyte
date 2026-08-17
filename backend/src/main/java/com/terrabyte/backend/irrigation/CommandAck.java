package com.terrabyte.backend.irrigation;

import java.time.Instant;

/**
 * One device report, in the shape the state machine consumes.
 *
 * <p>Transport-independent on purpose, exactly like {@code TelemetryEnvelope} is
 * for the uplink: the MQTT wire record lives in the {@code mqtt} package and
 * copies itself into this, so {@code irrigation} never depends on the transport.
 *
 * <p>{@code phase} stays a raw string rather than a {@link CommandAckPhase}
 * because resolving it is a policy decision — an unrecognised phase is dropped
 * with a warning — and that policy belongs to {@link CommandAckService}, next to
 * the transition table it guards.
 *
 * @param potId          as claimed by the device. Cross-checked against the
 *                       command row for diagnosis, never used to look anything
 *                       up: {@code command_id} is the join key
 * @param at             the device's own clock. Clamped before it is stored,
 *                       because a skewed edge clock writing {@code completed_at}
 *                       would move the cooldown gate
 * @param reason         free text from the wire. Diagnostic only; see
 *                       {@link CommandAckPhase} for why it cannot drive state
 */
public record CommandAck(
        String commandId,
        String phase,
        Instant at,
        String reason,
        Long potId,
        Integer actualMl,
        Integer actualRuntimeMs,
        String stopCause) {
}
