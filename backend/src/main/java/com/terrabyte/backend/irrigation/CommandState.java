package com.terrabyte.backend.irrigation;

/**
 * Lifecycle of a single {@link DeviceCommand}.
 *
 * <p>The distinction that matters for safety is not "did it succeed" but "could
 * the pump have run". Only {@link #REJECTED} answers no; every other state,
 * including the ones that look like failures, has to be assumed to have moved
 * water. See {@code DeviceCommandRepository#consumedMlSince}.
 */
public enum CommandState {

    /** Written to the database and published; the device has not answered yet. */
    ISSUED,

    /** The device acknowledged it and is running, or is about to. */
    ACCEPTED,

    /** Terminal. The device reported back, and {@code actual_ml} is authoritative. */
    COMPLETED,

    /**
     * Terminal. The device refused before touching the pump — unknown actuator,
     * tank empty at start, firmware disagreed with the parameters. The only
     * state that provably moved no water.
     */
    REJECTED,

    /** Terminal. Stopped part-way, by a watchdog or an operator. Water may have moved. */
    ABORTED,

    /**
     * Terminal. {@code expires_at} passed with no terminal report. The device
     * may have executed it and lost connectivity before reporting, so this
     * still counts against the budget.
     */
    EXPIRED;

    /** Whether no further state change is expected for this command. */
    public boolean isTerminal() {
        return this == COMPLETED || this == REJECTED || this == ABORTED || this == EXPIRED;
    }

    /** Whether this command still occupies the pot and blocks a new one (gate 5). */
    public boolean isOutstanding() {
        return this == ISSUED || this == ACCEPTED;
    }
}
