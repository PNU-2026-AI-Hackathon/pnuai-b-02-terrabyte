package com.terrabyte.backend.space;

import java.math.BigDecimal;

import com.fasterxml.jackson.annotation.JsonInclude;

public record CultivationSpaceResponse(
        long id,
        String name,
        String spaceType,
        BigDecimal areaSquareMeters,
        @JsonInclude(JsonInclude.Include.NON_NULL) LightSource lightSource) {

    public static CultivationSpaceResponse from(CultivationSpace space) {
        return new CultivationSpaceResponse(
                space.id(),
                space.name(),
                space.spaceType(),
                space.areaSquareMeters(),
                space.lightSource());
    }
}
