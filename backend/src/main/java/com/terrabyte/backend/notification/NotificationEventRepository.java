package com.terrabyte.backend.notification;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationEventRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, user_id, type, title, body, device_id, pot_id, external_ref,
                   dedupe_key, data_json, created_at, read_at
            FROM notification_event
            """;
    private static final TypeReference<Map<String, String>> DATA_TYPE = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public NotificationEventRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate,
            ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public NotificationEvent save(NotificationRequest request, Instant now) {
        return insert(request, now, false)
                .orElseThrow(() -> new IllegalStateException("Notification event was not inserted"));
    }

    public Optional<NotificationEvent> saveOnce(NotificationRequest request, Instant now) {
        return insert(request, now, true);
    }

    private Optional<NotificationEvent> insert(
            NotificationRequest request, Instant now, boolean ignoreConflict) {
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        int inserted = jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO notification_event"
                            + " (user_id, type, title, body, device_id, pot_id, external_ref,"
                            + " dedupe_key, data_json, created_at)"
                            + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                            + (ignoreConflict ? " ON CONFLICT DO NOTHING" : ""),
                    new String[]{"id"});
            statement.setLong(1, request.userId());
            statement.setString(2, request.type().name());
            statement.setString(3, request.title());
            statement.setString(4, request.body());
            setNullableLong(statement, 5, request.deviceId());
            setNullableLong(statement, 6, request.potId());
            statement.setString(7, request.externalRef());
            statement.setString(8, request.dedupeKey());
            statement.setString(9, json(request.data()));
            statement.setTimestamp(10, Timestamp.from(now));
            return statement;
        }, keyHolder);
        if (inserted == 0) return Optional.empty();
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Notification event id was not returned");
        }
        return Optional.of(findById(key.longValue())
                .orElseThrow(() -> new IllegalStateException("Notification event could not be loaded")));
    }

    public Optional<NotificationEvent> findById(long eventId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ?",
                        this::map,
                        eventId)
                .stream()
                .findFirst();
    }

    public List<NotificationEvent> findAllForUser(long userId, int limit) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
                this::map,
                userId,
                limit);
    }

    public long countUnreadForUser(long userId) {
        Long count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification_event WHERE user_id = ? AND read_at IS NULL",
                Long.class,
                userId);
        return count == null ? 0L : count;
    }

    public int markRead(long userId, long eventId, Instant now) {
        return jdbcTemplate.update(
                "UPDATE notification_event SET read_at = ?"
                        + " WHERE id = ? AND user_id = ? AND read_at IS NULL",
                Timestamp.from(now), eventId, userId);
    }

    public boolean existsForUser(long userId, long eventId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification_event WHERE id = ? AND user_id = ?",
                Integer.class,
                eventId,
                userId);
        return count != null && count > 0;
    }

    public int markAllRead(long userId, Instant now) {
        return jdbcTemplate.update(
                "UPDATE notification_event SET read_at = ?"
                        + " WHERE user_id = ? AND read_at IS NULL",
                Timestamp.from(now), userId);
    }

    private NotificationEvent map(ResultSet resultSet, int rowNumber) throws SQLException {
        Number deviceId = (Number) resultSet.getObject("device_id");
        Number potId = (Number) resultSet.getObject("pot_id");
        Timestamp readAt = resultSet.getTimestamp("read_at");
        return new NotificationEvent(
                resultSet.getLong("id"),
                resultSet.getLong("user_id"),
                NotificationType.valueOf(resultSet.getString("type")),
                resultSet.getString("title"),
                resultSet.getString("body"),
                deviceId == null ? null : deviceId.longValue(),
                potId == null ? null : potId.longValue(),
                resultSet.getString("external_ref"),
                resultSet.getString("dedupe_key"),
                parseData(resultSet.getString("data_json")),
                resultSet.getTimestamp("created_at").toInstant(),
                readAt == null ? null : readAt.toInstant());
    }

    private String json(Map<String, String> data) {
        try {
            return objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Notification data could not be serialized", exception);
        }
    }

    private Map<String, String> parseData(String data) {
        try {
            return objectMapper.readValue(data, DATA_TYPE);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Stored notification data is invalid", exception);
        }
    }

    private void setNullableLong(PreparedStatement statement, int index, Long value)
            throws SQLException {
        if (value == null) {
            statement.setNull(index, java.sql.Types.BIGINT);
        } else {
            statement.setLong(index, value);
        }
    }
}
