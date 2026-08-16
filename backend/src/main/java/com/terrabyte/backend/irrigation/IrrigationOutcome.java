package com.terrabyte.backend.irrigation;

import java.time.Instant;

import com.terrabyte.backend.ai.AiOutcome;

/**
 * What happened to one irrigation request, in the shape the API returns.
 *
 * <p>{@code dispatched} is separate from {@code granted} on purpose. Until #50
 * gives the backend a downlink, a command can be authorised and recorded while
 * nothing delivers it, and a caller that cannot tell those apart would report a
 * watering that never happened.
 */
public record IrrigationOutcome(
        boolean granted,
        String commandId,
        Integer grantedMl,
        ClampReason clampReason,
        Instant expiresAt,
        boolean dispatched,
        DenyReason denyReason,
        String detail,
        AiOutcome aiOutcome,
        String aiModelVersion) {

    public static IrrigationOutcome granted(
            IrrigationGrant grant,
            ClampReason clampReason,
            boolean dispatched,
            AiOutcome aiOutcome,
            String aiModelVersion) {
        return new IrrigationOutcome(
                true,
                grant.commandId(),
                grant.grantedMl(),
                clampReason,
                grant.expiresAt(),
                dispatched,
                null,
                null,
                aiOutcome,
                aiModelVersion);
    }

    public static IrrigationOutcome denied(DenyReason reason, String detail) {
        return new IrrigationOutcome(
                false, null, null, null, null, false, reason, detail, null, null);
    }
}
