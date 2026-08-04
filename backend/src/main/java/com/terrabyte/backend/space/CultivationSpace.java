package com.terrabyte.backend.space;

import java.math.BigDecimal;
import java.time.Instant;

public record CultivationSpace(
        long id,
        long userId,
        String name,
        String spaceType,
        BigDecimal areaSquareMeters,
        Instant createdAt) {
}
