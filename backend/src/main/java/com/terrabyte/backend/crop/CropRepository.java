package com.terrabyte.backend.crop;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CropRepository {

    private static final String SELECT_COLUMNS = """
            SELECT code, name_ko, emoji, description, display_order, active, created_at
            FROM crop
            """;

    private final JdbcTemplate jdbcTemplate;

    public CropRepository(@Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Crop> findActive(String query) {
        if (query == null || query.isBlank()) {
            return jdbcTemplate.query(
                    SELECT_COLUMNS + " WHERE active = TRUE ORDER BY display_order",
                    this::mapCrop);
        }

        String pattern = "%" + query.trim().toLowerCase(Locale.ROOT) + "%";
        return jdbcTemplate.query(
                SELECT_COLUMNS + """
                         WHERE active = TRUE
                           AND (LOWER(code) LIKE ? OR LOWER(name_ko) LIKE ?)
                         ORDER BY display_order
                        """,
                this::mapCrop,
                pattern,
                pattern);
    }

    public Optional<Crop> findActiveByCode(String code) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE code = ? AND active = TRUE",
                        this::mapCrop,
                        code)
                .stream()
                .findFirst();
    }

    private Crop mapCrop(ResultSet resultSet, int rowNumber) throws SQLException {
        return new Crop(
                resultSet.getString("code"),
                resultSet.getString("name_ko"),
                resultSet.getString("emoji"),
                resultSet.getString("description"),
                resultSet.getInt("display_order"),
                resultSet.getBoolean("active"),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
