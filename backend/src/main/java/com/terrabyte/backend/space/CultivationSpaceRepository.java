package com.terrabyte.backend.space;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class CultivationSpaceRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, user_id, device_id, name, space_type, area_m2, created_at
            FROM cultivation_space
            """;

    private final JdbcTemplate jdbcTemplate;

    public CultivationSpaceRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<CultivationSpace> findByUserId(long userId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE user_id = ?",
                        this::mapSpace,
                        userId)
                .stream()
                .findFirst();
    }

    public CultivationSpace save(
            long userId,
            long deviceId,
            String name,
            String spaceType,
            BigDecimal areaSquareMeters) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO cultivation_space (user_id, device_id, name, space_type, area_m2)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    new String[]{"id"});
            statement.setLong(1, userId);
            statement.setLong(2, deviceId);
            statement.setString(3, name);
            statement.setString(4, spaceType);
            statement.setBigDecimal(5, areaSquareMeters);
            return statement;
        }, keyHolder);

        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to read generated cultivation space id");
        }
        return findByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("Created cultivation space could not be loaded"));
    }

    private CultivationSpace mapSpace(ResultSet resultSet, int rowNumber) throws SQLException {
        return new CultivationSpace(
                resultSet.getLong("id"),
                resultSet.getLong("user_id"),
                resultSet.getLong("device_id"),
                resultSet.getString("name"),
                resultSet.getString("space_type"),
                resultSet.getBigDecimal("area_m2"),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
