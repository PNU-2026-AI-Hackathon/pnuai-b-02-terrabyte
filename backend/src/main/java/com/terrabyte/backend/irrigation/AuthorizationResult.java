package com.terrabyte.backend.irrigation;

import java.time.Instant;

/**
 * The outcome of {@link IrrigationGovernor#authorize}.
 *
 * <p>Sealed so a caller cannot forget one of the two cases: there is no
 * "granted but also denied", and no way to read a volume out of a refusal.
 */
public sealed interface AuthorizationResult {

    record Granted(IrrigationGrant grant, ClampReason clampReason)
            implements AuthorizationResult {

        /** Whether the granted volume is less than what was requested. */
        public boolean wasClamped() {
            return clampReason != null;
        }
    }

    /**
     * @param nextAvailableAt when this refusal will stop applying, or null when
     *        that cannot be known from the clock alone. Cooldown, in-flight and
     *        budget all expire at a computable time; a stale or broken sensor
     *        clears when a good reading arrives, which no timer predicts.
     */
    record Denied(DenyReason reason, String detail, Instant nextAvailableAt)
            implements AuthorizationResult {

        public static Denied at(DenyReason reason, String detail, Instant nextAvailableAt) {
            return new Denied(reason, detail, nextAvailableAt);
        }

        /** For refusals that clear on new data rather than on time. */
        public static Denied untilDataImproves(DenyReason reason, String detail) {
            return new Denied(reason, detail, null);
        }
    }
}
