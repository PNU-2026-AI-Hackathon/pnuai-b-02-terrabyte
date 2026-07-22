package com.terrabyte.backend.device;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, serial_code, user_id, status, last_seen_at, created_at
            FROM device
            """;

    private final JdbcTemplate jdbcTemplate;

    public DeviceRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Device> findBySerialCode(String serialCode) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE serial_code = ?",
                        this::mapDevice,
                        serialCode)
                .stream()
                .findFirst();
    }

    public Optional<Device> findByUserId(long userId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE user_id = ?",
                        this::mapDevice,
                        userId)
                .stream()
                .findFirst();
    }

    public int claim(long deviceId, long userId) {
        return jdbcTemplate.update(
                "UPDATE device SET user_id = ? WHERE id = ? AND user_id IS NULL",
                userId,
                deviceId);
    }

    private Device mapDevice(ResultSet resultSet, int rowNumber) throws SQLException {
        Number userId = (Number) resultSet.getObject("user_id");
        java.sql.Timestamp lastSeenAt = resultSet.getTimestamp("last_seen_at");
        return new Device(
                resultSet.getLong("id"),
                resultSet.getString("serial_code"),
                userId == null ? null : userId.longValue(),
                DeviceStatus.valueOf(resultSet.getString("status")),
                lastSeenAt == null ? null : lastSeenAt.toInstant(),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
