package com.terrabyte.backend.auth;

import java.time.Instant;

public record UserResponse(long id, String email, String nickname, Instant createdAt) {

    public static UserResponse from(UserAccount user) {
        return new UserResponse(user.id(), user.email(), user.nickname(), user.createdAt());
    }
}
