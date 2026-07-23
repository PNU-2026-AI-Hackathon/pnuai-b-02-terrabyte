package com.terrabyte.backend.crop;

import java.time.Instant;

public record Crop(
        String code,
        String name,
        String emoji,
        String description,
        int displayOrder,
        boolean active,
        Instant createdAt) {
}
