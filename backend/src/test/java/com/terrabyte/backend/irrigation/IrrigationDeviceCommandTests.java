package com.terrabyte.backend.irrigation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.Test;

class IrrigationDeviceCommandTests {

    private static final Instant ISSUED_AT = Instant.parse("2026-08-25T10:00:00Z");
    private static final int MAX_RUNTIME_MS = 204_082;

    @Test
    void stillBlocksAfterDeliveryExpiryWhileThePumpCouldBeRunning() {
        DeviceCommand command = command(CommandState.ISSUED);

        assertThat(command.expiresAt()).isEqualTo(ISSUED_AT.plus(Duration.ofMinutes(2)));
        assertThat(command.isOutstandingAt(command.expiresAt())).isTrue();
        assertThat(command.isOutstandingAt(ISSUED_AT.plusMillis(MAX_RUNTIME_MS))).isTrue();
    }

    @Test
    void stopsBlockingAtTheRuntimeAndTerminalAckBoundary() {
        DeviceCommand command = command(CommandState.ACCEPTED);
        Instant occupancyEnd = ISSUED_AT.plusMillis(MAX_RUNTIME_MS)
                .plus(DeviceCommand.TERMINAL_ACK_MARGIN);

        assertThat(command.isOutstandingAt(occupancyEnd.minusNanos(1))).isTrue();
        assertThat(command.isOutstandingAt(occupancyEnd)).isFalse();
        assertThat(command.isOutstandingAt(occupancyEnd.plusSeconds(1))).isFalse();
    }

    @Test
    void deliveryExpiredWithoutATerminalReportStillBlocksWithinTheRuntimeWindow() {
        DeviceCommand command = command(CommandState.EXPIRED);

        assertThat(command.isOutstandingAt(command.expiresAt())).isTrue();
    }

    @Test
    void aTerminalExecutionReportReleasesThePotImmediately() {
        assertThat(command(CommandState.COMPLETED).isOutstandingAt(ISSUED_AT.plusSeconds(1)))
                .isFalse();
        assertThat(command(CommandState.REJECTED).isOutstandingAt(ISSUED_AT.plusSeconds(1)))
                .isFalse();
        assertThat(command(CommandState.ABORTED).isOutstandingAt(ISSUED_AT.plusSeconds(1)))
                .isFalse();
    }

    @Test
    void aLightLatchStoresNoRuntimeButOccupiesItsAcknowledgementWindow() {
        DeviceCommand command = DeviceCommand.issuedLight(
                "01LIGHTCOMMAND",
                42L,
                "manual-light-1",
                true,
                ISSUED_AT,
                ISSUED_AT.plus(Duration.ofMinutes(2)));

        assertThat(command.actuator()).isEqualTo(DeviceCommand.ACTUATOR_LIGHT);
        assertThat(command.action()).isEqualTo(DeviceCommand.ACTION_ON);
        assertThat(command.grantedMl()).isNull();
        assertThat(command.maxRuntimeMs()).isZero();
        assertThat(command.occupancyEndsAt())
                .isEqualTo(ISSUED_AT.plus(DeviceCommand.TERMINAL_ACK_MARGIN));
        assertThat(command.isOutstandingAt(command.occupancyEndsAt().minusNanos(1))).isTrue();
        assertThat(command.isOutstandingAt(command.occupancyEndsAt())).isFalse();
    }

    private static DeviceCommand command(CommandState state) {
        return new DeviceCommand(
                "01TESTCOMMAND",
                42L,
                "evt-1",
                DeviceCommand.ACTUATOR_PUMP,
                DeviceCommand.ACTION_DOSE,
                200,
                MAX_RUNTIME_MS,
                state,
                ISSUED_AT,
                ISSUED_AT.plus(Duration.ofMinutes(2)),
                null,
                null,
                null,
                null,
                null,
                CommandOrigin.CLOUD);
    }
}
