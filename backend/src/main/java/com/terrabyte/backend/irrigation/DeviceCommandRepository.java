package com.terrabyte.backend.irrigation;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceCommandRepository {

    private final JdbcTemplate jdbcTemplate;

    public DeviceCommandRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Inserts the command. Void to match IrrigationDecisionRepository#save. */
    public void save(DeviceCommand command) {
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO device_command (
                        command_id, pot_id, correlation_id, actuator, action, granted_ml,
                        max_runtime_ms, state, issued_at, expires_at, acked_at, completed_at,
                        actual_ml, actual_runtime_ms, stop_cause, origin)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """);
            statement.setString(1, command.commandId());
            statement.setLong(2, command.potId());
            statement.setString(3, command.correlationId());
            statement.setString(4, command.actuator());
            statement.setString(5, command.action());
            setNullableInt(statement, 6, command.grantedMl());
            statement.setInt(7, command.maxRuntimeMs());
            statement.setString(8, command.state().name());
            statement.setTimestamp(9, Timestamp.from(command.issuedAt()));
            statement.setTimestamp(10, Timestamp.from(command.expiresAt()));
            setNullableTimestamp(statement, 11, command.ackedAt());
            setNullableTimestamp(statement, 12, command.completedAt());
            setNullableInt(statement, 13, command.actualMl());
            setNullableInt(statement, 14, command.actualRuntimeMs());
            statement.setString(15, command.stopCause());
            statement.setString(16, command.origin().name());
            return statement;
        });
    }

    public Optional<DeviceCommand> findById(String commandId) {
        return jdbcTemplate.query(
                        "SELECT * FROM device_command WHERE command_id = ?",
                        this::mapCommand,
                        commandId)
                .stream()
                .findFirst();
    }

    /**
     * Gate 5: is there already a command in flight for this pot?
     *
     * <p>Outstanding means not yet terminal (ISSUED or ACCEPTED) <em>and</em>
     * not yet expired. The expiry half matters: without it, one command whose
     * report never arrived would block the pot forever.
     */
    public boolean hasOutstanding(long potId, Instant now) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM device_command
                WHERE pot_id = ? AND state IN ('ISSUED', 'ACCEPTED') AND expires_at > ?
                """, Integer.class, potId, Timestamp.from(now));
        return count != null && count > 0;
    }

    /**
     * When the outstanding command stops blocking, for the refusal message.
     *
     * <p>A refusal that only says "no" leaves the user tapping the button
     * again; telling them when it will work is the difference between a
     * safeguard and a fault.
     */
    public Optional<Instant> outstandingExpiresAt(long potId, Instant now) {
        List<Timestamp> rows = jdbcTemplate.queryForList("""
                SELECT expires_at FROM device_command
                WHERE pot_id = ? AND state IN ('ISSUED', 'ACCEPTED') AND expires_at > ?
                ORDER BY expires_at DESC
                """, Timestamp.class, potId, Timestamp.from(now));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0).toInstant());
    }

    /**
     * The issue time of the oldest command still counted against the budget.
     *
     * <p>Budget is a rolling 24-hour window, so this is the moment the window
     * starts to release volume: {@code oldest + 24h} is the earliest the pot
     * can be watered again on budget grounds.
     */
    public Optional<Instant> oldestCountedIssuedAt(long potId, Instant since) {
        List<Timestamp> rows = jdbcTemplate.queryForList("""
                SELECT issued_at FROM device_command
                WHERE pot_id = ?
                  AND actuator = 'pump'
                  AND issued_at >= ?
                  AND state <> 'REJECTED'
                ORDER BY issued_at ASC
                """, Timestamp.class, potId, Timestamp.from(since));
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0).toInstant());
    }

    /** Gate 4: when this pot was last actually watered, or empty if it never was. */
    public Optional<Instant> lastCompletedAt(long potId) {
        Timestamp lastCompletedAt = jdbcTemplate.queryForObject("""
                SELECT MAX(completed_at) FROM device_command
                WHERE pot_id = ? AND actuator = 'pump' AND state = 'COMPLETED'
                """, Timestamp.class, potId);
        return Optional.ofNullable(lastCompletedAt).map(Timestamp::toInstant);
    }

    /**
     * Gate 6: millilitres this pot has consumed since {@code since}.
     *
     * <p>This is the safety-critical query. It deliberately over-counts, because
     * the cost of the two errors is not symmetric: over-counting delays a dose,
     * under-counting floods the pot.
     *
     * <p>Two rules encode that:
     * <ul>
     *   <li>{@code COALESCE(actual_ml, granted_ml)} — a command with no report
     *       counts at the volume it was authorised for. ISSUED, ACCEPTED and
     *       EXPIRED commands may all have run; an EXPIRED one in particular is
     *       "we stopped waiting", not "it did not happen", so it must not drop
     *       out of the sum.</li>
     *   <li>{@code state <> 'REJECTED'} — the sole exclusion. A rejection is the
     *       device telling us it never touched the pump, so it is the only case
     *       where zero is a fact rather than an assumption.</li>
     * </ul>
     *
     * <p>The actuator filter is explicit rather than relying on non-pump
     * commands happening to leave granted_ml NULL — that would quietly break
     * the day a light command starts carrying a number in that column.
     */
    public int consumedMlSince(long potId, Instant since) {
        Integer total = jdbcTemplate.queryForObject("""
                SELECT COALESCE(SUM(COALESCE(actual_ml, granted_ml)), 0)
                FROM device_command
                WHERE pot_id = ?
                  AND actuator = 'pump'
                  AND issued_at >= ?
                  AND state <> 'REJECTED'
                """, Integer.class, potId, Timestamp.from(since));
        return total == null ? 0 : total;
    }

    /** Records the device's execution report, making {@code actual_ml} authoritative. */
    public int markCompleted(
            String commandId,
            int actualMl,
            int actualRuntimeMs,
            String stopCause,
            Instant completedAt) {
        // Guarded on the current state so a late duplicate report cannot
        // resurrect a command that already ended, or double-count its volume.
        return jdbcTemplate.update("""
                UPDATE device_command
                SET state = 'COMPLETED', actual_ml = ?, actual_runtime_ms = ?,
                    stop_cause = ?, completed_at = ?
                WHERE command_id = ? AND state IN ('ISSUED', 'ACCEPTED')
                """,
                actualMl,
                actualRuntimeMs,
                stopCause,
                Timestamp.from(completedAt),
                commandId);
    }

    private static void setNullableInt(PreparedStatement statement, int index, Integer value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.INTEGER);
        } else {
            statement.setInt(index, value);
        }
    }

    private static void setNullableTimestamp(PreparedStatement statement, int index, Instant value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.TIMESTAMP);
        } else {
            statement.setTimestamp(index, Timestamp.from(value));
        }
    }

    private DeviceCommand mapCommand(ResultSet resultSet, int rowNumber) throws SQLException {
        return new DeviceCommand(
                resultSet.getString("command_id"),
                resultSet.getLong("pot_id"),
                resultSet.getString("correlation_id"),
                resultSet.getString("actuator"),
                resultSet.getString("action"),
                nullableInt(resultSet, "granted_ml"),
                resultSet.getInt("max_runtime_ms"),
                CommandState.valueOf(resultSet.getString("state")),
                resultSet.getTimestamp("issued_at").toInstant(),
                resultSet.getTimestamp("expires_at").toInstant(),
                nullableInstant(resultSet, "acked_at"),
                nullableInstant(resultSet, "completed_at"),
                nullableInt(resultSet, "actual_ml"),
                nullableInt(resultSet, "actual_runtime_ms"),
                resultSet.getString("stop_cause"),
                CommandOrigin.valueOf(resultSet.getString("origin")));
    }

    private static Integer nullableInt(ResultSet resultSet, String column) throws SQLException {
        int value = resultSet.getInt(column);
        return resultSet.wasNull() ? null : value;
    }

    private static Instant nullableInstant(ResultSet resultSet, String column) throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
