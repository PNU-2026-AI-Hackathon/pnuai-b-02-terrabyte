package com.terrabyte.backend.irrigation;

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

    record Denied(DenyReason reason, String detail) implements AuthorizationResult {}
}
