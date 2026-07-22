package com.terrabyte.backend.auth;

import java.sql.PreparedStatement;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

@Repository
public class UserAccountRepository {

    private static final String SELECT_COLUMNS =
            "SELECT id, email, password_hash, nickname, created_at FROM app_user";

    private final JdbcTemplate jdbcTemplate;

    public UserAccountRepository(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean existsByEmail(String email) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM app_user WHERE email = ?",
                Integer.class,
                email);
        return count != null && count > 0;
    }

    public Optional<UserAccount> findByEmail(String email) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE email = ?",
                        this::mapUser,
                        email)
                .stream()
                .findFirst();
    }

    public Optional<UserAccount> findById(long id) {
        return jdbcTemplate.query(
                        SELECT_COLUMNS + " WHERE id = ?",
                        this::mapUser,
                        id)
                .stream()
                .findFirst();
    }

    public UserAccount save(String email, String passwordHash, String nickname) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(
                    "INSERT INTO app_user (email, password_hash, nickname) VALUES (?, ?, ?)",
                    new String[]{"id"});
            statement.setString(1, email);
            statement.setString(2, passwordHash);
            statement.setString(3, nickname);
            return statement;
        }, keyHolder);

        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("Failed to read generated user id");
        }
        return findById(key.longValue())
                .orElseThrow(() -> new IllegalStateException("Created user could not be loaded"));
    }

    private UserAccount mapUser(java.sql.ResultSet resultSet, int rowNumber)
            throws java.sql.SQLException {
        return new UserAccount(
                resultSet.getLong("id"),
                resultSet.getString("email"),
                resultSet.getString("password_hash"),
                resultSet.getString("nickname"),
                resultSet.getTimestamp("created_at").toInstant());
    }
}
