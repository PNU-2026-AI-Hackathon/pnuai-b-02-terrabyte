package com.terrabyte.backend.order;

import java.time.Instant;

public record OrderSummaryResponse(
        long id,
        String orderNumber,
        OrderStatus status,
        int totalQuantity,
        long totalPrice,
        Instant orderedAt,
        Instant cancelledAt) {

    public static OrderSummaryResponse from(ShopOrder order) {
        return new OrderSummaryResponse(
                order.id(),
                order.orderNumber(),
                order.status(),
                order.totalQuantity(),
                order.totalPrice(),
                order.orderedAt(),
                order.cancelledAt());
    }
}
