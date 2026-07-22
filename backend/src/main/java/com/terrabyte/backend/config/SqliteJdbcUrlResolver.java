package com.terrabyte.backend.config;

import java.nio.file.Files;
import java.nio.file.Path;

final class SqliteJdbcUrlResolver {

    private static final String PREFIX = "jdbc:sqlite:";

    private SqliteJdbcUrlResolver() {
    }

    static String resolve(String url, Path workingDirectory) {
        if (url == null || !url.startsWith(PREFIX)) {
            return url;
        }

        String configuredPath = url.substring(PREFIX.length());
        if (configuredPath.startsWith(":") || configuredPath.startsWith("file:")) {
            return url;
        }

        Path path = Path.of(configuredPath);
        if (path.isAbsolute()) {
            return url;
        }

        Path directCandidate = workingDirectory.resolve(path).normalize();
        if (parentExists(directCandidate)) {
            return PREFIX + directCandidate;
        }

        Path backendCandidate = workingDirectory.resolve("backend").resolve(path).normalize();
        if (parentExists(backendCandidate)) {
            return PREFIX + backendCandidate;
        }

        return PREFIX + directCandidate;
    }

    private static boolean parentExists(Path path) {
        Path parent = path.getParent();
        return parent != null && Files.isDirectory(parent);
    }
}
