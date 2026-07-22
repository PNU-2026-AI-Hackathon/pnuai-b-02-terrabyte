package com.terrabyte.backend.auth;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.terrabyte.backend.device.DeviceResponse;

public record MeResponse(
        UserResponse user,
        boolean hasDevice,
        boolean hasCrop,
        @JsonInclude(JsonInclude.Include.NON_NULL) DeviceResponse device) {
}
