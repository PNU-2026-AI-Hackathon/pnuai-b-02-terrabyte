package com.terrabyte.backend.irrigation;

import java.time.Instant;

/**
 * What happened to one irrigation request, in the shape the API returns.
 *
 * <p>{@code dispatched} is separate from {@code granted} on purpose, and stays
 * that way now the downlink exists. A command is authorised and recorded before
 * anything tries to send it, and the send can still fail — the transport is
 * disabled, the broker is unreachable, the TTL ran out, the pot has no bound node.
 * A caller that cannot tell the two apart would report a watering that never
 * happened.
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
        /** When the refusal lifts, or null when it clears on new data instead. */
        Instant nextAvailableAt,
        VolumeSource volumeSource,
        /** Kept under its old name: it still answers "what proposed this volume". */
        String aiModelVersion) {

    public static IrrigationOutcome granted(
            IrrigationGrant grant,
            ClampReason clampReason,
            boolean dispatched,
            VolumeSource volumeSource,
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
                null,
                volumeSource,
                aiModelVersion);
    }

    public static IrrigationOutcome denied(
            DenyReason reason, String detail, Instant nextAvailableAt) {
        return new IrrigationOutcome(
                false, null, null, null, null, false,
                reason, detail, nextAvailableAt, null, null);
    }
}
