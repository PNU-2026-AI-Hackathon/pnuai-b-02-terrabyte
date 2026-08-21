package com.terrabyte.backend.shop;

import java.math.BigDecimal;
import java.time.Instant;

public record ShopProduct(
        String id,
        String category,
        String name,
        String emoji,
        String description,
        int price,
        int discountRate,
        String badge,
        int stockQuantity,
        String status,
        String imageUrl,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory,
        int displayOrder,
        Instant createdAt,
        Instant updatedAt) {
}
