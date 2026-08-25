package com.terrabyte.backend.irrigation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import com.terrabyte.backend.config.SchedulingConfig;
import com.terrabyte.backend.measurement.MeasurementStore;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.SchedulingConfiguration;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

/**
 * The expiry sweep, driven directly rather than by the scheduler.
 *
 * <p>Calling {@link ExpiredCommandSweeper#sweepOnce()} is not a workaround for an
 * awkward test: it is the only way to assert on rows that a timer would otherwise
 * be mutating underneath the assertions.
 */
@SpringBootTest
@ActiveProfiles("test")
class ExpiredCommandSweeperTests {

    private static final long POT_ID = 1L;

    @Autowired private ExpiredCommandSweeper sweeper;
    @Autowired private DeviceCommandRepository commands;
    @Autowired private CommandIdGenerator commandIdGenerator;
    @Autowired private ApplicationContext context;

    @Autowired
    @Qualifier("postgresJdbcTemplate")
    private JdbcTemplate jdbcTemplate;

    @MockitoBean private MeasurementStore measurementStore;

    @BeforeEach
    void reset() {
        jdbcTemplate.update("DELETE FROM device_command");
    }

    @Test
    void theSchedulerIsOffInTheTestProfile() {
        // If this ever fails, every test that inserts a deliberately overdue
        // command has acquired an invisible competitor.
        assertThat(context.getBeanNamesForType(SchedulingConfiguration.class)).isEmpty();
    }

    @Test
    void butTheSchedulerIsOnByDefaultEverywhereElse() {
        // The other half of the pair, so the assertion above cannot pass merely
        // because nothing ever registers under that type. Production must sweep:
        // silence here means pots that stay blocked on a lost acknowledgement.
        new ApplicationContextRunner()
                .withUserConfiguration(SchedulingConfig.class)
                .run(enabled -> assertThat(enabled)
                        .hasSingleBean(SchedulingConfiguration.class));

        new ApplicationContextRunner()
                .withUserConfiguration(SchedulingConfig.class)
                .withPropertyValues("app.scheduling.enabled=false")
                .run(disabled -> assertThat(disabled)
                        .doesNotHaveBean(SchedulingConfiguration.class));
    }

    @Test
    void expiresACommandWhoseReportNeverArrived() {
        String commandId = insert(CommandState.ISSUED, Duration.ofMinutes(30));

        assertThat(sweeper.sweepOnce()).isEqualTo(1);

        assertThat(commands.findById(commandId).orElseThrow().state())
                .isEqualTo(CommandState.EXPIRED);
    }

    @Test
    void expiresAnAcceptedCommandTooBecauseTheCompletionMayBeLost() {
        String commandId = insert(CommandState.ACCEPTED, Duration.ofMinutes(30));

        assertThat(sweeper.sweepOnce()).isEqualTo(1);

        assertThat(commands.findById(commandId).orElseThrow().state())
                .isEqualTo(CommandState.EXPIRED);
    }

    @Test
    void keepsTheVolumeOnTheBudgetAfterExpiring() {
        insert(CommandState.ISSUED, Duration.ofMinutes(30));

        sweeper.sweepOnce();

        // EXPIRED means "we stopped waiting", not "no water moved", so the
        // granted volume stays counted. Dropping it here is what would let a
        // silent gateway be watered twice over.
        assertThat(commands.consumedMlSince(POT_ID, Instant.now().minus(Duration.ofHours(24))))
                .isEqualTo(120);
    }

    @Test
    void leavesALiveCommandAlone() {
        String commandId = insert(CommandState.ISSUED, Duration.ofMinutes(-1));

        assertThat(sweeper.sweepOnce()).isZero();

        assertThat(commands.findById(commandId).orElseThrow().state())
                .isEqualTo(CommandState.ISSUED);
    }

    @Test
    void doesNotTouchACommandThatAlreadyReportedItself() {
        String commandId = insert(CommandState.ISSUED, Duration.ofMinutes(30));
        commands.markCompleted(commandId, 96, 12_000, "volume_reached", Instant.now());

        assertThat(sweeper.sweepOnce()).isZero();

        // Overdue, but terminal. A real report always beats the assumption.
        assertThat(commands.findById(commandId).orElseThrow().state())
                .isEqualTo(CommandState.COMPLETED);
    }

    @Test
    void isIdempotentAcrossTicks() {
        insert(CommandState.ISSUED, Duration.ofMinutes(30));

        assertThat(sweeper.sweepOnce()).isEqualTo(1);
        assertThat(sweeper.sweepOnce()).isZero();
    }

    /** @param overdueBy how long ago the TTL passed; negative means still live */
    private String insert(CommandState state, Duration overdueBy) {
        Instant expiresAt = Instant.now().minus(overdueBy);
        Instant issuedAt = expiresAt.minus(Duration.ofMinutes(2));
        String commandId = commandIdGenerator.next(issuedAt);
        commands.save(new DeviceCommand(
                commandId, POT_ID, "evt-" + commandId,
                DeviceCommand.ACTUATOR_PUMP, DeviceCommand.ACTION_DOSE,
                120, 20_000, state, issuedAt, expiresAt,
                null, null, null, null, null, CommandOrigin.CLOUD));
        return commandId;
    }
}
