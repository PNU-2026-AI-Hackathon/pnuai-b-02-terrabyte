package com.terrabyte.backend.irrigation;

import java.time.Instant;

/**
 * One row of the decision audit trail — written on every authorize() call,
 * whether it granted water or refused it.
 *
 * <p>Construct it through {@link #granted} or {@link #denied} rather than the
 * canonical constructor. The table has a CHECK that a row is exactly one of the
 * two, and a database error thrown after the pump has already been told to run
 * is the worst possible place to discover a mistake.
 *
 * @param id       null until the row has been inserted
 * @param grantedMl null on a refusal
 * @param denyReason null on a grant
 * @param clampReason set only when the granted volume is below what was asked
 * @param commandId  null on a refusal, and also null on a grant that has not
 *                   yet had its command persisted
 */
public record IrrigationDecision(
        Long id,
        long potId,
        String correlationId,
        CommandSource source,
        Instant sampleObservedAt,
        Double soilMoisturePct,
        String ruleVerdict,
        String aiModelVersion,
        Integer aiRequestedMl,
        Integer grantedMl,
        DenyReason denyReason,
        ClampReason clampReason,
        String commandId,
        Instant createdAt) {

    /** Rule engine verdict values, mirroring the {@code rule_verdict} column. */
    public static final String VERDICT_NEEDED = "NEEDED";

    public static final String VERDICT_NOT_NEEDED = "NOT_NEEDED";

    public IrrigationDecision {
        // Same invariant as the CHECK constraint, enforced one layer earlier so
        // the failure surfaces at the call site instead of at flush time.
        boolean isGrant = grantedMl != null;
        boolean isDenial = denyReason != null;
        if (isGrant == isDenial) {
            throw new IllegalArgumentException(
                    "A decision is exactly one of granted or denied: grantedMl=" + grantedMl
                            + ", denyReason=" + denyReason);
        }
    }

    /**
     * A decision that authorised water, with no AI involved in sizing the dose.
     *
     * <p>The AI columns stay NULL, which is the honest record: a rule-only dose
     * has no model to attribute it to.
     */
    public static IrrigationDecision granted(
            long potId,
            String correlationId,
            CommandSource source,
            Instant sampleObservedAt,
            Double soilMoisturePct,
            int grantedMl,
            ClampReason clampReason,
            String commandId,
            Instant createdAt) {
        return granted(potId, correlationId, source, sampleObservedAt, soilMoisturePct,
                null, null, grantedMl, clampReason, commandId, createdAt);
    }

    /** A decision that authorised water. */
    public static IrrigationDecision granted(
            long potId,
            String correlationId,
            CommandSource source,
            Instant sampleObservedAt,
            Double soilMoisturePct,
            String aiModelVersion,
            Integer aiRequestedMl,
            int grantedMl,
            ClampReason clampReason,
            String commandId,
            Instant createdAt) {
        // A grant only ever follows a NEEDED verdict; taking it as a parameter
        // would just be one more thing a caller could get wrong.
        return new IrrigationDecision(
                null,
                potId,
                correlationId,
                source,
                sampleObservedAt,
                soilMoisturePct,
                VERDICT_NEEDED,
                aiModelVersion,
                aiRequestedMl,
                grantedMl,
                null,
                clampReason,
                commandId,
                createdAt);
    }

    /**
     * A decision that refused water at one of the gates.
     *
     * <p>The verdict is recorded as NEEDED because a gate only ever sees a
     * request that something already asked for — the rule engine having decided
     * water was needed, or a person having pressed the button. Use the longer
     * overload to record an explicit NOT_NEEDED.
     */
    public static IrrigationDecision denied(
            long potId,
            String correlationId,
            CommandSource source,
            Instant sampleObservedAt,
            Double soilMoisturePct,
            DenyReason denyReason,
            Instant createdAt) {
        return denied(potId, correlationId, source, sampleObservedAt, soilMoisturePct,
                VERDICT_NEEDED, null, null, denyReason, createdAt);
    }

    /** A decision that refused water, for the reason of the gate that stopped it. */
    public static IrrigationDecision denied(
            long potId,
            String correlationId,
            CommandSource source,
            Instant sampleObservedAt,
            Double soilMoisturePct,
            String ruleVerdict,
            String aiModelVersion,
            Integer aiRequestedMl,
            DenyReason denyReason,
            Instant createdAt) {
        return new IrrigationDecision(
                null,
                potId,
                correlationId,
                source,
                sampleObservedAt,
                soilMoisturePct,
                ruleVerdict,
                aiModelVersion,
                aiRequestedMl,
                null,
                denyReason,
                null,
                null,
                createdAt);
    }

    public boolean wasGranted() {
        return grantedMl != null;
    }
}
