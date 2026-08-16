package com.terrabyte.backend.irrigation;

/** Why the granted volume is smaller than what was asked for. */
public enum ClampReason {
    /** Trimmed to what is left of the 24-hour budget. */
    DAILY_BUDGET,
    /** Trimmed to the per-dose ceiling. */
    MAX_DOSE,
    /** Raised to the per-dose floor; below it the pump barely wets anything. */
    MIN_DOSE
}
