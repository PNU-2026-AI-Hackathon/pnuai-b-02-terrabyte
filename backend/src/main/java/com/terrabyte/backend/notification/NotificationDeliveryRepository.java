package com.terrabyte.backend.notification;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationDeliveryRepository {

    private final JdbcTemplate jdbcTemplate;

    public NotificationDeliveryRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public int enqueue(long notificationId, long userId, Instant now) {
        return jdbcTemplate.update(
                "INSERT INTO notification_delivery"
                        + " (notification_id, registration_id, status, attempts,"
                        + " available_at, created_at, updated_at)"
                        + " SELECT ?, id, 'PENDING', 0, ?, ?, ? FROM push_registration"
                        + " WHERE user_id = ? AND active = TRUE ON CONFLICT DO NOTHING",
                notificationId,
                timestamp(now),
                timestamp(now),
                timestamp(now),
                userId);
    }

    public int recoverStaleClaims(Instant staleBefore, Instant now) {
        return jdbcTemplate.update(
                "UPDATE notification_delivery"
                        + " SET status = 'PENDING', available_at = ?, claimed_at = NULL,"
                        + " updated_at = ?, last_error = 'delivery_claim_timed_out'"
                        + " WHERE status = 'PROCESSING' AND claimed_at <= ?",
                timestamp(now), timestamp(now), timestamp(staleBefore));
    }

    public List<Long> findPendingIds(Instant now, int limit) {
        return jdbcTemplate.queryForList(
                "SELECT id FROM notification_delivery"
                        + " WHERE status = 'PENDING' AND available_at <= ?"
                        + " ORDER BY available_at, id LIMIT ?",
                Long.class,
                timestamp(now),
                limit);
    }

    public Optional<NotificationDelivery> claim(long deliveryId, Instant now) {
        int claimed = jdbcTemplate.update(
                "UPDATE notification_delivery SET status = 'PROCESSING', claimed_at = ?,"
                        + " updated_at = ? WHERE id = ? AND status = 'PENDING'"
                        + " AND available_at <= ?",
                timestamp(now), timestamp(now), deliveryId, timestamp(now));
        if (claimed == 0) return Optional.empty();
        return jdbcTemplate.query(
                        "SELECT id, notification_id, registration_id, attempts"
                                + " FROM notification_delivery WHERE id = ?",
                        (resultSet, rowNumber) -> new NotificationDelivery(
                                resultSet.getLong("id"),
                                resultSet.getLong("notification_id"),
                                resultSet.getLong("registration_id"),
                                resultSet.getInt("attempts")),
                        deliveryId)
                .stream()
                .findFirst();
    }

    public void markSent(long deliveryId, Instant now) {
        complete(deliveryId, "SENT", null, now);
    }

    public void markSkipped(long deliveryId, String detail, Instant now) {
        complete(deliveryId, "SKIPPED", detail, now);
    }

    public void markFailed(long deliveryId, int attempts, String detail, Instant now) {
        jdbcTemplate.update(
                "UPDATE notification_delivery SET status = 'FAILED', attempts = ?,"
                        + " claimed_at = NULL, last_error = ?, updated_at = ? WHERE id = ?",
                attempts, truncate(detail), timestamp(now), deliveryId);
    }

    public void retry(
            long deliveryId, int attempts, Instant availableAt, String detail, Instant now) {
        jdbcTemplate.update(
                "UPDATE notification_delivery SET status = 'PENDING', attempts = ?,"
                        + " available_at = ?, claimed_at = NULL, last_error = ?, updated_at = ?"
                        + " WHERE id = ?",
                attempts,
                timestamp(availableAt),
                truncate(detail),
                timestamp(now),
                deliveryId);
    }

    private void complete(long deliveryId, String status, String detail, Instant now) {
        jdbcTemplate.update(
                "UPDATE notification_delivery SET status = ?, claimed_at = NULL,"
                        + " last_error = ?, updated_at = ? WHERE id = ?",
                status, truncate(detail), timestamp(now), deliveryId);
    }

    private Timestamp timestamp(Instant instant) {
        return Timestamp.from(instant.truncatedTo(ChronoUnit.MICROS));
    }

    private String truncate(String detail) {
        if (detail == null || detail.length() <= 1000) return detail;
        return detail.substring(0, 1000);
    }
}
