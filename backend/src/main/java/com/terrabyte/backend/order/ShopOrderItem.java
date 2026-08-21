package com.terrabyte.backend.order;

import java.math.BigDecimal;

public record ShopOrderItem(
        long id,
        long orderId,
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
}
