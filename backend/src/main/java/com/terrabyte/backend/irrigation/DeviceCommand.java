package com.terrabyte.backend.irrigation;

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

    public static final String ACTION_DOSE = "dose";

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

    /** Whether this command still blocks a new one for the same pot at {@code now}. */
    public boolean isOutstandingAt(Instant now) {
        return state.isOutstanding() && expiresAt.isAfter(now);
    }
}
