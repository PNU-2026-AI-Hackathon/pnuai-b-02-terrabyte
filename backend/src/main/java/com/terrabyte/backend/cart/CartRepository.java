package com.terrabyte.backend.cart;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CartRepository {

    private static final String SELECT_CART_LINES = """
            SELECT ci.product_id, p.category, p.name, p.emoji, p.description,
                   p.price, p.discount_rate, p.badge,
                   ci.quantity, p.stock_quantity, p.status, p.image_url,
                   p.package_quantity, p.package_unit, p.sub_category
            FROM cart c
            JOIN cart_item ci ON ci.cart_id = c.id
            JOIN product p ON p.id = ci.product_id
            WHERE c.user_id = ?
            ORDER BY ci.created_at, p.display_order
            """;

    private final JdbcTemplate jdbcTemplate;

    public CartRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<CartLine> findLines(long userId) {
        return jdbcTemplate.query(SELECT_CART_LINES, this::mapLine, userId);
    }

    public List<CartLine> findLinesForUpdate(long userId) {
        Optional<Long> cartId = findCartId(userId);
        if (cartId.isEmpty()) {
            return List.of();
        }
        lockCart(cartId.get());
        return jdbcTemplate.query(
                SELECT_CART_LINES + " FOR UPDATE",
                this::mapLine,
                userId);
    }

    public Optional<Integer> findItemQuantity(long userId, String productId) {
        return jdbcTemplate.query(
                        """
                        SELECT ci.quantity
                        FROM cart c
                        JOIN cart_item ci ON ci.cart_id = c.id
                        WHERE c.user_id = ? AND ci.product_id = ?
                        """,
                        (resultSet, rowNumber) -> resultSet.getInt("quantity"),
                        userId,
                        productId)
                .stream()
                .findFirst();
    }

    public void saveItemQuantity(long userId, String productId, int quantity) {
        long cartId = findOrCreateCartId(userId);
        lockCart(cartId);
        int updated = jdbcTemplate.update(
                "UPDATE cart_item SET quantity = ?, updated_at = CURRENT_TIMESTAMP"
                        + " WHERE cart_id = ? AND product_id = ?",
                quantity,
                cartId,
                productId);
        if (updated == 0) {
            jdbcTemplate.update(
                    "INSERT INTO cart_item (cart_id, product_id, quantity) VALUES (?, ?, ?)",
                    cartId,
                    productId,
                    quantity);
        }
        touchCart(cartId);
    }

    public void deleteItem(long userId, String productId) {
        findCartId(userId).ifPresent(cartId -> {
            lockCart(cartId);
            jdbcTemplate.update(
                    "DELETE FROM cart_item WHERE cart_id = ? AND product_id = ?",
                    cartId,
                    productId);
            touchCart(cartId);
        });
    }

    public void clear(long userId) {
        findCartId(userId).ifPresent(cartId -> {
            lockCart(cartId);
            jdbcTemplate.update("DELETE FROM cart_item WHERE cart_id = ?", cartId);
            touchCart(cartId);
        });
    }

    private long findOrCreateCartId(long userId) {
        Optional<Long> existingCartId = findCartId(userId);
        if (existingCartId.isPresent()) {
            return existingCartId.get();
        }
        jdbcTemplate.queryForObject(
                "SELECT id FROM app_user WHERE id = ? FOR UPDATE",
                Long.class,
                userId);
        existingCartId = findCartId(userId);
        if (existingCartId.isPresent()) {
            return existingCartId.get();
        }
        jdbcTemplate.update("INSERT INTO cart (user_id) VALUES (?)", userId);
        return findCartId(userId)
                .orElseThrow(() -> new IllegalStateException("Created cart id could not be loaded"));
    }

    private void lockCart(long cartId) {
        jdbcTemplate.queryForObject(
                "SELECT id FROM cart WHERE id = ? FOR UPDATE",
                Long.class,
                cartId);
    }

    private Optional<Long> findCartId(long userId) {
        return jdbcTemplate.query(
                        "SELECT id FROM cart WHERE user_id = ?",
                        (resultSet, rowNumber) -> resultSet.getLong("id"),
                        userId)
                .stream()
                .findFirst();
    }

    private void touchCart(long cartId) {
        jdbcTemplate.update(
                "UPDATE cart SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                cartId);
    }

    private CartLine mapLine(ResultSet resultSet, int rowNumber) throws SQLException {
        BigDecimal packageQuantity = resultSet.getBigDecimal("package_quantity");
        return new CartLine(
                resultSet.getString("product_id"),
                resultSet.getString("category"),
                resultSet.getString("name"),
                resultSet.getString("emoji"),
                resultSet.getString("description"),
                resultSet.getInt("price"),
                resultSet.getInt("discount_rate"),
                resultSet.getString("badge"),
                resultSet.getInt("quantity"),
                resultSet.getInt("stock_quantity"),
                resultSet.getString("status"),
                resultSet.getString("image_url"),
                packageQuantity,
                resultSet.getString("package_unit"),
                resultSet.getString("sub_category"));
    }
}
