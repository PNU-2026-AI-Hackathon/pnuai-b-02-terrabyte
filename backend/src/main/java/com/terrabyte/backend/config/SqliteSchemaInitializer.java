package com.terrabyte.backend.config;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteConnection;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

/**
 * 애플리케이션 시작 시 SQLite 점수 DB의 스키마와 마이그레이션을
 * 자동으로 적용합니다.
 *
 * <ul>
 *   <li>빈 DB → {@code schema.sql} 전체 실행</li>
 *   <li>과거 bootstrap DB(기본 3개 테이블) → 전체 스키마 보완</li>
 *   <li>지원되는 기존 DB → 마이그레이션 스크립트 멱등 실행</li>
 *   <li>그 밖의 불완전한 DB → 데이터 손실 방지를 위해 기동 실패</li>
 * </ul>
 *
 * SQL 파일은 Gradle {@code prepareSqliteResources} 태스크가 빌드 시
 * classpath {@code db/sqlite/} 아래에 복사합니다.
 */
@Configuration(proxyBeanMethods = false)
class SqliteSchemaInitializer {

    private static final Logger log = LoggerFactory.getLogger(SqliteSchemaInitializer.class);

    private static final String SCHEMA_RESOURCE = "db/sqlite/schema.sql";

    /**
     * These tables existed before the two migrations below were introduced.
     * A database containing all of them can safely be upgraded in place. A
     * database containing only a subset is neither a new database nor a
     * supported historical version, so applying migrations to it would hide
     * corruption and fail later when a score is requested.
     */
    private static final Set<String> BASE_SCHEMA_TABLES = Set.of(
            "axis_catalog",
            "evaluation_state_catalog",
            "evidence_document",
            "crop_score_profile",
            "crop_score_profile_activation",
            "site",
            "crop_context",
            "crop_environment_observation"
    );

    /**
     * Early development builds created only this bootstrap layer. It is safe
     * to keep its immutable evidence data and add the rest of schema.sql.
     */
    private static final Set<String> LEGACY_BOOTSTRAP_TABLES = Set.of(
            "axis_catalog",
            "evaluation_state_catalog",
            "evidence_document"
    );

    private static final Set<String> CURRENT_SCHEMA_TABLES = Set.of(
            "crop_score_model_config"
    );

    /**
     * 마이그레이션 스크립트 목록. 파일 이름순으로 정렬되어야 합니다.
     * schema.sql에 이미 반영된 내용이더라도 IF NOT EXISTS / INSERT OR IGNORE로
     * 작성되어 있어 반복 실행해도 안전합니다.
     */
    private static final List<String> MIGRATION_RESOURCES = List.of(
            "db/sqlite/migrations/2026-07-25_score_profiles_v2.sql",
            "db/sqlite/migrations/2026-07-25_score_model_config_v1.sql",
            "db/sqlite/migrations/2026-08-25_rename_arugula_to_rucola.sql"
    );

    private final DataSource scoreDataSource;

    SqliteSchemaInitializer(@Qualifier("scoreDataSource") DataSource scoreDataSource) {
        this.scoreDataSource = scoreDataSource;
    }

    @EventListener(ApplicationReadyEvent.class)
    void initializeSchema() {
        SchemaState state = schemaState();
        switch (state) {
            case EMPTY -> {
                log.info("SQLite score DB is empty — applying full schema");
                executeSqlFromClasspath(SCHEMA_RESOURCE);
            }
            case LEGACY_BOOTSTRAP -> {
                log.info("SQLite score DB has the legacy bootstrap layer — completing full schema");
                executeSqlFromClasspath(SCHEMA_RESOURCE);
            }
            case BASE -> {
                log.info("SQLite score DB base schema is present — applying migrations");
                runMigrations();
            }
            case CURRENT -> {
                log.info("SQLite score DB schema is current — verifying migrations");
                runMigrations();
            }
            case PARTIAL -> throw new IllegalStateException(
                    "SQLite score DB is incomplete. Back up the file and restore a complete database "
                            + "or replace it with an empty file so the application can initialize it.");
        }

        verifyCurrentSchema();
        log.info("SQLite score DB schema is ready");
    }

    private SchemaState schemaState() {
        try (Connection conn = scoreDataSource.getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT name FROM sqlite_master WHERE type='table'")) {
            Set<String> tables = new HashSet<>();
            while (rs.next()) {
                tables.add(rs.getString(1));
            }

            if (tables.isEmpty()) {
                return SchemaState.EMPTY;
            }
            if (tables.equals(LEGACY_BOOTSTRAP_TABLES)) {
                return SchemaState.LEGACY_BOOTSTRAP;
            }
            if (!tables.containsAll(BASE_SCHEMA_TABLES)) {
                return SchemaState.PARTIAL;
            }
            if (tables.containsAll(CURRENT_SCHEMA_TABLES)) {
                return SchemaState.CURRENT;
            }
            return SchemaState.BASE;
        } catch (Exception e) {
            throw new IllegalStateException("Failed to inspect SQLite score DB schema", e);
        }
    }

    private void runMigrations() {
        for (String path : MIGRATION_RESOURCES) {
            executeSqlFromClasspath(path);
            log.debug("Applied migration: {}", path);
        }
    }

    private void verifyCurrentSchema() {
        try (Connection conn = scoreDataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            for (String table : BASE_SCHEMA_TABLES) {
                verifyObjectExists(stmt, "table", table);
            }
            for (String table : CURRENT_SCHEMA_TABLES) {
                verifyObjectExists(stmt, "table", table);
            }
            verifyObjectExists(stmt, "view", "crop_environment_score");
            verifyObjectExists(stmt, "view", "latest_crop_environment_score");
        } catch (Exception e) {
            throw new IllegalStateException("SQLite score DB schema verification failed", e);
        }
    }

    private void verifyObjectExists(Statement stmt, String type, String name) throws Exception {
        try (ResultSet rs = stmt.executeQuery(
                "SELECT count(*) FROM sqlite_master WHERE type='" + type + "' AND name='" + name + "'")) {
            if (!rs.next() || rs.getInt(1) == 0) {
                throw new IllegalStateException("Missing SQLite " + type + ": " + name);
            }
        }
    }

    /**
     * classpath의 SQL 파일을 읽어 한 번에 실행합니다.
     * <p>
     * SQLite의 native script executor에 전체 SQL을 넘깁니다. JDBC
     * {@link Statement#execute(String)}는 첫 문장만 실행하므로 전체 스키마
     * 초기화에 사용할 수 없습니다. native executor는 {@code CREATE TRIGGER}
     * 본문의 세미콜론도 SQLite 문법 그대로 처리합니다.
     */
    private void executeSqlFromClasspath(String classpathLocation) {
        Resource resource = new ClassPathResource(classpathLocation);
        if (!resource.exists()) {
            throw new IllegalStateException("SQL resource not found on classpath: " + classpathLocation);
        }
        try (Connection conn = scoreDataSource.getConnection()) {
            String sql = new String(
                    resource.getInputStream().readAllBytes(),
                    java.nio.charset.StandardCharsets.UTF_8);
            SQLiteConnection sqliteConnection = conn.unwrap(SQLiteConnection.class);
            int resultCode = sqliteConnection.getDatabase()._exec(sql);
            if (resultCode != 0) {
                throw new IllegalStateException(
                        "SQLite script failed with result code " + resultCode);
            }
        } catch (Exception e) {
            throw new RuntimeException(
                    "Failed to execute SQL from classpath: " + classpathLocation, e);
        }
    }

    private enum SchemaState {
        EMPTY,
        LEGACY_BOOTSTRAP,
        BASE,
        CURRENT,
        PARTIAL
    }
}
