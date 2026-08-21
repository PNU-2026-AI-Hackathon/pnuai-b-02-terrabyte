package com.terrabyte.backend.order;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class OrderRepository {

    private static final String SELECT_ORDER_COLUMNS = """
            SELECT id, order_number, user_id, status, total_quantity, total_price,
                   recipient_name, recipient_phone, postal_code, address, address_detail,
                   ordered_at, updated_at, cancelled_at
            FROM shop_order
            """;

    private static final String SELECT_ITEM_COLUMNS = """
            SELECT id, order_id, product_id, category, product_name, product_emoji,
                   product_description, original_unit_price, discount_rate,
                   unit_price, quantity, subtotal,
                   package_quantity, package_unit, sub_category
            FROM shop_order_item
            """;

    private final JdbcTemplate jdbcTemplate;

    public OrderRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ShopOrder> findAllByUser(long userId) {
        return jdbcTemplate.query(
                SELECT_ORDER_COLUMNS + " WHERE user_id = ? ORDER BY ordered_at DESC, id DESC",
                this::mapOrder,
                userId);
    }

    public List<ShopOrder> findAllForAdmin(OrderStatus status) {
        if (status == null) {
            return jdbcTemplate.query(
                    SELECT_ORDER_COLUMNS + " ORDER BY ordered_at DESC, id DESC",
                    this::mapOrder);
        }
        return jdbcTemplate.query(
                SELECT_ORDER_COLUMNS + " WHERE status = ? ORDER BY ordered_at DESC, id DESC",
                this::mapOrder,
                status.name());
    }

    public Optional<ShopOrder> findByIdForAdmin(long orderId) {
        return jdbcTemplate.query(
                        SELECT_ORDER_COLUMNS + " WHERE id = ?",
                        this::mapOrder,
                        orderId)
                .stream()
                .findFirst();
    }

    public Optional<ShopOrder> findByIdForAdminForUpdate(long orderId) {
        return jdbcTemplate.query(
                        SELECT_ORDER_COLUMNS + " WHERE id = ? FOR UPDATE",
                        this::mapOrder,
                        orderId)
                .stream()
                .findFirst();
    }

    public Optional<ShopOrder> findByIdAndUser(long orderId, long userId) {
        return jdbcTemplate.query(
                        SELECT_ORDER_COLUMNS + " WHERE id = ? AND user_id = ?",
                        this::mapOrder,
                        orderId,
                        userId)
                .stream()
                .findFirst();
    }

    public Optional<ShopOrder> findByOrderNumberAndUser(String orderNumber, long userId) {
        return jdbcTemplate.query(
                        SELECT_ORDER_COLUMNS + " WHERE order_number = ? AND user_id = ?",
                        this::mapOrder,
                        orderNumber,
                        userId)
                .stream()
                .findFirst();
    }

    public Optional<ShopOrder> findByIdAndUserForUpdate(long orderId, long userId) {
        return jdbcTemplate.query(
                        SELECT_ORDER_COLUMNS + " WHERE id = ? AND user_id = ? FOR UPDATE",
                        this::mapOrder,
                        orderId,
                        userId)
                .stream()
                .findFirst();
    }

    public List<ShopOrderItem> findItems(long orderId) {
        return jdbcTemplate.query(
                SELECT_ITEM_COLUMNS + " WHERE order_id = ? ORDER BY id",
                this::mapItem,
                orderId);
    }

    public ShopOrder create(
            String orderNumber,
            long userId,
            int totalQuantity,
            long totalPrice,
            String recipientName,
            String recipientPhone,
            String postalCode,
            String address,
            String addressDetail,
            Instant orderedAt) {
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO shop_order (
                        order_number, user_id, status, total_quantity, total_price,
                        recipient_name, recipient_phone, postal_code, address, address_detail,
                        ordered_at, updated_at
                    ) VALUES (?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    new String[]{"id"});
            statement.setString(1, orderNumber);
            statement.setLong(2, userId);
            statement.setInt(3, totalQuantity);
            statement.setLong(4, totalPrice);
            statement.setString(5, recipientName);
            statement.setString(6, recipientPhone);
            statement.setString(7, postalCode);
            statement.setString(8, address);
            statement.setString(9, addressDetail);
            statement.setTimestamp(10, Timestamp.from(orderedAt));
            statement.setTimestamp(11, Timestamp.from(orderedAt));
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Created order id could not be loaded");
        }
        return findByIdAndUser(key.longValue(), userId)
                .orElseThrow(() -> new IllegalStateException("Created order could not be loaded"));
    }

    public void saveItems(long orderId, List<OrderItemSnapshot> items) {
        jdbcTemplate.batchUpdate(
                """
                INSERT INTO shop_order_item (
                    order_id, product_id, category, product_name, product_emoji,
                    product_description, original_unit_price, discount_rate,
                    unit_price, quantity, subtotal,
                    package_quantity, package_unit, sub_category
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                items,
                items.size(),
                (statement, item) -> {
                    statement.setLong(1, orderId);
                    statement.setString(2, item.productId());
                    statement.setString(3, item.category());
                    statement.setString(4, item.productName());
                    statement.setString(5, item.productEmoji());
                    statement.setString(6, item.productDescription());
                    statement.setInt(7, item.originalUnitPrice());
                    statement.setInt(8, item.discountRate());
                    statement.setInt(9, item.unitPrice());
                    statement.setInt(10, item.quantity());
                    statement.setLong(11, item.subtotal());
                    statement.setBigDecimal(12, item.packageQuantity());
                    statement.setString(13, item.packageUnit());
                    statement.setString(14, item.subCategory());
                });
    }

    public int cancel(long orderId, long userId, Instant cancelledAt) {
        Timestamp timestamp = Timestamp.from(cancelledAt);
        return jdbcTemplate.update(
                """
                UPDATE shop_order
                SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
                WHERE id = ? AND user_id = ? AND status = 'PENDING'
                """,
                timestamp,
                timestamp,
                orderId,
                userId);
    }

    public int markPaid(long orderId, long userId, Instant paidAt) {
        return jdbcTemplate.update(
                """
                UPDATE shop_order
                SET status = 'PAID', updated_at = ?
                WHERE id = ? AND user_id = ? AND status = 'PENDING'
                """,
                Timestamp.from(paidAt),
                orderId,
                userId);
    }

    public int cancelPaid(long orderId, long userId, Instant cancelledAt) {
        Timestamp timestamp = Timestamp.from(cancelledAt);
        return jdbcTemplate.update(
                """
                UPDATE shop_order
                SET status = 'CANCELLED', cancelled_at = ?, updated_at = ?
                WHERE id = ? AND user_id = ? AND status = 'PAID'
                """,
                timestamp,
                timestamp,
                orderId,
                userId);
    }

    public int updateStatus(
            long orderId,
            OrderStatus currentStatus,
            OrderStatus nextStatus,
            Instant updatedAt) {
        return jdbcTemplate.update(
                """
                UPDATE shop_order
                SET status = ?, updated_at = ?
                WHERE id = ? AND status = ?
                """,
                nextStatus.name(),
                Timestamp.from(updatedAt),
                orderId,
                currentStatus.name());
    }

    private ShopOrder mapOrder(ResultSet resultSet, int rowNumber) throws SQLException {
        Timestamp cancelledAt = resultSet.getTimestamp("cancelled_at");
        return new ShopOrder(
                resultSet.getLong("id"),
                resultSet.getString("order_number"),
                resultSet.getLong("user_id"),
                OrderStatus.valueOf(resultSet.getString("status")),
                resultSet.getInt("total_quantity"),
                resultSet.getLong("total_price"),
                resultSet.getString("recipient_name"),
                resultSet.getString("recipient_phone"),
                resultSet.getString("postal_code"),
                resultSet.getString("address"),
                resultSet.getString("address_detail"),
                resultSet.getTimestamp("ordered_at").toInstant(),
                resultSet.getTimestamp("updated_at").toInstant(),
                cancelledAt == null ? null : cancelledAt.toInstant());
    }

    private ShopOrderItem mapItem(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ShopOrderItem(
                resultSet.getLong("id"),
                resultSet.getLong("order_id"),
                resultSet.getString("product_id"),
                resultSet.getString("category"),
                resultSet.getString("product_name"),
                resultSet.getString("product_emoji"),
                resultSet.getString("product_description"),
                resultSet.getInt("original_unit_price"),
                resultSet.getInt("discount_rate"),
                resultSet.getInt("unit_price"),
                resultSet.getInt("quantity"),
                resultSet.getLong("subtotal"),
                resultSet.getBigDecimal("package_quantity"),
                resultSet.getString("package_unit"),
                resultSet.getString("sub_category"));
    }
}
