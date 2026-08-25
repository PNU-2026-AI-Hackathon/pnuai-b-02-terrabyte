package com.terrabyte.backend.irrigation;

import java.time.Duration;
import java.time.Instant;

/**
 * One command sent to an actuator, and whatever the device reported back.
 *
 * <p>Rows of this table are the sole input to the daily-budget gate, so the
 * nullable report fields are deliberately nullable: {@code actualMl == null}
 * means "we never heard", which is a different fact from "it ran 0 mL" and is
 * treated far more conservatively.
 *
 * @param grantedMl        null for non-dosing actions (light on/off)
 * @param actualMl         reported volume; null until a report arrives
 */
public record DeviceCommand(
        String commandId,
        long potId,
        String correlationId,
        String actuator,
        String action,
        Integer grantedMl,
        int maxRuntimeMs,
        CommandState state,
        Instant issuedAt,
        Instant expiresAt,
        Instant ackedAt,
        Instant completedAt,
        Integer actualMl,
        Integer actualRuntimeMs,
        String stopCause,
        CommandOrigin origin) {

    public static final String ACTUATOR_PUMP = "pump";
    public static final String ACTUATOR_LIGHT = "light";

    public static final String ACTION_DOSE = "dose";
    public static final String ACTION_ON = "on";
    public static final String ACTION_OFF = "off";

    // The 15-second grace covers the edge's 1-second serial read timeout,
    // 2-second serial reconnect interval, and one 10-second MQTT publish/PUBACK
    // timeout, with 2 seconds left for worker scheduling and queueing.
    static final Duration TERMINAL_ACK_MARGIN = Duration.ofSeconds(15);

    /** A freshly authorised pump dose, before the device has said anything. */
    public static DeviceCommand issuedDose(IrrigationGrant grant) {
        return new DeviceCommand(
                grant.commandId(),
                grant.potId(),
                grant.correlationId(),
                ACTUATOR_PUMP,
                ACTION_DOSE,
                grant.grantedMl(),
                grant.maxRuntimeMs(),
                CommandState.ISSUED,
                grant.issuedAt(),
                grant.expiresAt(),
                null,
                null,
                null,
                null,
                null,
                grant.origin());
    }

    /** A manual grow-light latch command, before the device has answered. */
    public static DeviceCommand issuedLight(
            String commandId,
            long potId,
            String correlationId,
            boolean on,
            Instant issuedAt,
            Instant expiresAt) {
        return new DeviceCommand(
                commandId,
                potId,
                correlationId,
                ACTUATOR_LIGHT,
                on ? ACTION_ON : ACTION_OFF,
                null,
                // The schema requires a number, but a latch has no authorised
                // run to bound. Zero records that truth; occupancyEndsAt adds
                // the acknowledgement window separately so the in-flight gate
                // cannot disappear at the instant the row is inserted.
                0,
                CommandState.ISSUED,
                issuedAt,
                expiresAt,
                null,
                null,
                null,
                null,
                null,
                CommandOrigin.CLOUD);
    }

    /**
     * Whether this command still blocks a new one for the same pot at {@code now}.
     *
     * <p>There are two deliberately separate clocks. {@link #expiresAt()} is
     * the delivery-freshness deadline: after it, an edge must not start this
     * command. Pot occupancy instead ends after the run authorised by
     * {@link #maxRuntimeMs()}, plus a short grace for its terminal ack. A
     * terminal execution report releases the pot sooner.
     */
    public boolean isOutstandingAt(Instant now) {
        boolean hasNoTerminalExecutionReport = state.isOutstanding()
                || state == CommandState.EXPIRED;
        return hasNoTerminalExecutionReport && occupancyEndsAt().isAfter(now);
    }

    /** The actuator-aware instant at which this command stops occupying its pot. */
    public Instant occupancyEndsAt() {
        if (ACTUATOR_LIGHT.equals(actuator)) {
            // A light is a latch: accepted is its terminal acknowledgement and
            // there is no completed report after a run. The margin is therefore
            // the whole occupancy window, not an addition to an invented run.
            return issuedAt.plus(TERMINAL_ACK_MARGIN);
        }
        // Do not substitute expiresAt here. That is the short delivery TTL
        // which discards the queued-command burst on reconnect (F3 in
        // docs/design/edge_ai_hardening.md); lengthening or reusing it as a run
        // bound would merge delivery freshness with actuator occupancy again.
        return issuedAt.plusMillis(maxRuntimeMs).plus(TERMINAL_ACK_MARGIN);
    }
}
