package com.terrabyte.backend.irrigation;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class IrrigationDecisionRepository {

    private static final String SELECT_COLUMNS = """
            SELECT d.id, d.pot_id, d.correlation_id, d.source, d.sample_observed_at,
                   d.soil_moisture_pct, d.rule_verdict, d.ai_model_version, d.ai_requested_ml,
                   d.granted_ml, d.deny_reason, d.clamp_reason, d.command_id, d.created_at
            FROM irrigation_decision d
            """;

    private final JdbcTemplate jdbcTemplate;

    public IrrigationDecisionRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** Persists the decision. */
    public void save(IrrigationDecision decision) {
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                    INSERT INTO irrigation_decision (
                        pot_id, correlation_id, source, sample_observed_at, soil_moisture_pct,
                        rule_verdict, ai_model_version, ai_requested_ml, granted_ml,
                        deny_reason, clamp_reason, command_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, new String[]{"id"});
            statement.setLong(1, decision.potId());
            statement.setString(2, decision.correlationId());
            statement.setString(3, decision.source().name());
            statement.setTimestamp(4, Timestamp.from(decision.sampleObservedAt()));
            setNullableDouble(statement, 5, decision.soilMoisturePct());
            statement.setString(6, decision.ruleVerdict());
            statement.setString(7, decision.aiModelVersion());
            setNullableInt(statement, 8, decision.aiRequestedMl());
            setNullableInt(statement, 9, decision.grantedMl());
            statement.setString(10, decision.denyReason() == null ? null : decision.denyReason().name());
            statement.setString(11, decision.clampReason() == null ? null : decision.clampReason().name());
            statement.setString(12, decision.commandId());
            statement.setTimestamp(13, Timestamp.from(
                    decision.createdAt() == null ? Instant.now() : decision.createdAt()));
            return statement;
        }, keyHolder);
        if (keyHolder.getKey() == null) {
            throw new IllegalStateException("Failed to read generated irrigation_decision id");
        }
    }

    /** Newest first — this is what a "why did/didn't my pot get watered" view reads. */
    public List<IrrigationDecision> findRecentByPotId(long potId, int limit) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE d.pot_id = ? ORDER BY d.created_at DESC, d.id DESC LIMIT ?",
                this::mapDecision,
                potId,
                limit);
    }

    private static void setNullableInt(PreparedStatement statement, int index, Integer value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.INTEGER);
        } else {
            statement.setInt(index, value);
        }
    }

    private static void setNullableDouble(PreparedStatement statement, int index, Double value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, Types.DOUBLE);
        } else {
            statement.setDouble(index, value);
        }
    }

    private IrrigationDecision mapDecision(ResultSet resultSet, int rowNumber) throws SQLException {
        String denyReason = resultSet.getString("deny_reason");
        String clampReason = resultSet.getString("clamp_reason");
        return new IrrigationDecision(
                resultSet.getLong("id"),
                resultSet.getLong("pot_id"),
                resultSet.getString("correlation_id"),
                CommandSource.valueOf(resultSet.getString("source")),
                resultSet.getTimestamp("sample_observed_at").toInstant(),
                nullableDouble(resultSet, "soil_moisture_pct"),
                resultSet.getString("rule_verdict"),
                resultSet.getString("ai_model_version"),
                nullableInt(resultSet, "ai_requested_ml"),
                nullableInt(resultSet, "granted_ml"),
                denyReason == null ? null : DenyReason.valueOf(denyReason),
                clampReason == null ? null : ClampReason.valueOf(clampReason),
                resultSet.getString("command_id"),
                resultSet.getTimestamp("created_at").toInstant());
    }

    private static Integer nullableInt(ResultSet resultSet, String column) throws SQLException {
        int value = resultSet.getInt(column);
        return resultSet.wasNull() ? null : value;
    }

    private static Double nullableDouble(ResultSet resultSet, String column) throws SQLException {
        double value = resultSet.getDouble(column);
        return resultSet.wasNull() ? null : value;
    }
}
