package com.terrabyte.backend.cart;

import java.math.BigDecimal;

public record CartItemResponse(
        String productId,
        String category,
        String name,
        String emoji,
        String desc,
        int price,
        String badge,
        int quantity,
        long subtotal,
        int stockQuantity,
        String status,
        boolean available,
        String imageUrl,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory) {

    public static CartItemResponse from(CartLine line) {
        return new CartItemResponse(
                line.productId(),
                line.category(),
                line.name(),
                line.emoji(),
                line.description(),
                line.price(),
                line.badge(),
                line.quantity(),
                (long) line.price() * line.quantity(),
                line.stockQuantity(),
                line.status(),
                "ACTIVE".equals(line.status()) && line.stockQuantity() > 0,
                line.imageUrl(),
                line.packageQuantity(),
                line.packageUnit(),
                line.subCategory());
    }
}
