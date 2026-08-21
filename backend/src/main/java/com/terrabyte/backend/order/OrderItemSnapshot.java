package com.terrabyte.backend.order;

import java.math.BigDecimal;

import com.terrabyte.backend.cart.CartLine;

public record OrderItemSnapshot(
        String productId,
        String category,
        String productName,
        String productEmoji,
        String productDescription,
        int originalUnitPrice,
        int discountRate,
        int unitPrice,
        int quantity,
        long subtotal,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory) {

    public static OrderItemSnapshot from(CartLine line) {
        return new OrderItemSnapshot(
                line.productId(),
                line.category(),
                line.name(),
                line.emoji(),
                line.description(),
                line.price(),
                line.discountRate(),
                line.salePrice(),
                line.quantity(),
                (long) line.salePrice() * line.quantity(),
                line.packageQuantity(),
                line.packageUnit(),
                line.subCategory());
    }
}
