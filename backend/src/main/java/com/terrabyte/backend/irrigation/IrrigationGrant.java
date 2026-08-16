package com.terrabyte.backend.irrigation;

import java.time.Instant;

/**
 * Permission to issue exactly one irrigation command.
 *
 * <p>This object exists so that issuing a command requires having gone through
 * {@link IrrigationGovernor}. Nothing else can construct a valid one, which is
 * what makes "every command passes the gates" a property of the type system
 * rather than a convention people remember.
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
        CommandOrigin origin) {}
