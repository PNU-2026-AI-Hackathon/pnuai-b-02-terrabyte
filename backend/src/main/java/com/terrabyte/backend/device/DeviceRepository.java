package com.terrabyte.backend.device;

import java.security.SecureRandom;
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
public class DeviceRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, serial_code, hardware_id, user_id, space_id, claim_code, claimed_at,
                   status, last_seen_at, created_at
            FROM device
            """;

    private final JdbcTemplate jdbcTemplate;

    public DeviceRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Device> findByClaimCode(String claimCode) {
        return queryOne(" WHERE claim_code = ?", claimCode);
    }

    public Optional<Device> findBySerialCode(String serialCode) {
        return queryOne(" WHERE serial_code = ?", serialCode);
    }

    public Optional<Device> findByUserId(long userId) {
        return queryOne(" WHERE user_id = ? ORDER BY id", userId);
    }

    public List<Device> findAllByUserId(long userId) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE user_id = ? ORDER BY id", this::mapDevice, userId);
    }

    public Optional<Device> findByIdAndUserId(long deviceId, long userId) {
        return queryOne(" WHERE id = ? AND user_id = ?", deviceId, userId);
    }

    public Optional<Device> findByHardwareId(String hardwareId) {
        return queryOne(" WHERE hardware_id = ?", hardwareId);
    }

    // 개발 테스트 코드(123456)로 등록하는 계정마다, 실제 하드웨어와 연결되지 않은
    // 전용 device row를 새로 만들어 준다 — 미리 심어둔 단일 row를 여럿이 나눠 쓰지 않는다.
    public Device createTestDevice(long userId, long spaceId, Instant claimedAt) {
        String serialCode = generateUnusedSerialCode();
        jdbcTemplate.update(
                "INSERT INTO device (serial_code, claim_code, user_id, space_id, claimed_at, status)"
                        + " VALUES (?, ?, ?, ?, ?, 'OFFLINE')",
                serialCode,
                serialCode,
                userId,
                spaceId,
                Timestamp.from(claimedAt));
        return findBySerialCode(serialCode)
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

    public int claim(long deviceId, long userId, long spaceId, Instant claimedAt) {
        return jdbcTemplate.update(
                "UPDATE device SET user_id = ?, space_id = ?, claimed_at = ?"
                        + " WHERE id = ? AND user_id IS NULL",
                userId,
                spaceId,
                Timestamp.from(claimedAt),
                deviceId);
    }

    public void markOnline(long deviceId, Instant lastSeenAt) {
        jdbcTemplate.update(
                "UPDATE device SET status = 'ONLINE', last_seen_at = ? WHERE id = ?",
                Timestamp.from(lastSeenAt),
                deviceId);
    }

    private Optional<Device> queryOne(String suffix, Object... arguments) {
        return jdbcTemplate.query(SELECT_COLUMNS + suffix, this::mapDevice, arguments)
                .stream()
                .findFirst();
    }

    private Device mapDevice(ResultSet resultSet, int rowNumber) throws SQLException {
        Number userId = (Number) resultSet.getObject("user_id");
        Number spaceId = (Number) resultSet.getObject("space_id");
        Timestamp claimedAt = resultSet.getTimestamp("claimed_at");
        Timestamp lastSeenAt = resultSet.getTimestamp("last_seen_at");
        return new Device(
                resultSet.getLong("id"),
                resultSet.getString("serial_code"),
                resultSet.getString("hardware_id"),
                userId == null ? null : userId.longValue(),
                spaceId == null ? null : spaceId.longValue(),
                resultSet.getString("claim_code"),
                claimedAt == null ? null : claimedAt.toInstant(),
                DeviceStatus.valueOf(resultSet.getString("status")),
                lastSeenAt == null ? null : lastSeenAt.toInstant(),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
