package com.terrabyte.backend.device;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.CultivationSpaceResponse;

public record DeviceResponse(
        long id,
        String serialCode,
        DeviceStatus status,
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant lastSeenAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) CultivationSpaceResponse space) {

    public static DeviceResponse from(Device device) {
        return from(device, null);
    }

    public static DeviceResponse from(Device device, CultivationSpace space) {
        return new DeviceResponse(
                device.id(),
                device.serialCode(),
                device.status(),
                device.lastSeenAt(),
                space == null ? null : CultivationSpaceResponse.from(space));
    }
}
