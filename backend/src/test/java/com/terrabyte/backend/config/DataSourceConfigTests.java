package com.terrabyte.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class DataSourceConfigTests {

    private final JdbcTemplate postgresJdbcTemplate;
    private final JdbcTemplate scoreJdbcTemplate;

    @Autowired
    DataSourceConfigTests(
            @Qualifier("postgresJdbcTemplate") JdbcTemplate postgresJdbcTemplate,
            @Qualifier("scoreJdbcTemplate") JdbcTemplate scoreJdbcTemplate) {
        this.postgresJdbcTemplate = postgresJdbcTemplate;
        this.scoreJdbcTemplate = scoreJdbcTemplate;
    }

    @Test
    void connectsToBothConfiguredDataSources() {
        Integer postgresResult = postgresJdbcTemplate.queryForObject("select 1", Integer.class);
        Integer sqliteResult = scoreJdbcTemplate.queryForObject("select 1", Integer.class);

        assertThat(postgresResult).isEqualTo(1);
        assertThat(sqliteResult).isEqualTo(1);
    }

    @Test
    void sqliteSupportsThePowerFunctionUsedByTheGeometricScoreView() {
        Double result = scoreJdbcTemplate.queryForObject(
                "select round(pow(0.5, 1.0/3.0) * 100.0, 1)",
                Double.class);

        assertThat(result).isEqualTo(79.4);
    }
}
