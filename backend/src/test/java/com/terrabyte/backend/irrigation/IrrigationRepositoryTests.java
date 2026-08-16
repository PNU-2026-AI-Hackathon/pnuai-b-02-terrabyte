package com.terrabyte.backend.irrigation;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

import com.terrabyte.backend.measurement.MeasurementStore;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
@ActiveProfiles("test")
class IrrigationRepositoryTests {

    private final JdbcTemplate jdbcTemplate;
    private final IrrigationDecisionRepository decisionRepository;
    private final DeviceCommandRepository commandRepository;
    private final CommandIdGenerator commandIdGenerator;

    @MockitoBean
    private MeasurementStore measurementStore;

    private long potId;

    @Autowired
    IrrigationRepositoryTests(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate,
            IrrigationDecisionRepository decisionRepository,
            DeviceCommandRepository commandRepository,
            CommandIdGenerator commandIdGenerator) {
        this.jdbcTemplate = jdbcTemplate;
        this.decisionRepository = decisionRepository;
        this.commandRepository = commandRepository;
        this.commandIdGenerator = commandIdGenerator;
    }

    @BeforeEach
    void resetIrrigationTables() {
        jdbcTemplate.update("DELETE FROM irrigation_decision");
        jdbcTemplate.update("DELETE FROM device_command");
        potId = jdbcTemplate.queryForObject("SELECT MIN(id) FROM pot", Long.class);
    }

    @Test
    void roundTripsAGrantedDecision() {
        Instant observedAt = Instant.parse("2026-05-01T09:00:00Z");
        decisionRepository.save(IrrigationDecision.granted(
                potId, "evt-1", CommandSource.RULE_AI, observedAt, 31.5,
                "dose-v3", 140, 120, ClampReason.DAILY_BUDGET, "01ABC", observedAt));

        IrrigationDecision loaded = decisionRepository.findRecentByPotId(potId, 10).get(0);
        assertThat(loaded.id()).isNotNull();
        assertThat(loaded.grantedMl()).isEqualTo(120);
        assertThat(loaded.aiRequestedMl()).isEqualTo(140);
        assertThat(loaded.clampReason()).isEqualTo(ClampReason.DAILY_BUDGET);
        assertThat(loaded.denyReason()).isNull();
        assertThat(loaded.soilMoisturePct()).isEqualTo(31.5);
        assertThat(loaded.source()).isEqualTo(CommandSource.RULE_AI);
    }

    @Test
    void roundTripsADeniedDecision() {
        Instant observedAt = Instant.parse("2026-05-01T09:00:00Z");
        decisionRepository.save(IrrigationDecision.denied(
                potId, "evt-2", CommandSource.RULE, observedAt, 62.0,
                IrrigationDecision.VERDICT_NOT_NEEDED, null, null, DenyReason.COOLDOWN, observedAt));

        IrrigationDecision loaded = decisionRepository.findRecentByPotId(potId, 10).get(0);
        assertThat(loaded.denyReason()).isEqualTo(DenyReason.COOLDOWN);
        assertThat(loaded.grantedMl()).isNull();
        assertThat(loaded.commandId()).isNull();
        assertThat(loaded.wasGranted()).isFalse();
    }

    @Test
    void countsACompletedCommandByItsReportedVolume() {
        Instant issuedAt = Instant.now().minus(Duration.ofHours(2));
        String commandId = insert(CommandState.ISSUED, 100, null, issuedAt, issuedAt.plusSeconds(120));

        int updated = commandRepository.markCompleted(
                commandId, 96, 8200, "VOLUME_REACHED", issuedAt.plusSeconds(30));

        assertThat(updated).isEqualTo(1);
        // 96, not the 100 that was authorised: once the device reports, the
        // report is the truth.
        assertThat(commandRepository.consumedMlSince(potId, issuedAt.minusSeconds(1))).isEqualTo(96);
        assertThat(commandRepository.lastCompletedAt(potId)).contains(issuedAt.plusSeconds(30));
    }

    @Test
    void countsAnUnfinishedCommandAtItsGrantedVolume() {
        Instant issuedAt = Instant.now().minus(Duration.ofMinutes(1));
        insert(CommandState.ISSUED, 150, null, issuedAt, issuedAt.plusSeconds(120));

        // No report yet — assume it ran in full rather than assume it did not.
        assertThat(commandRepository.consumedMlSince(potId, issuedAt.minusSeconds(1))).isEqualTo(150);
    }

    @Test
    void countsAnExpiredCommandBecauseItMayStillHaveRun() {
        Instant issuedAt = Instant.now().minus(Duration.ofHours(3));
        insert(CommandState.EXPIRED, 200, null, issuedAt, issuedAt.plusSeconds(120));

        // Expiry means "we stopped waiting for a report", not "no water moved".
        assertThat(commandRepository.consumedMlSince(potId, issuedAt.minusSeconds(1))).isEqualTo(200);
    }

    @Test
    void ignoresARejectedCommandBecauseItProvablyDidNotRun() {
        Instant issuedAt = Instant.now().minus(Duration.ofHours(1));
        insert(CommandState.REJECTED, 200, null, issuedAt, issuedAt.plusSeconds(120));
        insert(CommandState.ACCEPTED, 40, null, issuedAt, issuedAt.plusSeconds(600));

        assertThat(commandRepository.consumedMlSince(potId, issuedAt.minusSeconds(1))).isEqualTo(40);
    }

    @Test
    void excludesCommandsIssuedBeforeTheBudgetWindow() {
        Instant now = Instant.now();
        insert(CommandState.COMPLETED, 200, 200, now.minus(Duration.ofHours(30)),
                now.minus(Duration.ofHours(30)).plusSeconds(120));
        insert(CommandState.COMPLETED, 50, 50, now.minus(Duration.ofHours(2)),
                now.minus(Duration.ofHours(2)).plusSeconds(120));

        assertThat(commandRepository.consumedMlSince(potId, now.minus(Duration.ofHours(24))))
                .isEqualTo(50);
    }

    @Test
    void treatsAnExpiredIssuedCommandAsNoLongerBlockingThePot() {
        Instant now = Instant.now();
        insert(CommandState.ISSUED, 80, null, now.minus(Duration.ofHours(1)),
                now.minus(Duration.ofMinutes(50)));

        // Otherwise one lost report would block this pot forever.
        assertThat(commandRepository.hasOutstanding(potId, now)).isFalse();
    }

    @Test
    void treatsALiveIssuedCommandAsBlockingThePot() {
        Instant now = Instant.now();
        insert(CommandState.ISSUED, 80, null, now.minusSeconds(10), now.plusSeconds(110));

        assertThat(commandRepository.hasOutstanding(potId, now)).isTrue();
    }

    @Test
    void doesNotLetALateDuplicateReportOverwriteATerminalCommand() {
        Instant issuedAt = Instant.now().minus(Duration.ofHours(1));
        String commandId = insert(CommandState.ISSUED, 100, null, issuedAt, issuedAt.plusSeconds(120));
        commandRepository.markCompleted(commandId, 98, 8000, "VOLUME_REACHED", issuedAt.plusSeconds(20));

        int secondUpdate = commandRepository.markCompleted(
                commandId, 98, 8000, "VOLUME_REACHED", issuedAt.plusSeconds(25));

        assertThat(secondUpdate).isZero();
        assertThat(commandRepository.consumedMlSince(potId, issuedAt.minusSeconds(1))).isEqualTo(98);
    }

    @Test
    void generatesUlidsThatSortLexicographicallyByTime() {
        List<String> ids = new ArrayList<>();
        Instant base = Instant.parse("2026-05-01T00:00:00Z");
        for (int i = 0; i < 50; i++) {
            CommandIdGenerator generator = new CommandIdGenerator(
                    Clock.fixed(base.plusMillis(i * 7L), ZoneOffset.UTC));
            ids.add(generator.next());
        }

        assertThat(ids).allMatch(id -> id.length() == 26);
        // Byte order equals time order: this is what makes command_id usable as
        // a time-ordered primary key.
        assertThat(ids).isSorted();
        assertThat(ids).doesNotHaveDuplicates();
    }

    @Test
    void generatesDistinctIdsWithinTheSameMillisecond() {
        CommandIdGenerator generator = new CommandIdGenerator(
                Clock.fixed(Instant.parse("2026-05-01T00:00:00Z"), ZoneOffset.UTC));

        List<String> ids = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            ids.add(generator.next());
        }

        assertThat(ids).doesNotHaveDuplicates();
        assertThat(ids).allMatch(id -> id.startsWith(ids.get(0).substring(0, 10)));
    }

    private String insert(
            CommandState state, Integer grantedMl, Integer actualMl, Instant issuedAt, Instant expiresAt) {
        String commandId = commandIdGenerator.next(issuedAt);
        commandRepository.save(new DeviceCommand(
                commandId,
                potId,
                "evt-" + commandId,
                DeviceCommand.ACTUATOR_PUMP,
                DeviceCommand.ACTION_DOSE,
                grantedMl,
                20_000,
                state,
                issuedAt,
                expiresAt,
                null,
                state == CommandState.COMPLETED ? issuedAt.plusSeconds(20) : null,
                actualMl,
                null,
                null,
                CommandOrigin.CLOUD));
        return commandId;
    }
}
