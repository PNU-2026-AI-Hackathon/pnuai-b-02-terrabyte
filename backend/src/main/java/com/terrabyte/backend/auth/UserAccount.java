package com.terrabyte.backend.auth;

import java.time.Instant;

public record UserAccount(
        long id,
        String email,
        String passwordHash,
        String nickname,
        Instant createdAt) {
}
