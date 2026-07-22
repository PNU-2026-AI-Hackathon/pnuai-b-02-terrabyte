package com.terrabyte.backend.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class SqliteJdbcUrlResolverTests {

    @TempDir
    Path temporaryDirectory;

    @Test
    void resolvesFromTheBackendWorkingDirectory() throws Exception {
        Path backendDirectory = Files.createDirectory(temporaryDirectory.resolve("backend"));
        Files.createDirectory(backendDirectory.resolve("db"));

        String resolved = SqliteJdbcUrlResolver.resolve(
                "jdbc:sqlite:./db/terrabyte-score.db",
                backendDirectory);

        assertThat(resolved).isEqualTo(
                "jdbc:sqlite:" + backendDirectory.resolve("db/terrabyte-score.db"));
    }

    @Test
    void resolvesFromTheRepositoryRootWorkingDirectory() throws Exception {
        Path backendDirectory = Files.createDirectory(temporaryDirectory.resolve("backend"));
        Files.createDirectory(backendDirectory.resolve("db"));

        String resolved = SqliteJdbcUrlResolver.resolve(
                "jdbc:sqlite:./db/terrabyte-score.db",
                temporaryDirectory);

        assertThat(resolved).isEqualTo(
                "jdbc:sqlite:" + backendDirectory.resolve("db/terrabyte-score.db"));
    }

    @Test
    void leavesMemoryAndAbsoluteUrlsUnchanged() {
        assertThat(SqliteJdbcUrlResolver.resolve("jdbc:sqlite::memory:", temporaryDirectory))
                .isEqualTo("jdbc:sqlite::memory:");
        assertThat(SqliteJdbcUrlResolver.resolve(
                "jdbc:sqlite:" + temporaryDirectory.resolve("score.db"),
                temporaryDirectory))
                .isEqualTo("jdbc:sqlite:" + temporaryDirectory.resolve("score.db"));
    }
}
