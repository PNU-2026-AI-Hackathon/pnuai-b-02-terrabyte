package com.terrabyte.backend.irrigation;

/**
 * One request for water, before any gate has looked at it.
 *
 * @param potId          the pot to water
 * @param requestedMl    what the caller wants. May be out of range; the
 *                       Governor refuses rather than silently clamping a
 *                       nonsense value into something plausible
 * @param source         who asked
 * @param correlationId  the telemetry event id the decision was based on, so a
 *                       decision can be traced back to the reading that caused it
 * @param cooldownOverride  manual requests only, and only skips the cooldown
 *                       gate. The per-dose ceiling and the daily budget are not
 *                       overridable by anyone
 * @param overrideReason required when {@code cooldownOverride} is set; it lands
 *                       in the audit trail
 * @param aiModelVersion which model proposed this, or null when none did.
 *                       Recorded on every decision so a bad dose can be traced
 *                       back to the artifact that suggested it
 * @param aiRequestedMl  what the model actually said, before any clamp or
 *                       fallback. Differs from {@code requestedMl} exactly when
 *                       its answer was overridden, which is the case worth
 *                       being able to find later
 */
public record IrrigationRequest(
        long potId,
        int requestedMl,
        CommandSource source,
        String correlationId,
        boolean cooldownOverride,
        String overrideReason,
        String aiModelVersion,
        Integer aiRequestedMl) {

    public static IrrigationRequest automatic(
            long potId, int requestedMl, CommandSource source, String correlationId) {
        return new IrrigationRequest(
                potId, requestedMl, source, correlationId, false, null, null, null);
    }

    /** An automatic request whose volume came from, or was overridden from, the model. */
    public static IrrigationRequest fromModel(
            long potId,
            int requestedMl,
            CommandSource source,
            String correlationId,
            String aiModelVersion,
            Integer aiRequestedMl) {
        return new IrrigationRequest(
                potId, requestedMl, source, correlationId, false, null,
                aiModelVersion, aiRequestedMl);
    }
}
