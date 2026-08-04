package com.terrabyte.backend.space;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class CultivationSpaceRepository {

    private static final String SELECT_COLUMNS = """
            SELECT id, user_id, name, space_type, area_m2, created_at
            FROM cultivation_space
            """;

    private final JdbcTemplate jdbcTemplate;

    public CultivationSpaceRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Optional<CultivationSpace> findByUserId(long userId) {
        return findAllByUserId(userId).stream().findFirst();
    }

    public Optional<CultivationSpace> findByIdAndUserId(long spaceId, long userId) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ? AND user_id = ?",
                        this::mapSpace,
                        spaceId,
                        userId)
                .stream()
                .findFirst();
    }

    public List<CultivationSpace> findAllByUserId(long userId) {
        return jdbcTemplate.query(
                SELECT_COLUMNS + " WHERE user_id = ? ORDER BY id", this::mapSpace, userId);
    }

    public CultivationSpace save(
            long userId,
            String name,
            String spaceType,
            BigDecimal areaSquareMeters) {
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    """
                    INSERT INTO cultivation_space (user_id, name, space_type, area_m2)
                    VALUES (?, ?, ?, ?)
                    """,
                    new String[]{"id"});
            statement.setLong(1, userId);
            statement.setString(2, name);
            statement.setString(3, spaceType);
            statement.setBigDecimal(4, areaSquareMeters);
            return statement;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to read generated cultivation space id");
        }
        return findByIdAndUserId(key.longValue(), userId)
                .orElseThrow(() -> new IllegalStateException(
                        "Created cultivation space could not be loaded"));
    }

    private CultivationSpace mapSpace(ResultSet resultSet, int rowNumber) throws SQLException {
        return new CultivationSpace(
                resultSet.getLong("id"),
                resultSet.getLong("user_id"),
                resultSet.getString("name"),
                resultSet.getString("space_type"),
                resultSet.getBigDecimal("area_m2"),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
