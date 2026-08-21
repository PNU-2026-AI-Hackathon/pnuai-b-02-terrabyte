package com.terrabyte.backend.payment;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class PaymentRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, order_id, provider, status, amount, customer_key, payment_key,
                   method, provider_status, failure_code, failure_message, receipt_url,
                   confirm_idempotency_key, cancel_idempotency_key, inventory_deducted,
                   requested_at, updated_at, approved_at, cancelled_at
            FROM payment
            """;

    private final JdbcTemplate jdbcTemplate;

    public PaymentRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<Payment> findByOrderId(long orderId) {
        return queryOne(SELECT_COLUMNS + " WHERE order_id = ?", orderId);
    }

    public Optional<Payment> findByOrderIdForUpdate(long orderId) {
        return queryOne(SELECT_COLUMNS + " WHERE order_id = ? FOR UPDATE", orderId);
    }

    public Optional<Long> findOrderIdByIdAndUserForUpdate(long paymentId, long userId) {
        return jdbcTemplate.query(
                        """
                        SELECT p.order_id
                        FROM payment p
                        JOIN shop_order o ON o.id = p.order_id
                        WHERE p.id = ? AND o.user_id = ?
                        FOR UPDATE
                        """,
                        (resultSet, rowNumber) -> resultSet.getLong("order_id"),
                        paymentId,
                        userId)
                .stream()
                .findFirst();
    }

    public Payment create(long orderId, long amount, String customerKey, Instant now) {
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO payment (
                        order_id, provider, status, amount, customer_key, requested_at, updated_at
                    ) VALUES (?, 'TOSS', 'READY', ?, ?, ?, ?)
                    """,
                    new String[]{"id"});
            statement.setLong(1, orderId);
            statement.setLong(2, amount);
            statement.setString(3, customerKey);
            statement.setTimestamp(4, Timestamp.from(now));
            statement.setTimestamp(5, Timestamp.from(now));
            return statement;
        }, keyHolder);
        return findByOrderId(orderId)
                .orElseThrow(() -> new IllegalStateException("Created payment could not be loaded"));
    }

    public void resetReady(long paymentId, Instant now) {
        jdbcTemplate.update(
                """
                UPDATE payment
                SET status = 'READY', payment_key = NULL, method = NULL,
                    provider_status = NULL, failure_code = NULL, failure_message = NULL,
                    receipt_url = NULL, confirm_idempotency_key = NULL,
                    cancel_idempotency_key = NULL, updated_at = ?, approved_at = NULL,
                    cancelled_at = NULL
                WHERE id = ?
                """,
                Timestamp.from(now),
                paymentId);
    }

    public void markConfirming(
            long paymentId,
            String paymentKey,
            String idempotencyKey,
            boolean inventoryDeducted,
            Instant now) {
        jdbcTemplate.update(
                """
                UPDATE payment
                SET status = 'CONFIRMING', payment_key = ?, confirm_idempotency_key = ?,
                    inventory_deducted = ?, failure_code = NULL, failure_message = NULL,
                    updated_at = ?
                WHERE id = ?
                """,
                paymentKey,
                idempotencyKey,
                inventoryDeducted,
                Timestamp.from(now),
                paymentId);
    }

    public void markPaid(long paymentId, GatewayPayment result, Instant now) {
        jdbcTemplate.update(
                """
                UPDATE payment
                SET status = 'PAID', method = ?, provider_status = ?, receipt_url = ?,
                    failure_code = NULL, failure_message = NULL, approved_at = ?, updated_at = ?
                WHERE id = ?
                """,
                result.method(),
                result.status(),
                result.receiptUrl(),
                Timestamp.from(result.approvedAt() == null ? now : result.approvedAt()),
                Timestamp.from(now),
                paymentId);
    }

    public void markFailed(long paymentId, String code, String message, Instant now) {
        jdbcTemplate.update(
                """
                UPDATE payment
                SET status = 'FAILED', provider_status = 'FAILED', failure_code = ?,
                    failure_message = ?, inventory_deducted = FALSE, updated_at = ?
                WHERE id = ?
                """,
                code,
                message,
                Timestamp.from(now),
                paymentId);
    }

    public void setCancelIdempotencyKey(long paymentId, String idempotencyKey, Instant now) {
        jdbcTemplate.update(
                "UPDATE payment SET cancel_idempotency_key = ?, updated_at = ? WHERE id = ?",
                idempotencyKey,
                Timestamp.from(now),
                paymentId);
    }

    public void markCancelled(long paymentId, String providerStatus, Instant now) {
        Timestamp timestamp = Timestamp.from(now);
        jdbcTemplate.update(
                """
                UPDATE payment
                SET status = 'CANCELLED', provider_status = ?, inventory_deducted = FALSE,
                    cancelled_at = ?, updated_at = ?
                WHERE id = ?
                """,
                providerStatus,
                timestamp,
                timestamp,
                paymentId);
    }

    private Optional<Payment> queryOne(String sql, Object... parameters) {
        return jdbcTemplate.query(sql, this::mapPayment, parameters).stream().findFirst();
    }

    private Payment mapPayment(ResultSet resultSet, int rowNumber) throws SQLException {
        return new Payment(
                resultSet.getLong("id"),
                resultSet.getLong("order_id"),
                resultSet.getString("provider"),
                PaymentStatus.valueOf(resultSet.getString("status")),
                resultSet.getLong("amount"),
                resultSet.getString("customer_key"),
                resultSet.getString("payment_key"),
                resultSet.getString("method"),
                resultSet.getString("provider_status"),
                resultSet.getString("failure_code"),
                resultSet.getString("failure_message"),
                resultSet.getString("receipt_url"),
                resultSet.getString("confirm_idempotency_key"),
                resultSet.getString("cancel_idempotency_key"),
                resultSet.getBoolean("inventory_deducted"),
                instant(resultSet, "requested_at"),
                instant(resultSet, "updated_at"),
                instant(resultSet, "approved_at"),
                instant(resultSet, "cancelled_at"));
    }

    private Instant instant(ResultSet resultSet, String column) throws SQLException {
        Timestamp value = resultSet.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }
}
