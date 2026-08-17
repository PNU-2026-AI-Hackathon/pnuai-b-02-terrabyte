package com.terrabyte.backend.irrigation;

import java.time.Instant;

/**
 * Permission to issue exactly one irrigation command.
 *
 * <p>This object exists so that issuing a command requires having gone through
 * {@link IrrigationGovernor}. Nothing else can construct a valid one, which is
 * what makes "every command passes the gates" a property of the type system
 * rather than a convention people remember.
 *
 * <p>The last three components are the audit trail rather than instructions:
 * they answer "what was asked for, and what did the envelope do to it". They are
 * on the grant because the downlink contract carries them in its {@code safety}
 * block, and the alternative — a transport reaching back into the request and
 * the authorisation result to reassemble them — is how a payload starts
 * disagreeing with the row it was recorded from.
 *
 * @param requestedMl    what the caller asked for, before clamping
 * @param clampReason    null when {@code grantedMl == requestedMl}
 * @param aiModelVersion what sized the dose, or null when the fallback table did
 */
public record IrrigationGrant(
        String commandId,
        long potId,
        int grantedMl,
        int maxRuntimeMs,
        Instant issuedAt,
        Instant expiresAt,
        String correlationId,
        CommandSource source,
        CommandOrigin origin,
        Integer requestedMl,
        ClampReason clampReason,
        String aiModelVersion) {

    /** Whether {@code expiresAt} has passed. The TTL is judged three times over
     * — here before publishing, on the gateway on receipt, and by the expiry
     * sweep — because each layer can be the only one still running. */
    public boolean hasExpiredAt(Instant now) {
        return !expiresAt.isAfter(now);
    }
}
