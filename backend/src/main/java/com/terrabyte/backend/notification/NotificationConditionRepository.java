package com.terrabyte.backend.notification;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationConditionRepository {

    private final JdbcTemplate jdbcTemplate;

    public NotificationConditionRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<State> find(long userId, String conditionKey) {
        return jdbcTemplate.query(
                        "SELECT active, last_notified_at FROM notification_condition_state"
                                + " WHERE user_id = ? AND condition_key = ? FOR UPDATE",
                        (resultSet, rowNumber) -> {
                            Timestamp lastNotifiedAt = resultSet.getTimestamp("last_notified_at");
                            return new State(
                                    resultSet.getBoolean("active"),
                                    lastNotifiedAt == null ? null : lastNotifiedAt.toInstant());
                        },
                        userId,
                        conditionKey)
                .stream()
                .findFirst();
    }

    public int insertActiveIfAbsent(long userId, String conditionKey, Instant now) {
        return jdbcTemplate.update(
                "INSERT INTO notification_condition_state"
                        + " (user_id, condition_key, active, last_notified_at, updated_at)"
                        + " VALUES (?, ?, TRUE, ?, ?) ON CONFLICT DO NOTHING",
                userId, conditionKey, Timestamp.from(now), Timestamp.from(now));
    }

    public void markActive(
            long userId, String conditionKey, Instant now, boolean updateNotifiedAt) {
        if (updateNotifiedAt) {
            jdbcTemplate.update(
                    "UPDATE notification_condition_state"
                            + " SET active = TRUE, last_notified_at = ?, updated_at = ?"
                            + " WHERE user_id = ? AND condition_key = ?",
                    Timestamp.from(now), Timestamp.from(now), userId, conditionKey);
        } else {
            jdbcTemplate.update(
                    "UPDATE notification_condition_state SET active = TRUE, updated_at = ?"
                            + " WHERE user_id = ? AND condition_key = ?",
                    Timestamp.from(now), userId, conditionKey);
        }
    }

    public void resolve(long userId, String conditionKey, Instant now) {
        jdbcTemplate.update(
                "UPDATE notification_condition_state SET active = FALSE, updated_at = ?"
                        + " WHERE user_id = ? AND condition_key = ? AND active = TRUE",
                Timestamp.from(now), userId, conditionKey);
    }

    public record State(boolean active, Instant lastNotifiedAt) {
    }
}
