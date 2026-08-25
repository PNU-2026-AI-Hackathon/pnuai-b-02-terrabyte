package com.terrabyte.backend.space;

import java.math.BigDecimal;
import java.time.Instant;

public record CultivationSpace(
        long id,
        long userId,
        String name,
        String spaceType,
        BigDecimal areaSquareMeters,
        // NULL 은 "모름 또는 미설정". space_type 으로 추정한다.
        LightSource lightSource,
        Instant createdAt) {
}
