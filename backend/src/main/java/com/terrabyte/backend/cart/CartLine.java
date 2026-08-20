package com.terrabyte.backend.cart;

import java.math.BigDecimal;

public record CartLine(
        String productId,
        String category,
        String name,
        String emoji,
        String description,
        int price,
        String badge,
        int quantity,
        int stockQuantity,
        String status,
        String imageUrl,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory) {
}
