package com.terrabyte.backend.shop;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ShopCatalogRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, category, name, emoji, description, price, discount_rate, badge,
                   stock_quantity, status, image_url, package_quantity, package_unit,
                   sub_category,
                   display_order, created_at, updated_at
            FROM product
            """;

    private final JdbcTemplate jdbcTemplate;

    public ShopCatalogRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ShopProduct> findActive(
            String category, String subCategory, String query, boolean recommendedOnly) {
        StringBuilder sql = new StringBuilder(SELECT_COLUMNS).append(" WHERE status = 'ACTIVE'");
        List<Object> parameters = new ArrayList<>();

        if (category != null && !category.isBlank()) {
            sql.append(" AND category = ?");
            parameters.add(category.trim().toLowerCase(Locale.ROOT));
        }
        if (subCategory != null && !subCategory.isBlank()) {
            sql.append(" AND sub_category = ?");
            parameters.add(subCategory.trim().toUpperCase(Locale.ROOT));
        }
        if (query != null && !query.isBlank()) {
            sql.append(" AND (LOWER(id) LIKE ? OR LOWER(name) LIKE ? OR LOWER(description) LIKE ?)");
            String pattern = "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
            parameters.add(pattern);
            parameters.add(pattern);
            parameters.add(pattern);
        }
        if (recommendedOnly) {
            sql.append(" AND badge LIKE ?");
            parameters.add("%추천%");
        }

        sql.append(" ORDER BY display_order");
        return jdbcTemplate.query(sql.toString(), this::mapProduct, parameters.toArray());
    }

    public Optional<ShopProduct> findActiveById(String id) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ? AND status = 'ACTIVE'",
                        this::mapProduct,
                        id)
                .stream()
                .findFirst();
    }

    public List<ShopProduct> findAllForAdmin() {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " ORDER BY display_order",
                this::mapProduct);
    }

    public Optional<ShopProduct> findById(String id) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ?",
                        this::mapProduct,
                        id)
                .stream()
                .findFirst();
    }

    public void create(ShopProduct product) {
        jdbcTemplate.update(
                """
                INSERT INTO product (
                    id, category, name, emoji, description, price, discount_rate, badge,
                    stock_quantity, status, image_url, package_quantity, package_unit,
                    sub_category, display_order, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                product.id(),
                product.category(),
                product.name(),
                product.emoji(),
                product.description(),
                product.price(),
                product.discountRate(),
                product.badge(),
                product.stockQuantity(),
                product.status(),
                product.imageUrl(),
                product.packageQuantity(),
                product.packageUnit(),
                product.subCategory(),
                product.displayOrder(),
                Timestamp.from(product.createdAt()),
                Timestamp.from(product.updatedAt()));
    }

    public int update(ShopProduct product) {
        return jdbcTemplate.update(
                """
                UPDATE product
                SET category = ?, name = ?, emoji = ?, description = ?, price = ?,
                    discount_rate = ?, badge = ?, status = ?, image_url = ?, package_quantity = ?,
                    package_unit = ?, sub_category = ?, display_order = ?, updated_at = ?
                WHERE id = ?
                """,
                product.category(),
                product.name(),
                product.emoji(),
                product.description(),
                product.price(),
                product.discountRate(),
                product.badge(),
                product.status(),
                product.imageUrl(),
                product.packageQuantity(),
                product.packageUnit(),
                product.subCategory(),
                product.displayOrder(),
                Timestamp.from(product.updatedAt()),
                product.id());
    }

    public int setStock(String productId, int stockQuantity, Instant updatedAt) {
        return jdbcTemplate.update(
                """
                UPDATE product
                SET stock_quantity = ?, updated_at = ?
                WHERE id = ?
                """,
                stockQuantity,
                Timestamp.from(updatedAt),
                productId);
    }

    public int decreaseStock(String productId, int quantity) {
        return jdbcTemplate.update(
                """
                UPDATE product
                SET stock_quantity = stock_quantity - ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'ACTIVE' AND stock_quantity >= ?
                """,
                quantity,
                productId,
                quantity);
    }

    public void increaseStock(String productId, int quantity) {
        jdbcTemplate.update(
                """
                UPDATE product
                SET stock_quantity = stock_quantity + ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                quantity,
                productId);
    }

    private ShopProduct mapProduct(ResultSet resultSet, int rowNumber) throws SQLException {
        return new ShopProduct(
                resultSet.getString("id"),
                resultSet.getString("category"),
                resultSet.getString("name"),
                resultSet.getString("emoji"),
                resultSet.getString("description"),
                resultSet.getInt("price"),
                resultSet.getInt("discount_rate"),
                resultSet.getString("badge"),
                resultSet.getInt("stock_quantity"),
                resultSet.getString("status"),
                resultSet.getString("image_url"),
                resultSet.getBigDecimal("package_quantity"),
                resultSet.getString("package_unit"),
                resultSet.getString("sub_category"),
                resultSet.getInt("display_order"),
                resultSet.getTimestamp("created_at").toInstant(),
                resultSet.getTimestamp("updated_at").toInstant());
    }
}
