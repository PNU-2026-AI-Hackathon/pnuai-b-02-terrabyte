package com.terrabyte.backend.irrigation;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * The four device report phases, and the state transition each one authorises.
 *
 * <h2>The transition table</h2>
 *
 * <pre>
 * phase       target      allowed-from                    columns written
 * ---------------------------------------------------------------------------
 * accepted    ACCEPTED    ISSUED                          acked_at
 * rejected    REJECTED    ISSUED, ACCEPTED, EXPIRED       acked_at, stop_cause
 * completed   COMPLETED   ISSUED, ACCEPTED, EXPIRED       acked_at, completed_at,
 *                                                         actual_ml,
 *                                                         actual_runtime_ms,
 *                                                         stop_cause
 * aborted     ABORTED     ISSUED, ACCEPTED                acked_at, completed_at,
 *                                                         actual_ml,
 *                                                         actual_runtime_ms,
 *                                                         stop_cause
 * (TTL sweep) EXPIRED     ISSUED, ACCEPTED                —
 * </pre>
 *
 * <p><strong>The allowed-from set is the whole design.</strong> It goes into the
 * {@code WHERE} clause of a single guarded {@code UPDATE}, so idempotency is not
 * something the caller has to arrange — a redelivered ack (QoS 1 guarantees
 * duplicates, twice over: broker to backend, and gateway to broker) updates zero
 * rows and is reported as already handled. A blind {@code UPDATE ... SET state}
 * would instead let a duplicate {@code completed} re-apply its volume, or an
 * out-of-order {@code accepted} resurrect a command that already finished.
 *
 * <h2>Why {@code phase} decides the state and {@code reason} never does</h2>
 *
 * <p>The word "cooldown" means three different things in this system. The
 * firmware sends lower-case short values ({@code cooldown}, {@code duplicate},
 * {@code volume_reached}, {@code watchdog}, {@code max_runtime}); the MQTT
 * contract defines eight UPPER_SNAKE values of its own; and Java already has
 * {@link DenyReason#COOLDOWN}, which is a <em>server</em> gate refusing to
 * publish at all — the opposite side of the wire from a firmware refusal after
 * publication. Three vocabularies that overlap by accident.
 *
 * <p>So {@code reason} is never an input to this table. It is stored verbatim in
 * {@code stop_cause} for diagnosis, and an unrecognised value must not stop an
 * ack from being applied. Only {@code phase} — four values — moves state.
 *
 * <h2>EXPIRED is not quite terminal</h2>
 *
 * <p>{@link CommandState#EXPIRED} means "we stopped waiting", not "nothing
 * happened", so it counts against the budget at its granted volume. Two late
 * acks are still allowed to overwrite it, both because they strictly add
 * information:
 *
 * <ul>
 *   <li>a late {@code rejected} demotes EXPIRED to REJECTED — the device is
 *       telling us the pump never ran, which is the only fact that removes
 *       volume from the budget;</li>
 *   <li>a late {@code completed} corrects the assumed {@code granted_ml} to the
 *       reported {@code actual_ml}, with no double counting because the row is
 *       updated rather than added to.</li>
 * </ul>
 *
 * <p>A late {@code aborted} deliberately does <em>not</em> overwrite EXPIRED.
 * Both states already say "water may have moved" and both count at
 * {@code granted_ml}, so the transition would buy nothing while widening the
 * window in which a terminal row can still change.
 */
public enum CommandAckPhase {

    ACCEPTED("accepted", CommandState.ACCEPTED, EnumSet.of(CommandState.ISSUED)),

    REJECTED(
            "rejected",
            CommandState.REJECTED,
            EnumSet.of(CommandState.ISSUED, CommandState.ACCEPTED, CommandState.EXPIRED)),

    COMPLETED(
            "completed",
            CommandState.COMPLETED,
            EnumSet.of(CommandState.ISSUED, CommandState.ACCEPTED, CommandState.EXPIRED)),

    ABORTED(
            "aborted",
            CommandState.ABORTED,
            EnumSet.of(CommandState.ISSUED, CommandState.ACCEPTED));

    private final String wireValue;
    private final CommandState target;
    private final Set<CommandState> allowedFrom;

    CommandAckPhase(String wireValue, CommandState target, Set<CommandState> allowedFrom) {
        this.wireValue = wireValue;
        this.target = target;
        this.allowedFrom = Collections.unmodifiableSet(allowedFrom);
    }

    /** The lower-case value that travels in the {@code phase} field. */
    public String wireValue() {
        return wireValue;
    }

    /** The state a successful transition lands in. */
    public CommandState target() {
        return target;
    }

    /** The states this phase may transition out of, and nothing else. */
    public Set<CommandState> allowedFrom() {
        return allowedFrom;
    }

    /** Whether this phase reports how much actually ran. */
    public boolean carriesExecutionReport() {
        return this == COMPLETED || this == ABORTED;
    }

    /**
     * Resolve a wire value, tolerantly on case but not on spelling.
     *
     * <p>Empty rather than an exception, because an unknown phase arrives from
     * outside the backend and must be logged and dropped, not thrown past a
     * Paho callback thread.
     */
    public static Optional<CommandAckPhase> from(String wireValue) {
        if (wireValue == null || wireValue.isBlank()) {
            return Optional.empty();
        }
        String normalised = wireValue.trim().toLowerCase(Locale.ROOT);
        for (CommandAckPhase phase : values()) {
            if (phase.wireValue.equals(normalised)) {
                return Optional.of(phase);
            }
        }
        return Optional.empty();
    }
}
