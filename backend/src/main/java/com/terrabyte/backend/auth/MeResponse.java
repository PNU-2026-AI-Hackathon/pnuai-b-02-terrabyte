package com.terrabyte.backend.auth;

import com.fasterxml.jackson.annotation.JsonInclude;

public record MeResponse(
        UserResponse user,
        boolean hasDevice,
        boolean hasCrop,
        @JsonInclude(JsonInclude.Include.NON_NULL) Object device) {
}
