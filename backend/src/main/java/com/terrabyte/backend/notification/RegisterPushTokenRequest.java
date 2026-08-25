package com.terrabyte.backend.notification;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RegisterPushTokenRequest(
        @NotBlank @Size(max = 2048) String token,
        @NotNull PushPlatform platform,
        @Size(max = 2048) String previousToken) {

    public RegisterPushTokenRequest(String token, PushPlatform platform) {
        this(token, platform, null);
    }
}
