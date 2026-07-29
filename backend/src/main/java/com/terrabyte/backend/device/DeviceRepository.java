package com.terrabyte.backend.device;

import java.security.SecureRandom;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DeviceRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, serial_code, hardware_id, user_id, crop_code, crop_selected_at,
                   status, last_seen_at, created_at
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

    public Optional<Device> findByIdAndUserId(long deviceId, long userId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ? AND user_id = ?",
                        this::mapDevice,
                        deviceId,
                        userId)
                .stream()
                .findFirst();
    }

    public Optional<Device> findByHardwareId(String hardwareId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE hardware_id = ?",
                        this::mapDevice,
                        hardwareId)
                .stream()
                .findFirst();
    }

    // 개발 테스트 코드(123456)로 등록하는 계정마다, 실제 하드웨어와 연결되지 않은
    // 전용 device row를 새로 만들어 준다 — 미리 심어둔 단일 row를 여럿이 나눠 쓰지 않는다.
    public Device createTestDevice(long userId) {
        String serialCode = generateUnusedSerialCode();
        jdbcTemplate.update(
                "INSERT INTO device (serial_code, user_id, status) VALUES (?, ?, 'OFFLINE')",
                serialCode,
                userId);
        return findByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("Test device could not be loaded"));
    }

    private String generateUnusedSerialCode() {
        SecureRandom random = new SecureRandom();
        String candidate;
        do {
            candidate = String.format("%06d", random.nextInt(1_000_000));
        } while (findBySerialCode(candidate).isPresent());
        return candidate;
    }

    public int claim(long deviceId, long userId) {
        return jdbcTemplate.update(
                "UPDATE device SET user_id = ? WHERE id = ? AND user_id IS NULL",
                userId,
                deviceId);
    }

    public void markOnline(long deviceId, java.time.Instant lastSeenAt) {
        jdbcTemplate.update(
                "UPDATE device SET status = 'ONLINE', last_seen_at = ? WHERE id = ?",
                java.sql.Timestamp.from(lastSeenAt),
                deviceId);
    }

    public int selectCrop(long deviceId, long userId, String cropCode, java.time.Instant selectedAt) {
        return jdbcTemplate.update(
                "UPDATE device SET crop_code = ?, crop_selected_at = ? WHERE id = ? AND user_id = ?",
                cropCode,
                java.sql.Timestamp.from(selectedAt),
                deviceId,
                userId);
    }

    private Device mapDevice(ResultSet resultSet, int rowNumber) throws SQLException {
        Number userId = (Number) resultSet.getObject("user_id");
        java.sql.Timestamp lastSeenAt = resultSet.getTimestamp("last_seen_at");
        java.sql.Timestamp cropSelectedAt = resultSet.getTimestamp("crop_selected_at");
        return new Device(
                resultSet.getLong("id"),
                resultSet.getString("serial_code"),
                resultSet.getString("hardware_id"),
                userId == null ? null : userId.longValue(),
                resultSet.getString("crop_code"),
                cropSelectedAt == null ? null : cropSelectedAt.toInstant(),
                DeviceStatus.valueOf(resultSet.getString("status")),
                lastSeenAt == null ? null : lastSeenAt.toInstant(),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
