package com.terrabyte.backend.irrigation;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

/** What happened to one manual grow-light request. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LightOutcome(
        boolean issued,
        String commandId,
        boolean on,
        boolean dispatched,
        LightDenyReason denyReason,
        String detail,
        Instant nextAvailableAt) {

    public static LightOutcome issued(DeviceCommand command, boolean on, boolean dispatched) {
        return new LightOutcome(
                true, command.commandId(), on, dispatched, null, null, null);
    }

    public static LightOutcome denied(
            boolean on,
            LightDenyReason denyReason,
            String detail,
            Instant nextAvailableAt) {
        return new LightOutcome(
                false, null, on, false, denyReason, detail, nextAvailableAt);
    }
}
