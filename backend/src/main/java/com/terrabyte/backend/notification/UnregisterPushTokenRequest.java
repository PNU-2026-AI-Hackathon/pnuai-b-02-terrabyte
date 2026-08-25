package com.terrabyte.backend.notification;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UnregisterPushTokenRequest(@NotBlank @Size(max = 2048) String token) {
}
