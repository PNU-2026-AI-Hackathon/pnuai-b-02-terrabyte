package com.terrabyte.backend.device;

import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.terrabyte.backend.pot.Pot;
import com.terrabyte.backend.pot.PotResponse;
import com.terrabyte.backend.space.CultivationSpace;
import com.terrabyte.backend.space.CultivationSpaceResponse;

public record DeviceResponse(
        long id,
        String serialCode,
        DeviceStatus status,
        @JsonInclude(JsonInclude.Include.NON_NULL) String cropCode,
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant lastSeenAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) CultivationSpaceResponse space,
        @JsonInclude(JsonInclude.Include.NON_EMPTY) List<PotResponse> pots) {

    public static DeviceResponse from(Device device) {
        return from(device, null, List.of());
    }

    public static DeviceResponse from(Device device, CultivationSpace space) {
        return from(device, space, List.of());
    }

    public static DeviceResponse from(Device device, CultivationSpace space, List<Pot> pots) {
        String cropCode = pots.isEmpty() ? null : pots.get(0).cropCode();
        return new DeviceResponse(
                device.id(),
                device.serialCode(),
                device.status(),
                cropCode,
                device.lastSeenAt(),
                space == null ? null : CultivationSpaceResponse.from(space),
                pots.stream().map(PotResponse::from).toList());
    }
}
