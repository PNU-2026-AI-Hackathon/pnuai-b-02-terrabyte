package com.terrabyte.backend.notification;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PushRegistrationRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, user_id, token, platform, active, created_at, updated_at
            FROM push_registration
            """;

    private final JdbcTemplate jdbcTemplate;

    public PushRegistrationRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public PushRegistration register(
            long userId, String token, PushPlatform platform, Instant now) {
        if (reactivate(userId, token, platform, now) == 0) {
            int inserted = jdbcTemplate.update(
                    "INSERT INTO push_registration"
                            + " (user_id, token, platform, active, created_at, updated_at)"
                            + " VALUES (?, ?, ?, TRUE, ?, ?) ON CONFLICT DO NOTHING",
                    userId,
                    token,
                    platform.name(),
                    Timestamp.from(now),
                    Timestamp.from(now));
            if (inserted == 0) {
                reactivate(userId, token, platform, now);
            }
        }
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE token = ?",
                        this::map,
                        token)
                .stream()
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Push registration could not be loaded"));
    }

    public List<PushRegistration> findActiveByUser(long userId) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE user_id = ? AND active = TRUE ORDER BY id",
                this::map,
                userId);
    }

    public int deactivate(long userId, String token, Instant now) {
        return jdbcTemplate.update(
                "UPDATE push_registration SET active = FALSE, updated_at = ?"
                        + " WHERE user_id = ? AND token = ? AND active = TRUE",
                Timestamp.from(now), userId, token);
    }

    public Optional<PushRegistration> findById(long registrationId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ?",
                        this::map,
                        registrationId)
                .stream()
                .findFirst();
    }

    public int deactivatePrevious(
            long userId, String previousToken, String replacementToken, Instant now) {
        return jdbcTemplate.update(
                "UPDATE push_registration SET active = FALSE, updated_at = ?"
                        + " WHERE user_id = ? AND token = ? AND token <> ? AND active = TRUE",
                Timestamp.from(now), userId, previousToken, replacementToken);
    }

    public int deactivateAll(long userId, Instant now) {
        return jdbcTemplate.update(
                "UPDATE push_registration SET active = FALSE, updated_at = ?"
                        + " WHERE user_id = ? AND active = TRUE",
                Timestamp.from(now), userId);
    }

    public void deactivateToken(String token, Instant now) {
        jdbcTemplate.update(
                "UPDATE push_registration SET active = FALSE, updated_at = ? WHERE token = ?",
                Timestamp.from(now), token);
    }

    private int reactivate(
            long userId, String token, PushPlatform platform, Instant now) {
        return jdbcTemplate.update(
                "UPDATE push_registration"
                        + " SET user_id = ?, platform = ?, active = TRUE, updated_at = ?"
                        + " WHERE token = ?",
                userId, platform.name(), Timestamp.from(now), token);
    }

    private PushRegistration map(ResultSet resultSet, int rowNumber) throws SQLException {
        return new PushRegistration(
                resultSet.getLong("id"),
                resultSet.getLong("user_id"),
                resultSet.getString("token"),
                PushPlatform.valueOf(resultSet.getString("platform")),
                resultSet.getBoolean("active"),
                resultSet.getTimestamp("created_at").toInstant(),
                resultSet.getTimestamp("updated_at").toInstant());
    }
}
