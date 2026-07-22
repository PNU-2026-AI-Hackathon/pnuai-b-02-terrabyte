package com.terrabyte.backend.space;

import java.math.BigDecimal;

public record CultivationSpaceResponse(
        long id,
        String name,
        String spaceType,
        BigDecimal areaSquareMeters) {

    public static CultivationSpaceResponse from(CultivationSpace space) {
        return new CultivationSpaceResponse(
                space.id(),
                space.name(),
                space.spaceType(),
                space.areaSquareMeters());
    }
}
