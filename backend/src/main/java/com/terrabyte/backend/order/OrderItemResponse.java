package com.terrabyte.backend.order;

import java.math.BigDecimal;

public record OrderItemResponse(
        String productId,
        String category,
        String name,
        String emoji,
        String desc,
        int originalUnitPrice,
        int discountRate,
        int unitPrice,
        int quantity,
        long subtotal,
        BigDecimal packageQuantity,
        String packageUnit,
        String subCategory) {

    public static OrderItemResponse from(ShopOrderItem item) {
        return new OrderItemResponse(
                item.productId(),
                item.category(),
                item.productName(),
                item.productEmoji(),
                item.productDescription(),
                item.originalUnitPrice(),
                item.discountRate(),
                item.unitPrice(),
                item.quantity(),
                item.subtotal(),
                item.packageQuantity(),
                item.packageUnit(),
                item.subCategory());
    }
}
