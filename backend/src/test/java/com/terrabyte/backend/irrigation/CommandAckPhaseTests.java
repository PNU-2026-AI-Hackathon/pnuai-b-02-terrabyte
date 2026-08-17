package com.terrabyte.backend.irrigation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Optional;

import org.junit.jupiter.api.Test;

/**
 * The transition table itself, asserted rather than only documented.
 *
 * <p>These read as tautologies against {@link CommandAckPhase} and that is the
 * point: the allowed-from sets go straight into SQL {@code WHERE} clauses, so a
 * one-word edit there silently changes what a duplicate ack is allowed to do.
 */
class CommandAckPhaseTests {

    @Test
    void acceptedOnlyLeavesIssued() {
        assertThat(CommandAckPhase.ACCEPTED.target()).isEqualTo(CommandState.ACCEPTED);
        assertThat(CommandAckPhase.ACCEPTED.allowedFrom())
                .containsExactly(CommandState.ISSUED);
    }

    @Test
    void rejectedMayDemoteAnExpiredCommand() {
        // The only ack that removes volume from the budget, so it is worth
        // letting it overwrite a terminal state.
        assertThat(CommandAckPhase.REJECTED.allowedFrom())
                .containsExactlyInAnyOrder(
                        CommandState.ISSUED, CommandState.ACCEPTED, CommandState.EXPIRED);
    }

    @Test
    void completedMayCorrectAnExpiredCommand() {
        assertThat(CommandAckPhase.COMPLETED.allowedFrom())
                .containsExactlyInAnyOrder(
                        CommandState.ISSUED, CommandState.ACCEPTED, CommandState.EXPIRED);
        assertThat(CommandAckPhase.COMPLETED.carriesExecutionReport()).isTrue();
    }

    @Test
    void abortedDoesNotOverwriteAnExpiredCommand() {
        // Both states already mean "water may have moved" and both count at
        // granted_ml, so the transition would add nothing.
        assertThat(CommandAckPhase.ABORTED.allowedFrom())
                .containsExactlyInAnyOrder(CommandState.ISSUED, CommandState.ACCEPTED);
    }

    @Test
    void noPhaseCanTransitionOutOfAnAlreadyReportedTerminalState() {
        for (CommandAckPhase phase : CommandAckPhase.values()) {
            assertThat(phase.allowedFrom())
                    .as("phase %s", phase.wireValue())
                    .doesNotContain(
                            CommandState.COMPLETED, CommandState.REJECTED, CommandState.ABORTED);
        }
    }

    @Test
    void resolvesTheFourWireValuesAndNothingElse() {
        assertThat(CommandAckPhase.from("completed")).contains(CommandAckPhase.COMPLETED);
        assertThat(CommandAckPhase.from("ACCEPTED")).contains(CommandAckPhase.ACCEPTED);
        assertThat(CommandAckPhase.from(" aborted ")).contains(CommandAckPhase.ABORTED);

        // An unknown phase is an empty answer, never an exception: it arrives
        // from outside the backend, on a Paho callback thread.
        assertThat(CommandAckPhase.from("expired")).isEqualTo(Optional.empty());
        assertThat(CommandAckPhase.from("")).isEqualTo(Optional.empty());
        assertThat(CommandAckPhase.from(null)).isEqualTo(Optional.empty());
    }
}
